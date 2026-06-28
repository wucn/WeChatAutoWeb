# backend-patterns 深度分析（一）：架构与分层设计

> 源文件：`skills/backend-patterns/SKILL.md`（558 行，~1572 词）
> 本篇聚焦：Repository / Service / Middleware 三层架构的接口定义、类设计、依赖注入
> 系列第 1 篇，共 5 篇

## 概览

backend-patterns skill 的架构核心是**三层分离**：

```
HTTP 请求
   │
   ▼
Middleware 层（横切：auth、logging、rate limit）
   │
   ▼
Service 层（业务逻辑）
   │
   ▼
Repository 层（数据访问抽象）
   │
   ▼
数据源（Supabase / Redis / 外部 API）
```

每一层都有**明确的职责边界**和**接口契约**，不允许跨层调用。

## 一、Repository 层（数据访问抽象）

### 1.1 设计目的
隔离数据访问逻辑，让 Service 层不感知具体的数据源（Supabase / Postgres / 其他）。

### 1.2 接口契约定义

```typescript
interface MarketRepository {
  findAll(filters?: MarketFilters): Promise<Market[]>
  findById(id: string): Promise<Market | null>
  create(data: CreateMarketDto): Promise<Market>
  update(id: string, data: UpdateMarketDto): Promise<Market>
  delete(id: string): Promise<void>
}
```

**5 个标准方法**，覆盖 CRUD：

| 方法 | 签名 | 返回 |
|---|---|---|
| `findAll` | `(filters?: MarketFilters) => Promise<Market[]>` | 列表（可能空） |
| `findById` | `(id: string) => Promise<Market \| null>` | 单个或 null（不抛异常） |
| `create` | `(data: CreateMarketDto) => Promise<Market>` | 创建后的完整对象 |
| `update` | `(id: string, data: UpdateMarketDto) => Promise<Market>` | 更新后的完整对象 |
| `delete` | `(id: string) => Promise<void>` | 无返回（失败抛异常） |

### 1.3 DTO 命名约定

| 后缀 | 用途 |
|---|---|
| `Dto` | Data Transfer Object，跨层数据传输 |
| `CreateXxxDto` | 创建时的输入（不含 id、createdAt 等服务端字段） |
| `UpdateXxxDto` | 更新时的输入（部分字段可选） |
| `XxxFilters` | 查询过滤条件 |

### 1.4 具体实现（Supabase 版）

```typescript
class SupabaseMarketRepository implements MarketRepository {
  async findAll(filters?: MarketFilters): Promise<Market[]> {
    let query = supabase.from('markets').select('*')

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)
    return data
  }
  // 其他方法...
}
```

**关键设计点**：

1. **链式查询构建**：`let query = supabase.from('markets').select('*')` 是可变变量，根据 filters 动态追加 `.eq()` / `.limit()`
2. **错误转换**：Supabase 返回 `{ data, error }`，Repository 把 `error` 转成异常抛出，让 Service 层不用处理 Supabase 特有的错误结构
3. **filters 可选**：`filters?` 表示无过滤时返回全部（但注意：用户面查询必须 `.limit()`，见数据库篇）

### 1.5 Repository 层的硬性规则

| 规则 | 原因 |
|---|---|
| 接口与实现分离 | Service 层依赖 `MarketRepository` 接口，不依赖 `SupabaseMarketRepository` 实现，便于 mock 测试 |
| 返回领域对象，不返回查询结果 | 返回 `Market`，不返回 Supabase 的 `{ data, error }` |
| 错误转异常 | 不把数据源错误结构泄漏到 Service 层 |
| 单一职责 | 一个 Repository 只管一个聚合根（Market），不跨表 JOIN 到无关表 |

## 二、Service 层（业务逻辑）

### 2.1 设计目的
承载业务规则，协调多个 Repository，不感知 HTTP 也不感知数据源细节。

### 2.2 类设计

```typescript
class MarketService {
  constructor(private marketRepo: MarketRepository) {}

  async searchMarkets(query: string, limit: number = 10): Promise<Market[]> {
    // 1. 生成 embedding（业务步骤）
    const embedding = await generateEmbedding(query)

    // 2. 向量搜索（业务步骤）
    const results = await this.vectorSearch(embedding, limit)

    // 3. 取完整数据（协调 Repository）
    const markets = await this.marketRepo.findByIds(results.map(r => r.id))

    // 4. 业务排序
    return markets.sort((a, b) => {
      const scoreA = results.find(r => r.id === a.id)?.score || 0
      const scoreB = results.find(r => r.id === b.id)?.score || 0
      return scoreA - scoreB
    })
  }

  private async vectorSearch(embedding: number[], limit: number) {
    // 私有实现细节
  }
}
```

### 2.3 Service 层的关键约束

| 约束 | 说明 |
|---|---|
| 构造函数注入 Repository | `constructor(private marketRepo: MarketRepository)` —— 依赖通过构造注入，不 new |
| 不直接访问 supabase | Service 只调 `this.marketRepo.xxx()`，不出现 `supabase.from()` |
| 业务步骤显式编号 | 注释标注步骤 1/2/3，让流程可读 |
| 私有方法封装实现细节 | `vectorSearch` 是 private，外部不可见 |
| 默认参数值 | `limit: number = 10` 给业务默认值 |

### 2.4 Service 与 Repository 的协作模式

```
Service.searchMarkets(query, limit=10)
    │
    ├─ ① generateEmbedding(query)         ← 外部服务调用
    │
    ├─ ② this.vectorSearch(embedding)     ← 私有方法
    │       返回 [{id, score}, ...]
    │
    ├─ ③ this.marketRepo.findByIds(ids)   ← Repository 调用
    │       返回 [Market, ...]
    │
    └─ ④ markets.sort(by score)           ← 业务排序
            返回排序后的 Market[]
```

**关键**：Service 可以调用**多个** Repository 和**外部服务**（如 generateEmbedding），但 Repository 不能调用 Service。

### 2.5 装饰器模式：缓存层

Service 层支持用**装饰器模式**叠加缓存，而不修改业务逻辑：

```typescript
class CachedMarketRepository implements MarketRepository {
  constructor(
    private baseRepo: MarketRepository,    // 被装饰的真实 Repository
    private redis: RedisClient
  ) {}

  async findById(id: string): Promise<Market | null> {
    // 1. 先查缓存
    const cached = await this.redis.get(`market:${id}`)
    if (cached) return JSON.parse(cached)

    // 2. 缓存未命中，查真实 Repository
    const market = await this.baseRepo.findById(id)

    // 3. 写缓存（5 分钟 TTL）
    if (market) {
      await this.redis.setex(`market:${id}`, 300, JSON.stringify(market))
    }

    return market
  }

  async invalidateCache(id: string): Promise<void> {
    await this.redis.del(`market:${id}`)
  }
}
```

**设计要点**：
- `CachedMarketRepository` **实现同一个接口** `MarketRepository`
- 持有 `baseRepo`（被装饰对象）和 `redis`
- Service 层无感知：`new MarketService(new CachedMarketRepository(new SupabaseMarketRepository(), redis))`
- 缓存失效是**显式方法** `invalidateCache`，不自动失效（见数据库与缓存篇）

## 三、Middleware 层（横切关注点）

### 3.1 设计目的
处理 auth、logging、rate limit 等横切关注点，与业务逻辑解耦。

### 3.2 高阶函数（HOF）模式

```typescript
export function withAuth(handler: NextApiHandler): NextApiHandler {
  return async (req, res) => {
    // 1. 前置处理：提取 token
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
      // 2. 前置处理：验证 token
      const user = await verifyToken(token)
      req.user = user  // 注入到 req

      // 3. 调用真实 handler
      return handler(req, res)
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}

// 使用
export default withAuth(async (req, res) => {
  // handler 内可直接访问 req.user
})
```

### 3.3 HOF 的设计契约

| 契约 | 说明 |
|---|---|
| 输入：handler | 接收一个 `NextApiHandler` |
| 输出：handler | 返回一个**新的** `NextApiHandler`（签名相同） |
| 前置处理 | 在调用 handler 前做检查（auth、validation） |
| 注入上下文 | 把验证结果挂到 `req`（如 `req.user`） |
| 错误短路 | 验证失败直接返回，不调 handler |
| 后置处理 | 可在 handler 后做清理（本例未展示） |

### 3.4 中间件组合

多个 HOF 可叠加（洋葱模型）：

```typescript
export default withAuth(withRateLimit(withLogging(async (req, res) => {
  // 此时 req.user 已注入，已限流，已记录日志
})))
```

**执行顺序**：`withAuth 前 → withRateLimit 前 → withLogging 前 → handler → withLogging 后 → withRateLimit 后 → withAuth 后`

## 四、分层架构的依赖方向

```
Middleware（依赖 Service + Auth 工具）
    │
    ▼ 调用
Service（依赖 Repository 接口 + 外部服务）
    │
    ▼ 调用
Repository 接口
    │
    ▼ 被实现
SupabaseMarketRepository / CachedMarketRepository
    │
    ▼ 访问
数据源（Supabase / Redis）
```

**依赖反转原则**：
- 高层（Service）不依赖低层（SupabaseMarketRepository），两者都依赖抽象（MarketRepository 接口）
- Service 不知道数据来自 Supabase 还是缓存，只调接口方法

## 五、测试策略对应的分层

| 层 | 测试类型 | Mock 对象 |
|---|---|---|
| Middleware | Unit | mock `verifyToken` |
| Service | Unit | mock `MarketRepository` 接口 |
| Repository | Integration | 真实 Supabase（或测试库） |
| 端到端 | E2E | 不 mock，真实请求 |

**关键**：因为依赖通过构造注入，Service 测试时可传 mock Repository：

```typescript
const mockRepo: MarketRepository = {
  findByIds: jest.fn().mockResolvedValue([mockMarket]),
  // 其他方法...
}
const service = new MarketService(mockRepo)
```

## 六、与项目根 CLAUDE.md 的呼应

`common/coding-style.md` 的通用原则在本 skill 落地：
- **KISS**：三层分离本身是最简可行架构，不引入 DDD 的聚合/值对象等重抽象
- **DRY**：Repository 接口让数据访问不重复
- **YAGNI**：没有过早引入 CQRS、Event Sourcing，只有 CRUD + Service
- **Immutability**：`update` 返回新对象，不原地改

## 七、反模式（本 skill 隐含禁止）

| 反模式 | 为什么错 |
|---|---|
| Service 直接调 `supabase.from()` | 数据源泄漏到业务层，无法 mock 测试 |
| Repository 返回 `{ data, error }` | 把 Supabase 错误结构泄漏给 Service |
| Service 里做 HTTP 响应 | Service 应返回数据，HTTP 响应是 Middleware/Handler 职责 |
| Middleware 里写业务逻辑 | 横切关注点只做检查和注入，不做业务决策 |
| 不定义接口直接用类 | 无法替换实现（如加缓存层） |

---

## 下一篇

- [backend-patterns 深度分析（二）：数据库与缓存](./backend-patterns-深度分析-二-数据库与缓存.md) — 查询优化规则、N+1 防护、事务边界、Redis Cache-Aside 完整实现
