# security-review 深度分析（三）：限流与数据暴露

> 源文件：`skills/security-review/SKILL.md`（:273-345 行）
> 本篇聚焦：Rate Limiting + Sensitive Data Exposure
> 系列第 3 篇，共 4 篇

## 引言：流量与数据外流的安全

本篇覆盖"流量怎么来 + 数据怎么流出"的安全：

```
流量与暴露
   │
   ├─ ⑦ Rate Limiting           ← 接口流量控制
   │     - 普通限流
   │     - 昂贵操作分级限流
   │
   └─ ⑧ Sensitive Data Exposure  ← 数据从日志/错误流出
         - 日志脱敏
         - 错误信息分级
```

这两个安全域的方向相反但互补：限流防"流量太多"，数据暴露防"数据流出太多"。

## 一、Rate Limiting（限流）

> 源文件 :273-306 | OWASP 映射：A04 Insecure Design（防滥用）

### 1.1 普通限流

```typescript
// (:276-287)
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟窗口
  max: 100,                  // 100 次请求 / 窗口
  message: 'Too many requests'
})

// 应用到路由
app.use('/api/', limiter)
```

**3 个配置项**：

| 配置 | 值 | 含义 |
|---|---|---|
| `windowMs` | `15 * 60 * 1000`（15 分钟） | 时间窗口 |
| `max` | `100` | 窗口内最大请求数 |
| `message` | `'Too many requests'` | 超限响应 |

### 1.2 限流的计算模型

```
固定窗口算法（express-rate-limit 默认）:

时间轴: |--窗口1(15min)--|--窗口2(15min)--|
请求:   100个               100个
         ↑                  ↑
         达 max，后续 429    窗口重置，重新计数

窗口边界:
   14:59 发了 100 个请求（窗口1 满）
   15:01 窗口2 开始，又能发 100 个
   ↓ 窗口切换瞬间可突发 2× 流量
```

### 1.3 分级限流（昂贵操作）

```typescript
// (:291-298)
// 搜索用更严格限流
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 分钟窗口
  max: 10,                  // 10 次 / 分钟
  message: 'Too many search requests'
})

app.use('/api/search', searchLimiter)
```

**两种限流对比**：

| 接口类型 | 窗口 | max | 策略 |
|---|---|---|---|
| 普通 `/api/` | 15 min | 100 | 宽松 |
| 搜索 `/api/search` | 1 min | 10 | 严格 |

> **💡 为什么搜索要更严**
>
> 搜索是**资源消耗大头**（全表扫描 / 倒排索引 / 可能触发 LLM）。若与普通接口同配额，攻击者用搜索请求即可耗尽数据库资源。
>
> | 操作 | 单次成本 | 建议限流 |
> |---|---|---|
> | 列表查询 | 低 | 60 req/min |
> | 全文搜索 | 高 | 10 req/min |
> | AI 生成 | 极高 | 5 req/hour |
> | 写操作 | 中 | 20 req/min |

### 1.4 ⚠️ 关键冲突：内存存储 vs backend-patterns 硬性约束

源文件用 `express-rate-limit`（:277），其**默认存储是内存**（per-process memory store）。

这与 **backend-patterns 第 4 篇的硬性约束直接冲突**：

```
backend-patterns（:433-441）:
   "Rate limiting must use a shared store such as Redis,
    a gateway, or the platform's native limiter.
    Do not use per-process in-memory counters for
    production APIs: they reset on deploy, split across
    replicas, and fail open in serverless."

security-review（:277）:
   import rateLimit from 'express-rate-limit'
   const limiter = rateLimit({ ... })   // 默认 memory store
   app.use('/api/', limiter)
```

> **⚠️ 跨 skill 冲突**
>
> | skill | 立场 |
> |---|---|
> | backend-patterns | **禁止**内存计数器（生产） |
> | security-review | 示例用 `express-rate-limit` 默认内存存储 |
>
> **后果**：按 security-review 的示例直接用，会在生产环境出现 backend-patterns 描述的 3 类失效。

### 1.5 内存存储的 3 类失效场景

```
场景 1：部署重置
─────────────────────────────────────
部署前: 计数器 = 99（接近阈值 100）
部署:  新实例启动，计数器 = 0
部署后: 攻击者可再发 100 个请求
       ↓ 部署窗口期内限流失效

场景 2：多副本分裂
─────────────────────────────────────
replica A: 计数器 = 50
replica B: 计数器 = 50
replica C: 计数器 = 50
       ↓
LB 轮询：总请求 = 150（超阈值，但单副本看不出）

场景 3：serverless fail open
─────────────────────────────────────
Lambda 冷启动: 计数器 = 0
请求 1:         计数器 = 1
Lambda 销毁:    计数器丢失
       ↓ 每次冷启动从 0 开始，限流形同虚设
```

### 1.6 修复方向

| 方案 | 改法 | 适用 |
|---|---|---|
| 配置 Redis store | `rateLimit({ store: new RedisStore({...}) })` | 自建后端 |
| 用网关限流 | AWS API Gateway / Cloudflare | 云托管 |
| 平台原生 | Vercel Edge / Cloudflare Pages 限流 | serverless |

**本 skill 应明确标注**：示例仅限开发，生产需配共享存储。

### 1.7 限流的两个维度

源文件 :301-305 的验证清单区分两种限流：

| 维度 | 键 | 场景 |
|---|---|---|
| IP-based | 客户端 IP | 未认证请求 |
| User-based | user.userId | 已认证请求 |

```
未认证请求
   ↓ 限流键 = IP
   ↓ 但 NAT 后多用户共享 IP → 误伤

已认证请求
   ↓ 限流键 = userId（更精确）
   ↓ 单用户超额不影响他人
```

### 1.8 Verification Steps

源文件 :301-305 给出 4 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | Rate limiting on all API endpoints | 所有端点都限流 |
| 2 | Stricter limits on expensive operations | 昂贵操作更严 |
| 3 | IP-based rate limiting | 基于 IP |
| 4 | User-based rate limiting (authenticated) | 基于用户 |

> **⚠️ 清单未提及"共享存储"**
>
> 4 项检查都没提"必须用 Redis 等共享存储"，与 backend-patterns 的 CRITICAL 约束不一致。**本 skill 的限流章节是最需补强的部分**。

### 1.9 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| 限流 | NSURLSession 的 `httpMaximumConnectionsPerHost` | OkHttp 的 `Dispatcher.maxRequests` |
| 固定窗口 | 的令牌桶（`DispatchSemaphore`） | TokenBucket 算法 |
| 分级限流 | 不同 API 用不同 URLSession 配置 | 不同 Retrofit 实例不同拦截器 |
| Redis 共享存储 | iCloud KeyValueStore | Firebase RemoteConfig |
| 内存计数器 | app 内 `static var`（进程死即丢） | `companion object` 变量 |

## 二、Sensitive Data Exposure（敏感数据暴露）

> 源文件 :307-345 | OWASP 映射：A09 Security Logging Failures、A05 Security Misconfiguration

### 2.1 日志脱敏

**FAIL（绝对禁止）**：

```typescript
// (:311-313)
// WRONG: Logging sensitive data
console.log('User login:', { email, password })
console.log('Payment:', { cardNumber, cvv })
```

**PASS（必须这么做）**：

```typescript
// (:315-317)
// CORRECT: Redact sensitive data
console.log('User login:', { email, userId })
console.log('Payment:', { last4: card.last4, userId })
```

**脱敏对照**：

| 字段 | ❌ 全记 | ✅ 脱敏 |
|---|---|---|
| 密码 | `password` | **不记** |
| 卡号 | `cardNumber`（16 位） | `last4`（仅后 4 位） |
| CVV | `cvv` | **不记** |
| 邮箱 | `email` | `email`（可记，非最高敏感） |

### 2.2 脱敏的模式

```
原始数据                    日志记录
─────────────────────────────────────
{ password: "abc123" }  →  不记 password
{ cardNumber: "4111...4111" } →  { last4: "4111" }
{ token: "Bearer xxx" } →  不记 token
{ email: "a@b.com" }    →  { email: "a@b.com" }（可记）
```

> **💡 为什么卡号只记 last4**
>
> | 记法 | 泄露风险 |
> |---|---|
> | 全卡号 | 完整卡号可直接消费 |
> | 前 12 位 | 可暴力枚举后 4 位（BIN 已知） |
> | **仅后 4 位** | 无法还原全卡号 |
> | 完全不记 | 最安全，但失去排查线索 |
>
> 后 4 位是"排查够用 + 泄露无害"的平衡点。

### 2.3 错误信息分级暴露

**FAIL**：

```typescript
// (:321-328)
// WRONG: Exposing internal details
catch (error) {
  return NextResponse.json(
    { error: error.message, stack: error.stack },
    { status: 500 }
  )
}
```

**PASS**：

```typescript
// (:330-338)
// CORRECT: Generic error messages
catch (error) {
  console.error('Internal error:', error)     // 服务端记详细
  return NextResponse.json(
    { error: 'An error occurred. Please try again.' },  // 用户看通用
    { status: 500 }
  )
}
```

### 2.4 双通道原则

```
错误发生
   │
   ├─ 通道 1：返回给用户（响应体）
   │    └─ 通用消息（"An error occurred"）
   │       不含 error.message / error.stack
   │
   └─ 通道 2：记录到服务端日志
        └─ 详细信息（console.error 完整 error）
           含 message / stack / 上下文
```

| 通道 | 受众 | 内容 | 目的 |
|---|---|---|---|
| 响应体 | 用户 | 通用消息 | 不泄露 + 友好提示 |
| 服务端日志 | 开发者 | 完整 error | 排查 |

> **💡 为什么错误信息要分级**
>
> | 泄露内容 | 攻击价值 |
> |---|---|
> | `error.message` | 可能含 SQL 片段 / 文件路径 / 内部结构 |
> | `error.stack` | 暴露代码文件结构、框架版本（辅助攻击） |
> | 数据库连接串 | 直接连库 |
>
> 返回通用消息让攻击者**无法通过错误探测系统内部结构**。

### 2.5 与 backend-patterns errorHandler 的一致性

backend-patterns 第 3 篇的集中式 errorHandler 严格遵循本篇规则：

```typescript
// backend-patterns errorHandler
if (error instanceof ApiError) {
  // 业务错误：message 可展示（isOperational=true）
  return { success: false, error: error.message }
}
if (error instanceof z.ZodError) {
  // 验证错误：details 可展示
  return { success: false, error: 'Validation failed', details: error.errors }
}
// 未知错误：通用消息 + 记日志
console.error('Unexpected error:', error)
return { success: false, error: 'Internal server error' }
```

**错误信息的安全边界**：

| 错误类型 | 暴露给用户 | 暴露给日志 |
|---|---|---|
| 业务错误（ApiError） | message | message + statusCode |
| 验证错误（ZodError） | "Validation failed" + details | details |
| 未知错误 | "Internal error" | 完整 error + stack |

### 2.6 Verification Steps

源文件 :340-344 给出 4 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | No passwords, tokens, or secrets in logs | 日志无密码/token |
| 2 | Error messages generic for users | 用户看通用错误 |
| 3 | Detailed errors only in server logs | 详细错误只在服务端 |
| 4 | No stack traces exposed to users | 不向用户暴露 stack |

### 2.7 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| 日志脱敏 | OSLog 的 `privacy: .private` | Logcat 的 `Log.d` 不记密码 |
| `last4` 卡号 | PKPayment 的 `last4` 属性 | PaymentCard 的 `last4` |
| 错误分级 | 用户看 `localizedDescription`，开发者看 debug | 用户看 `message`，开发者看 stacktrace |
| 通用错误消息 | "Something went wrong" | "An error occurred" |

## 三、两个安全域的协作

### 3.1 限流与日志的协同

```
限流触发（429）
   ↓
记日志：谁触发？什么时候？哪个接口？
   ↓
日志数据用于：识别滥用模式（security-review 第 4 篇的 abuse detection）

但日志不能记：
   - 用户的密码（即使请求体里有）
   - 用户的 token
   - 卡号全号
```

### 3.2 限流与错误的协同

```
限流超限 → 429 响应
   ↓
429 响应体：
   { error: 'Too many requests' }     ← 通用消息
   ❌ 不返回：{ error: 'You are rate limited by IP 1.2.3.4, user abc' }
```

即使是限流错误，也不应泄露"用什么键限流""用户是谁"等细节。

## 四、跨 skill 协作

### 4.1 与 backend-patterns 的协作（含冲突）

| 关注点 | backend-patterns | security-review | 一致性 |
|---|---|---|---|
| 限流存储 | 必须共享存储 | 示例用内存 | ❌ **冲突** |
| 限流分级 | 昂贵接口更严 | 同 | ✅ 一致 |
| 限流键 | userId / IP | userId / IP | ✅ 一致 |
| 错误分级 | ApiError 三层 | 通用 vs 详细 | ✅ 一致 |
| 错误脱敏 | 未知错误不暴露 | 同 | ✅ 一致 |
| 日志脱敏 | Logger 无脱敏 | 明确脱敏 | ⚠️ backend-patterns 待补 |

> **⚠️ backend-patterns 的 Logger 缺陷**
>
> backend-patterns 第 5 篇的 `Logger` 类**没有脱敏机制**——`context` 里若含 password 会原样 JSON.stringify 输出。应参考本篇的脱敏规则，在 Logger 层增加字段过滤。

### 4.2 限流的完整职责链

```
security-review（本 skill）
   职责：定义限流的安全要求
   - 要限流
   - 分级限流
   - IP/user 两个维度
   ↓ 但缺少"共享存储"约束

backend-patterns（第 4 篇）
   职责：选择集成点 + 错误形态
   - 必须共享存储（补强 security-review 的缺失）
   - 限流错误抛 429

api-design
   职责：HTTP 契约
   - 429 响应头规范（Retry-After）
```

### 4.3 错误处理的职责链

```
security-review（本 skill）
   职责：定义错误信息的安全边界
   - 用户看通用
   - 日志记详细
   - 不暴露 stack

backend-patterns（第 3 篇）
   职责：错误处理的代码实现
   - ApiError 类
   - 集中式 errorHandler
   - 三层错误分类
```

## 五、设计哲学

### 5.1 限流的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 所有端点都限流 | 防滥用 | 单点被刷爆 |
| 昂贵操作分级 | 资源消耗差异大 | 搜索耗尽 DB |
| 用户级限流（已认证） | 精确到人 | IP 共享误伤 |
| 共享存储（**本 skill 缺失**） | 多实例一致 | 部署重置/分裂/fail open |

### 5.2 数据暴露的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 日志只记必要字段 | 最小化 | 膨胀 + 泄露风险 |
| 卡号只记 last4 | 排查够用 + 泄露无害 | 全卡号可消费 |
| 密码/CVV 不记 | 不可逆敏感 | 日志泄露即灾难 |
| 错误双通道 | 用户友好 + 排查可用 | 要么泄露要么没法排查 |
| 用户看通用消息 | 不泄露内部结构 | 攻击者探测系统 |

### 5.3 最小暴露原则（Least Exposure）

本篇的核心哲学：

```
每一条数据暴露都要问:
   - 必须暴露吗？（能不记就不记）
   - 暴露给谁？（用户 vs 日志）
   - 暴露多少？（全量 vs 脱敏后）
   ↓ 默认最小暴露，按需放开
```

## 六、反模式汇总

### 6.1 限流反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 生产用内存存储 | 部署重置/分裂/fail open | Redis / 网关 / 平台原生 |
| 所有接口同配额 | 昂贵接口被挤占 | 分级限流 |
| 只限 IP（已认证也用 IP） | NAT 误伤 | 已认证用 userId |
| 不限昂贵操作 | 搜索耗尽资源 | 搜索 10 req/min |
| 429 返回内部细节 | 泄露限流策略 | 通用 "Too many requests" |

### 6.2 数据暴露反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 日志记密码/CVV | 泄露 | 不记 |
| 日志记全卡号 | 泄露 | 仅 last4 |
| 日志记 token | 泄露 | 不记 |
| 返回 error.message | 泄露内部 | 通用消息 |
| 返回 error.stack | 泄露结构 | 不暴露 |
| 把详细错误返用户 | 泄露 | 服务端记，用户看通用 |

## 七、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 限流 | 所有 API 端点都限流 | **CRITICAL** |
| 限流 | 昂贵操作分级限流 | HIGH |
| 限流 | 已认证请求基于 userId | HIGH |
| 限流 | 未认证请求基于 IP | 标准 |
| 限流 | 429 响应用通用消息 | HIGH |
| 限流 | **必须用共享存储（与 backend-patterns 一致，源文件示例待修正）** | **CRITICAL** |
| 限流 | 示例 `express-rate-limit` 默认内存（⚠️ 冲突） | ⚠️ 冲突 |
| 日志 | 不记密码 / CVV / token | **CRITICAL** |
| 日志 | 卡号仅记 last4 | HIGH |
| 日志 | email 可记（非最高敏感） | 标准 |
| 错误 | 用户看通用错误消息 | **CRITICAL** |
| 错误 | 不返回 error.message 给用户 | **CRITICAL** |
| 错误 | 不返回 error.stack 给用户 | **CRITICAL** |
| 错误 | 详细错误只进服务端日志 | HIGH |
| 整合 | backend-patterns Logger 需补脱敏机制 | ⚠️ 待补 |

---

## 下一篇

- [security-review 深度分析（四）：专项安全与部署检查](./security-review-深度分析-四-专项安全与部署检查.md) — Blockchain Security、Dependency Security、Security Testing、Pre-Deployment Checklist
