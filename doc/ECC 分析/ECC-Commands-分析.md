# ECC Commands 详细分析

> 生成日期：2026-06-23 ｜ 分析对象：`commands/` 目录下 75 个斜杠命令
> 用户特别要求详解：`plan.md` 和 `code-review.md`

## 概览

ECC 在 `commands/` 目录下提供 **75 个斜杠命令**，每个命令是一个 Markdown 文件，通过 `/command-name` 触发。命令是"工作流入口"，调用后展开为完整 prompt，常委托给 skill 或 agent 执行。

> 长期方向是 skills-first（命令逐步迁移到 skill），但 `commands/` 保留以兼容。

## 命令分类（75 个）

| 类别 | 数量 | 代表命令 |
|---|---|---|
| 规划与 PR | 26 | plan, plan-prd, prp-plan, prp-prd, prp-implement, prp-pr, pr, feature-dev, project-init, projects, promote |
| 代码审查与质量 | 13 | code-review, review-pr, cpp-review, go-review, kotlin-review, python-review, rust-review, flutter-review, fastapi-review, security-scan, quality-gate |
| 构建/测试 | 15 | build-fix, cpp-build, go-build, kotlin-build, rust-build, flutter-build, gradle-build, go-test, kotlin-test, cpp-test, flutter-test, rust-test, test-coverage, refactor-clean |
| 会话与循环 | 11 | aside, loop-start, loop-status, santa-loop, resume-session, save-session, sessions, evolve, learn, learn-eval, instinct-status/import/export, promote, prune, checkpoint |
| 配置与工具 | 7 | cost-report, hookify, hookify-configure, hookify-help, hookify-list, model-route, jira, auto-update, update-codemaps, update-docs, ecc-guide, harness-audit, setup-pm, pm2 |
| 元/Skill | 3 | skill-create, skill-health, gan-build, gan-design |

---

## 重点详解 1：`/plan` — 实现规划命令

**文件**：`commands/plan.md`（201 行）

### 设计意图
在写任何代码前，**复述需求 → 识别风险 → 生成步骤计划 → 等待用户确认**。强制"先想后写"。

### 关键约束
> **CRITICAL**: This command will **NOT** write any code until you explicitly confirm the plan with "yes" or "proceed" or similar affirmative response.

### 四种输入模式

| 输入 | 模式 | 行为 |
|---|---|---|
| `path/to/name.prd.md` | PRD artifact 模式 | 读 PRD，选下一个 pending 里程碑，写 `.claude/plans/{name}.plan.md` |
| 其他 markdown 路径 | 参考模式 | 读文件作为上下文，产出内联计划 |
| 自由文本 | 对话模式 | 产出内联计划 |
| 空 | 澄清模式 | 询问要规划什么 |

### PRD Artifact 输出结构
```
# Plan: {Feature Name}
**Source PRD**: {path}
**Selected Milestone**: {milestone}
**Complexity**: Small | Medium | Large

## Summary (2-3 句)
## Patterns to Mirror (表格：Category/Source/Pattern)
## Files to Change (表格：File/Action/Why)
## Tasks (Task 1: Action/Mirror/Validate)
## Validation (bash 命令)
## Risks (表格：Risk/Likelihood/Mitigation)
## Acceptance (checkbox)
```

### Pattern Grounding（模式落地）
写计划前，搜索代码库中实现应该镜像的约定，捕获 5 类示例：
- Naming（命名）
- Error handling（错误处理）
- Logging（日志）
- Data access（数据访问）
- Tests（测试）

> If no similar code exists, state that explicitly. Do not invent a pattern.

### 与其他命令集成
```
/plan → 生成计划并等待确认
  ↓
tdd-workflow skill → 用 TDD 实现
  ↓
/build-fix → 修构建错误
  ↓
/code-review → 审查完成实现
  ↓
/pr 或 /prp-pr → 开 PR
```

### 设计哲学
1. **默认内联执行**（:11）：不调用 Task 工具或子代理，保证插件安装（只带 commands 不带 agents）也能用
2. **PRD 优先**：有 `.prd.md` 时走 artifact 模式，落地到 `.claude/plans/`
3. **计划→代码 解耦**：计划是独立产物，确认后才进代码
4. **复杂度估计**：High/Medium/Low + 工时拆分
5. **Planner agent 可选**（:193-200）：如果运行时暴露 `planner` 子代理且用户显式要求才委托，否则内联规划，避免 "Agent type 'planner' not found" 错误

### 工作流示例
```
User: /plan 我需要加市场解决时的实时通知

Assistant:
# 实现计划：实时市场解决通知

## 需求复述
- 市场解决时向用户发通知
- 支持多通道（应用内/邮件/webhook）
- 可靠交付

## 实现阶段
Phase 1: 数据库 Schema（notifications 表 + 偏好表 + 索引）
Phase 2: 通知服务（lib/notifications.ts + BullMQ 队列 + 重试）
Phase 3: 集成点（市场解决逻辑 hook + 查询持仓用户）
Phase 4: 前端组件（NotificationBell + 实时订阅）

## 依赖
Redis / SendGrid / Supabase real-time

## 风险
HIGH: 邮件可送达性（需 SPF/DKIM）
MEDIUM: 1000+ 用户性能
MEDIUM: 解决频繁导致通知垃圾

## 复杂度：MEDIUM（9-13 小时）

**等待确认**：按此计划进行？（yes/no/modify）
```

---

## 重点详解 2：`/code-review` — 代码审查命令

**文件**：`commands/code-review.md`（290 行）

### 设计意图
双模式代码审查：**本地未提交变更** 或 **GitHub PR**。传入 PR 号/URL 进 PR 模式，否则本地模式。

> PR review mode adapted from PRPs-agentic-eng by Wirasm. Part of the PRP workflow series.

### 模式选择逻辑
```
$ARGUMENTS 含 PR 号/URL/--pr？ 
├── 是 → PR Review Mode（8 阶段）
└── 否 → Local Review Mode（3 阶段）
```

### Local Review Mode（3 阶段）

**Phase 1 — GATHER**：`git diff --name-only HEAD`，无变更则停 "Nothing to review."

**Phase 2 — REVIEW**：完整读每个变更文件，检查三类问题：

| 严重度 | 类别 | 检查项 |
|---|---|---|
| CRITICAL | Security | 硬编码密钥、SQL 注入、XSS、缺输入验证、不安全依赖、路径遍历 |
| HIGH | Code Quality | >50 行函数、>800 行文件、>4 层嵌套、缺错误处理、console.log、TODO/FIXME、缺 JSDoc |
| MEDIUM | Best Practices | mutation 模式、emoji、缺测试、a11y 问题 |

**Phase 3 — REPORT**：CRITICAL/HIGH/MEDIUM/LOW + 文件位置 + 行号 + 修复建议。CRITICAL/HIGH 阻止提交。

### PR Review Mode（8 阶段）

**Phase 1 — FETCH**：解析输入
| 输入 | 动作 |
|---|---|
| 数字（如 `42`） | 作 PR 号 |
| URL | 提取 PR 号 |
| 分支名 | `gh pr list --head <branch>` 找 PR |

```bash
gh pr view <NUMBER> --json number,title,body,author,baseRefName,headRefName,changedFiles,additions,deletions
gh pr diff <NUMBER>
```

**Phase 2 — CONTEXT**：构建审查上下文
1. 项目规则（CLAUDE.md、.claude/docs/、contributing）
2. 规划产物（.claude/prds/、.claude/plans/、.claude/reviews/、legacy .claude/PRPs/）
3. PR 意图（描述、关联 issue、测试计划）
4. 变更文件分类（source/test/config/docs）

**Phase 3 — REVIEW**：完整读每个变更文件（不只 diff hunks，需周围上下文）。在 PR head revision 取完整文件：
```bash
gh pr diff <NUMBER> --name-only | while IFS= read -r file; do
  gh api "repos/{owner}/{repo}/contents/$file?ref=<head-branch>" --jq '.content' | base64 -d
done
```

**7 类审查清单**：

| 类别 | 检查 |
|---|---|
| Correctness | 逻辑错误、off-by-one、null 处理、边缘案例、竞态 |
| Type Safety | 类型不匹配、不安全 cast、`any`、缺泛型 |
| Pattern Compliance | 命名/文件结构/错误处理/导入是否符合项目约定 |
| Security | 注入、auth 缺口、密钥暴露、SSRF、路径遍历、XSS |
| Performance | N+1、缺索引、无界循环、内存泄漏、大 payload |
| Completeness | 缺测试/错误处理/迁移/文档 |
| Maintainability | 死代码、magic number、深嵌套、命名不清、缺类型 |

**严重度→动作映射**：
| 严重度 | 含义 | 动作 |
|---|---|---|
| CRITICAL | 安全漏洞或数据丢失风险 | 必须修后合并 |
| HIGH | Bug 或逻辑错误 | 应该修后合并 |
| MEDIUM | 质量问题或缺最佳实践 | 建议修 |
| LOW | 风格小建议 | 可选 |

**Phase 4 — VALIDATE**：检测项目类型并跑验证
```bash
# Node/TS: typecheck + lint + test + build
# Rust: clippy + test + build
# Go: vet + test + build
# Python: pytest
```

**Phase 5 — DECIDE**：
| 条件 | 决策 |
|---|---|
| 零 CRITICAL/HIGH + 验证通过 | **APPROVE** |
| 仅 MEDIUM/LOW + 验证通过 | **APPROVE** 带评论 |
| 任何 HIGH 或验证失败 | **REQUEST CHANGES** |
| 任何 CRITICAL | **BLOCK** |

特殊：Draft PR → 总 COMMENT；仅 docs/config → 轻量审查；`--approve`/`--request-changes` flag → 覆盖决策（仍报告全部 findings）

**Phase 6 — REPORT**：写 `.claude/reviews/pr-<NUMBER>-review.md`，含 Summary、Findings（按严重度）、Validation Results 表、Files Reviewed

**Phase 7 — PUBLISH**：发布到 GitHub
```bash
gh pr review <NUMBER> --approve --body "<summary>"
# 或 --request-changes / --comment
# 内联评论用 pulls/<NUMBER>/comments API
```

**Phase 8 — OUTPUT**：给用户摘要
```
PR #<NUMBER>: <TITLE>
Decision: APPROVE | REQUEST CHANGES | BLOCK
Issues: X critical, Y high, Z medium, W low
Validation: M/N checks passed
Artifacts: .claude/reviews/pr-<NUMBER>-review.md, GitHub URL
Next steps: ...
```

### 边缘情况处理
- **无 `gh` CLI**：回退到本地审查，跳过 GitHub 发布，警告用户
- **分叉分支**：建议 `git fetch origin && git rebase origin/<base>`
- **大 PR（>50 文件）**：警告审查范围，先 source 再 test 再 config/docs

### 设计哲学
1. **双模式自适应**：本地/PR 同一命令
2. **完整文件而非 diff hunks**（:108）：避免脱离上下文误判
3. **项目类型自动检测**（:142）：不用用户指定语言
4. **决策矩阵驱动**（:175-182）：明确条件→决策映射，不靠主观判断
5. **产物落盘**（:191）：审查报告写文件，可追溯
6. **Draft PR 特殊处理**（:185）：不 approve/block，只 comment
7. **flag 覆盖但仍报告**（:187）：用户可强推决策，但 findings 透明

---

## 其他命令速览（按类别）

### 规划与 PR（26 个）

| 命令 | 用途 |
|---|---|
| `/plan` | 实现规划（详解见上） |
| `/plan-prd` | 生成精简 PRD 到 `.claude/prds/{name}.prd.md` |
| `/prp-plan` | 深度 PRP 规划，`.claude/PRPs/` 产物 |
| `/prp-prd` | PRP PRD 生成 |
| `/prp-implement` | 执行 PRP 计划，带严格验证循环 |
| `/prp-pr` | PRP 工作流开 PR |
| `/prp-commit` | PRP 工作流提交 |
| `/pr` | 标准 PR 创建 |
| `/review-pr` | 审查 PR（code-review 的 PR 专用） |
| `/feature-dev` | 特性开发工作流 |
| `/project-init` | 项目初始化 |
| `/projects` | 管理多项目 |
| `/promote` | 项目本能提升到全局（continuous-learning-v2） |

### 代码审查与质量（13 个）

| 命令 | 用途 |
|---|---|
| `/code-review` | 通用代码审查（详解见上） |
| `/review-pr` | PR 专用审查 |
| `/cpp-review` | C++ 审查（内存安全/现代 C++/并发/安全），调 cpp-reviewer agent |
| `/go-review` | Go 审查（惯用模式/并发安全/错误处理），调 go-reviewer agent |
| `/kotlin-review` | Kotlin 审查（null 安全/协程安全） |
| `/python-review` | Python 审查 |
| `/rust-review` | Rust 审查 |
| `/flutter-review` | Flutter/Dart 审查（widget/状态管理/性能/a11y） |
| `/fastapi-review` | FastAPI 审查（架构/async/DI/Pydantic/安全） |
| `/security-scan` | 安全扫描（调 AgentShield） |
| `/quality-gate` | 质量门禁 |

### 构建/测试（15 个）

| 命令 | 用途 |
|---|---|
| `/build-fix` | 修复构建错误 |
| `/cpp-build` `/go-build` `/kotlin-build` `/rust-build` `/flutter-build` `/gradle-build` | 各语言构建 |
| `/cpp-test` `/go-test` `/kotlin-test` `/rust-test` `/flutter-test` | 各语言测试 |
| `/test-coverage` | 测试覆盖率检查 |
| `/refactor-clean` | 重构清理 |

### 会话与循环（11 个）

| 命令 | 用途 |
|---|---|
| `/aside` | 中途答问不打断当前任务，答完自动恢复 |
| `/loop-start` `/loop-status` | 自主循环控制 |
| `/santa-loop` | Santa 循环模式 |
| `/resume-session` `/save-session` `/sessions` | 会话历史管理 |
| `/evolve` | 聚类本能 → skill/command/agent（continuous-learning-v2） |
| `/learn` `/learn-eval` | 学习与学习评估 |
| `/instinct-status` `/instinct-export` `/instinct-import` | 本能管理 |
| `/promote` | 项目本能提升全局 |
| `/prune` | 清理 |
| `/checkpoint` | 检查点 |

### 配置与工具（7 个）

| 命令 | 用途 |
|---|---|
| `/cost-report` | 从 cost-tracker SQLite 生成成本报告 |
| `/hookify` `/hookify-configure` `/hookify-help` `/hookify-list` | Hookify 规则管理 |
| `/model-route` | 按复杂度/风险/预算推荐模型 tier |
| `/jira` | Jira 工单操作（调 jira-integration skill + MCP/REST） |
| `/auto-update` | 自动更新 |
| `/update-codemaps` `/update-docs` | 同步文档/代码地图 |
| `/ecc-guide` | ECC 使用指南 |
| `/harness-audit` | Harness 审计（`node scripts/harness-audit.js`，12 类评分） |
| `/setup-pm` `/pm2` | 包管理器设置与 PM2 |

### 元/Skill（3 个）

| 命令 | 用途 |
|---|---|
| `/skill-create` | 从 git 历史生成 skill |
| `/skill-health` | skill 健康检查 |
| `/gan-build` `/gan-design` | GAN（生成对抗网络）构建与设计 |

---

## 命令设计共性模式

1. **Frontmatter 双字段**：`description`（命令说明）+ `argument-hint`（参数提示）
2. **`$ARGUMENTS` 变量**：用户输入注入命令 prompt
3. **阶段化流程**：多数命令是 Phase 1/2/3... 线性流程
4. **决策表驱动**：条件→动作映射，而非自由文本
5. **产物落盘**：`.claude/plans/`、`.claude/reviews/`、`.claude/prds/` 等目录
6. **委托 skill/agent**：命令是入口，详细模式在 skill（如 `/code-review` → `code-reviewer` agent + `security-review` skill）
7. **边缘情况处理**：无 gh CLI、大 PR、分叉分支等显式处理
8. **与其他命令集成**：明确 next steps（plan → tdd-workflow → build-fix → code-review → pr）

## 命令 vs Skill vs Agent 关系

```
用户输入 /code-review 42
        │
        ▼
commands/code-review.md（展开为完整 prompt）
        │
        ├─ 调用 agents/code-reviewer.md（执行体，有 tools/model）
        │       └─ 末尾 "see skill: security-review"
        │               ▼
        └─ 引用 skills/security-review/SKILL.md（知识包，模式库）
                └─ 提供安全 checklist + FAIL/PASS 示例
```

- **Command** = 工作流入口 + 阶段编排
- **Agent** = 执行体（有 tools + model）
- **Skill** = 知识库（无 tools/model）

三者解耦：命令决定"怎么跑一次流程"，agent 决定"用什么工具执行"，skill 提供"怎么干得对的标准"。

---

## 与 ECC Skill 分析系列的对应关系

本篇 Commands 分析中提到的 skill 和 agent，在 Skill 分析系列三篇中有详解：

| 命令 | 对应 skill（详见系列文档） |
|---|---|
| `/code-review` + `code-reviewer` agent | `security-review` skill（系列一） |
| `/plan` + `planner` agent | — |
| `/instinct-*` `/evolve` `/promote` | `continuous-learning-v2` skill（系列二） |
| `/loop-*` `/santa-loop` | `autonomous-loops` skill（系列二） |
| `/cost-report` | `cost-aware-llm-pipeline` skill（系列二） |
| `/cpp-*` `/go-*` 等 | `golang-patterns`/`golang-testing`（系列一）、`perl-*`（系列三） |

---

## 完结

Commands 分析完成。如需深入某个具体命令（如 `/prp-implement` 的验证循环、`/loop-start` 的循环配置、`/harness-audit` 的 12 类评分维度），可继续指定。
