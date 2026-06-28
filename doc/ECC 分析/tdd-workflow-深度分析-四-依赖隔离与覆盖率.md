# tdd-workflow 深度分析（四）：依赖隔离与覆盖率

> 源文件：`skills/tdd-workflow/SKILL.md`（:308-367 行）
> 本篇聚焦：Mocking External Services + Test Coverage Verification
> 系列第 4 篇，共 5 篇

## 引言：隔离与度量

本篇覆盖"外部依赖怎么隔离 + 测试质量怎么度量"：

```
依赖隔离与覆盖率
   │
   ├─ Mocking External Services    ← 外部服务隔离
   │     - Supabase Mock
   │     - Redis Mock
   │     - OpenAI Mock
   │
   └─ Test Coverage Verification   ← 覆盖率度量
         - Run Coverage Report
         - Coverage Thresholds
```

这两个主题的关系：Mock 让 Unit 测试快且稳，覆盖率度量测试是否够全。

## 一、Mocking External Services（外部服务隔离）

> 源文件 :308-344

### 1.1 为什么要 Mock

```
不 Mock（真实依赖）:
   Unit 测试 → 真实 Supabase → 网络 → 慢/不稳/花钱
   ↓
   - 慢（网络往返）
   - 不稳（服务抖动）
   - 花钱（OpenAI API 调用）
   - 不可并行（数据冲突）

Mock（隔离）:
   Unit 测试 → Mock Supabase → 立即返回固定数据
   ↓
   - 快（无网络）
   - 稳（不依赖外部）
   - 免费（不调真实 API）
   - 可并行（各自隔离）
```

| 不 Mock | Mock |
|---|---|
| 慢（秒级） | 快（毫秒级） |
| 不稳 | 稳定 |
| 花钱 | 免费 |
| 数据冲突 | 隔离 |

### 1.2 jest.mock 的机制

```typescript
jest.mock('@/lib/supabase', () => ({
  supabase: { ... }   // 替换整个模块
}))
```

**jest.mock 的工作原理**：

```
import { supabase } from '@/lib/supabase'
   ↓ jest.mock 拦截
   不执行真实模块
   ↓
   返回 mock 工厂函数的返回值
   { supabase: { from: jest.fn(...) } }
```

| 要点 | 说明 |
|---|---|
| 模块级替换 | 整个 `@/lib/supabase` 被替换 |
| 工厂函数 | `() => ({...})` 返回替代实现 |
| `jest.fn()` | 创建可断言的 mock 函数 |
| 提升（hoisting） | `jest.mock` 被提到文件顶部，先于 import |

> **💡 jest.mock 的提升**
>
> 即使 `jest.mock` 写在 `import` 之后，Jest 也会**自动提升到顶部**。这是因为 Babel 转译时把 `jest.mock` 提前。所以 mock 一定在 import 前生效。

## 二、Supabase Mock

> 源文件 :310-324

### 2.1 完整示例

```typescript
// (:312-323)
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({
          data: [{ id: 1, name: 'Test Market' }],
          error: null
        }))
      }))
    }))
  }
}))
```

### 2.2 链式调用的 Mock 结构

Supabase 的查询是链式的：

```typescript
// 真实调用
const { data } = await supabase
  .from('markets')        // ①
  .select('*')            // ②
  .eq('status', 'active') // ③

// Mock 要复刻这条链
supabase: {
  from: jest.fn(() => ({          // ① from 返回对象
    select: jest.fn(() => ({      // ② select 返回对象
      eq: jest.fn(() => Promise.resolve({  // ③ eq 返回 Promise
        data: [...], error: null
      }))
    }))
  }))
}
```

**链式结构对照**：

| 真实调用 | Mock 返回 |
|---|---|
| `supabase.from(x)` | `jest.fn(() => ({select: ...}))` |
| `.select(x)` | `jest.fn(() => ({eq: ...}))` |
| `.eq(k, v)` | `jest.fn(() => Promise.resolve({data, error}))` |

### 2.3 ⚠️ 链式 Mock 的脆弱性

> **⚠️ 维护成本高**
>
> | 问题 | 说明 |
> |---|---|
> | 链长 | 每多一个方法就多一层嵌套 |
> | 顺序绑死 | 真实调用顺序变了，Mock 就要改 |
> | 方法遗漏 | 真实代码加了 `.filter()`，Mock 没加就报错 |
> | 重复 | 每个测试都要写一遍这条链 |
>
> **更健壮的方案**（本 skill 未给）：
>
> ```typescript
> // 用工厂函数生成链
> function mockChain(resolved) {
>   const chain = {
>     select: jest.fn().mockReturnThis(),
>     eq: jest.fn().mockReturnThis(),
>     filter: jest.fn().mockReturnThis(),
>     then: (resolve) => resolve(resolved)  // 让 await 能解
>   }
>   return jest.fn(() => chain)
> }
> ```
>
> 用 `mockReturnThis()` 让每个方法返回自身，支持任意顺序链式调用。

### 2.4 Mock 的返回数据

```typescript
Promise.resolve({
  data: [{ id: 1, name: 'Test Market' }],
  error: null
})
```

**Supabase 的响应契约**：

| 字段 | 含义 |
|---|---|
| `data` | 查询结果（数组或对象） |
| `error` | 错误（null 表示成功） |

> **⚠️ 只 Mock 成功路径**
>
> 源文件的 Mock 只返回 `error: null`（成功）。**未 Mock 错误路径**：
>
> | 场景 | 源文件 Mock | 应补充 |
> |---|---|---|
> | 查询成功 | ✅ `{data: [...], error: null}` | - |
> | 查询失败 | ❌ 未给 | `{data: null, error: {...}}` |
> | 网络超时 | ❌ 未给 | `Promise.reject(new Error('timeout'))` |
>
> 错误路径的 Mock 应在"handles database errors gracefully"测试中用（第 3 篇 :224 提到的半成品测试）。

### 2.5 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| `jest.mock` | `@testable import` + 协议替换 | Mockito `mock()` |
| `jest.fn()` | `XCTMock` 协议实现 | `Mockito.mock(Interface::class)` |
| 链式 Mock | NSFetch 的 mock predicate | Retrofit mock chain |
| `mockReturnThis()` | 返回 self 支持链式 | Kotlin `apply {}` |

## 三、Redis Mock

> 源文件 :328-334

### 3.1 完整示例

```typescript
// (:328-333)
jest.mock('@/lib/redis', () => ({
  searchMarketsByVector: jest.fn(() => Promise.resolve([
    { slug: 'test-market', similarity_score: 0.95 }
  ])),
  checkRedisHealth: jest.fn(() => Promise.resolve({ connected: true }))
}))
```

### 3.2 与 Supabase Mock 的差异

| 维度 | Supabase Mock | Redis Mock |
|---|---|---|
| 结构 | 链式（from→select→eq） | 扁平（直接调函数） |
| 返回 | `{data, error}` | 直接返回值 |
| 方法数 | 多（链上每环） | 少（独立函数） |

**Redis Mock 更简单**——因为 `@/lib/redis` 是**自封装模块**，把 Redis 操作封装成独立函数（`searchMarketsByVector` / `checkRedisHealth`），不是链式 API。

> **💡 封装带来的可测性**
>
> | 设计 | 可测性 |
> |---|---|
> | 直接用 Redis 链式 client | 难 Mock（要复刻链） |
> | 封装成 `searchMarketsByVector()` 函数 | 易 Mock（mock 单函数） |
>
> backend-patterns 第 1 篇的"Service 层封装"正是此意——封装让依赖易隔离。

### 3.3 两个 Mock 函数

| 函数 | Mock 返回 | 用途 |
|---|---|---|
| `searchMarketsByVector` | `[{slug, similarity_score}]` | 语义搜索 |
| `checkRedisHealth` | `{connected: true}` | 健康检查 |

### 3.4 ⚠️ 同样缺错误路径

源文件只 Mock 了 `connected: true`，未 Mock Redis 不可用的场景。

但第 2 篇 Step 2 的测试用例提到了：

```typescript
it('falls back to substring search when Redis unavailable', ...)
```

这说明**测试需要 Redis 不可用的 Mock**，但源文件没给：

```typescript
// 应补充
checkRedisHealth: jest.fn(() => Promise.resolve({ connected: false }))
searchMarketsByVector: jest.fn(() => Promise.reject(new Error('Redis down')))
```

## 四、OpenAI Mock

> 源文件 :336-343

### 4.1 完整示例

```typescript
// (:338-342)
jest.mock('@/lib/openai', () => ({
  generateEmbedding: jest.fn(() => Promise.resolve(
    new Array(1536).fill(0.1)  // Mock 1536 维 embedding
  ))
}))
```

### 4.2 Embedding 的 Mock 策略

```typescript
new Array(1536).fill(0.1)   // 1536 个 0.1
```

**为什么 1536 维**：OpenAI `text-embedding-ada-002` 模型输出 1536 维向量。

| 模型 | 维度 |
|---|---|
| text-embedding-ada-002 | 1536 |
| text-embedding-3-small | 1536 |
| text-embedding-3-large | 3072 |

### 4.3 Mock 向量的设计

```
真实 embedding:
   [0.023, -0.045, 0.087, ..., 0.012]   ← 语义编码
   ↓ 用于余弦相似度搜索

Mock embedding:
   [0.1, 0.1, 0.1, ..., 0.1]            ← 固定值
   ↓ 只验证"函数被调 + 返回 1536 维"
```

> **💡 Mock 向量不验证语义**
>
> Mock 的目的是**隔离 OpenAI 调用**，不是验证语义搜索准确性。语义准确性应由 Integration/E2E 用真实 embedding 测。
>
> | 测试类型 | 用什么 embedding |
> |---|---|
> | Unit | Mock（固定值） |
> | Integration | 真实 OpenAI 或预录 embedding |
> | E2E | 真实 OpenAI |

### 4.4 三个 Mock 的共同模式

| Mock | 隔离什么 | 返回 |
|---|---|---|
| Supabase | 数据库 | `{data, error}` |
| Redis | 缓存/向量搜索 | 直接值 |
| OpenAI | LLM | 固定向量 |

**共同原则**：隔离外部 + 返回固定值 + 不验证外部逻辑。

## 五、Test Coverage Verification（覆盖率验证）

> 源文件 :345-367

### 5.1 运行覆盖率

```bash
# (:348-350)
npm run test:coverage
```

### 5.2 覆盖率门槛配置

```json
// (:353-365)
{
  "jest": {
    "coverageThresholds": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

### 5.3 四个维度的含义

| 维度 | 含义 | 例子 |
|---|---|---|
| `branches` | 分支覆盖 | `if(x)` 的 true/false 两边都跑过 |
| `functions` | 函数覆盖 | 每个定义的函数都被调用过 |
| `lines` | 行覆盖 | 每行代码都执行过 |
| `statements` | 语句覆盖 | 每条语句都跑过 |

### 5.4 四维的关系

```
语句覆盖 ⊃ 行覆盖 ⊃ 分支覆盖
   ↓
   最严: branches（分支覆盖了，语句一定覆盖了）
   最松: statements
```

| 维度 | 严格度 |
|---|---|
| `statements` | 最松 |
| `lines` | （与 statements 接近） |
| `functions` | 中 |
| `branches` | 最严 |

> **💡 为什么 4 维都要 80%**
>
> | 只卡一个维度 | 漏洞 |
> |---|---|
> | 只卡 lines | 漏分支（if 只测了 true） |
> | 只卡 branches | 漏函数（某函数从没调过） |
> | 只卡 functions | 漏内部逻辑 |
> | **4 维全 80%** | 互补，最严 |
>
> 源文件要求 4 维**全部** 80%+，不是平均 80%。

### 5.5 覆盖率门槛是硬门禁

```json
"coverageThresholds": {
  "global": {
    "branches": 80,    // 低于 80% 则测试失败（exit code 非 0）
    ...
  }
}
```

**行为**：覆盖率低于门槛，`npm run test:coverage` **退出非 0**，CI 失败。

```
npm run test:coverage
   ↓
   跑测试 + 收集覆盖率
   ↓
   对比 thresholds
   ├─ 全 ≥ 80% → exit 0（通过）
   └─ 有 < 80% → exit 1（失败）→ CI 阻断
```

### 5.6 global vs per-file 门槛

源文件用 `global` 门槛（整体 80%）。Jest 还支持 per-file：

```json
"coverageThresholds": {
  "global": { "lines": 80 },           // 整体
  "./src/important/": { "lines": 95 }  // 关键目录更严
}
```

| 门槛类型 | 适用 |
|---|---|
| `global` 80% | 整体兜底（源文件用） |
| per-file 95% | 核心代码更严 |

> **⚠️ global 门槛的局限**
>
> `global` 80% 允许**某些文件 0% 被其他文件拉平**。比如：
>
> | 文件 | 覆盖率 |
> |---|---|
> | a.ts | 100% |
> | b.ts | 0% |
> | 整体 | 50%（若两文件等大） |
>
> 要严格应加 per-file 门槛。源文件未配 per-file。

### 5.7 ⚠️ 覆盖率未覆盖行的处理流程缺失

源文件只说"跑覆盖率 + 卡门槛"，**没说低于门槛怎么办**。

> **⚠️ 缺失的补全流程**
>
> | 步骤 | 源文件 | 应补充 |
> |---|---|---|
> | 跑覆盖率 | ✅ | - |
> | 卡门槛 | ✅ | - |
> | 查看未覆盖行 | ❌ | `open coverage/lcov-report/index.html` |
> | 分析未覆盖原因 | ❌ | 是漏测？还是防御代码？ |
> | 补测试 | ❌ | 针对未覆盖行补用例 |
> | 排除不测的 | ❌ | `/* istanbul ignore next */` |
>
> 完整流程：
>
> ```
> 跑覆盖率
>    ↓ < 80%
>    查 coverage report
>    ↓
>    未覆盖行
>    ├─ 漏测 → 补测试
>    └─ 防御代码/不可达 → istanbul ignore
>    ↓
>    重跑 ≥ 80%
> ```

## 六、Mock 与覆盖率的关系

### 6.1 Mock 影响覆盖率吗

```
不 Mock:
   测试调真实 Supabase → Supabase client 代码被覆盖
   ↓ 但 Supabase client 是第三方库，不该计入我们的覆盖率

Mock:
   测试调 Mock → 我们的业务代码被覆盖
   ↓ Supabase client 被 mock 替换，不参与覆盖
```

**Mock 让覆盖率聚焦"自己的代码"**，不被第三方库稀释。

### 6.2 配置 coverage 忽略第三方

```json
{
  "jest": {
    "coveragePathIgnorePatterns": [
      "/node_modules/",
      "/.next/",
      ".*\\.stories\\..*"
    ]
  }
}
```

| 忽略 | 原因 |
|---|---|
| `/node_modules/` | 第三方库 |
| `/.next/` | 构建产物 |
| `*.stories.*` | Storybook 不算业务代码 |

## 七、与 backend-patterns / security-review 的协作

### 7.1 Mock backend-patterns 的依赖

| backend-patterns 依赖 | 用本篇哪个 Mock |
|---|---|
| Repository → Supabase | Supabase Mock |
| Cache → Redis | Redis Mock |
| 语义搜索 → OpenAI embedding | OpenAI Mock |
| JobQueue | 内部，直接 mock `execute` |

### 7.2 覆盖率与 security-review

security-review 的安全测试也计入覆盖率：

| security-review 测试 | 覆盖的代码 |
|---|---|
| `requires authentication`（401） | 鉴权中间件 |
| `requires admin role`（403） | RBAC 检查 |
| `rejects invalid input`（400） | Zod 校验 |
| `enforces rate limits`（429） | 限流中间件 |

**安全测试补覆盖率盲区**：正常业务测试可能漏掉鉴权/限流分支，安全测试覆盖这些分支。

### 7.3 职责分工

| 关注点 | tdd-workflow（本篇） | backend-patterns | security-review |
|---|---|---|---|
| Mock 模式 | ✅ jest.mock 用法 | ❌ | ❌ |
| 被依赖 | ❌ | ✅ 提供 Supabase/Redis 封装 | ❌ |
| 覆盖率门槛 | ✅ 4 维 80% | ❌ | ❌ |
| 安全分支覆盖 | ❌ | ❌ | ✅ 安全测试补盲区 |

## 八、设计哲学

### 8.1 隔离原则

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 外部服务全 Mock | 快+稳+免费 | 真实调用慢/不稳/花钱 |
| 封装依赖成函数 | 易 Mock | 直接用链式 client 难 Mock |
| Mock 返回固定值 | 可预测 | 随机值难断言 |

### 8.2 度量原则

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 4 维全 80% | 互补无漏洞 | 单维度有盲区 |
| 门槛是硬门禁 | CI 阻断 | 覆盖率下滑无感知 |
| 忽略第三方 | 聚焦自己的代码 | 被库稀释 |

### 8.3 Mock 与真实互补

| 测试类型 | 用 Mock | 用真实 |
|---|---|---|
| Unit | ✅ 全 Mock | ❌ |
| Integration | 部分 | ✅ DB |
| E2E | ❌ | ✅ 全真实 |

> **💡 不是所有测试都 Mock**
>
> | 极端 | 问题 |
> |---|---|
> | 全 Mock（包括 Integration） | 漏真实集成问题 |
> | 全不 Mock（包括 Unit） | 慢/不稳/花钱 |
> | 按层级区分 | ✅ 本 skill 的金字塔 |

## 九、反模式汇总

### 9.1 Mock 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 不 Mock 真实 API | 慢/花钱/不稳 | Mock |
| 链式 Mock 写死顺序 | 脆弱 | 用 `mockReturnThis()` |
| 只 Mock 成功路径 | 漏错误测试 | 补 error/reject Mock |
| Mock 太细（每个测试重写） | 重复 | 抽 Mock 工厂 |
| Mock 业务逻辑 | 测不出 bug | 只 Mock 外部依赖 |

### 9.2 覆盖率反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 只卡 lines | 漏分支 | 4 维全卡 |
| 追求 100% | 边际收益低 | 80% 门槛 |
| 覆盖率 = 质量 | 可能断言错 | 覆盖率 + 断言审查 |
| 不看未覆盖行 | 不知道漏哪 | 查 coverage report |
| 不排除第三方 | 被稀释 | 配置 ignorePatterns |

## 十、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| Mock | 外部服务全 Mock（Supabase/Redis/OpenAI） | **CRITICAL** |
| Mock | 用 `jest.mock` 模块级替换 | 标准 |
| Mock | `jest.fn()` 创建可断言 mock | 标准 |
| Mock | 链式调用用 `mockReturnThis()`（⚠️ 源文件未用） | HIGH |
| Mock | 必须补错误路径 Mock（error/reject） | HIGH（⚠️ 源文件缺） |
| Mock | 封装依赖成函数（易 Mock） | HIGH |
| Mock | 只 Mock 外部依赖，不 Mock 业务逻辑 | HIGH |
| 覆盖率 | 4 维全 80%（branches/functions/lines/statements） | **CRITICAL** |
| 覆盖率 | 门槛是硬门禁（低于则 CI 失败） | HIGH |
| 覆盖率 | 忽略第三方库（coveragePathIgnorePatterns） | HIGH |
| 覆盖率 | 查未覆盖行补测试（⚠️ 源文件未给流程） | HIGH |
| 覆盖率 | per-file 门槛用于核心代码（源文件未配） | 标准 |

---

## 下一篇

- [tdd-workflow 深度分析（五）：反模式与持续测试](./tdd-workflow-深度分析-五-反模式与持续测试.md) — 3 对反模式、Watch/PreCommit/CI、10 条最佳实践、成功指标
