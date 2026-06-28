# backend-patterns 深度分析（四）：鉴权与限流

> 源文件：`skills/backend-patterns/SKILL.md`（:346-441 行）
> 本篇聚焦：JWT 验证、RBAC 权限模型、HOF 中间件、限流硬性约束
> 系列第 4 篇，共 5 篇

## 一、JWT Token 验证

### 1.1 JWTPayload 接口定义

```typescript
// (:353-357)
interface JWTPayload {
  userId: string
  email: string
  role: 'admin' | 'user'
}
```

**3 个字段**：

| 字段 | 类型 | 用途 |
|---|---|---|
| `userId` | `string` | 用户唯一标识，贯穿后续查询（如 `getDataForUser(user.userId)`） |
| `email` | `string` | 用户邮箱，用于审计日志/展示 |
| `role` | `'admin' \| 'user'` | 角色标识，用于粗粒度鉴权 |

> **⚠️ 冲突点（需暴露，不折中）**
>
> `JWTPayload.role` 的取值是 `'admin' | 'user'`（:356，2 种），而下面 RBAC 的 `User.role` 是 `'admin' | 'moderator' | 'user'`（:395，3 种）。**同一个项目里 role 枚举不一致**，意味着 JWT 签发时无法携带 `moderator`，`moderator` 角色走不通 JWT 路径。
>
> | 位置 | 定义 | 取值 |
> |---|---|---|
> | `JWTPayload.role`（:356） | JWT 载荷 | `'admin' \| 'user'` |
> | `User.role`（:395） | RBAC 权限表 | `'admin' \| 'moderator' \| 'user'` |
>
> **修复方向**：以 `User.role` 为准（3 种更完整），把 `JWTPayload.role` 也改成 `'admin' | 'moderator' | 'user'`，否则 moderator 无法通过 JWT 鉴权。

### 1.2 verifyToken 函数

```typescript
// (:359-366)
import jwt from 'jsonwebtoken'

export function verifyToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload
    return payload
  } catch (error) {
    throw new ApiError(401, 'Invalid token')
  }
}
```

**设计要点**：

| 要点 | 说明 |
|---|---|
| 同步函数 | `jwt.verify` 是同步 API，返回 payload 直接用 |
| 类型断言 `as JWTPayload` | `jwt.verify` 返回 `string \| object`，断言成业务类型 |
| `process.env.JWT_SECRET!` | 非空断言，假设环境变量已配置 |
| 失败转 `ApiError(401)` | 不暴露 jwt 库的原始错误，统一成业务错误 |
| 错误 message 固定 | `"Invalid token"`，不区分过期/篡改/格式错，避免信息泄露 |

> **💡 为什么 `verifyToken` 失败时只返回 "Invalid token"**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | 合并所有 JWT 错误 | `jwt.verify` 可能抛 `TokenExpiredError`、`JsonWebTokenError`、`NotBeforeError` | 攻击者可依据错误类型枚举 token 状态 |
> | 用 `ApiError(401)` | 复用上一篇的集中式 errorHandler | 需要 handler 各自处理鉴权错误 |
> | 不记原始 error | `catch (error)` 但未用 | 日志若记 `error.message` 可能泄露 secret 片段 |

### 1.3 requireAuth 中间件

```typescript
// (:368-376)
export async function requireAuth(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')

  if (!token) {
    throw new ApiError(401, 'Missing authorization token')
  }

  return verifyToken(token)
}
```

**3 步流程**：

```
    ┌─────────────────────────────────────┐
    │ ① 提取 Bearer token                  │
    │    header.authorization              │
    │    .replace('Bearer ', '')           │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ② token 缺失?                         │
    │    ├─ 是 → throw ApiError(401,       │
    │    │         'Missing authorization │
    │    │         token')                │
    │    └─ 否 → 继续                       │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ③ verifyToken(token)                 │
    │    返回 JWTPayload                   │
    └─────────────────────────────────────┘
```

### 1.4 Bearer token 提取的细节

```typescript
const token = request.headers.get('authorization')?.replace('Bearer ', '')
```

| 细节 | 说明 | 风险 |
|---|---|---|
| `?.` 可选链 | header 可能不存在 | 避免空指针 |
| `replace('Bearer ', '')` | 去掉前缀 | **脆弱**：见下方 |
| 区分大小写 | `replace` 不忽略大小写 | `"bearer xxx"` 会残留前缀，验证失败 |

> **⚠️ `replace('Bearer ', '')` 的反模式**
>
> 这个写法假设 header 格式严格是 `"Bearer <token>"`。但实际客户端可能传：
>
> | 实际输入 | replace 后 | 结果 |
> |---|---|---|
> | `"Bearer abc123"` | `"abc123"` | ✅ 正确 |
> | `"bearer abc123"` | `"bearer abc123"` | ❌ 残留前缀 |
> | `"Bearer  abc123"`（双空格） | `" abc123"` | ❌ 多一个空格 |
> | `"Bearer abc123 "`（尾空格） | `"abc123 "` | ❌ 尾空格 |
>
> **更健壮的写法**（本 skill 未采用）：
>
> ```typescript
> const auth = request.headers.get('authorization') ?? ''
> const match = auth.match(/^Bearer\s+(.+)$/i)
> const token = match?.[1]?.trim()
> ```

### 1.5 在 API 路由中使用

```typescript
// (:378-385)
export async function GET(request: Request) {
  const user = await requireAuth(request)          // 鉴权
  const data = await getDataForUser(user.userId)  // 用 user.userId 查数据
  return NextResponse.json({ success: true, data })
}
```

**模式**：每个需要鉴权的 handler 第一行调 `requireAuth`，拿到 `user` 后业务逻辑用 `user.userId` 做查询。

**客户端类比**：

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| JWT token | URLRequest 的 `Authorization: Bearer xxx` header | OkHttp Interceptor 注入 header |
| `requireAuth` | URLProtocol 拦截请求验签 | AuthInterceptor 拦截请求 |
| `JWTPayload` | decoded JWT 后的 Claims 字典 | JWT 解析后的 JSONObject |
| `JWT_SECRET` | Keychain 里存的 secret（服务端独有） | 服务端独有，客户端不持有 |
| 401 未认证 | HTTP 401 → 跳登录页 | HTTP 401 → 触发重新登录 |

## 二、RBAC（基于角色的访问控制）

### 2.1 类型定义

```typescript
// (:391-396)
type Permission = 'read' | 'write' | 'delete' | 'admin'

interface User {
  id: string
  role: 'admin' | 'moderator' | 'user'
}
```

**Permission 的 4 个取值**：

| 权限 | 语义 | 典型场景 |
|---|---|---|
| `read` | 读取 | GET 请求 |
| `write` | 写入 | POST/PUT/PATCH 请求 |
| `delete` | 删除 | DELETE 请求 |
| `admin` | 管理员专属 | 用户管理、系统配置 |

**User 的 3 种角色**：

| 角色 | 权限数 | 定位 |
|---|---|---|
| `admin` | 4 | 超级管理员，含 `admin` 权限 |
| `moderator` | 3 | 内容审核员，无 `admin` 权限 |
| `user` | 2 | 普通用户，仅 `read` + `write` |

### 2.2 rolePermissions 映射表

```typescript
// (:398-402)
const rolePermissions: Record<User['role'], Permission[]> = {
  admin:     ['read', 'write', 'delete', 'admin'],
  moderator: ['read', 'write', 'delete'],
  user:      ['read', 'write']
}
```

**权限矩阵**：

| 角色 \ 权限 | read | write | delete | admin |
|---|---|---|---|---|
| admin | ✅ | ✅ | ✅ | ✅ |
| moderator | ✅ | ✅ | ✅ | ❌ |
| user | ✅ | ✅ | ❌ | ❌ |

> **💡 设计决策：用数组而非位运算**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | `Permission[]` 数组 | 可读性强，权限是字符串，日志友好 | 位运算（`READ=1, WRITE=2`）性能高但调试困难 |
> | `Record<User['role'], Permission[]>` | 编译期检查每个 role 都有权限配置 | 漏配某个 role 只能运行时发现 |
> | 权限显式列出 | 不依赖"高权限隐含低权限" | 改 admin 权限时要同步改隐含逻辑，易漏 |

### 2.3 hasPermission 函数

```typescript
// (:404-406)
export function hasPermission(user: User, permission: Permission): boolean {
  return rolePermissions[user.role].includes(permission)
}
```

**设计要点**：

| 要点 | 说明 |
|---|---|
| 纯函数 | 输入 `user` + `permission`，输出 bool，无副作用 |
| O(n) 查找 | `includes` 在 4 元素数组上线性扫描，性能可忽略 |
| 无默认拒绝 | `rolePermissions[user.role]` 若 role 未配置会 `undefined.includes` 崩溃 |

> **⚠️ 隐患：role 未配置时崩溃**
>
> `rolePermissions` 是 `Record<User['role'], Permission[]>`，TS 类型层面保证 3 种 role 都配齐。但运行时若 `user.role` 来自外部（如数据库枚举变更），可能是 `"superadmin"` 等新值，此时 `rolePermissions['superadmin']` 为 `undefined`，`.includes` 会抛 `TypeError`。
>
> **更健壮的写法**（本 skill 未采用）：
>
> ```typescript
> export function hasPermission(user: User, permission: Permission): boolean {
>   return rolePermissions[user.role]?.includes(permission) ?? false
> }
> ```

### 2.4 requirePermission 高阶函数（HOF）

```typescript
// (:408-420)
export function requirePermission(permission: Permission) {
  return (handler: (request: Request, user: User) => Promise<Response>) => {
    return async (request: Request) => {
      const user = await requireAuth(request)              // ① 鉴权

      if (!hasPermission(user, permission)) {              // ② 权限检查
        throw new ApiError(403, 'Insufficient permissions')
      }

      return handler(request, user)                        // ③ 执行 handler
    }
  }
}
```

**HOF 嵌套结构**：

```
requirePermission('delete')          ← 第 1 层：传入 permission，返回装饰器
   │
   └─→ (handler) => {                ← 第 2 层：传入 handler，返回新 handler
         return async (request) => {
           ① requireAuth(request)     ← 鉴权
           ② hasPermission(user, 'delete')
           ③ handler(request, user)  ← 调用原 handler
         }
       }
```

**3 个设计意图**：

| 意图 | 实现 |
|---|---|
| 权限声明式 | `requirePermission('delete')` 在路由定义处声明权限 |
| 鉴权自动 | 新 handler 内部自动调 `requireAuth`，业务代码不写鉴权 |
| user 注入 | handler 签名 `(request, user)`，业务直接用 user，不用再调 `requireAuth` |

### 2.5 HOF 包装 handler 的使用

```typescript
// (:422-428)
export const DELETE = requirePermission('delete')(
  async (request: Request, user: User) => {
    // Handler receives authenticated user with verified permission
    return new Response('Deleted', { status: 200 })
  }
)
```

**调用形式**：`requirePermission('delete')(handler)` —— 两次连续调用（柯里化）。

| 调用阶段 | 参数 | 返回 |
|---|---|---|
| 第 1 次 | `'delete'`（Permission） | 装饰器函数 |
| 第 2 次 | `handler`（原处理函数） | 新的 handler（带鉴权+权限检查） |

**对比：未用 HOF 的等价写法**：

```typescript
// 反例：每个 handler 都要手写鉴权
export async function DELETE(request: Request) {
  const user = await requireAuth(request)
  if (!hasPermission(user, 'delete')) {
    throw new ApiError(403, 'Insufficient permissions')
  }
  // 业务逻辑
  return new Response('Deleted', { status: 200 })
}
```

**HOF 的收益**：

| 对比项 | HOF 写法 | 反例 |
|---|---|---|
| 鉴权代码 | 0 行（自动） | 4 行 |
| 权限声明 | `requirePermission('delete')` | 埋在 if 里 |
| 忘记鉴权风险 | 无（强制包装） | 高（漏写就裸奔） |
| 业务代码聚焦 | 是 | 否（混入鉴权） |

### 2.6 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| RBAC | Scene 的 `userActivity` 权限检查 | Android Manifest 的 `permission` 属性 |
| `rolePermissions` | Info.plist 的权限字典 | `ContextCompat.checkSelfPermission` |
| `hasPermission` | `canPerform(action)` 协议方法 | `checkSelfPermission(perm) == GRANTED` |
| HOF 装饰器 | Method Swizzling 拦截方法 | Annotation 拦截（`@RequiresPermission`） |
| `requirePermission('delete')` | `@available(iOS 13, *)` 声明能力 | `@RequiresPermission("android.perm.DELETE")` |

## 三、鉴权与限流的关系

### 3.1 限流的两种维度

```
    ┌─────────────────────────────────────┐
    │ 未认证请求                           │
    │    限流键 = 客户端 IP                 │
    │    限流策略 = 宽松（如 100 req/min） │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ requireAuth                         │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 已认证请求                           │
    │    限流键 = user.userId              │
    │    限流策略 = 按用户分级              │
    │      普通用户: 60 req/min           │
    │      admin:    200 req/min          │
    │      昂贵接口: 10 req/min（如搜索） │
    └─────────────────────────────────────┘
```

### 3.2 限流键的选择

| 场景 | 限流键 | 理由 |
|---|---|---|
| 公开接口（无鉴权） | IP | 唯一可识别维度 |
| 已认证普通接口 | `user.userId` | 精确到用户，避免 IP 共享误伤 |
| 昂贵接口（搜索/AI） | `user.userId + 接口名` | 防止单用户耗尽搜索资源 |
| 写接口 | `user.userId + 写操作` | 防刷单（如批量创建） |

### 3.3 昂贵操作的分级限流

```typescript
// 概念示例（本 skill 未给代码，仅给约束）
app.get('/api/search',     rateLimit({ key: 'search', perUser: 10 }))   // 搜索：10 req/min
app.get('/api/markets',    rateLimit({ key: 'read',   perUser: 60 }))   // 列表：60 req/min
app.post('/api/markets',   rateLimit({ key: 'write',  perUser: 20 }))   // 创建：20 req/min
app.delete('/api/markets', rateLimit({ key: 'delete', perUser: 5  }))   // 删除：5 req/min
```

**设计意图**：不同接口的资源消耗差异大，统一限流会让便宜接口被昂贵接口"挤占"配额。

## 四、限流硬性约束

### 4.1 原文引用（:433-441）

```
Rate limiting must use a shared store such as Redis, a gateway, or the
platform's native limiter. Do not use per-process in-memory counters for
production APIs: they reset on deploy, split across replicas, and fail open
in serverless or multi-instance environments.

Keep the backend layer responsible for choosing the integration point and
error shape; use `api-design` for the HTTP contract and `security-review`
for abuse case review.
```

### 4.2 硬性规则：必须用共享存储

| 规则 | 说明 | 严重度 |
|---|---|---|
| 限流必须用共享存储 | Redis / 网关 / 平台原生限流器 | **CRITICAL** |
| 禁止内存计数器（生产） | per-process in-memory counter | **CRITICAL** |
| 禁止 fail-open（生产） | 内存计数器在 serverless 会 fail open | **CRITICAL** |

### 4.3 为什么禁止内存计数器

**3 个失效场景**：

```
场景 1：部署重置
─────────────────────────────────────
部署前: 内存计数器 = 99（接近阈值 100）
部署:  新实例启动，计数器 = 0
部署后: 攻击者可再发 100 个请求
       ↓
       部署窗口期内限流失效

场景 2：多副本分裂
─────────────────────────────────────
replica A: 计数器 = 50
replica B: 计数器 = 50
replica C: 计数器 = 50
       ↓
LB 轮询：每个请求命中不同副本
       总请求 = 150（超过阈值 100，但单副本看不出）

场景 3：serverless fail open
─────────────────────────────────────
Lambda 冷启动: 计数器 = 0
请求 1:         计数器 = 1
Lambda 销毁:    计数器丢失
       ↓
       每次冷启动都从 0 开始，限流形同虚设
```

> **💡 客户端类比：为什么共享存储是必须的**
>
> | 服务端概念 | iOS 类比 | Android 类比 |
> |---|---|---|
> | 内存计数器 | app 内 `static var counter`（app 杀进程就丢） | `companion object` 里的 `var counter`（进程死就丢） |
> | Redis 共享存储 | iCloud KeyValueStore（跨设备同步） | Firebase RemoteConfig（全局共享） |
> | 多副本分裂 | 多个 app 实例各自计数 | 多进程各自计数 |
> | serverless 冷启动 | app 后台被回收，再次启动状态全无 | WorkManager 重启后状态丢失 |

### 4.4 推荐的限流存储选项

| 存储类型 | 适用场景 | 优点 | 缺点 |
|---|---|---|---|
| Redis | 自建后端、多实例 | 精细控制、计数+滑窗+令牌桶 | 需运维 Redis |
| API 网关 | 云托管（AWS API Gateway / Cloudflare） | 托管、无需维护 | 限流规则受网关能力限制 |
| 平台原生 | Vercel/Cloudflare Pages 等 | 零配置 | 平台绑定，难迁移 |
| ❌ 内存计数器 | 仅本地开发 | 简单 | 生产必失效 |

### 4.5 职责边界（跨 skill 协作）

```
    ┌─────────────────────────────────────┐
    │ backend-patterns（本 skill）         │
    │    职责：选择集成点 + 错误形态        │
    │    - 选 Redis / 网关 / 平台原生       │
    │    - 限流触发时抛什么错误（429）      │
    │    - 错误响应格式（{success, error}） │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ api-design skill                    │
    │    职责：HTTP 契约                   │
    │    - 429 状态码规范                  │
    │    - Retry-After header 格式         │
    │    - 限流响应体 schema               │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ security-review skill               │
    │    职责：滥用场景审查                 │
    │    - 暴力破解检测                    │
    │    - 分布式攻击识别                   │
    │    - 异常流量模式告警                 │
    └─────────────────────────────────────┘
```

**职责切分表**：

| 关注点 | 归属 skill | 本 skill 的边界 |
|---|---|---|
| 用什么存储做限流 | backend-patterns | ✅ 负责 |
| 限流错误长什么样 | backend-patterns | ✅ 负责 |
| 429 响应头规范 | api-design | ❌ 不负责 |
| Retry-After 格式 | api-design | ❌ 不负责 |
| 识别爬虫/撞库 | security-review | ❌ 不负责 |
| 限流绕过检测 | security-review | ❌ 不负责 |

> **💡 为什么这样切分**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | 本 skill 只管"集成点+错误形态" | backend-patterns 聚焦后端通用模式，不深入 HTTP 细节 | 限流错误格式在多处定义，易不一致 |
> | HTTP 契约委托 api-design | 状态码/header 规范是 API 设计的子领域 | backend-patterns 需重复 429 规范 |
> | 滥用场景委托 security-review | 安全审查是独立维度 | backend-patterns 既管架构又管安全，职责过载 |

## 五、鉴权与限流的设计哲学

### 5.1 鉴权的 3 层防护

```
请求
  │
  ├─ ① 认证（Authentication）     ← requireAuth
  │    "你是谁？"                  ← 验证 JWT
  │    失败 → 401
  │
  ├─ ② 授权（Authorization）      ← requirePermission
  │    "你能做这事吗？"             ← 查 rolePermissions
  │    失败 → 403
  │
  └─ ③ 限流（Rate Limiting）      ← 外部存储（本 skill 不实现）
       "你做太频繁了"              ← 查 Redis 计数
       失败 → 429
```

### 5.2 401 vs 403 vs 429

| 状态码 | 含义 | 触发点 | message |
|---|---|---|---|
| 401 | 未认证 | `requireAuth` 未通过 | `Missing authorization token` / `Invalid token` |
| 403 | 已认证但无权 | `requirePermission` 未通过 | `Insufficient permissions` |
| 429 | 请求过频 | 限流触发 | （由 api-design 定义） |

**关键区分**：
- 401 是"你是谁？"——token 缺失或无效
- 403 是"你不能做这事"——身份明确但权限不足
- 429 是"你做太多了"——身份和权限都 OK，但频率超限

### 5.3 鉴权失败的错误响应

```typescript
// 401：未认证
throw new ApiError(401, 'Missing authorization token')   // token 缺失
throw new ApiError(401, 'Invalid token')                  // token 无效/过期

// 403：已认证但无权
throw new ApiError(403, 'Insufficient permissions')       // 权限不足
```

**所有错误都走 `ApiError` + 集中式 `errorHandler`**（见第 3 篇），保证响应格式统一：

```typescript
{ success: false, error: 'Missing authorization token' }  // status: 401
{ success: false, error: 'Invalid token' }                // status: 401
{ success: false, error: 'Insufficient permissions' }     // status: 403
```

### 5.4 HOF 模式的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 权限检查是装饰器 | 声明式，业务代码不混入鉴权 | 每个 handler 手写 if 检查 |
| handler 签名 `(request, user)` | user 自动注入 | 业务代码再调 `requireAuth`，重复 |
| 鉴权失败抛异常 | 走集中式 errorHandler | 每个 handler 自己 return 401/403 |
| 柯里化 `requirePermission(perm)(handler)` | 第一参数是权限配置，第二参数是被装饰函数 | 传参不分离，难复用 |

### 5.5 与 examples/CLAUDE.md 的呼应

通用 CLAUDE.md 模板（examples/CLAUDE.md）定义的鉴权契约：

```typescript
// examples/CLAUDE.md 的鉴权部分
- JWT bearer token validation
- Permission-based authorization
```

本 skill 把这两条契约落地成具体代码：
- `verifyToken` + `requireAuth` → JWT bearer token validation
- `hasPermission` + `requirePermission` → Permission-based authorization

### 5.6 与 security-review skill 的协作

`security-review` skill（系列一）的 "Authentication & Authorization" 域规定：

| security-review 规则 | 本 skill 实现 |
|---|---|
| 密码必须 bcrypt 哈希 | 本 skill 不涉及（只管 token 验证） |
| JWT secret 不能硬编码 | `process.env.JWT_SECRET!` 从环境变量读 |
| token 过期必须处理 | `jwt.verify` 自动抛过期错误 → 转 `ApiError(401)` |
| 敏感操作要二次验证 | 本 skill 未实现（属于业务层） |

**边界**：本 skill 只管"token 验证 + 权限检查"，token 签发、密码存储、二次验证属于 security-review 和业务层的范畴。

## 六、反模式汇总

### 6.1 鉴权反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| handler 不调 `requireAuth` | 忘记鉴权，裸奔 | 用 `requirePermission` HOF 包装 |
| 自己解析 JWT | 遗漏过期/签名检查 | 用 `jwt.verify` 库 |
| 错误返回 jwt 原始 message | 泄露 token 内部信息 | 统一 `"Invalid token"` |
| `replace('Bearer ', '')` 不容错 | 大小写/空格差异导致提取失败 | 用正则 `/^Bearer\s+(.+)$/i` |
| role 枚举多处定义不一致 | moderator 走不通 JWT 路径 | 统一 role 枚举类型 |

### 6.2 权限反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| handler 内手写 if 检查权限 | 鉴权代码混入业务 | HOF 装饰器 |
| 权限检查不抛异常 | 走不到 errorHandler | `throw new ApiError(403, ...)` |
| `rolePermissions` 用 `Map` | 运行时漏配 role 不报错 | `Record<User['role'], ...>` 编译期保证 |
| `hasPermission` 不防 undefined | 新 role 未配置时崩溃 | `?.includes(...) ?? false` |

### 6.3 限流反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 用内存 `Map` 做限流 | 部署重置、多副本分裂 | Redis / 网关 / 平台原生 |
| 限流逻辑写在 handler 里 | 难复用、难调整 | 中间件层统一处理 |
| 限流错误返回 500 | 状态码错误 | 429 Too Many Requests |
| 所有接口统一限流配额 | 昂贵接口被挤占 | 分级限流（搜索 10/min，列表 60/min） |
| 限流只基于 IP | NAT 后多用户共享 IP 误伤 | 已认证请求基于 userId |

## 七、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| JWT | `JWTPayload` 含 userId / email / role | 标准 |
| JWT | `verifyToken` 失败统一抛 `ApiError(401, 'Invalid token')` | HIGH |
| JWT | 不暴露 jwt 库原始错误 | HIGH |
| JWT | `JWT_SECRET` 从环境变量读，不硬编码 | CRITICAL |
| Bearer | header 提取用 `replace('Bearer ', '')`（**有容错风险**） | ⚠️ 需改进 |
| 鉴权 | `requireAuth` 返回 user，handler 直接用 | 标准 |
| 鉴权 | 未认证 → 401，无权 → 403 | HIGH |
| RBAC | `Permission` 4 种：read / write / delete / admin | 标准 |
| RBAC | `rolePermissions` 用 `Record<User['role'], ...>` | 标准 |
| RBAC | `hasPermission` 纯函数，无副作用 | 标准 |
| HOF | `requirePermission(perm)(handler)` 柯里化 | 标准 |
| HOF | handler 签名 `(request, user)` 自动注入 | 标准 |
| HOF | 权限检查失败抛 `ApiError(403)` | HIGH |
| 限流 | **必须用共享存储**（Redis / 网关 / 平台原生） | **CRITICAL** |
| 限流 | **禁止内存计数器**（生产环境） | **CRITICAL** |
| 限流 | 已认证请求基于 userId 限流 | 标准 |
| 限流 | 昂贵接口分级限流 | 标准 |
| 职责 | 本 skill 只管集成点 + 错误形态 | 标准 |
| 职责 | HTTP 契约委托 api-design | 标准 |
| 职责 | 滥用场景委托 security-review | 标准 |
| 一致性 | `JWTPayload.role` 与 `User.role` **不一致（需修复）** | ⚠️ BUG |

---

## 下一篇

- [backend-patterns 深度分析（五）：后台任务与可观测](./backend-patterns-深度分析-五-后台任务与可观测.md) — Job Queue 实现、结构化日志、requestId 上下文传递
