# backend-patterns 深度分析（三）：API 设计与错误处理

> 源文件：`skills/backend-patterns/SKILL.md`（:21-34, 264-344 行）
> 本篇聚焦：RESTful URL 规范、HTTP 方法语义、统一响应格式、错误分类与重试退避
> 系列第 3 篇，共 5 篇

## 一、RESTful URL 规范

### 1.1 资源命名规则

```typescript
// PASS: 资源型 URL
GET    /api/markets                 # 列资源
GET    /api/markets/:id             # 单资源
POST   /api/markets                 # 创建资源
PUT    /api/markets/:id             # 替换资源（整体）
PATCH  /api/markets/:id             # 更新资源（部分）
DELETE /api/markets/:id             # 删除资源
```

### 1.2 URL 设计规则

| 规则 | 正例 | 反例 |
|---|---|---|
| 用名词复数 | `/api/markets` | `/api/getMarkets`、`/api/market` |
| 资源 ID 在路径 | `/api/markets/123` | `/api/markets?id=123`（GET 单个时） |
| 动作用 HTTP 方法 | `DELETE /api/markets/123` | `POST /api/markets/123/delete` |
| 嵌套表达从属 | `/api/users/123/markets` | `/api/userMarkets?userId=123` |
| 版本在路径或头 | `/api/v1/markets` 或 `Accept: application/vnd.api+json;version=1` | 无版本 |

### 1.3 查询参数规范

```typescript
// PASS: 查询参数用于过滤、排序、分页
GET /api/markets?status=active&sort=volume&limit=20&offset=0
```

| 参数类型 | 示例 | 用途 |
|---|---|---|
| 过滤 | `?status=active` | 等值过滤 |
| 排序 | `?sort=volume` 或 `?sort=-volume`（降序） | 排序字段 |
| 分页 | `?limit=20&offset=0` | limit/offset 分页 |
| 字段选择 | `?fields=id,name,status` | 只返回指定字段（GraphQL 风格） |
| 搜索 | `?q=keyword` | 全文搜索 |

**关键约束**：
- 过滤参数名与字段名一致（`status` 对应 `markets.status`）
- 排序降序用 `-` 前缀（`-volume`），与 GitHub API 一致
- 分页**必须有 limit**，不允许无限返回（见数据库篇的硬性规则）

### 1.4 HTTP 方法语义对照

| 方法 | 语义 | 幂等性 | 安全性 | body |
|---|---|---|---|---|
| GET | 读取 | 是 | 是 | 无 |
| POST | 创建 | 否 | 否 | 有 |
| PUT | 整体替换 | 是 | 否 | 有（完整资源） |
| PATCH | 部分更新 | 否 | 否 | 有（部分字段） |
| DELETE | 删除 | 是 | 否 | 无 |

**幂等性的实践意义**：
- GET/PUT/DELETE 可安全重试（网络抖动时客户端可自动重试）
- POST 不可重试（重复提交会创建多个资源）—— 需幂等键

### 1.5 状态码使用规范

| 状态码 | 场景 |
|---|---|
| 200 OK | GET/PUT/PATCH/DELETE 成功 |
| 201 Created | POST 创建成功 |
| 204 No Content | DELETE 成功（无响应体） |
| 400 Bad Request | 请求参数错误、验证失败 |
| 401 Unauthorized | 未认证（token 缺失/无效） |
| 403 Forbidden | 已认证但无权限 |
| 404 Not Found | 资源不存在 |
| 409 Conflict | 资源冲突（如唯一约束） |
| 422 Unprocessable Entity | 语义错误（如业务规则违反） |
| 429 Too Many Requests | 限流触发 |
| 500 Internal Server Error | 服务端异常 |

**关键区分**：
- 401 vs 403：401 是"你是谁？"（未认证），403 是"你不能做这事"（已认证但无权）
- 400 vs 422：400 是请求格式错（JSON 解析失败），422 是语义错（字段合法但业务规则不允许）
- 404 vs 403：**资源不存在时，无权限用户也返回 404**（避免泄露资源存在性）

## 二、统一响应格式

### 2.1 成功响应

```typescript
// 标准成功
return NextResponse.json({ success: true, data })
```

### 2.2 失败响应

```typescript
// 标准失败
return NextResponse.json({
  success: false,
  error: 'User-friendly message'
}, { status: 400 })
```

### 2.3 验证错误（带详情）

```typescript
return NextResponse.json({
  success: false,
  error: 'Validation failed',
  details: error.errors   // Zod 的 errors 数组
}, { status: 400 })
```

### 2.4 响应格式契约

```typescript
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: any }
```

**关键设计**：
- **布尔 `success` 字段**：客户端先查 `success`，不用靠状态码判断
- **`data` 只在成功时出现**：失败时不返回 `data: null`（避免 null 检查歧义）
- **`error` 是用户友好消息**：不是技术错误，是给人看的
- **`details` 可选**：验证错误等结构化错误才带，普通错误不带

### 2.5 与 examples/CLAUDE.md 的呼应

通用 CLAUDE.md 模板（examples/CLAUDE.md:64-72）定义的接口：

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

而 SaaS 样例（examples/saas-nextjs-CLAUDE.md:72-76）用**判别联合**更严格：

```typescript
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }
```

**演进**：判别联合比可选字段更安全 —— TypeScript 会强制处理 success=true/false 两种分支。

## 三、错误处理模式

### 3.1 自定义错误类

```typescript
class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message)
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}
```

**3 个字段**：

| 字段 | 用途 |
|---|---|
| `statusCode` | HTTP 状态码，用于响应 |
| `message` | 用户友好错误消息 |
| `isOperational` | 是否预期内错误（vs 编程 bug） |

**`isOperational` 的意义**：
- `true`：业务错误（如"用户不存在"、"余额不足"），可向用户展示
- `false`：编程 bug（如 null 引用、类型错误），不应展示给用户，需修复代码

### 3.2 `Object.setPrototypeOf` 的必要性

```typescript
constructor(...) {
  super(message)
  Object.setPrototypeOf(this, ApiError.prototype)  // 关键！
}
```

**为什么需要**：TypeScript 编译到 ES5 时，`extends Error` 的 `instanceof` 检查会失败（原型链丢失）。手动 `setPrototypeOf` 修复。

**没有这行的后果**：
```typescript
try { throw new ApiError(400, 'bad') } catch (e) {
  if (e instanceof ApiError) { /* 永远不进这里 */ }
}
```

### 3.3 集中式错误处理器

```typescript
export function errorHandler(error: unknown, req: Request): Response {
  // 1. 已知业务错误
  if (error instanceof ApiError) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: error.statusCode })
  }

  // 2. 验证错误（Zod）
  if (error instanceof z.ZodError) {
    return NextResponse.json({
      success: false,
      error: 'Validation failed',
      details: error.errors
    }, { status: 400 })
  }

  // 3. 未知错误（编程 bug）
  console.error('Unexpected error:', error)

  return NextResponse.json({
    success: false,
    error: 'Internal server error'
  }, { status: 500 })
}
```

**3 层错误分类**：

| 层 | 错误类型 | 处理 | 状态码 |
|---|---|---|---|
| 1 | `ApiError` | 返回 message | error.statusCode |
| 2 | `ZodError` | 返回 details | 400 |
| 3 | 其他（未知） | 记日志，返回通用消息 | 500 |

**关键设计**：
- **未知错误不泄露细节**：返回 `"Internal server error"`，不返回 `error.message` 或 `error.stack`
- **未知错误必记日志**：`console.error('Unexpected error:', error)` 供排查
- **业务错误 message 可展示**：因为 `isOperational = true` 的错误是预期内的

### 3.4 Handler 中使用

```typescript
export async function GET(request: Request) {
  try {
    const data = await fetchData()
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return errorHandler(error, request)
  }
}
```

**约定**：每个 handler 都用 `try/catch` 包裹，catch 统一调 `errorHandler`。

### 3.5 抛出业务错误的模式

```typescript
async function getUser(id: string): Promise<User> {
  const user = await db.users.findUnique({ where: { id } })

  if (!user) {
    throw new ApiError(404, 'User not found')  // 业务错误
  }

  return user
}

async function deleteUser(userId: string, requesterId: string) {
  const requester = await db.users.findUnique({ where: { id: requesterId } })

  if (requester.role !== 'admin') {
    throw new ApiError(403, 'Insufficient permissions')  // 权限错误
  }

  await db.users.delete({ where: { id: userId } })
}
```

**抛出位置**：在 Service 或 Repository 层抛 `ApiError`，由 handler 的 catch 统一处理。

## 四、重试与退避

### 4.1 指数退避实现

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      if (i < maxRetries - 1) {
        // 指数退避：1s, 2s, 4s
        const delay = Math.pow(2, i) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError!
}
```

### 4.2 退避序列

| 重试次数 | i | 延迟 |
|---|---|---|
| 第 1 次 | 0 | 2^0 × 1000 = 1s |
| 第 2 次 | 1 | 2^1 × 1000 = 2s |
| 第 3 次 | 2 | 2^2 × 1000 = 4s |
| 第 4 次 | 3 | 不再重试，抛 lastError |

### 4.3 重试规则

| 规则 | 说明 |
|---|---|
| 默认 3 次重试 | `maxRetries = 3` |
| 最后一次不 sleep | `if (i < maxRetries - 1)` 避免最后一次还 sleep |
| 保留 lastError | 重试耗尽后抛**最后一次**的错误 |
| 非空断言 `!` | `throw lastError!` 因为 TS 不知道循环必然抛 |

### 4.4 什么错误应该重试

| 错误类型 | 重试？ | 原因 |
|---|---|---|
| 网络超时 | 是 | 瞬时错误 |
| 5xx 服务端错误 | 是 | 服务端临时不可用 |
| 429 限流 | 是（带 Retry-After） | 限流是临时的 |
| 4xx 客户端错误 | 否 | 请求本身有问题，重试无意义 |
| 401/403 | 否 | 认证/权限问题，需人工介入 |
| 业务错误（ApiError） | 否 | 业务规则违反，重试不会变好 |

> **注意**：本 skill 的 `fetchWithRetry` 是简化版，**没有区分错误类型**，对所有错误都重试。生产应判断错误类型后再决定是否重试（参考 `cost-aware-llm-pipeline` skill 的 `_RETRYABLE_ERRORS` 模式）。

### 4.5 使用示例

```typescript
const data = await fetchWithRetry(() => fetchFromAPI())

// 调用外部 API
const weather = await fetchWithRetry(() => fetchWeatherAPI(city), 5)
```

**适用场景**：
- 外部 API 调用（第三方服务可能抖动）
- 数据库连接（瞬时连接失败）
- 文件 I/O（磁盘瞬时不可用）

**不适用**：
- 内部业务逻辑（ApiError 不应重试）
- 用户输入验证（重试不会改变结果）

## 五、错误处理的设计哲学

### 5.1 三层错误分类

```
错误来源
   │
   ├─ 用户输入问题 → ZodError → 400 + details
   │
   ├─ 业务规则违反 → ApiError(statusCode, message) → 对应状态码
   │
   └─ 编程 bug → 未知错误 → 500 + 通用消息 + 记日志
```

### 5.2 错误信息的安全边界

| 错误类型 | 暴露给用户 | 暴露给日志 |
|---|---|---|
| 业务错误（ApiError） | message | message + statusCode |
| 验证错误（ZodError） | "Validation failed" + details | details |
| 未知错误 | "Internal server error" | 完整 error 对象 + stack |

**关键**：未知错误**绝不**向用户暴露 `error.message` 或 `error.stack`，可能含敏感信息（数据库连接字符串、内部路径）。

### 5.3 与 security-review skill 的协作

`security-review` skill（系列一）的 "Sensitive Data Exposure" 域规定：

```typescript
// FAIL: 暴露内部细节
catch (error) {
  return NextResponse.json(
    { error: error.message, stack: error.stack },
    { status: 500 }
  )
}

// PASS: 通用错误消息
catch (error) {
  console.error('Internal error:', error)
  return NextResponse.json(
    { error: 'An error occurred. Please try again.' },
    { status: 500 }
  )
}
```

本 skill 的 `errorHandler` 严格遵循这个规则。

## 六、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| URL | 名词复数，资源 ID 在路径 | 标准 |
| URL | 动作用 HTTP 方法，不在 URL 编码动作 | 标准 |
| URL | 查询参数用于过滤/排序/分页 | 标准 |
| 分页 | 必须有 limit | CRITICAL |
| 响应 | 统一 `{success, data/error}` 格式 | HIGH |
| 响应 | 失败不返回 `data: null`，直接不返回 data | HIGH |
| 错误 | 自定义 `ApiError` 类带 statusCode + isOperational | 标准 |
| 错误 | 集中式 `errorHandler` 处理 3 类错误 | HIGH |
| 错误 | 未知错误不泄露 message/stack | CRITICAL |
| 错误 | 未知错误必记日志 | HIGH |
| 重试 | 指数退避（1s, 2s, 4s） | 标准 |
| 重试 | 默认 3 次，最后一次不 sleep | 标准 |
| 重试 | 业务错误不重试 | HIGH |

---

## 下一篇

- [backend-patterns 深度分析（四）：鉴权与限流](./backend-patterns-深度分析-四-鉴权与限流.md) — JWT 验证、RBAC 权限模型、HOF 中间件、限流硬性约束
