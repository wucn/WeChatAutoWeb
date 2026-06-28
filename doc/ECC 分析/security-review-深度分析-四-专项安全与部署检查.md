# security-review 深度分析（四）：专项安全与部署检查

> 源文件：`skills/security-review/SKILL.md`（:346-503 行）
> 本篇聚焦：Blockchain Security + Dependency Security + Security Testing + Pre-Deployment Checklist
> 系列第 4 篇（完结篇），共 4 篇

## 引言：特定领域与上线前的总检

本篇覆盖"专项领域安全 + 上线前最后检查"：

```
专项与运维
   │
   ├─ ⑨ Blockchain Security     ← Solana 区块链专项
   │     - 钱包签名验证
   │     - 交易校验
   │
   ├─ ⑩ Dependency Security     ← 第三方依赖安全
   │     - npm audit
   │     - lock files
   │     - Dependabot
   │
   ├─ Security Testing          ← 安全测试自动化
   │     - 4 类测试用例
   │
   └─ Pre-Deployment Checklist  ← 上线前 16 项检查
```

## 一、Blockchain Security（区块链安全）

> 源文件 :346-398 | OWASP 映射：A04 Insecure Design（区块链专项）

### 1.1 Wallet Verification（钱包签名验证）

```typescript
// (:350-368)
import { verify } from '@solana/web3.js'

async function verifyWalletOwnership(
  publicKey: string,
  signature: string,
  message: string
) {
  try {
    const isValid = verify(
      Buffer.from(message),
      Buffer.from(signature, 'base64'),
      Buffer.from(publicKey, 'base64')
    )
    return isValid
  } catch (error) {
    return false
  }
}
```

**钱包验证的原理**：

```
① 客户端：用私钥对 message 签名
   signature = sign(privateKey, message)

② 客户端：发送 publicKey + signature + message

③ 服务端：verify(publicKey, signature, message)
   ├─ 通过 → 证明客户端持有该 publicKey 对应的私钥
   └─ 失败 → 签名无效或被篡改
```

> **⚠️ verify 签名需核验**
>
> `@solana/web3.js` 的 `verify` 函数实际参数顺序与源文件示例可能不同。不同版本 API：
>
> | 版本/库 | verify 签名 |
> |---|---|
> | `tweetnacl` | `nacl.sign.detached.verify(message, signature, publicKey)` |
> | `@solana/web3.js` | `Util.sign.detached.verify(...)` 或 `verify(message, sig, pubKey)` |
>
> 源文件 :358-362 的 `verify(Buffer, Buffer, Buffer)` 三个参数顺序（message, signature, publicKey）需对照实际库文档核验。**用错顺序会返回错误结果**（验证永远失败或永远成功，后者更危险）。

### 1.2 验证失败的容错

```typescript
// (:364-366)
} catch (error) {
  return false   // 任何异常都视为验证失败
}
```

> **💡 Fail-Closed（失败即拒绝）**
>
> | 失败处理 | 行为 | 安全性 |
> |---|---|---|
> | **return false**（源文件） | 验证失败 → 拒绝 | ✅ 安全（Fail-Closed） |
> | return true | 验证失败 → 放行 | ❌ 危险（Fail-Open） |
> | throw | 中断流程 | ⚠️ 调用方需处理 |
>
> 鉴权场景必须 Fail-Closed：宁可拒绝合法用户，不可放行攻击者。

### 1.3 Transaction Verification（交易校验）

```typescript
// (:372-391)
async function verifyTransaction(transaction: Transaction) {
  // 1. 校验收款方
  if (transaction.to !== expectedRecipient) {
    throw new Error('Invalid recipient')
  }

  // 2. 校验金额
  if (transaction.amount > maxAmount) {
    throw new Error('Amount exceeds limit')
  }

  // 3. 校验余额
  const balance = await getBalance(transaction.from)
  if (balance < transaction.amount) {
    throw new Error('Insufficient balance')
  }

  return true
}
```

**3 层校验**：

| # | 校验 | 防的攻击 |
|---|---|---|
| 1 | 收款方匹配 | 篡改收款地址（转账到攻击者钱包） |
| 2 | 金额不超限 | 大额盗刷 |
| 3 | 余额充足 | 透支 / 失败交易上链 |

```
交易提交
   │
   ├─ ① 收款方 = 预期?
   │    └─ 否 → throw（防篡改地址）
   │
   ├─ ② 金额 ≤ 上限?
   │    └─ 否 → throw（防大额盗刷）
   │
   └─ ③ 余额 ≥ 金额?
        └─ 否 → throw（防透支）
   ↓ 全通过
   执行交易
```

> **💡 为什么金额要设上限**
>
> 单笔上限是"最大损失封顶"策略。即使前两层被绕过（如收款方校验有漏洞），金额上限也能把损失控制在可承受范围。

### 1.4 ⚠️ No blind transaction signing（拒绝盲签）

源文件 :397 的验证项：**"No blind transaction signing"**。

```
盲签（BAD）:
   客户端发来交易 → 服务端直接签名广播
   ↓ 服务端不知道交易内容
   ↓ 攻击者可构造恶意交易

非盲签（GOOD）:
   客户端发来交易 → 服务端解析交易内容
   → 校验收款方/金额/余额（本节 1.3）
   → 全通过才签名广播
```

### 1.5 Verification Steps

源文件 :393-397 给出 4 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | Wallet signatures verified | 钱包签名已验证 |
| 2 | Transaction details validated | 交易明细已校验 |
| 3 | Balance checks before transactions | 交易前查余额 |
| 4 | No blind transaction signing | 不盲签 |

### 1.6 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| 钱包签名验证 | App Store 收据验证（验签） | Play Billing 的签名验证 |
| `verify(pubKey, sig, msg)` | `SecKeyVerifySignature` | `Signature.verify` |
| Fail-Closed | 验证失败拒绝支付 | 验证失败拒绝支付 |
| 交易金额上限 | In-App Purchase 的价格档位 | Play Billing 的价格上限 |
| 非盲签 | 先校验产品 ID 再发货 | 先校验 SKU 再发货 |

## 二、Dependency Security（依赖安全）

> 源文件 :399-431 | OWASP 映射：A06 Vulnerable and Outdated Components

### 2.1 漏洞扫描

```bash
# (:403-414)
# 检查漏洞
npm audit

# 自动修复可修复的
npm audit fix

# 更新依赖
npm update

# 检查过时包
npm outdated
```

**4 个命令的分工**：

| 命令 | 作用 | 何时用 |
|---|---|---|
| `npm audit` | 扫描已知漏洞 | CI 检查 |
| `npm audit fix` | 自动修复（SemVer 范围内） | 本地修复 |
| `npm update` | 更新到 SemVer 最新 | 定期维护 |
| `npm outdated` | 列出过时包 | 评估升级 |

### 2.2 Lock Files（锁文件）

```bash
# (:418-422)
# ALWAYS commit lock files
git add package-lock.json

# CI/CD 用 ci 而非 install
npm ci  # Instead of npm install
```

**`npm ci` vs `npm install`**：

| 命令 | 行为 | 用途 |
|---|---|---|
| `npm install` | 解析依赖 + 写 lock + 装包 | 本地开发 |
| **`npm ci`** | **严格按 lock 文件装**，不更新 | **CI/CD** |

> **💡 为什么 CI 必须用 `npm ci`**
>
> | 用 npm install 的风险 | 后果 |
> |---|---|
> | 解析依赖可能装到不同版本 | 本地通过 CI 失败（环境不一致） |
> | 写 lock 文件 | CI 改了仓库状态 |
> | 耗时长 | 解析 + 网络 |
>
> `npm ci` 保证**每次构建装一模一样的依赖**（可重现构建）。

### 2.3 依赖安全的 3 层防护

```
① 开发期：npm audit / npm outdated
   发现已知漏洞
        │
        ▼
② 构建期：npm ci（lock 文件）
   锁定版本，防供应链篡改
        │
        ▼
③ 维护期：Dependabot 自动 PR
   持续更新
```

### 2.4 Dependabot

源文件 :429 提到：**Dependabot enabled on GitHub**。

Dependabot 是 GitHub 的依赖更新机器人：

```
依赖有新版本/安全补丁
   ↓
Dependabot 自动创建 PR
   "Bump lodash from 4.17.20 to 4.17.21"
   ↓
CI 跑测试
   ↓
人工 review 合并
```

> **💡 自动化更新的价值**
>
> | 方式 | 响应速度 | 风险 |
> |---|---|---|
> | 手动定期更新 | 慢（季度） | 漏洞窗口期长 |
> | Dependabot 自动 PR | 快（漏洞当天） | 需 review（可能破坏功能） |
> | 自动合并 | 最快 | 高（未经测试的破坏性更新） |

### 2.5 Verification Steps

源文件 :425-430 给出 5 项检查：

| # | 检查项 | 含义 |
|---|---|---|
| 1 | Dependencies up to date | 依赖最新 |
| 2 | No known vulnerabilities (npm audit clean) | audit 无漏洞 |
| 3 | Lock files committed | lock 文件入库 |
| 4 | Dependabot enabled on GitHub | Dependabot 已启用 |
| 5 | Regular security updates | 定期安全更新 |

### 2.6 供应链攻击的防护

| 攻击 | 说明 | 防护 |
|---|---|---|
| 依赖投毒 | 恶意包混入（如 event-stream 事件） | lock 文件 + 审查 |
| 名称抢注 | `lodahs` 冒充 `lodash` | 仔细核对包名 |
| 版本回退 | 强制装旧漏洞版本 | `npm ci` 锁版本 |
| registry 劫持 | 官方源被替换 | 用可信 registry |

## 三、Security Testing（安全测试）

> 源文件 :432-471

### 3.1 4 类安全测试

源文件给出 4 类自动化测试：

```typescript
// (:436-440) ① 测试认证
test('requires authentication', async () => {
  const response = await fetch('/api/protected')
  expect(response.status).toBe(401)   // 未带 token → 401
})

// (:443-448) ② 测试授权
test('requires admin role', async () => {
  const response = await fetch('/api/admin', {
    headers: { Authorization: `Bearer ${userToken}` }
  })
  expect(response.status).toBe(403)   // 非管理员 → 403
})

// (:451-457) ③ 测试输入校验
test('rejects invalid input', async () => {
  const response = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email' })
  })
  expect(response.status).toBe(400)   // 非法邮箱 → 400
})

// (:460-469) ④ 测试限流
test('enforces rate limits', async () => {
  const requests = Array(101).fill(null).map(() =>
    fetch('/api/endpoint')
  )
  const responses = await Promise.all(requests)
  const tooManyRequests = responses.filter(r => r.status === 429)
  expect(tooManyRequests.length).toBeGreaterThan(0)   // 至少一个 429
})
```

### 3.2 测试矩阵

| 测试 | 攻击场景 | 期望响应 | 覆盖安全域 |
|---|---|---|---|
| 认证 | 无 token 访问受保护接口 | 401 | Auth |
| 授权 | 普通用户访问 admin | 403 | Authz |
| 校验 | 非法邮箱注册 | 400 | Input |
| 限流 | 突发 101 请求 | 至少 1 个 429 | Rate Limit |

### 3.3 ⚠️ 限流测试的脆弱性

源文件 :460-469 的限流测试用 `Promise.all` 并发 101 请求：

```typescript
const requests = Array(101).fill(null).map(() =>
  fetch('/api/endpoint')
)
const responses = await Promise.all(requests)
```

**问题**：

| 问题 | 说明 |
|---|---|
| 依赖内存限流 | express-rate-limit 默认内存，多实例下测试可能全过（无 429） |
| 并发不保证 | `Promise.all` 不保证同时发出，可能被限流窗口分散 |
| 环境敏感 | 测试环境与生产限流配置不同，测试通过不代表生产生效 |

> **⚠️ 更稳健的限流测试**
>
> | 改进 | 说明 |
> |---|---|
> | 显式配置测试限流 | 测试用极小窗口（如 `windowMs: 1000, max: 5`） |
> | 串行发够量 | 循环发超阈值次数，确保触发 |
> | 验证响应头 | 检查 `Retry-After` 是否存在 |
> | 独立存储 | 测试用独立 Redis db，避免污染 |

### 3.4 测试与 CI 的集成

```
CI Pipeline
   │
   ├─ 单元测试
   ├─ 集成测试
   ├─ 安全测试（本节 4 类）   ← 应纳入 CI
   └─ npm audit（自动）       ← 见第二节
```

**安全测试应作为 CI 的门禁**：任一安全测试失败，阻止部署。

## 四、Pre-Deployment Security Checklist（部署前安全清单）

> 源文件 :472-493

### 4.1 16 项检查

源文件给出生产部署前的 16 项检查：

| # | 检查项 | 对应安全域 |
|---|---|---|
| 1 | Secrets: 无硬编码，全环境变量 | 域 1 |
| 2 | Input Validation: 所有输入校验 | 域 2 |
| 3 | SQL Injection: 全参数化 | 域 3 |
| 4 | XSS: 用户内容已净化 | 域 5 |
| 5 | CSRF: 防护启用 | 域 6 |
| 6 | Authentication: token 处理正确 | 域 4 |
| 7 | Authorization: 角色检查到位 | 域 4 |
| 8 | Rate Limiting: 所有端点启用 | 域 7 |
| 9 | HTTPS: 生产强制 | 基础 |
| 10 | Security Headers: CSP 等 | 域 5 |
| 11 | Error Handling: 错误无敏感数据 | 域 8 |
| 12 | Logging: 日志无敏感数据 | 域 8 |
| 13 | Dependencies: 最新无漏洞 | 域 10 |
| 14 | Row Level Security: Supabase 启用 | 域 4 |
| 15 | CORS: 正确配置 | 基础 |
| 16 | File Uploads: 已校验 | 域 2 |
| (17) | Wallet Signatures: 区块链场景验证 | 域 9 |

> **⚠️ 纯手工勾选的局限**
>
> 16 项全是 `- [ ]` 手工勾选，**易遗漏**。改进方向：
>
> | 方式 | 说明 |
> |---|---|
> | 脚本化 | 写脚本自动检查前 N 项（如 grep 硬编码密钥） |
> | CI 门禁 | 把安全测试 + npm audit 作为部署前置 |
> | 工具辅助 | SAST（静态扫描）/ DAST（动态扫描）自动化 |

### 4.2 清单的分类视图

```
部署前清单（16 项）
   │
   ├─ 代码层（11 项）
   │    Secrets / Input / SQL / XSS / CSRF
   │    Auth / Authz / RateLimit / Error / Logging / FileUpload
   │
   ├─ 配置层（3 项）
   │    HTTPS / Security Headers / CORS
   │
   ├─ 基础设施层（2 项）
   │    Dependencies / RLS
   │
   └─ 可选（1 项）
        Wallet（仅区块链项目）
```

### 4.3 清单的使用流程

```
开发完成
   ↓
代码审查（人）+ 安全扫描（工具）
   ↓
逐项对照清单（16 项）
   ├─ 全过 → 进入部署
   └─ 有项未过 → 修复 → 重新对照
   ↓
部署到 staging
   ↓
staging 再过一遍清单
   ↓
部署到 production
```

> **💡 为什么 staging 也要过清单**
>
> 生产环境配置可能与 staging 不同（如密钥、限流配置）。staging 通过不代表生产通过，**生产部署前必须再确认**。

## 五、跨安全域的协作

### 5.1 区块链安全与通用安全的结合

区块链项目除了 ⑨ 专项，还要满足通用安全：

```
区块链应用的安全栈:
   ① Secrets（私钥管理）     ← 域 1
   ② Input Validation       ← 域 2（交易参数校验）
   ④ Auth（钱包登录）        ← 域 4 + 域 9
   ⑦ Rate Limiting          ← 域 7（防交易刷量）
   ⑧ Sensitive Exposure     ← 域 8（不记私钥/助记词）
   ⑨ Blockchain              ← 域 9（专项）
   ⑩ Dependency             ← 域 10（@solana/web3.js 版本）
```

### 5.2 依赖安全与全栈的关系

```
依赖安全（域 10）影响所有其他域:
   - 用的 zod 有漏洞 → 输入校验（域 2）失效
   - 用的 jsonwebtoken 有漏洞 → 认证（域 4）失效
   - 用的 DOMPurify 有漏洞 → XSS 防护（域 5）失效
   ↓
   依赖是所有防护的地基
```

### 5.3 测试覆盖与上线清单的对应

| 清单项 | 自动化测试 |
|---|---|
| Authentication（#6） | 测试 ①（401） |
| Authorization（#7） | 测试 ②（403） |
| Input Validation（#2） | 测试 ③（400） |
| Rate Limiting（#8） | 测试 ④（429） |
| Dependencies（#13） | npm audit |

> **⚠️ 清单 16 项中只有 5 项有自动化测试**
>
> 其余 11 项（Secrets、SQL、XSS、CSRF、HTTPS、Headers、Error、Logging、RLS、CORS、FileUpload、Wallet）**缺自动化测试**，依赖人工审查。

## 六、设计哲学

### 6.1 区块链安全的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 签名验证 | 证明私钥所有权 | 任何人冒充钱包 |
| Fail-Closed | 失败即拒绝 | 验证异常时放行攻击 |
| 交易 3 层校验 | 防篡改/盗刷/透支 | 单点失守即损失 |
| 拒绝盲签 | 服务端必须知道交易内容 | 恶意交易上链 |
| 金额上限 | 最大损失封顶 | 单笔掏空钱包 |

### 6.2 依赖安全的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| lock 文件入库 | 可重现构建 | 环境不一致 |
| `npm ci`（CI） | 严格按 lock | CI 装到不同版本 |
| npm audit | 扫已知漏洞 | 带病上线 |
| Dependabot | 自动响应补丁 | 漏洞窗口期长 |
| 定期更新 | 跟上生态 | 技术债累积 |

### 6.3 测试驱动安全的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 4 类安全测试 | 覆盖核心攻击面 | 安全规则形同虚设 |
| 测试断言状态码 | 验证防护确实生效 | 以为有防护实际没有 |
| CI 门禁 | 防回归 | 改动悄悄破坏防护 |

### 6.4 上线检查的设计哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 16 项清单 | 不漏关键项 | 凭记忆易忘 |
| 分类（代码/配置/基础设施） | 系统性覆盖 | 零散检查 |
| staging + production 双确认 | 配置可能不同 | 仅 staging 过不代表生产 |
| 清单随安全域更新 | 演进 | 新漏洞类型漏检 |

## 七、反模式汇总

### 7.1 区块链反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 盲签交易 | 恶意交易上链 | 解析 + 校验后签名 |
| 不校验收款方 | 转账到攻击者 | `to !== expected` 拒绝 |
| 无金额上限 | 大额盗刷 | 设 maxAmount |
| 不查余额 | 透支/失败上链 | `balance < amount` 拒绝 |
| 验证异常 return true | Fail-Open | return false |
| verify 参数顺序错 | 验证失效 | 对照库文档核验 |

### 7.2 依赖反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 不提交 lock 文件 | 环境不一致 | git add lock |
| CI 用 npm install | 可能装不同版本 | npm ci |
| 不跑 npm audit | 带漏洞上线 | CI 跑 audit |
| 不更新依赖 | 漏洞累积 | Dependabot |
| 装未审查的新包 | 供应链攻击 | 审查 + 可信源 |

### 7.3 测试反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 只测 happy path | 防护未验证 | 测攻击场景 |
| 限流测试依赖内存 | 环境敏感 | 显式配置测试限流 |
| 测试不进 CI | 不防回归 | CI 门禁 |
| 断言不检查状态码 | 假阳性 | 严格断言 401/403/400/429 |

### 7.4 上线清单反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 凭记忆检查 | 易漏 | 用清单 |
| 只过一次 | 配置可能变 | staging + production 双确认 |
| 清单不更新 | 漏新漏洞 | 随安全域演进 |
| 纯手工 | 易遗漏 | 脚本化 + CI 自动化 |

## 八、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 区块链 | 钱包签名必须验证 | **CRITICAL** |
| 区块链 | 验证失败 Fail-Closed（return false） | **CRITICAL** |
| 区块链 | 交易校验收款方 | **CRITICAL** |
| 区块链 | 交易设金额上限 | HIGH |
| 区块链 | 交易前查余额 | HIGH |
| 区块链 | 拒绝盲签 | **CRITICAL** |
| 区块链 | verify 参数顺序需核验库文档 | ⚠️ 待核 |
| 依赖 | lock 文件入库 | HIGH |
| 依赖 | CI 用 `npm ci` | HIGH |
| 依赖 | 定期 `npm audit` | HIGH |
| 依赖 | 启用 Dependabot | 标准 |
| 依赖 | 定期更新 | 标准 |
| 测试 | 4 类安全测试（认证/授权/输入/限流） | HIGH |
| 测试 | 安全测试纳入 CI 门禁 | HIGH |
| 测试 | 限流测试需显式配置（避免环境敏感） | ⚠️ 需改进 |
| 清单 | 16 项上线前检查 | **CRITICAL** |
| 清单 | staging + production 双确认 | HIGH |
| 清单 | 清单随安全域演进 | 标准 |
| 清单 | 尽量脚本化/自动化（防人工遗漏） | ⚠️ 待补 |

---

## 系列完结

至此，security-review skill 的 4 篇深度分析全部完成：

| # | 文件 | 主题 |
|---|---|---|
| 零 | `security-review-深度分析-零-总纲.md` | skill 定位、章节地图、阅读指南 |
| 一 | `security-review-深度分析-一-密钥管理与输入验证.md` | Secrets + Input + SQL Injection |
| 二 | `security-review-深度分析-二-鉴权与Web攻击防护.md` | Auth + XSS + CSRF |
| 三 | `security-review-深度分析-三-限流与数据暴露.md` | Rate Limit + Sensitive Exposure |
| 四 | `security-review-深度分析-四-专项安全与部署检查.md` | Blockchain + Dependency + Testing + Checklist |

**关键发现**：本系列标记的最严重问题是限流示例（:277）用 `express-rate-limit` 默认内存存储，与 backend-patterns 第 4 篇"禁止内存计数器"硬性约束冲突——这是跨 skill 的设计冲突，需在 skill 层面统一修正。
