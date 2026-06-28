# security-review 深度分析（零）：总纲

> 源文件：`skills/security-review/SKILL.md`（共 503 行）
> 系列导论，共 4 篇深度分析的前置说明
> 阅读本文后再按需进入各专题篇

## 一、这个 skill 是什么

### 1.1 定位

`security-review` 是 ECC 插件库中的一个 **skill**，为 Claude Code 提供应用安全的检查清单与防护模式。它是整个 ECC 安全体系的**单一权威来源**——所有涉及认证、输入处理、密钥、支付、敏感数据的任务都应激活本 skill。

| 属性 | 值 |
|---|---|
| 名称 | `security-review` |
| 类型 | skill（Markdown + YAML frontmatter） |
| 来源 | ECC（origin: ECC） |
| 规模 | 503 行 |
| 技术栈 | Node.js / Next.js / Supabase / Solana |
| 风格 | **checklist 驱动**（FAIL / PASS / Verification Steps 三段式） |
| 语言 | TypeScript + SQL + Bash |

**frontmatter 定义**（源文件 :1-5）：

```yaml
---
name: security-review
description: Use this skill when adding authentication, handling user input,
  working with secrets, creating API endpoints, or implementing payment/sensitive
  features. Provides comprehensive security checklist and patterns.
origin: ECC
---
```

### 1.2 它解决什么问题

为"如何写出**不漏安全漏洞**的应用"提供一套**覆盖 OWASP 核心维度的检查清单**。不是泛泛的"注意安全"，而是带每个漏洞的具体反例、正例、验证步骤的工程参考。

```
security-review skill
   │
   ├─ 不是 → "要注意 SQL 注入"（纯提醒）
   │
   └─ 是   → SQL 注入的反例：
             const query = `SELECT * WHERE email='${userEmail}'`  // FAIL
             正例：
             db.query('SELECT * WHERE email = $1', [userEmail])   // PASS
             验证清单：
             - [ ] 所有查询用参数化
             - [ ] 无字符串拼接
             （具体到代码）
```

### 1.3 与 backend-patterns 的风格差异

| 对比项 | backend-patterns | security-review |
|---|---|---|
| 驱动方式 | 代码模板（接口定义 + 类设计） | **检查清单**（FAIL / PASS / Verification） |
| 侧重 | 怎么搭（架构） | **怎么防**（漏洞） |
| 输出物 | 可复用的代码模式 | 可逐条勾选的验证项 |
| 篇幅分配 | 按"层"分（DB / API / Auth） | 按"漏洞域"分（10 个安全域） |

### 1.4 客户端类比：skill 是什么

| ECC 概念 | iOS 类比 | Android 类比 |
|---|---|---|
| security-review | Apple 的 App Store 审核指南 | Google Play 的安全要求清单 |
| Verification Steps | Xcode 的 Analyzer 检查项 | Android Lint 的安全规则集 |
| FAIL / PASS 示例 | WWDC "Do This, Not That" 幻灯片 | Android 安全博客的代码对比 |
| Pre-Deployment Checklist | TestFlight 上线前的 Release Checklist | Play Console 发布前检查表 |

## 二、什么时候激活（When to Activate）

源文件 :11-20 列出 7 个触发场景：

| # | 触发场景 | 中文 | 覆盖安全域 |
|---|---|---|---|
| 1 | Implementing authentication or authorization | 实现鉴权 | Authentication & Authorization（域 4） |
| 2 | Handling user input or file uploads | 处理输入/上传 | Input Validation（域 2） |
| 3 | Creating new API endpoints | 创建 API | Rate Limiting（域 7） + 全局 |
| 4 | Working with secrets or credentials | 处理密钥 | Secrets Management（域 1） |
| 5 | Implementing payment features | 实现支付 | Sensitive Data Exposure（域 8） + Blockchain（域 9） |
| 6 | Storing or transmitting sensitive data | 存储传输敏感数据 | Sensitive Data Exposure（域 8） |
| 7 | Integrating third-party APIs | 集成第三方 API | Dependency Security（域 10） |

**触发全景图**：

```
安全相关任务
   │
   ├─ 写鉴权代码?    → 场景 1 → 第 2 篇（鉴权与 Web 攻击）
   ├─ 处理用户输入?  → 场景 2 → 第 1 篇（密钥与输入）
   ├─ 建 API?       → 场景 3 → 第 3 篇（限流与暴露）+ 全域
   ├─ 用密钥?        → 场景 4 → 第 1 篇（密钥管理）
   ├─ 做支付?        → 场景 5 → 第 3、4 篇（暴露 + 区块链）
   ├─ 敏感数据?      → 场景 6 → 第 3 篇（数据暴露）
   └─ 第三方依赖?    → 场景 7 → 第 4 篇（依赖安全）
```

## 三、源文件章节地图

源文件按 10 个安全域 + 测试 + 部署清单组织（共 503 行）：

| 安全域 | 源文件行号 | 行数 | 主题 |
|---|---|---|---|
| 1. Secrets Management | :23-48 | ~26 | 硬编码 vs 环境变量 |
| 2. Input Validation | :49-108 | ~60 | Zod 校验 + 文件上传 |
| 3. SQL Injection Prevention | :109-138 | ~30 | 参数化查询 |
| 4. Authentication & Authorization | :139-193 | ~55 | httpOnly cookie + RLS |
| 5. XSS Prevention | :194-241 | ~48 | DOMPurify + CSP |
| 6. CSRF Protection | :242-272 | ~31 | CSRF token + SameSite |
| 7. Rate Limiting | :273-306 | ~34 | 限流（普通 + 严格） |
| 8. Sensitive Data Exposure | :307-345 | ~39 | 日志脱敏 + 错误分级 |
| 9. Blockchain Security (Solana) | :346-398 | ~53 | 钱包签名 + 交易验证 |
| 10. Dependency Security | :399-431 | ~33 | npm audit + lock files |
| Security Testing | :432-471 | ~40 | 4 类自动化测试 |
| Pre-Deployment Checklist | :472-493 | ~22 | 16 项上线检查 |
| Resources | :494-499 | ~6 | OWASP / Next.js / Supabase |

**安全域规模分布**：

```
Input Validation   ████████████   60 行  ← 最大
Auth & Authz       ███████████    55 行
Blockchain         ██████████     53 行
XSS                █████████      48 行
Sensitive Exposure ████████       39 行
Rate Limiting      ███████        34 行
Dependency         ███████        33 行
CSRF                ██████        31 行
SQL Injection       ██████        30 行
Secrets            █████          26 行  ← 最小
```

## 四、4 篇分析的拆分逻辑

10 个安全域按**攻击面分组**重组为 4 篇：

```
源文件安全域                        深度分析篇目
─────────────────────────────────────────────────
1. Secrets Management     ┐
2. Input Validation       ├─→  一、密钥管理与输入验证
3. SQL Injection          ┘    （"什么进入系统"）

4. Auth & Authz           ┐
5. XSS Prevention         ├─→  二、鉴权与 Web 攻击防护
6. CSRF Protection        ┘    （"谁在操作 + 浏览器攻击"）

7. Rate Limiting          ┐
8. Sensitive Data Exposure┘    三、限流与数据暴露
                              （"流量 + 数据怎么流出"）

9. Blockchain Security    ┐
10. Dependency Security   │
Security Testing          ├─→  四、专项安全与部署检查
Pre-Deployment Checklist  ┘    （"特定领域 + 上线前"）
```

### 4.1 分组原则

| 分组 | 共同主题 | 含安全域 |
|---|---|---|
| 一 | **数据入口**：防止恶意/错误数据进入系统 | Secrets + Input + SQL Injection |
| 二 | **身份与浏览器**：防伪造身份 + 客户端脚本攻击 | Auth + XSS + CSRF |
| 三 | **流量与泄露**：防滥用 + 防数据从日志/错误流出 | Rate Limit + Sensitive Exposure |
| 四 | **专项与运维**：特定领域 + 上线前总检 | Blockchain + Dependency + Testing + Checklist |

### 4.2 篇目与源域映射表

| 篇目 | 标题 | 对应安全域 | 源行号 |
|---|---|---|---|
| 一 | 密钥管理与输入验证 | Secrets + Input + SQL Injection | :23-138 |
| 二 | 鉴权与 Web 攻击防护 | Auth + XSS + CSRF | :139-272 |
| 三 | 限流与数据暴露 | Rate Limit + Sensitive Exposure | :273-345 |
| 四 | 专项安全与部署检查 | Blockchain + Dependency + Testing + Checklist | :346-493 |

## 五、阅读顺序建议

### 5.1 按角色推荐

| 角色 | 推荐阅读顺序 | 理由 |
|---|---|---|
| 后端新手 | 一 → 二 → 三 → 四 | 按攻击面由浅入深 |
| 后端开发者 | 二 → 一 → 三 → 四 | 先鉴权（最常用），再输入，再运维 |
| DevOps / SRE | 四 → 三 → 一 | 先部署清单 + 依赖，再限流暴露 |
| 区块链开发者 | 四（Blockchain）→ 二（鉴权） | 先钱包安全，再通用鉴权 |
| 安全审查员 | 全部按序 + Pre-Deployment Checklist | 全覆盖审查 |

### 5.2 按问题定位

| 你担心的问题 | 直接看哪篇 |
|---|---|
| API key 硬编码 | 一 |
| 用户传恶意输入 | 一 |
| SQL 注入风险 | 一 |
| token 存哪 | 二 |
| XSS / 脚本注入 | 二 |
| 伪造请求（CSRF） | 二 |
| 接口被刷 | 三 |
| 日志泄露密码 | 三 |
| 错误信息暴露内部细节 | 三 |
| 上线前漏检查 | 四（Pre-Deployment Checklist） |
| 第三方依赖漏洞 | 四（Dependency） |

## 六、核心设计原则总览（跨篇）

security-review 贯穿 10 个安全域的核心原则：

| 核心原则 | 体现安全域 | 说明 |
|---|---|---|
| 环境变量托管密钥 | Secrets | 永不硬编码，从 `process.env` 读 |
| 白名单优于黑名单 | Input / File Upload | 显式允许的类型才放行 |
| 参数化查询 | SQL Injection | 永不字符串拼接 SQL |
| httpOnly + Secure + SameSite | Auth / CSRF | cookie 三重保护 |
| 最小权限 | Auth / RLS | 用户只能访问自己的数据 |
| 净化后渲染 | XSS | 用户 HTML 必须 sanitize |
| 默认严格 CSP | XSS | 严起步，有计划才放宽 |
| 双重防护 | CSRF | token + SameSite 双保险 |
| 分级限流 | Rate Limit | 昂贵操作更严格 |
| 错误信息分级暴露 | Sensitive Exposure | 用户看通用，服务端记详细 |
| 签名验证 | Blockchain | 钱包签名 + 交易校验，拒绝盲签 |
| 锁定依赖 | Dependency | lock files 入库 + npm ci |

## 七、已发现问题汇总

本系列按"暴露冲突，不要折中"原则标记的问题：

| # | 问题 | 所在篇 | 源行号 | 严重度 |
|---|---|---|---|---|
| 1 | Rate Limiting 用 `express-rate-limit`（默认内存存储） | 三 | :277 | CRITICAL |
| 2 | 与 backend-patterns"禁止内存计数器"硬性约束**冲突** | 三 | :277 vs backend-patterns:433 | ⚠️ 跨 skill 冲突 |
| 3 | CSRF 引用 `@/lib/csrf` 但未提供实现 | 二 | :246 | ⚠️ 缺实现 |
| 4 | Authorization 删除用户返回 403（暴露用户存在性） | 二 | :159-164 | ⚠️ 信息泄露 |
| 5 | CSP 示例 `style-src 'self'` 可能破坏主流框架 | 二 | :229 | ⚠️ 兼容性 |
| 6 | 文件上传仅校验 `file.type`（可伪造） | 一 | :86 | ⚠️ 绕过风险 |
| 7 | `verifyWalletOwnership` 的 verify 签名需核验 | 四 | :358 | ⚠️ 待核 |
| 8 | Rate Limit 测试发 101 请求依赖内存限流稳定 | 四 | :460-469 | ⚠️ 测试脆弱 |
| 9 | Pre-Deployment Checklist 无自动化（纯手工勾选） | 四 | :472-493 | ⚠️ 易漏 |

**最严重的冲突（#2）**：

```
backend-patterns（:433-441）:
   "Do not use per-process in-memory counters for
    production APIs: they reset on deploy, split across
    replicas, and fail open in serverless."

security-review（:277-287）:
   import rateLimit from 'express-rate-limit'
   const limiter = rateLimit({ ... })   // 默认 memory store
   app.use('/api/', limiter)            // 生产直接用

   ↓ 冲突！一个禁止，一个示范
```

> **修复方向**：security-review 的限流示例应明确标注"仅限开发，生产需配置 Redis store"，或直接给出 `rateLimit({ store: new RedisStore(...) })` 的示例。

## 八、与其他 skill / agent 的协作

security-review 是 ECC 安全生态的核心，多处协作：

| 协作对象 | 协作点 | 关系 |
|---|---|---|
| `backend-patterns` | 错误处理安全边界、限流存储 | **有冲突**（见 #2） |
| `api-design` | HTTP 契约的安全头（CSP / CORS） | security-review 定义头，api-design 定义契约 |
| `tdd-workflow` | 安全测试自动化 | security-review 给测试用例，tdd-workflow 给测试框架 |
| `examples/CLAUDE.md` | 安全约定落地 | 把"密钥入环境变量"等写成项目规则 |
| code-reviewer agent | 代码审查 | agent 审查时引用 security-review 的清单 |
| planner agent | 方案设计 | 设计阶段引用安全约束 |

**协作边界图**：

```
                ┌──────────────────────┐
                │ examples/CLAUDE.md   │ ← 项目级安全约定
                └──────────┬───────────┘
                           │ 落地
                           ▼
   ┌────────────────────────────────────────┐
   │      security-review（本 skill）         │
   │   10 个安全域 + 测试 + 部署清单            │
   └──┬─────────────┬───────────────┬───────┘
      │             │               │
      ▼             ▼               ▼
  ┌────────┐   ┌──────────┐    ┌──────────┐
  │backend-│   │api-design│    │tdd-      │
  │patterns│   │(安全头)  │    │workflow  │
  │(错误/  │   │          │    │(安全测试)│
  │限流)   │   │          │    │          │
  │⚠️冲突  │   │          │    │          │
  └────────┘   └──────────┘    └──────────┘
```

## 九、写作风格说明（本系列的约定）

沿用 backend-patterns 系列的约定，并针对 security-review 的 checklist 风格调整：

| 约定 | 说明 |
|---|---|
| 源行号引用 | 引用源文件标注行号，如 `(:23-48)` |
| 三段式保留 | 保留 FAIL / PASS / Verification Steps 结构 |
| 规则表格化 | 硬性规则用"规则 / 说明 / 严重度"三列表 |
| 客户端类比 | 服务端安全概念附 iOS + Android 类比 |
| 流程图优先 | 攻击流程 / 防护流程用 ASCII 图 |
| 反模式详述 | 每个 FAIL 例子讲清楚"为什么危险" |
| 暴露冲突 | 跨 skill 冲突明确标注 |
| OWASP 映射 | 每个安全域标注对应 OWASP Top 10 类别 |
| 规则总结表 | 每篇结尾汇总 + 严重度 |

## 十、篇目索引

| # | 文件 | 核心内容 |
|---|---|---|
| 零 | `security-review-深度分析-零-总纲.md` | 本文：skill 定位、章节地图、阅读指南 |
| 一 | `security-review-深度分析-一-密钥管理与输入验证.md` | Secrets Management + Input Validation + SQL Injection |
| 二 | `security-review-深度分析-二-鉴权与Web攻击防护.md` | Auth & Authz + XSS + CSRF |
| 三 | `security-review-深度分析-三-限流与数据暴露.md` | Rate Limiting + Sensitive Data Exposure |
| 四 | `security-review-深度分析-四-专项安全与部署检查.md` | Blockchain + Dependency + Testing + Pre-Deployment |

**建议入门路径**：先读本文（零）建立全局认知 → 按第五节的角色推荐进入对应篇目。

---

> **系列状态**：总纲已完成，4 篇深度分析进行中
> **源文件箴言**：Security is not optional. One vulnerability can compromise the entire platform.（:503）
