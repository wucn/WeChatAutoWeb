# security-review 深度分析（一）：密钥管理与输入验证

> 源文件：`skills/security-review/SKILL.md`（:23-138 行）
> 本篇聚焦：Secrets Management + Input Validation + SQL Injection Prevention
> 系列第 1 篇，共 4 篇

## 引言：数据入口的三道防线

本篇覆盖"什么进入系统"的安全——从密钥、用户输入到数据库查询：

```
数据入口
   │
   ├─ ① Secrets Management   ← 密钥从哪来（环境变量 vs 硬编码）
   │
   ├─ ② Input Validation     ← 用户输入是否合法（Zod + 文件上传）
   │
   └─ ③ SQL Injection        ← 输入怎么进数据库（参数化 vs 拼接）
```

这三道防线是递进关系：密钥泄露让攻击者直入后台，恶意输入绕过业务校验，SQL 注入则窃取/篡改整个数据库。

## 一、Secrets Management（密钥管理）

> 源文件 :23-48 | OWASP 映射：A02 Cryptographic Failures（加密失败）

### 1.1 核心规则：永不硬编码

**FAIL（绝对禁止）**：

```typescript
// (:27-29)
const apiKey = "sk-proj-xxxxx"       // 硬编码 API key
const dbPassword = "password123"     // 密码写源码
```

**PASS（必须这么做）**：

```typescript
// (:33-40)
const apiKey = process.env.OPENAI_API_KEY
const dbUrl = process.env.DATABASE_URL

// 启动时验证密钥存在
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

### 1.2 硬编码的危险

| 风险 | 说明 | 后果 |
|---|---|---|
| 源码即泄露 | git push 后密钥进远端 | 仓库泄露 = 密钥泄露 |
| git 历史残留 | 即使删了行，历史还在 | `git log -p` 可追溯 |
| 无法轮换 | 改密钥要改代码 + 重新部署 | 密钥泄露后响应慢 |
| 多环境混乱 | dev/staging/prod 用同一密钥 | 测试环境拖垮生产 |

> **💡 为什么密钥进了 git 就等于泄露**
>
> 即使仓库是 private：
> - 协作者都能看到（包括离职员工）
> - fork / clone 后扩散
> - CI 日志可能打印
> - 公开仓库会被 GitHub 自动扫描并通知服务商（如 Stripe 会自动吊销泄露的 key）

### 1.3 启动验证模式

```typescript
// (:37-39)
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

**设计要点**：

| 要点 | 说明 |
|---|---|
| 启动时检查 | 进程启动即暴露配置错误，而非运行到一半才失败 |
| 抛 Error 中断 | 缺密钥直接崩，避免带病运行 |
| 错误信息不含值 | 只说"not configured"，不打印部分密钥 |

> **💡 Fail-Fast 原则**
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | 启动即检查 | 配置错误早暴露 | 运行时才发现，用户已受影响 |
> | 直接 throw | 中断启动 | 静默降级，密钥相关功能半瘫 |

### 1.4 Verification Steps（验证清单）

源文件 :42-47 给出 5 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | No hardcoded API keys, tokens, or passwords | 无硬编码密钥 |
| 2 | All secrets in environment variables | 密钥全走环境变量 |
| 3 | `.env.local` in .gitignore | 本地环境文件不入库 |
| 4 | No secrets in git history | git 历史无密钥残留 |
| 5 | Production secrets in hosting platform | 生产密钥存托管平台 |

### 1.5 密钥管理的完整链路

```
开发                CI/CD                生产
 │                   │                   │
 ├─ .env.local       ├─ CI secrets       ├─ Vercel/Railway
 │  (gitignore)      │  (加密变量)        │  环境变量
 │                   │                   │
 └─ 本地测试          └─ npm ci           └─ 运行时注入
                       (不装 .env)
                                                ↓
                                      process.env.XXX 读取
                                                ↓
                                      启动验证 (!apiKey → throw)
```

### 1.6 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| `process.env.SECRET` | Info.plist 的 `$(MY_SECRET)` + xcconfig | BuildConfig + gradle.properties |
| 硬编码密钥 | key 写进 .swift 文件 | key 写进 .kt 文件 |
| `.env.local` in gitignore | xcconfig 不入库 | local.properties 不入库 |
| 启动验证 | `assert(apiKey != nil)` | `requireNotNull(apiKey)` |
| 托管平台密钥 | App Store Connect 的 API key | Play Console 的服务账号密钥 |

## 二、Input Validation（输入校验）

> 源文件 :49-108 | OWASP 映射：A03 Injection（注入）的前置防线

### 2.1 核心规则：所有输入必须校验

```typescript
// (:52-74)
import { z } from 'zod'

// 定义校验 schema
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150)
})

// 处理前先校验
export async function createUser(input: unknown) {
  try {
    const validated = CreateUserSchema.parse(input)
    return await db.users.create(validated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error.errors }
    }
    throw error
  }
}
```

### 2.2 Zod Schema 的约束设计

| 字段 | 约束 | 含义 |
|---|---|---|
| `email` | `z.string().email()` | 必须是合法邮箱格式 |
| `name` | `z.string().min(1).max(100)` | 非空，最多 100 字符 |
| `age` | `z.number().int().min(0).max(150)` | 整数，0-150 之间 |

**约束层次**：

```
z.object({...})           ← 类型层：是个对象
   ├─ z.string()           ← 类型层：是字符串
   │    ├─ .email()        ← 格式层：邮箱格式
   │    ├─ .min(1)         ← 业务层：非空
   │    └─ .max(100)       ← 业务层：长度上限
   └─ z.number()
        ├─ .int()          ← 格式层：整数
        ├─ .min(0)         ← 业务层：下限
        └─ .max(150)       ← 业务层：上限
```

> **💡 为什么要 min/max 边界**
>
> | 约束 | 防的攻击 | 如果不约束 |
> |---|---|---|
> | `.max(100)` | 超长字符串撑爆存储/内存 | ReDoS / 缓冲区溢出 |
> | `.max(150)` 年龄 | 荒谬值污染数据 | 数据完整性破坏 |
> | `.int()` | 浮点数绕过业务逻辑 | 类型混淆漏洞 |

### 2.3 input: unknown 的类型设计

```typescript
export async function createUser(input: unknown) {
```

**关键**：入参类型是 `unknown` 而非 `any` 或具体类型。

| 类型选择 | 安全性 | 说明 |
|---|---|---|
| `any` | ❌ 无 | 跳过类型检查，危险 |
| `CreateUserInput`（具体） | ⚠️ 中 | 假设调用方已校验，不可信 |
| **`unknown`** | ✅ 高 | 强制必须校验后才能用 |

> **💡 unknown vs any**
>
> `unknown` 是"类型安全的 any"：可以接收任何值，但**使用前必须收窄**（narrow）。`z.parse(input)` 的返回值才是可信的，原 `input` 不能直接用。

### 2.4 校验流程

```
input: unknown
   │
   ├─ CreateUserSchema.parse(input)
   │     │
   │     ├─ 通过 → validated: CreateUserInput（类型收窄）
   │     │         │
   │     │         └─ db.users.create(validated)
   │     │
   │     └─ 失败 → 抛 ZodError
   │                │
   │                └─ catch: { success: false, errors: error.errors }
   │
   └─ 其他异常 → throw error（非校验错误向上抛）
```

### 2.5 白名单 vs 黑名单

源文件 :106 明确：**Whitelist validation (not blacklist)**。

| 策略 | 做法 | 安全性 |
|---|---|---|
| **白名单**（PASS） | 显式列出允许的值/类型 | ✅ 默认拒绝，新攻击向量自动挡 |
| 黑名单（FAIL） | 列出禁止的值 | ❌ 默认放行，新攻击绕过 |

**文件上传的白名单示例**：

```typescript
// (:86)
const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']
if (!allowedTypes.includes(file.type)) {  // 白名单：不在列表就拒
  throw new Error('Invalid file type')
}
```

> **⚠️ 隐患：`file.type` 可伪造**
>
> `file.type` 来自客户端 MIME 头，**攻击者可任意伪造**。仅靠 `includes(file.type)` 不能防恶意文件。
>
> | 攻击 | 说明 |
> |---|---|
> | 改 MIME 头 | 上传 `.exe` 但声明 `Content-Type: image/jpeg` |
> | 多重扩展名 | `shell.php.jpg` 绕过扩展名检查 |
>
> **更健壮的方案**（本 skill 未给）：
> - 用 magic bytes 校验文件真实类型（如 `file-type` 库）
> - 服务端重新编码图片（剥离 EXIF / 隐写）
> - 上传到隔离域名，禁止执行权限

### 2.6 文件上传校验

```typescript
// (:78-100)
function validateFileUpload(file: File) {
  // 大小检查（5MB 上限）
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error('File too large (max 5MB)')
  }

  // 类型检查
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type')
  }

  // 扩展名检查
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif']
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new Error('Invalid file extension')
  }

  return true
}
```

**3 层校验**：

| 层 | 检查 | 防的攻击 |
|---|---|---|
| 大小 | `file.size > 5MB` | 拒绝服务（撑爆磁盘/内存） |
| 类型 | `file.type` 在白名单 | 伪装文件类型 |
| 扩展名 | `.jpg/.png/.gif` | 可执行扩展名（.php/.exe） |

> **💡 为什么三层都要**
>
> | 只查... | 绕过方式 |
> |---|---|
> | 只查类型 | 改 MIME 头即可绕过 |
> | 只查扩展名 | `image.jpg` 内容是 PHP 木马 |
> | 只查大小 | 能传任意类型的大文件 |
> | **三层都查** | 大幅提高攻击成本（但仍需 magic bytes 兜底） |

### 2.7 Verification Steps

源文件 :102-107 给出 5 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | All user inputs validated with schemas | 所有输入过 Zod |
| 2 | File uploads restricted (size, type, extension) | 文件上传三层校验 |
| 3 | No direct use of user input in queries | 输入不直接拼 SQL（见第三节） |
| 4 | Whitelist validation (not blacklist) | 用白名单 |
| 5 | Error messages don't leak sensitive info | 错误信息不泄露 |

## 三、SQL Injection Prevention（SQL 注入防护）

> 源文件 :109-138 | OWASP 映射：A03 Injection

### 3.1 核心规则：永不字符串拼接

**FAIL（致命）**：

```typescript
// (:113-116)
// DANGEROUS - SQL Injection vulnerability
const query = `SELECT * FROM users WHERE email = '${userEmail}'`
await db.query(query)
```

**攻击示例**：

```
userEmail = "admin@x.com' OR '1'='1"
query = `SELECT * FROM users WHERE email = 'admin@x.com' OR '1'='1'`
                                                        ↑↑↑↑↑↑↑↑↑
                                                        恒真条件
→ 返回所有用户数据！
```

更狠的注入：

```
userEmail = "x'; DROP TABLE users; --"
query = `SELECT * FROM users WHERE email = 'x'; DROP TABLE users; --'`
                                             ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                                             删表！
```

### 3.2 参数化查询（PASS）

```typescript
// (:119-131)
// 安全 - 参数化查询
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', userEmail)        // 方式一：ORM/查询构建器

// 或原生 SQL
await db.query(
  'SELECT * FROM users WHERE email = $1',   // 占位符
  [userEmail]                                 // 参数单独传
)
```

**两种安全方式**：

| 方式 | 示例 | 原理 |
|---|---|---|
| ORM/查询构建器 | `supabase.from('users').eq('email', x)` | API 层自动参数化 |
| 原生参数化 | `db.query('... WHERE email = $1', [x])` | 数据库驱动分离代码与数据 |

### 3.3 参数化为什么安全

```
拼接方式（FAIL）:
   "SELECT * WHERE email = '用户输入'"
                     ↑
              用户输入被当代码执行

参数化方式（PASS）:
   "SELECT * WHERE email = $1",  [用户输入]
                          ↑              ↑
                     占位符          参数值
                   (代码)        (纯数据，不当代码)
```

> **💡 代码与数据分离**
>
> 参数化的本质是**把用户输入从"代码"降级为"数据"**。数据库知道 `$1` 处是个值占位符，无论传入什么（哪怕 `' OR '1'='1`）都只被当作字符串字面量匹配，不会被执行为 SQL 语法。

### 3.4 常见拼接反模式

| ❌ 反模式 | 危险代码 | 安全替代 |
|---|---|---|
| 模板字符串拼接 | `` `... WHERE id = ${id}` `` | `... WHERE id = $1`, [id] |
| 字符串相加 | `'... WHERE id = ' + id` | 同上 |
| 动态表名拼接 | `` `SELECT * FROM ${table}` `` | 白名单表名映射 |
| 动态 ORDER BY | `` `ORDER BY ${col}` `` | 白名单列名 |

> **⚠️ 动态表名/列名无法参数化**
>
> `$1` 只能用于**值**，不能用于表名/列名。需要动态拼时必须用**白名单**：
>
> ```typescript
> const allowedTables = ['users', 'markets', 'orders']
> if (!allowedTables.includes(table)) {
>   throw new Error('Invalid table name')
> }
> const query = `SELECT * FROM ${table} WHERE ...`
> ```

### 3.5 Verification Steps

源文件 :133-137 给出 4 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | All database queries use parameterized queries | 所有查询参数化 |
| 2 | No string concatenation in SQL | 无字符串拼接 |
| 3 | ORM/query builder used correctly | ORM 用对（别绕过） |
| 4 | Supabase queries properly sanitized | Supabase 查询正确净化 |

> **⚠️ ORM 也能注入**
>
> 用了 ORM 不等于安全。某些 ORM 提供"原始查询"逃逸口：
>
> ```typescript
> // 危险：ORM 的 raw 接口仍可拼接
> db.raw(`SELECT * FROM users WHERE email = '${email}'`)
>
> // 安全：用参数化 raw
> db.raw('SELECT * FROM users WHERE email = ?', [email])
> ```
>
> 第 3 条检查项"ORM used correctly"正是防这个——别用 ORM 的 raw 接口拼接。

## 四、跨安全域的协作

### 4.1 三道防线的递进关系

```
① Secrets Management
   防止攻击者拿到数据库凭证
        │
        ▼ 若失守（拿到 DATABASE_URL）
② Input Validation
   防止恶意输入进入业务逻辑
        │
        ▼ 若失守（绕过校验）
③ SQL Injection Prevention
   最后一道：防止恶意输入进入 SQL
        │
        ▼ 若失守
   数据库被拖库（数据泄露 / 篡改 / 删除）
```

### 4.2 与 backend-patterns 的协作

| backend-patterns 篇目 | 本篇对应 |
|---|---|
| 第 3 篇：错误处理（ApiError + errorHandler） | 本篇 Input Validation 的 ZodError 走 errorHandler |
| 第 2 篇：数据库与缓存 | 本篇 SQL Injection 的参数化查询 |
| 第 4 篇：鉴权 | 本篇 Secrets（JWT_SECRET 从环境变量读） |

### 4.3 与 examples/CLAUDE.md 的呼应

通用模板（examples/CLAUDE.md）的安全约定：

```typescript
// examples/CLAUDE.md 的安全部分
- Environment variables for secrets (no hardcoded keys)
- Input validation on all user data
- Parameterized database queries
```

本篇把这三条落地为具体代码：环境变量读取、Zod 校验、参数化查询。

## 五、设计哲学

### 5.1 三道防线的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 密钥启动验证 | 配置错误早暴露 | 运行时半瘫 |
| 输入用 `unknown` | 强制校验后才能用 | 跳过校验直接用 |
| 白名单优于黑名单 | 默认拒绝更安全 | 新攻击绕过 |
| 参数化查询 | 代码数据分离 | 注入 |
| 三层文件校验 | 提高攻击成本 | 单层易绕过 |

### 5.2 Fail-Fast vs Fail-Safe

本篇两个安全域体现不同失败哲学：

| 安全域 | 哲学 | 体现 |
|---|---|---|
| Secrets | **Fail-Fast**（快失败） | 缺密钥直接 throw，启动即崩 |
| Input Validation | **Fail-Safe**（安全失败） | 校验失败返回错误，不崩进程 |

> **💡 什么时候用哪种**
>
> | 场景 | 哲学 | 理由 |
> |---|---|---|
> | 启动配置缺失 | Fail-Fast | 带病运行比崩溃更危险 |
> | 单个请求校验失败 | Fail-Safe | 一个坏请求不该拖垮服务 |

### 5.3 纵深防御（Defense in Depth）

三道防线不是"任选其一"，而是**层层叠加**：

```
攻击者要拖库，需要突破：
   ① 拿到 DATABASE_URL（需先突破密钥管理）
   ② 绕过输入校验（需构造合法格式的恶意输入）
   ③ 绕过参数化查询（不可能，除非用 raw 拼接）
   ↓
   三层任一挡住，攻击就失败
```

## 六、反模式汇总

### 6.1 密钥管理反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 密钥写源码 | git 泄露 | `process.env.XXX` |
| `.env.local` 入库 | 仓库泄露 = 密钥泄露 | 加入 `.gitignore` |
| 启动不验证密钥 | 运行时半瘫 | `if (!key) throw` |
| 删了密钥行就以为安全 | git 历史残留 | 用 `git filter-branch` 清历史 + 轮换密钥 |
| dev/prod 共用密钥 | 测试环境拖垮生产 | 分环境配置 |

### 6.2 输入校验反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 用 `any` 接收输入 | 跳过校验 | `unknown` + Zod |
| 黑名单过滤 | 新攻击绕过 | 白名单 |
| 只校验类型不校验边界 | 超长/越界值 | `.min()/.max()` |
| 文件只查类型 | MIME 可伪造 | magic bytes 校验 |
| 错误信息泄露字段名 | 攻击者了解结构 | 通用错误消息 |

### 6.3 SQL 注入反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 模板字符串拼接 | 注入 | 参数化 `$1` |
| 字符串相加 | 注入 | 参数化 |
| 动态表名直接拼 | 注入 | 白名单映射 |
| 信任 ORM raw 接口 | 仍可注入 | raw 也用参数化 |
| 用户输入直接进 ORDER BY | 注入 | 白名单列名 |

## 七、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 密钥 | 永不硬编码密钥 | **CRITICAL** |
| 密钥 | 所有密钥从环境变量读 | **CRITICAL** |
| 密钥 | `.env.local` 加入 gitignore | HIGH |
| 密钥 | git 历史无密钥残留 | HIGH |
| 密钥 | 生产密钥存托管平台 | HIGH |
| 密钥 | 启动时验证密钥存在（Fail-Fast） | HIGH |
| 输入 | 所有用户输入过 Zod 校验 | **CRITICAL** |
| 输入 | 入参用 `unknown`（非 any） | HIGH |
| 输入 | 字段加 min/max 边界 | HIGH |
| 输入 | 白名单校验（非黑名单） | HIGH |
| 输入 | 文件上传三层校验（大小/类型/扩展名） | HIGH |
| 输入 | 错误信息不泄露敏感细节 | HIGH |
| SQL | 所有查询参数化 | **CRITICAL** |
| SQL | 永不字符串拼接 | **CRITICAL** |
| SQL | ORM 用对（不绕过 raw） | HIGH |
| SQL | 动态表名/列名用白名单 | HIGH |
| 文件上传 | `file.type` 可伪造，需 magic bytes 兜底 | ⚠️ 需改进 |

---

## 下一篇

- [security-review 深度分析（二）：鉴权与 Web 攻击防护](./security-review-深度分析-二-鉴权与Web攻击防护.md) — httpOnly cookie、RBAC、Supabase RLS、XSS、CSRF
