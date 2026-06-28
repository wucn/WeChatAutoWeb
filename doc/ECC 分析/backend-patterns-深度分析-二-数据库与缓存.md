# backend-patterns 深度分析（二）：数据库与缓存

> 源文件：`skills/backend-patterns/SKILL.md`（:129-262 行）
> 本篇聚焦：查询优化硬性规则、N+1 防护、事务边界、Redis 缓存策略
> 系列第 2 篇，共 5 篇

## 一、查询优化：列选择规则

### 1.1 硬性规则：禁用 `select('*')`

```typescript
// PASS: 只取需要的列
const { data } = await supabase
  .from('markets')
  .select('id, name, status, volume')      // 显式列
  .eq('status', 'active')
  .order('volume', { ascending: false })
  .limit(10)

// FAIL: 取全部列
const { data } = await supabase
  .from('markets')
  .select('*')
```

**为什么禁止 `*`**：
- 传输冗余数据（宽表 20+ 列只用 4 列）
- 索引失效（covering index 无法覆盖 `*`）
- schema 变动时行为不确定（新增列被意外返回）
- 序列化成本（API 响应变大）

### 1.2 列选择清单（写代码前先确认）

| 必须想清楚的问题 | 答案 |
|---|---|
| 这个 API 响应需要哪些字段？ | 列出来 |
| 前端列表只需要标题和状态吗？ | 只取 `id, name, status` |
| 详情页需要关联数据吗？ | 用 JOIN 或单独查询 |

## 二、N+1 查询防护

### 2.1 N+1 的典型形态

```typescript
// FAIL: N+1 查询问题
const markets = await getMarkets()
for (const market of markets) {
  market.creator = await getUser(market.creator_id)  // N 次查询！
}
```

**问题**：如果 `markets` 有 100 条，会发 1 + 100 = 101 次 DB 查询。

### 2.2 修复方案：批量查询 + Map 索引

```typescript
// PASS: 批量查询
const markets = await getMarkets()
const creatorIds = markets.map(m => m.creator_id)

// 1 次查询拿全部 creator
const creators = await getUsers(creatorIds)

// 建 Map 便于查找
const creatorMap = new Map(creators.map(c => [c.id, c]))

// 内存中关联
markets.forEach(market => {
  market.creator = creatorMap.get(market.creator_id)
})
```

### 2.3 N+1 防护规则

| 规则 | 说明 |
|---|---|
| 循环内禁调 DB | `for (item of items) await getX(item.id)` 是 N+1 信号 |
| 批量 API | Repository 必须提供 `findByIds(ids: string[])` 方法 |
| Map 索引关联 | 拿到批量结果后用 `new Map(arr.map(x => [x.id, x]))` 建索引 |
| 数据量校验 | 如果 ids 数组可能很大（>1000），考虑分批或用 SQL JOIN |

### 2.4 何时用 JOIN 而非批量查询

| 场景 | 推荐 |
|---|---|
| 关联 1 个表，数据量小 | SQL JOIN（一次查询） |
| 关联多个表 | 批量查询（避免多表 JOIN 性能爆炸） |
| 跨数据源（Supabase + 外部 API） | 必须批量查询 |
| 需要分页 | JOIN（批量查询难以分页） |

## 三、事务边界

### 3.1 设计原则：事务用 SQL 函数，不用客户端事务

```typescript
async function createMarketWithPosition(
  marketData: CreateMarketDto,
  positionData: CreatePositionDto
) {
  // 调用 Supabase RPC（远程过程调用）
  const { data, error } = await supabase.rpc('create_market_with_position', {
    market_data: marketData,
    position_data: positionData
  })

  if (error) throw new Error('Transaction failed')
  return data
}
```

### 3.2 SQL 函数定义（必须落库）

```sql
CREATE OR REPLACE FUNCTION create_market_with_position(
  market_data jsonb,
  position_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  -- 事务自动开始
  INSERT INTO markets VALUES (market_data);
  INSERT INTO positions VALUES (position_data);
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    -- 回滚自动发生
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

### 3.3 为什么用 SQL 函数而非客户端事务

| 维度 | 客户端事务（`BEGIN/COMMIT`） | SQL 函数（RPC） |
|---|---|---|
| 网络往返 | 多次（BEGIN → INSERT → INSERT → COMMIT） | 1 次 |
| 事务持有时间 | 长（网络延迟期间持锁） | 短（数据库内完成） |
| 失败回滚 | 需客户端显式 ROLLBACK | EXCEPTION 自动回滚 |
| 并发安全 | 连接断开可能留下悬挂事务 | 函数结束自动结束事务 |
| 错误处理 | 客户端解析错误信息 | SQLERRM 结构化错误 |

### 3.4 事务边界的硬性规则

| 规则 | 说明 |
|---|---|
| **事务内禁网络调用** | 不在事务中调外部 API，网络超时会长时间持锁 |
| **多表原子写入用 SQL 函数** | `rpc()` 一次调用完成 |
| **失败抛异常** | `if (error) throw new Error(...)`，不吞错误 |
| **EXCEPTION 必须返回结构化结果** | `{success: false, error: SQLERRM}` 而非静默失败 |

### 3.5 客户端类比的边界情况

| 场景 | 处理 |
|---|---|
| 单表写入 | 不需要事务，直接 INSERT |
| 多表写入但无顺序依赖 | 可用批量 INSERT，不必事务 |
| 多表写入需原子性 | SQL 函数 + rpc() |
| 需要读后写的一致性快照 | `SELECT ... FOR UPDATE` 在 SQL 函数内 |

## 四、Redis 缓存策略

### 4.1 Cache-Aside 模式（默认推荐）

```typescript
async function getMarketWithCache(id: string): Promise<Market> {
  const cacheKey = `market:${id}`

  // 1. 先查缓存
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  // 2. 缓存未命中，查 DB
  const market = await db.markets.findUnique({ where: { id } })

  if (!market) throw new Error('Market not found')

  // 3. 写缓存（TTL 5 分钟 = 300 秒）
  await redis.setex(cacheKey, 300, JSON.stringify(market))

  return market
}
```

**Cache-Aside 的 3 步**：
1. **读缓存**：命中直接返回
2. **读 DB**：未命中查数据库
3. **写缓存**：用 `setex` 设 TTL

### 4.2 缓存装饰器模式（与 Repository 结合）

```typescript
class CachedMarketRepository implements MarketRepository {
  constructor(
    private baseRepo: MarketRepository,
    private redis: RedisClient
  ) {}

  async findById(id: string): Promise<Market | null> {
    const cached = await this.redis.get(`market:${id}`)

    if (cached) {
      return JSON.parse(cached)
    }

    const market = await this.baseRepo.findById(id)

    if (market) {
      // 5 分钟 TTL
      await this.redis.setex(`market:${id}`, 300, JSON.stringify(market))
    }

    return market
  }

  async invalidateCache(id: string): Promise<void> {
    await this.redis.del(`market:${id}`)
  }
}
```

### 4.3 缓存 Key 命名规范

```
market:{id}          → 单个 market 缓存
market:list:active   → active 状态列表缓存
user:{id}:markets    → 用户的 markets 缓存
```

| 规则 | 说明 |
|---|---|
| 冒号分层 | `entity:subtype:identifier` |
| 实体名在前 | `market:` 而非 `markets:`（单数便于一致性） |
| ID 在后 | `market:123` 便于 `KEYS market:*` 批量删除（生产慎用 KEYS） |

### 4.4 TTL 策略

| 数据类型 | TTL | 原因 |
|---|---|---|
| 单个实体（`market:{id}`） | 5 分钟（300s） | 频繁访问，容忍短暂过期 |
| 列表（`market:list:*`） | 1 分钟（60s） | 列表变动快，短 TTL |
| 计数器 | 无 TTL（手动管理） | 用 `INCR` 维护，不设过期 |
| 用户会话 | 1 小时（3600s） | 与 JWT 过期对齐 |

### 4.5 缓存失效策略

**本 skill 的选择：显式失效**（非 TTL 自动失效）

```typescript
async invalidateCache(id: string): Promise<void> {
  await this.redis.del(`market:${id}`)
}
```

**调用时机**：在 Service 层 update/delete 后显式调用：

```typescript
class MarketService {
  constructor(
    private repo: CachedMarketRepository  // 注意类型是装饰后的
  ) {}

  async updateMarket(id: string, data: UpdateMarketDto): Promise<Market> {
    const market = await this.repo.update(id, data)
    await this.repo.invalidateCache(id)   // 显式失效
    return market
  }
}
```

**为什么不用自动失效**：
- TTL 自动失效会有一致性窗口（5 分钟内读到旧数据）
- 写后立即读（read-after-write）需要一致性，必须显式失效
- 但 TTL 作为**兜底**（防止显式失效漏调）

### 4.6 缓存陷阱

| 陷阱 | 后果 | 防护 |
|---|---|---|
| 缓存穿透（查不存在的 key） | 每次查 DB | 缓存 null 值，短 TTL（60s） |
| 缓存雪崩（大量 key 同时过期） | DB 瞬间压力 | TTL 加随机抖动（`300 + random(60)`） |
| 缓存击穿（热点 key 失效瞬间大量请求） | DB 压力 | 用 `SETNX` 加锁，单飞回源 |
| 序列化大对象 | Redis 内存压力 | 只缓存必要字段，非全行 |

> **注意**：本 skill 文档未展开这些陷阱的完整防护，只展示了基本 Cache-Aside。生产系统需补充。

## 五、查询构建的可变变量模式

```typescript
let query = supabase.from('markets').select('*')

if (filters?.status) {
  query = query.eq('status', filters.status)
}

if (filters?.limit) {
  query = query.limit(filters.limit)
}

const { data, error } = await query
```

**关键**：`let query` 而非 `const`，因为 Supabase 的查询构建器每次返回新对象，需要重新赋值。

**为什么不用提前 return**：
- 过滤条件是组合的（status + limit + sort），每个都可能缺失
- 用 `let` + 条件追加比 `if/else` 嵌套更清晰

## 六、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 查询 | 禁 `select('*')`，显式列名 | HIGH |
| 查询 | 用户面查询必加 `.limit()` | CRITICAL |
| N+1 | 循环内禁调 DB | CRITICAL |
| N+1 | 用 `findByIds` 批量查询 | HIGH |
| 事务 | 多表原子写入用 SQL 函数 + `rpc()` | HIGH |
| 事务 | 事务内禁网络调用 | CRITICAL |
| 事务 | 失败必抛异常 | HIGH |
| 缓存 | Cache-Aside 3 步：读缓存 → 读 DB → 写缓存 | 标准 |
| 缓存 | TTL 默认 5 分钟（300s） | 标准 |
| 缓存 | 写后显式失效 | HIGH |
| 缓存 | Key 命名 `entity:subtype:id` | 标准 |

---

## 下一篇

- [backend-patterns 深度分析（三）：API 设计与错误处理](./backend-patterns-深度分析-三-API设计与错误处理.md) — RESTful URL 规范、HTTP 方法语义、统一响应格式、错误分类与重试退避
