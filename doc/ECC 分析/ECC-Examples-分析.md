# ECC Examples 详细分析

> 生成日期：2026-06-23 ｜ 分析对象：`examples/` 目录下 46 个示例文件
> 路径：`examples/`

## 概览

ECC 的 `examples/` 提供 **46 个可直接复制使用的示例**，分两大类：
1. **项目级 CLAUDE.md 样例**（8 个）—— 不同技术栈的项目规则模板
2. **evaluator-rag-prototype 套件**（37 个文件）—— AgentShield 评估器原型，含 6 个场景
3. **配置与辅助**（其他）—— statusline.json、gan-harness 示例等

## 目录结构

```
examples/
├── CLAUDE.md                          # 通用 CLAUDE.md 模板
├── django-api-CLAUDE.md               # Django REST API 样例
├── go-microservice-CLAUDE.md          # Go 微服务样例
├── harmonyos-app-CLAUDE.md            # HarmonyOS 应用样例
├── laravel-api-CLAUDE.md              # Laravel API 样例
├── rust-api-CLAUDE.md                 # Rust API 样例
├── saas-nextjs-CLAUDE.md              # Next.js + Supabase + Stripe SaaS 样例
├── user-CLAUDE.md                     # 用户级 CLAUDE.md 样例
├── statusline.json                    # 状态栏配置样例
├── hud-status-contract.json           # HUD 状态契约
├── gan-harness/
│   └── README.md                      # GAN-Style Harness 使用示例
└── evaluator-rag-prototype/          # 评估器 RAG 原型（37 个文件）
    ├── scenario.json                  # 顶层场景
    ├── report.json                    # 顶层报告
    ├── trace.json                     # 顶层 trace
    ├── verifier-result.json           # 顶层验证结果
    ├── candidate-playbook.md          # 候选 playbook 模板
    ├── agentshield-policy-exception/  # 场景 1：AgentShield 策略例外
    │   ├── scenario.json / report.json / trace.json / verifier-result.json / candidate-playbook.md
    ├── billing-marketplace-readiness/ # 场景 2：计费市场就绪
    ├── ci-failure-diagnosis/         # 场景 3：CI 失败诊断
    ├── deep-analyzer-evidence/       # 场景 4：深度分析器证据
    ├── harness-config-quality/       # 场景 5：Harness 配置质量
    └── skill-quality-evidence/       # 场景 6：Skill 质量证据
```

---

## 一、项目级 CLAUDE.md 样例（8 个）

### 1.1 通用模板（examples/CLAUDE.md）

**设计意图**：作为新项目的 CLAUDE.md 起点，覆盖所有必备章节。

**章节结构**：
1. **Prompt Defense Baseline**（6 行安全基线，与 agent 文件一致）
2. **Project Overview**：项目描述 + 技术栈
3. **Critical Rules**（4 类）：
   - Code Organization：多小文件 > 少大文件，200-400 行典型，800 max，按特性组织
   - Code Style：无 emoji、不可变、无 console.log、错误处理、Zod 验证
   - Testing：TDD、80% 覆盖、Unit/Integration/E2E
   - Security：无硬编码密钥、环境变量、输入验证、参数化查询、CSRF
4. **File Structure**：src/app/components/hooks/lib/types
5. **Key Patterns**：ApiResponse 格式、错误处理模板
6. **Environment Variables**：必填 + 可选
7. **Available Commands**：`/tdd` `/plan` `/code-review` `/build-fix`
8. **Git Workflow**：Conventional commits、禁直推 main、PR 审查、测试通过才合并

### 1.2 SaaS Next.js 样例（examples/saas-nextjs-CLAUDE.md）

**技术栈**：Next.js 15 (App Router) + TypeScript + Supabase + Stripe + Tailwind + Playwright

**架构原则**：Server Components 默认，Client Components 仅交互，API 路由用于 webhook，Server Actions 用于 mutation

**4 类关键规则**：

| 类别 | 关键约束 |
|---|---|
| Database | RLS 启用永不绕过；migrations 目录不直改；显式列名非 `*`；用户查询必 `.limit()` |
| Authentication | `createServerClient()` (Server) / `createBrowserClient()` (Client)；用 `getUser()` 非 `getSession()`；middleware 刷新 token |
| Billing | webhook 处理；服务端取价不信任客户端；`subscription_status` 列同步；Free tier 3 项目 + 100 API/天 |
| Code Style | 无 emoji；不可变；Server Components 无 `'use client'`；Client Components `'use client'` 顶部 + 提取到 hooks；Zod 验证 |

**Server Action 模式**（关键示例）：
```typescript
'use server'
import { z } from 'zod'
const schema = z.object({ name: z.string().min(1).max(100) })
export async function createProject(formData: FormData) {
  const parsed = schema.safeParse({ name: formData.get('name') })
  if (!parsed.success) return { success: false, error: parsed.error.flatten() }
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }
  // ... insert + select
}
```

**关键 E2E 流**（4 条）：
1. 注册 → 邮箱验证 → 首项目创建
2. 登录 → 仪表盘 → CRUD
3. 升级 → Stripe checkout → 订阅激活
4. Webhook：取消订阅 → 降级 free tier

**ECC 工作流**：
```bash
/plan "Add team invitations"  →  /tdd  →  /code-review + /security-scan  →  /e2e + /test-coverage
```

### 1.3 其他技术栈样例

| 文件 | 技术栈 | 用途 |
|---|---|---|
| `django-api-CLAUDE.md` | Django REST Framework | Python 后端 API |
| `go-microservice-CLAUDE.md` | Go + gRPC | 微服务 |
| `harmonyos-app-CLAUDE.md` | ArkTS + HarmonyOS | 鸿蒙应用 |
| `laravel-api-CLAUDE.md` | Laravel + PHP | PHP API |
| `rust-api-CLAUDE.md` | Rust + Axum/Actix | Rust API |
| `user-CLAUDE.md` | — | 用户级 `~/.claude/CLAUDE.md` 全局偏好 |

**设计共性**：
- 都以 Prompt Defense Baseline 开头
- 都有 Project Overview + Critical Rules + File Structure + Patterns
- 都引用 ECC 命令（`/tdd` `/plan` `/code-review` `/e2e`）
- 都用 Conventional commits + PR 流程

---

## 二、evaluator-rag-prototype 套件（37 个文件）

### 2.1 设计意图
**AgentShield 评估器 RAG 原型**，验证"给定一个安全策略问题，能否通过检索仓库文档 + 外部 PR 证据，产出有证据支撑的决策 playbook"。

**模式**：`read_only_prototype`（只读原型，不修改代码/策略）

### 2.2 6 个评估场景

| 场景 | 目标 |
|---|---|
| `agentshield-policy-exception` | 门控 AgentShield 策略例外，需报告 + SARIF 证据 |
| `billing-marketplace-readiness` | 计费市场就绪检查 |
| `ci-failure-diagnosis` | CI 失败诊断 |
| `deep-analyzer-evidence` | 深度分析器证据 |
| `harness-config-quality` | Harness 配置质量 |
| `skill-quality-evidence` | Skill 质量证据 |

### 2.3 单场景文件结构（以 agentshield-policy-exception 为例）

每个场景 5 个文件：

| 文件 | 内容 |
|---|---|
| `scenario.json` | 场景定义：目标、数据源、检索问题、禁止动作、验收门 |
| `report.json` | 评估报告 |
| `trace.json` | 检索 trace |
| `verifier-result.json` | 验证结果 |
| `candidate-playbook.md` | 候选 playbook（产出） |

### 2.4 scenario.json 结构详解

```json
{
  "schema_version": "ecc.evaluator-rag.scenario.v1",
  "scenario_id": "agentshield-policy-exception",
  "title": "Gate AgentShield policy exceptions with report and SARIF evidence",
  "mode": "read_only_prototype",
  "objective": "...",
  "sources": [...],              // 数据源（repo_doc/repo_command/repo_skill/external_pr_evidence）
  "retrieval_questions": [...],  // 检索问题（6 条）
  "forbidden_actions": [...],   // 禁止动作（6 条）
  "acceptance_gates": [...]      // 验收门（7 条）
}
```

**4 类数据源**：
- `repo_doc`：仓库文档（如 `docs/ECC-2.0-GA-ROADMAP.md`）
- `repo_command`：ECC 命令（如 `commands/security-scan.md`）
- `repo_skill`：ECC skill（如 `skills/security-scan/SKILL.md`）
- `external_pr_evidence`：外部 PR 证据（如 `affaan-m/agentshield` PRs 55,56,57,59,60,62）

**6 条检索问题**（示例）：
- 哪个 AgentShield 策略 finding/类别/严重度/受影响文件触发了请求？
- 是否有 SARIF/code-scanning 证据匹配报告 finding？
- 例外是 active/expiring/expired？
- 例外是否含 owner/ticket/scope/expiry/rationale？
- 哪个 policy pack 或组织基线产生了 finding？
- 现在能修复，还是有界例外比 blanket suppression 更安全？

**6 条禁止动作**：
- 无 SARIF/报告证据批准策略例外
- 把过期例外当 active
- blanket-suppress AgentShield policy packs
- 无 owner/ticket/scope/expiry 降级 critical/high finding
- 从此 ECC evaluator 运行编辑 AgentShield 代码/策略
- 从此只读 evaluator 发布/执行新安全策略

**7 条验收门**：
- 命名 SARIF/报告证据
- 保留 finding id/类别/严重度/受影响 surface
- 命名 policy pack/组织基线
- 记录 owner/ticket/scope/expiry 状态
- 过期例外保持拒绝/强制
- remediation vs 有界例外决策显式
- 至少拒绝一个 blanket suppression 候选

### 2.5 顶层文件（evaluator-rag-prototype/）
- `scenario.json` / `report.json` / `trace.json` / `verifier-result.json`：顶层聚合
- `candidate-playbook.md`：通用候选 playbook 模板

### 2.6 设计哲学
1. **证据驱动**：每个决策必须有 SARIF/报告/PR 证据
2. **只读安全**：原型模式禁止修改代码/策略/发布
3. **禁止 blanket suppression**：强制有界例外，防止一刀切
4. **多源检索**：仓库文档 + 命令 + skill + 外部 PR 四类源
5. **显式验收门**：7 条 gate 必须全过才算通过
6. **可追溯 trace**：每个场景有 trace.json 记录检索路径

---

## 三、配置与辅助示例

### 3.1 statusline.json — 状态栏配置

**用途**：配置 Claude Code 状态栏显示模型/任务/成本/工具数/文件数/时长/目录/上下文进度条。

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<plugin-root>/scripts/hooks/ecc-statusline.js\"",
    "description": "ECC statusline: model | task | $cost tools files duration | dir | context bar"
  }
}
```

**显示示例**：
```
Opus 4.6 | Fixing auth bug | $1.23 47t 5f 15m | myproject ███████░░░ 68%
```

**上下文颜色阈值**：
| 颜色 | 条件 |
|---|---|
| green | < 50% |
| yellow | < 65% |
| orange | < 80% |
| red_blink | ≥ 80% |

**依赖**：读 `ecc-metrics-bridge.js` PostToolUse hook 的 bridge 文件，两者都装才有完整指标。

### 3.2 hud-status-contract.json — HUD 状态契约

定义 HUD（平视显示）的状态数据结构契约。

### 3.3 gan-harness/README.md — GAN-Style Harness 示例

**用途**：演示 Generator-Evaluator 三代理 harness 的使用方式。

**4 种调用模式**：

| 模式 | 命令 | 适用 |
|---|---|---|
| 全栈 web | `./scripts/gan-harness.sh "Build..."` | 全栈应用 |
| 前端设计 | `GAN_SKIP_PLANNER=true ./scripts/gan-harness.sh "..."` | 跳过规划，专注设计迭代 |
| API only | `GAN_EVAL_MODE=code-only ./scripts/gan-harness.sh "..."` | 无需浏览器测试 |
| 紧预算 | `GAN_MAX_ITERATIONS=5 GAN_PASS_THRESHOLD=6.5 ./scripts/gan-harness.sh "..."` | 少迭代低阈值 |

**手动三代理运行**：
```bash
# Step 1: Plan (Opus) → 产 spec.md + eval-rubric.md
claude -p --model opus "$(cat agents/gan-planner.md) ..."

# Step 2: Generate iteration 1 (Opus) → 构建初始应用
claude -p --model opus "$(cat agents/gan-generator.md) ..."

# Step 3: Evaluate iteration 1 (Opus) → 产 feedback-001.md
claude -p --model opus "$(cat agents/gan-evaluator.md) ..."

# Step 4: Generate iteration 2 (读 feedback) → 修问题
claude -p --model opus "$(cat agents/gan-generator.md) ..."
# 重复 3-4 直到满意
```

**项目类型推荐设置**：

| 项目类型 | Eval Mode | 迭代 | 阈值 | 估计成本 |
|---|---|---|---|---|
| 全栈 web | playwright | 10-15 | 7.0 | $100-200 |
| Landing page | screenshot | 5-8 | 7.5 | $30-60 |
| REST API | code-only | 5-8 | 7.0 | $30-60 |
| CLI tool | code-only | 3-5 | 6.5 | $15-30 |
| Data dashboard | playwright | 8-12 | 7.0 | $60-120 |
| Game | playwright | 10-15 | 7.0 | $100-200 |

**自定义评估 rubric**（API 项目示例）：
- Correctness (0.4)：端点返回/边缘案例/状态码
- Performance (0.2)：< 100ms / 无 N+1 / 分页
- Security (0.2)：输入验证 / SQLi 防护 / 限流 / 认证
- Documentation (0.2)：OpenAPI spec / 端点文档 / 示例

**5 条提示**：
1. 明确 brief（"Build X with Y and Z" > "make something cool"）
2. 别低于 5 迭代（前 2-3 通常低于阈值）
3. UI 项目用 playwright（screenshot 漏交互 bug）
4. 审查 feedback 文件（即使最终通过，feedback 有价值）
5. 改进 spec 再跑（结果不佳时改 `spec.md` + `--skip-planner`）

**产出文件**：
- `gan-harness/build-report.md`：最终总结 + 分数进展
- `gan-harness/feedback/`：所有评估反馈
- `gan-harness/spec.md`：完整 spec（可手动继续）

---

## Examples 设计哲学

### 1. 可复制即用
所有 CLAUDE.md 样例都标注"Copy this to your project root and customize for your stack"，是模板而非教程。

### 2. 技术栈覆盖广
8 个 CLAUDE.md 覆盖主流栈：Next.js/Supabase/Stripe、Django、Go 微服务、Laravel、Rust、HarmonyOS。

### 3. 与 ECC 命令深度集成
每个 CLAUDE.md 都引用 ECC 命令工作流（`/plan` → `/tdd` → `/code-review` → `/e2e`），展示真实使用链路。

### 4. 证据驱动评估
evaluator-rag-prototype 不给"教程"，给"可验证的评估场景"——每个场景有 sources + retrieval_questions + forbidden_actions + acceptance_gates。

### 5. 安全第一
- 所有 CLAUDE.md 以 Prompt Defense Baseline 开头
- evaluator 强制 read_only_prototype 模式
- 禁止 blanket suppression，强制有界例外

### 6. 真实成本透明
gan-harness README 给出每种项目类型的估计成本（$15-200），不隐藏 LLM 调用开销。

---

## Examples 与其他组件的协作

```
examples/CLAUDE.md（项目规则模板）
    │
    │ 用户复制到项目根
    ▼
项目 CLAUDE.md（引用 ECC 命令）
    │
    ├─ /plan → commands/plan.md（系列：Commands 分析）
    │           ↓
    │       agents/planner.md（系列：Skill 分析一引用的 agent）
    │
    ├─ /tdd → skills/tdd-workflow/SKILL.md（系列：Skill 分析一）
    │
    ├─ /code-review → commands/code-review.md + agents/code-reviewer.md
    │                  + skills/security-review/SKILL.md（系列：Skill 分析一）
    │
    └─ /e2e → skills/e2e-testing/SKILL.md

examples/evaluator-rag-prototype/（评估器原型）
    │
    │ 引用
    ▼
commands/security-scan.md + skills/security-scan/SKILL.md
    + docs/ECC-2.0-GA-ROADMAP.md
    + 外部 affaan-m/agentshield PRs

examples/gan-harness/README.md（GAN harness 示例）
    │
    │ 引用
    ▼
agents/gan-planner.md + gan-generator.md + gan-evaluator.md
    + commands/gan-build.md + gan-design.md
```

---

## 完结

Examples 分析完成。ECC 的 examples 是"可复制即用"的模板库：
- **CLAUDE.md 样例**：8 个技术栈项目规则模板
- **evaluator-rag-prototype**：6 场景的 AgentShield 评估器原型
- **gan-harness**：Generator-Evaluator 三代理使用示例
- **配置样例**：statusline / hud-status-contract

如需深入某个具体样例（如某个技术栈 CLAUDE.md 的完整规则、evaluator 某场景的 trace.json 检索路径、gan-harness 的 build-report.md 分数进展），可继续指定。

---

## 系列文档总览

本次 ECC 分析共产出 **6 篇文档**：

| # | 文档 | 内容 |
|---|---|---|
| 1 | AGENTS-SKILLS-OVERVIEW.md | 60 agents + 231 skills 总览（之前生成） |
| 2 | ECC-Skill-分析-一-工程方法论篇.md | 6 个工程基础 skill 详解 |
| 3 | ECC-Skill-分析-二-AI与上下文管理篇.md | 7 个 AI/上下文 skill 详解 |
| 4 | ECC-Skill-分析-三-语言与平台篇.md | 6 个语言/平台 skill 详解 |
| 5 | ECC-Commands-分析.md | 75 个命令 + plan/code-review 详解 |
| 6 | ECC-Rules-分析.md | 通用 + 13 语言专属规则 |
| 7 | ECC-Examples-分析.md（本文） | 46 个示例文件 |

所有文档位于 `docs/analysis/` 目录。
