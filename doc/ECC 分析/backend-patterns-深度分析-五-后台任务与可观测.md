# backend-patterns 深度分析（五）：后台任务与可观测

> 源文件：`skills/backend-patterns/SKILL.md`（:442-559 行）
> 本篇聚焦：Job Queue 实现、结构化日志、requestId 上下文传递
> 系列第 5 篇（完结篇），共 5 篇

## 一、Job Queue 实现

### 1.1 JobQueue 泛型类设计

```typescript
// (:447-478)
class JobQueue<T> {
  private queue: T[] = []
  private processing = false

  async add(job: T): Promise<void> {
    this.queue.push(job)

    if (!this.processing) {
      this.process()
    }
  }

  private async process(): Promise<void> {
    this.processing = true

    while (this.queue.length > 0) {
      const job = this.queue.shift()!

      try {
        await this.execute(job)
      } catch (error) {
        console.error('Job failed:', error)
      }
    }

    this.processing = false
  }

  private async execute(job: T): Promise<void> {
    // Job execution logic
  }
}
```

**3 个成员**：

| 成员 | 类型 | 用途 |
|---|---|---|
| `queue` | `T[]` | 任务队列（FIFO，用 `push` + `shift`） |
| `processing` | `boolean` | 防止重复启动处理循环 |
| `execute` | `(job: T) => Promise<void>` | 抽象方法，子类实现具体逻辑 |

**2 个方法**：

| 方法 | 可见性 | 作用 |
|---|---|---|
| `add(job)` | public | 推入队列 + 自动触发 `process` |
| `process()` | private | 循环处理队列，失败记日志不中断 |
| `execute(job)` | private | 抽象方法（本 skill 未实现，留空） |

### 1.2 add 方法：推入 + 自动启动

```typescript
// (:451-457)
async add(job: T): Promise<void> {
  this.queue.push(job)            // ① 推入队列尾部

  if (!this.processing) {         // ② 当前没在处理?
    this.process()                 //    启动处理循环
  }
}
```

**设计要点**：

```
add(job) 调用
   │
   ├─ ① push 到 queue 尾部
   │
   └─ ② 检查 processing 标志
        ├─ false → 调 process()（启动循环）
        │           注意：不 await，fire-and-forget
        └─ true  → 跳过（process 循环自己会处理新 job）
```

> **💡 为什么 `process()` 不 await**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | `add` 内调 `process()` 不 await | `add` 快速返回，不等任务执行完 | `add` 会阻塞到所有任务处理完 |
> | `processing` 标志防重入 | 避免多个 `process` 循环并发 | 多个循环同时 `shift` 会导致竞争 |
> | fire-and-forget | `add` 只负责入队，处理异步进行 | 调用方需等待，失去队列意义 |

### 1.3 process 方法：循环处理 + 失败不中断

```typescript
// (:459-473)
private async process(): Promise<void> {
  this.processing = true              // ① 标记处理中

  while (this.queue.length > 0) {     // ② 队列非空循环
    const job = this.queue.shift()!    //    取出队首（FIFO）

    try {
      await this.execute(job)         // ③ 执行任务
    } catch (error) {
      console.error('Job failed:', error)  // ④ 失败记日志，不中断
    }
  }

  this.processing = false             // ⑤ 队列空，标记处理完
}
```

**5 步流程**：

```
    ┌─────────────────────────────────────┐
    │ ① processing = true                  │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ② queue.length > 0?                  │
    │    ├─ 否 → 跳到 ⑤                     │
    │    └─ 是 → 继续                       │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ③ job = queue.shift()                │
    │    await execute(job)               │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ④ execute 抛异常?                    │
    │    ├─ 是 → console.error，继续循环    │
    │    └─ 否 → 回到 ②                     │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ⑤ processing = false                │
    │    退出循环                           │
    └─────────────────────────────────────┘
```

### 1.4 失败不中断的设计

```typescript
try {
  await this.execute(job)
} catch (error) {
  console.error('Job failed:', error)   // 只记日志，不 rethrow
}
// 循环继续处理下一个 job
```

> **💡 为什么失败不中断**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | catch 不 rethrow | 单个 job 失败不影响其他 job | 一个坏 job 阻塞整个队列 |
> | 只 console.error | 简单记录，不重试 | 生产应加重试/死信队列（本 skill 未实现） |
> | 继续下一个 | 队列本质是"尽力而为" | 队列因一个失败而停摆 |

### 1.5 execute 方法：抽象方法（待子类实现）

```typescript
// (:475-477)
private async execute(job: T): Promise<void> {
  // Job execution logic
}
```

**⚠️ 注意**：源文件里 `execute` 是**空实现**，不是抽象方法（`abstract`）。本 skill 用 `private` 而非 `protected`/`abstract`，意味着**子类无法重写**。

| 问题 | 说明 |
|---|---|
| `execute` 是 private | 子类无法 override，只能用 `JobQueue` 内的空实现 |
| 没有 abstract 关键字 | TypeScript 的 `abstract` 要求类也是 abstract，不能 `new JobQueue()` |
| 实际使用 | 当前 `execute` 啥也不做，`add` 后任务入队但永不执行 |

> **⚠️ 设计缺陷：execute 无法被子类实现**
>
> ```typescript
> class JobQueue<T> {
>   private async execute(job: T): Promise<void> {
>     // 空 —— 需要子类填逻辑
>   }
> }
>
> // 反例：子类想重写 execute，但 private 不允许
> class IndexJobQueue extends JobQueue<IndexJob> {
>   private async execute(job: IndexJob): Promise<void> {
>     // ❌ TS 错误：execute 是 private，且 override 不生效
>     await indexMarket(job.marketId)
>   }
> }
> ```
>
> **修复方向**：
>
> | 方案 | 改法 | 代价 |
> |---|---|---|
> | 方案 A | `execute` 改 `protected`，子类 override | `JobQueue` 仍可 new（但 execute 是空的） |
> | 方案 B | `execute` 改 `abstract`，类也改 abstract | 不能直接 `new JobQueue()`，必须子类 |
> | 方案 C | 构造函数注入 `executor` 函数 | 更函数式，但改动大 |
>
> 本 skill 未给出修复，使用时需自行调整。

### 1.6 使用场景：索引市场任务

```typescript
// (:481-494)
interface IndexJob {
  marketId: string
}

const indexQueue = new JobQueue<IndexJob>()

export async function POST(request: Request) {
  const { marketId } = await request.json()

  // Add to queue instead of blocking
  await indexQueue.add({ marketId })

  return NextResponse.json({ success: true, message: 'Job queued' })
}
```

**请求时序**：

```
客户端                    API (POST)              indexQueue
  │                          │                       │
  │── POST /api/markets ──→  │                       │
  │   { marketId: "m1" }    │                       │
  │                          │── add({marketId}) ──→ │
  │                          │                       │── push queue
  │                          │                       │── process() 启动
  │←── 200 { queued } ──────│                       │   （异步处理）
  │                          │                       │
  │                          │                       │── execute(job) ← 异步
  │                          │                       │   indexMarket(m1)
```

> **💡 为什么用队列而不是直接 await**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | 入队后立即返回 200 | `indexMarket` 耗时（可能秒级） | 客户端等几秒才响应，超时风险 |
> | 异步处理 | 不阻塞请求线程 | 占用请求资源，吞吐量下降 |
> | fire-and-forget | 简单，适合低并发 | 高并发需专业队列（BullMQ/Celery） |

### 1.7 JobQueue 的局限性

| 局限 | 说明 | 生产方案 |
|---|---|---|
| 内存队列 | 进程重启任务丢失 | Redis-backed 队列（BullMQ） |
| 无重试 | `execute` 失败就丢了 | 指数退避重试（见第 3 篇） |
| 无死信队列 | 失败任务无记录 | DLQ 存失败任务待人工处理 |
| 无优先级 | FIFO，紧急任务排后面 | 优先级队列 |
| 无并发控制 | 串行执行 | worker pool 并发处理 |
| `execute` 无法子类化 | private 限制 | 改 protected / abstract |

> **⚠️ 本 skill 的 JobQueue 是"教学示例"**
>
> 源文件称其为 `Simple Queue Pattern`，明确是简化版。**生产环境禁用**，应使用：
> - Node.js: BullMQ / Bee-Queue（Redis-backed）
> - Python: Celery / RQ
> - Go: asynq / machinery
> - 平台原生: Vercel Background Functions / AWS SQS + Lambda

### 1.8 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| Job Queue | `OperationQueue` / `DispatchQueue`（后台任务队列） | WorkManager（持久化后台任务） |
| `add(job)` 入队 | `queue.addOperation(op)` | `workManager.enqueue(request)` |
| `process()` 循环 | `OperationQueue` 自动调度 | WorkManager 的 Worker 执行 |
| 失败不中断 | `Operation` 的 `completionBlock` 记错误 | `Result.failure()` 不阻塞队列 |
| 内存队列丢失 | app 杀进程队列丢失 | WorkManager 持久化（重启不丢） |
| requestId | `URLSession.taskIdentifier` | `WorkRequest.getId()` |

## 二、结构化日志

### 2.1 LogContext 接口定义

```typescript
// (:502-508)
interface LogContext {
  userId?: string
  requestId?: string
  method?: string
  path?: string
  [key: string]: unknown
}
```

**4 个显式字段 + 1 个扩展字段**：

| 字段 | 类型 | 用途 |
|---|---|---|
| `userId` | `string?` | 关联用户（已认证时） |
| `requestId` | `string?` | 关联请求（贯穿请求生命周期） |
| `method` | `string?` | HTTP 方法（GET/POST...） |
| `path` | `string?` | 请求路径 |
| `[key: string]` | `unknown` | 扩展字段（任意业务上下文） |

> **💡 为什么 4 个显式字段用 `?` 可选**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | 全部可选 | 不同日志点上下文不同 | 强制传全部字段会写很多 `undefined` |
> | 扩展字段 `unknown` | 允许任意业务字段 | 用 `any` 失去类型检查 |
> | `userId` 仅认证后有 | 未认证请求没 userId | 强制传会报错 |
> | `requestId` 贯穿 | 串联一个请求的所有日志 | 无法追踪请求链路 |

### 2.2 Logger 类设计

```typescript
// (:510-537)
class Logger {
  log(level: 'info' | 'warn' | 'error', message: string, context?: LogContext) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    }

    console.log(JSON.stringify(entry))
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context)
  }

  error(message: string, error: Error, context?: LogContext) {
    this.log('error', message, {
      ...context,
      error: error.message,
      stack: error.stack
    })
  }
}
```

**3 层方法结构**：

```
logger.info / logger.warn / logger.error      ← 3 个便捷方法
       │
       └─→ logger.log(level, message, context) ← 核心方法
              │
              └─→ console.log(JSON.stringify(entry))  ← 输出
```

| 方法 | level | 特殊处理 |
|---|---|---|
| `info` | `'info'` | 无 |
| `warn` | `'warn'` | 无 |
| `error` | `'error'` | **自动带 error.message + error.stack** |
| `log` | 参数传入 | 核心实现 |

### 2.3 error 方法的特殊设计

```typescript
// (:530-536)
error(message: string, error: Error, context?: LogContext) {
  this.log('error', message, {
    ...context,              // 业务上下文
    error: error.message,   // 错误消息
    stack: error.stack      // 调用栈
  })
}
```

**与其他方法的差异**：

| 对比项 | `info` / `warn` | `error` |
|---|---|---|
| 参数 | `(message, context?)` | `(message, error, context?)` |
| 额外字段 | 无 | `error.message` + `error.stack` |
| 签名多一个 `Error` | 否 | 是 |

> **💡 为什么 error 方法签名不同**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | 第二参数是 `Error` 对象 | 自动提取 message + stack | 调用方手动传 error.message |
> | `stack` 仅 error 级别记 | stack 冗长，info/warn 不需要 | 日志膨胀 |
> | context 仍可选 | 业务上下文与错误分离 | 错误日志无法关联业务 |
> | `...context` 在前 | 业务字段不被 error 覆盖 | 若 error 在前，context 可覆盖 error 字段 |

### 2.4 日志输出格式

```typescript
const entry = {
  timestamp: new Date().toISOString(),
  level,         // 'info' | 'warn' | 'error'
  message,
  ...context     // userId / requestId / method / path / 扩展字段
}
console.log(JSON.stringify(entry))
```

**输出示例**：

```json
// info 日志
{
  "timestamp": "2026-06-23T10:30:00.000Z",
  "level": "info",
  "message": "Fetching markets",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "GET",
  "path": "/api/markets"
}

// error 日志（自动带 error + stack）
{
  "timestamp": "2026-06-23T10:30:01.000Z",
  "level": "error",
  "message": "Failed to fetch markets",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Connection refused",
  "stack": "Error: Connection refused\n    at fetchMarkets..."
}
```

> **💡 为什么用 JSON 格式**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | `JSON.stringify` | 机器可读，日志系统（ELK/Datadog）易解析 | 纯文本难解析，无法字段检索 |
> | `timestamp` 用 ISO 8601 | 时区明确，排序友好 | 本地时间格式跨时区混乱 |
> | `level` 字段 | 日志系统按级别过滤 | 纯文本需正则提取级别 |
> | `...context` 展开 | 业务字段平铺在顶层 | 嵌套 `context: {...}` 难查询 |

### 2.5 单例模式

```typescript
// (:539)
const logger = new Logger()
```

**设计要点**：

| 要点 | 说明 |
|---|---|
| 模块级单例 | `import { logger } from './logger'` 共享一个实例 |
| 无配置 | 不接受参数（如 logLevel / output stream） |
| 直接 `console.log` | 无 transport 层抽象（不能切到文件/syslog） |

> **⚠️ 局限性**
>
> | 局限 | 说明 |
> |---|---|
> | 无日志级别过滤 | 生产应支持只记 warn+，不记 info |
> | 无 transport 抽象 | 无法切到文件/syslog/远程日志服务 |
> | 无采样 | 高频日志会淹没日志系统 |
> | 无脱敏 | `context` 里若含密码/token 会原样输出 |

## 三、requestId 上下文传递

### 3.1 请求入口生成 requestId

```typescript
// (:543)
const requestId = crypto.randomUUID()
```

**`crypto.randomUUID()`**：Node.js 18+ 内置，生成 UUID v4（如 `550e8400-e29b-41d4-a716-446655440000`）。

**生成位置**：每个请求入口（handler 第一行）生成。

### 3.2 requestId 贯穿请求生命周期

```typescript
// (:542-558)
export async function GET(request: Request) {
  const requestId = crypto.randomUUID()         // ① 生成

  logger.info('Fetching markets', {              // ② 开始日志
    requestId,
    method: 'GET',
    path: '/api/markets'
  })

  try {
    const markets = await fetchMarkets()        // ③ 业务
    return NextResponse.json({ success: true, data: markets })
  } catch (error) {
    logger.error('Failed to fetch markets', error as Error, { requestId })  // ④ 错误日志
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

**4 步时序**：

```
请求入口 (GET /api/markets)
   │
   │ ① requestId = crypto.randomUUID()
   │
   ├─ ② logger.info('Fetching markets', { requestId, ... })
   │      ↓ 日志带 requestId
   │
   ├─ ③ fetchMarkets()
   │      ├─ 成功 → return 200
   │      └─ 失败 ↓
   │
   └─ ④ logger.error('Failed to fetch markets', error, { requestId })
          ↓ 错误日志带相同 requestId
```

### 3.3 requestId 的关联作用

**同一请求的所有日志用相同 requestId 关联**：

```
请求 A (requestId: aaa-111)
  ├─ [10:30:00] info  "Fetching markets"     { requestId: "aaa-111" }
  ├─ [10:30:01] info  "DB query executed"    { requestId: "aaa-111" }
  └─ [10:30:02] error "Failed to fetch"      { requestId: "aaa-111" }

请求 B (requestId: bbb-222)
  ├─ [10:30:01] info  "Fetching markets"     { requestId: "bbb-222" }
  └─ [10:30:01] info  "DB query executed"    { requestId: "bbb-222" }
```

**日志系统可按 requestId 过滤**：查 `requestId: "aaa-111"` 可重建请求 A 的完整执行链路。

### 3.4 上下文传递模式

```
    ┌─────────────────────────────────────┐
    │ 请求入口                              │
    │    requestId = crypto.randomUUID()    │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 每个 logger 调用都带 requestId       │
    │    logger.info(..., { requestId })   │
    │    logger.warn(..., { requestId })   │
    │    logger.error(..., { requestId })   │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 日志系统按 requestId 串联             │
    │    查询: requestId="xxx"             │
    │    结果: 一个请求的所有日志           │
    └─────────────────────────────────────┘
```

> **💡 客户端类比：requestId**
>
> | 服务端概念 | iOS 类比 | Android 类比 |
> |---|---|---|
> | requestId | `URLSession.task.taskIdentifier` | `OkHttp Call.id()` |
> | `crypto.randomUUID()` | `UUID().uuidString` | `UUID.randomUUID().toString()` |
> | 日志带 requestId | OSLog 的 `subsystem + category` | Log 按Tag 分组 |
> | 按 requestId 查日志 | Instruments 按 task ID 过滤 | Logcat 按 tag 过滤 |
> | 请求生命周期 | task 的 start ~ finish | Call 的 enqueue ~ onResponse |

### 3.5 上下文未传递的局限

本 skill 的 requestId 是**手动传参**模式：每个 `logger.xxx` 调用都要显式传 `{ requestId }`。

**问题**：

```typescript
// 反例：忘记传 requestId
logger.info('DB query executed')   // ❌ 没带 requestId，无法关联
```

**生产方案（本 skill 未实现）**：

| 方案 | 说明 | 适用 |
|---|---|---|
| AsyncLocalStorage | Node.js 的"线程本地存储"，自动透传 | Node 14+ |
| Context 变量 | 把 requestId 存到 `Context` 对象，下游函数接收 | 函数式 |
| 中间件注入 | middleware 把 requestId 挂到 `request.requestId` | Express/Next.js |

**AsyncLocalStorage 示例**（本 skill 未采用）：

```typescript
import { AsyncLocalStorage } from 'async_hooks'

const als = new AsyncLocalStorage<{ requestId: string }>()

// middleware
function withRequestId(handler) {
  return (req, res) => {
    const requestId = crypto.randomUUID()
    als.run({ requestId }, () => handler(req, res))
  }
}

// 业务代码无需手动传 requestId
class Logger {
  log(level, message, context?) {
    const store = als.getStore()  // 自动拿到 requestId
    const entry = {
      timestamp: new Date().toISOString(),
      level, message,
      requestId: store?.requestId,  // 自动带
      ...context
    }
    console.log(JSON.stringify(entry))
  }
}
```

## 四、可观测性设计

### 4.1 请求入口的可观测

```typescript
// (:542-558)
export async function GET(request: Request) {
  const requestId = crypto.randomUUID()

  logger.info('Fetching markets', {          // 入口日志
    requestId,
    method: 'GET',
    path: '/api/markets'
  })

  try {
    const markets = await fetchMarkets()
    return NextResponse.json({ success: true, data: markets })
  } catch (error) {
    logger.error('Failed to fetch markets', error as Error, { requestId })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

**3 个可观测点**：

| 可观测点 | 实现 | 用途 |
|---|---|---|
| 入口日志 | `logger.info('Fetching markets', { requestId, method, path })` | 知道请求来了 |
| 错误日志 | `logger.error('Failed...', error, { requestId })` | 知道请求失败原因 |
| requestId | `crypto.randomUUID()` | 串联整个请求 |

### 4.2 与 middleware 层的协作

```
    ┌─────────────────────────────────────┐
    │ Middleware 层                        │
    │    - 生成 requestId                  │
    │    - 注入到 request 对象              │
    │    - 记录请求开始日志                 │
    │    - 记录请求结束日志（含耗时）        │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ Handler 层                           │
    │    - 用 middleware 生成的 requestId   │
    │    - 业务日志带 requestId             │
    │    - 错误日志带 requestId + error     │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ Service 层                           │
    │    - 接收 requestId（透传）           │
    │    - 业务日志带 requestId             │
    └─────────────────────────────────────┘
```

> **⚠️ 本 skill 未实现 middleware 层的 requestId 注入**
>
> 源文件示例里 requestId 在 handler 内生成（:543），未提到 middleware。生产应在 middleware 层生成并注入，避免每个 handler 手动生成。

### 4.3 错误日志的上下文

```typescript
// (:555)
logger.error('Failed to fetch markets', error as Error, { requestId })
```

**错误日志包含**：

| 字段 | 来源 | 用途 |
|---|---|---|
| `timestamp` | `new Date().toISOString()` | 时间点 |
| `level` | `'error'` | 级别 |
| `message` | `'Failed to fetch markets'` | 业务描述 |
| `requestId` | context 传入 | 关联请求 |
| `error` | `error.message` | 错误消息 |
| `stack` | `error.stack` | 调用栈 |

**输出 JSON**：

```json
{
  "timestamp": "2026-06-23T10:30:02.000Z",
  "level": "error",
  "message": "Failed to fetch markets",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Connection refused",
  "stack": "Error: Connection refused\n    at fetchMarkets (file:///...)"
}
```

### 4.4 日志与 errorHandler 的协作

上一篇（第 3 篇）的 `errorHandler` 在未知错误时调 `console.error`：

```typescript
// 第 3 篇 errorHandler
if (error instanceof ApiError) {
  return NextResponse.json({...}, { status: error.statusCode })
}
if (error instanceof z.ZodError) {
  return NextResponse.json({...}, { status: 400 })
}
// 未知错误
console.error('Unexpected error:', error)   // ← 这里应改用 logger.error
return NextResponse.json({...}, { status: 500 })
```

**整合建议**（本 skill 未明确，但合理）：

| 位置 | 本 skill | 整合后 |
|---|---|---|
| `errorHandler` 未知错误 | `console.error` | `logger.error('Unexpected error', error, { requestId })` |
| `JobQueue` 任务失败 | `console.error('Job failed:', error)` | `logger.error('Job failed', error, { jobId })` |

## 五、设计哲学

### 5.1 Job Queue 的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 泛型 `JobQueue<T>` | 类型安全，不同 job 类型独立 | 用 `any` 失去类型检查 |
| `processing` 标志防重入 | 避免多个循环并发 shift | 竞争条件导致任务丢失 |
| 失败不中断 | 单 job 失败不影响队列 | 一个坏 job 阻塞全部 |
| fire-and-forget `add` | 快速响应，处理异步 | 调用方等待，失去队列意义 |
| `execute` 留空 | 教学示例，子类填逻辑 | private 导致无法 override（缺陷） |

### 5.2 结构化日志的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| JSON 格式 | 机器可读，易解析 | 纯文本难检索 |
| `timestamp` ISO 8601 | 时区明确 | 本地时间跨时区混乱 |
| `level` 枚举 | 日志系统按级别过滤 | 字符串易拼错 |
| `context` 扩展字段 | 业务上下文灵活 | 固定字段不够用 |
| `error` 自动带 stack | 错误溯源 | 手动传易遗漏 |

### 5.3 requestId 的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 每个请求一个 UUID | 全局唯一，不冲突 | 自增 ID 在多实例下重复 |
| 贯穿请求生命周期 | 串联一个请求的所有日志 | 日志散落，无法追踪 |
| 手动传参（非 AsyncLocalStorage） | 简单，无依赖 | 易遗忘，需开发者自律 |

### 5.4 与 examples/CLAUDE.md 的呼应

通用 CLAUDE.md 模板定义的可观测契约：

```typescript
// examples/CLAUDE.md 的 observability 部分
- Structured logging with correlation IDs
- Request/response logging
- Error logging with stack traces
```

本 skill 落地实现：

| examples 契约 | 本 skill 实现 |
|---|---|
| Structured logging | `Logger` 类 + JSON 输出 |
| Correlation IDs | `requestId` 字段 + `crypto.randomUUID()` |
| Request/response logging | `logger.info` 在 handler 入口 |
| Error logging with stack traces | `logger.error` 自动带 `error.message` + `error.stack` |

### 5.5 与其他 skill 的协作

| 协作 skill | 协作点 |
|---|---|
| `api-design` | 限流错误（429）的日志格式 |
| `security-review` | 日志脱敏（不记密码/token） |
| `cost-aware-llm-pipeline` | LLM 调用日志（token 用量、成本） |
| `continuous-learning` | 从日志中提取错误模式 |

## 六、反模式汇总

### 6.1 Job Queue 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 用内存队列做持久化任务 | 进程重启任务丢失 | Redis-backed 队列 |
| `execute` 失败 rethrow | 队列中断 | catch + 记日志 |
| `processing` 不防重入 | 多循环并发 shift | 布尔标志守门 |
| 无重试机制 | 瞬时错误导致任务丢失 | 指数退避重试 |
| 无死信队列 | 失败任务无记录 | DLQ 存储 |

### 6.2 日志反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| `console.log('xxx')` 纯文本 | 不可解析 | `JSON.stringify` 结构化 |
| 日志带密码/token | 安全风险 | 脱敏后记录 |
| `error.message` 不带 stack | 无法溯源 | `logger.error` 自动带 stack |
| 无 requestId | 无法关联请求 | 每个日志带 requestId |
| 本地时间格式 | 跨时区混乱 | ISO 8601 UTC |

### 6.3 可观测反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| requestId 在 handler 生成 | 重复代码 | middleware 层统一生成 |
| requestId 不透传到 Service | 深层日志无法关联 | AsyncLocalStorage 或显式传参 |
| 只记 error 不记 info | 缺少正常流程上下文 | 关键路径都记 info |
| 日志无采样 | 高频日志淹没系统 | 采样率 + 级别过滤 |

## 七、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| Job Queue | 泛型 `JobQueue<T>` 类型安全 | 标准 |
| Job Queue | `processing` 标志防重入 | HIGH |
| Job Queue | 失败记日志不中断 | HIGH |
| Job Queue | `add` 后 fire-and-forget | 标准 |
| Job Queue | `execute` private 无法 override（**缺陷**） | ⚠️ 需修复 |
| Job Queue | **内存队列仅限教学，生产用 Redis-backed** | CRITICAL |
| 日志 | `LogContext` 含 requestId / userId / method / path | 标准 |
| 日志 | 扩展字段用 `[key: string]: unknown` | 标准 |
| 日志 | JSON 格式输出 | HIGH |
| 日志 | `timestamp` 用 ISO 8601 | 标准 |
| 日志 | `error` 方法自动带 error.message + stack | HIGH |
| 日志 | 单例 `const logger = new Logger()` | 标准 |
| requestId | 用 `crypto.randomUUID()` | 标准 |
| requestId | 每请求生成一个，贯穿生命周期 | HIGH |
| requestId | 手动传参（非 AsyncLocalStorage） | ⚠️ 可改进 |
| 可观测 | 入口日志 + 错误日志都带 requestId | HIGH |
| 可观测 | 错误日志带 stack | HIGH |
| 可观测 | middleware 层应统一注入 requestId | 标准 |
| 整合 | `errorHandler` 未知错误改用 `logger.error` | 标准 |
| 整合 | `JobQueue` 任务失败改用 `logger.error` | 标准 |

---

## 系列完结

至此，backend-patterns skill 的 5 篇深度分析全部完成：

| # | 文件 | 主题 |
|---|---|---|
| 1 | `backend-patterns-深度分析-一-架构与分层.md` | Repository / Service / Middleware 三层架构 |
| 2 | `backend-patterns-深度分析-二-数据库与缓存.md` | 查询优化、N+1 防护、事务边界、Redis Cache-Aside |
| 3 | `backend-patterns-深度分析-三-API设计与错误处理.md` | RESTful 规范、统一响应、ApiError、重试退避 |
| 4 | `backend-patterns-深度分析-四-鉴权与限流.md` | JWT 验证、RBAC、HOF 中间件、限流硬性约束 |
| 5 | `backend-patterns-深度分析-五-后台任务与可观测.md` | Job Queue、结构化日志、requestId 上下文 |
