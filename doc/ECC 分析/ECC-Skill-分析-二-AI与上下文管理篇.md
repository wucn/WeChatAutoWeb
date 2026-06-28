# ECC Skill 详细分析（二）：AI 与上下文管理篇

> 生成日期：2026-06-23 ｜ 分析对象：7 个 AI/上下文/自主循环类 Skill
> 系列文档：本篇为 Skill 分析系列第 2 篇，共 3 篇

## 本篇涵盖

| # | Skill | origin | 字数 | 定位 |
|---|---|---|---|---|
| 1 | `continuous-learning` | ECC | ~533 | v1 会话学习（已废弃） |
| 2 | `continuous-learning-v2` | ECC | ~2000 | v2.1 基于本能的学习系统 |
| 3 | `iterative-retrieval` | ECC | ~700 | 子代理渐进式上下文检索 |
| 4 | `strategic-compact` | ECC | ~600 | 手动上下文精简策略 |
| 5 | `cost-aware-llm-pipeline` | ECC | ~700 | LLM 成本优化管道 |
| 6 | `regex-vs-llm-structured-text` | ECC | ~800 | 正则 vs LLM 选型决策 |
| 7 | `autonomous-loops` | ECC | ~2400 | 自主循环模式谱系 |

---

## 1. continuous-learning — v1 会话学习（已废弃）

**文件**：`skills/continuous-learning/SKILL.md`（132 行）

### 1.1 废弃状态
文件顶部明确标记：`[DEPRECATED - use continuous-learning-v2]`，2026-04-28 废弃。保留用于向后兼容和对比研究。

### 1.2 v1 核心机制
- **触发**：Stop hook（会话结束时）
- **流程**：检查消息数 ≥ 10 → 检测模式 → 保存到 `~/.claude/skills/learned/`
- **配置**：`min_session_length`、`extraction_threshold`、`auto_approve`、`patterns_to_detect`

### 1.3 v1 检测的 5 类模式
| 模式 | 说明 |
|---|---|
| `error_resolution` | 错误如何被解决 |
| `user_corrections` | 用户纠正的模式 |
| `workarounds` | 框架/库怪癖的绕过方案 |
| `debugging_techniques` | 有效的调试方法 |
| `project_specific` | 项目特定约定 |

### 1.4 v1 的致命缺陷（文档自述）
> "v1 relied on skills to observe. Skills are probabilistic—they fire ~50-80% of the time."

Stop hook 虽轻量，但只在会话结束时跑一次，无法捕获会话中期的模式。这是 v2 出现的根本原因。

---

## 2. continuous-learning-v2 — 基于本能的学习系统

**文件**：`skills/continuous-learning-v2/SKILL.md`（361 行，version 2.1.0）

### 2.1 核心范式转移
v2 把"学习"从"会话结束时提取完整 skill"改为"**实时观察 → 原子本能 → 聚类演化**"的三段式。

### 2.2 v1 vs v2 vs v2.1 对比

| 维度 | v1 | v2 | v2.1 |
|---|---|---|---|
| 观察机制 | Stop hook（会话末） | PreToolUse/PostToolUse（每次工具调用） | + 项目上下文检测 |
| 分析 | 主上下文 | 后台 Haiku agent | + 项目隔离 |
| 粒度 | 完整 skill | 原子 instinct | + 项目/全局作用域 |
| 置信度 | 无 | 0.3-0.9 加权 | + 衰减机制 |
| 存储 | 全局 `~/.claude/homunculus/` | 全局 | 项目隔离 + 全局提升 |
| 可靠性 | ~50-80% | **100%**（hook 确定性触发） | 100% |

### 2.3 Instinct 数据结构

```yaml
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.7
domain: "code-style"
source: "session-observation"
scope: project
project_id: "a1b2c3d4e5f6"
project_name: "my-react-app"
```

**5 个属性**：
- **Atomic**：一个 trigger + 一个 action
- **Confidence-weighted**：0.3 试探 / 0.5 中等 / 0.7 强 / 0.9 近确定
- **Domain-tagged**：code-style/testing/git/debugging/workflow
- **Evidence-backed**：记录观察来源
- **Scope-aware**：`project`（默认）或 `global`

### 2.4 置信度演化规则

| 置信度变化 | 触发条件 |
|---|---|
| ↑ 增加 | 模式被重复观察、用户未纠正、多源一致 |
| ↓ 减少 | 用户显式纠正、长期未观察、出现矛盾证据 |

### 2.5 项目检测优先级
1. `CLAUDE_PROJECT_DIR` 环境变量（最高）
2. `git remote get-url origin` → hash（可移植，跨机器同 ID）
3. `git rev-parse --show-toplevel`（机器特定，回退）
4. 全局回退（无项目时）

### 2.6 作用域决策指南

| 模式类型 | 作用域 | 示例 |
|---|---|---|
| 语言/框架约定 | **project** | "用 React hooks"、"遵循 Django REST" |
| 文件结构偏好 | **project** | "测试放 `__tests__/`" |
| 代码风格 | **project** | "用函数式风格" |
| 安全实践 | **global** | "验证输入"、"清洗 SQL" |
| 通用最佳实践 | **global** | "先写测试"、"总是处理错误" |
| 工具工作流 | **global** | "Edit 前先 Grep"、"Write 前先 Read" |
| Git 实践 | **global** | "Conventional commits" |

### 2.7 项目 → 全局提升机制
**自动提升条件**：
- 同一 instinct ID 出现在 2+ 个项目
- 平均置信度 ≥ 0.8

**命令**：
```bash
/instinct-status     # 查看所有本能（项目+全局）
/evolve              # 聚类相关本能 → skill/command/agent
/instinct-export     # 导出本能
/instinct-import     # 导入他人的本能
/promote [id]        # 项目本能 → 全局
/projects            # 列出所有已知项目
```

### 2.8 关键设计哲学
- **Hook 而非 Skill 做观察**（:327-334）：Hook 100% 确定性触发，Skill 只有 50-80%。这是 v2 可靠性的根基。
- **数据存放在 `~/.claude` 之外**（:139-143）：`${XDG_DATA_HOME:-~/.local/share}/ecc-homunculus/`，避免 Claude Code 的 sensitive-path guard 阻止后台写入。
- **隐私**：观察数据本地存储，只导出 instinct（模式），不导出原始观察/代码/对话。

---

## 3. iterative-retrieval — 渐进式上下文检索

**文件**：`skills/iterative-retrieval/SKILL.md`（212 行）

### 3.1 解决的问题
子代理被 spawn 时上下文有限，它**不知道自己需要什么上下文**：
- 发全部 → 超出 context limit
- 发空 → 缺关键信息
- 猜 → 经常猜错

### 3.2 4 阶段循环

```
DISPATCH ──→ EVALUATE ──→ REFINE ──→ LOOP
   │            │           │          │
   │            │           │          └─ 最多 3 轮
   │            │           └─ 基于评估更新查询
   │            └─ 打分（0-1）+ 识别缺口
   └─ 初始广搜
```

### 3.3 相关性评分标准

| 分数 | 含义 | 处理 |
|---|---|---|
| 0.8-1.0 | High | 直接实现目标功能，保留 |
| 0.5-0.7 | Medium | 相关模式或类型，保留参考 |
| 0.2-0.4 | Low | 间接相关，可选 |
| 0-0.2 | None | 排除 |

### 3.4 两个实例

**Bug 修复场景**：
- Cycle 1：搜 "token/auth/expiry" → 找到 auth.ts(0.9)、tokens.ts(0.8)、user.ts(0.3)
- REFINE：加 "refresh/jwt" 关键词，排除 user.ts
- Cycle 2：找到 session-manager.ts(0.95)、jwt-utils.ts(0.85) → 足够，停止

**功能实现场景**：
- Cycle 1：搜 "rate/limit/api" → 无匹配（代码库用 "throttle"）
- REFINE：加 "throttle/middleware"
- Cycle 2：找到 throttle.ts(0.9)、middleware/index.ts(0.7)
- Cycle 3：加 "router/express" → 找到 router-setup.ts(0.8)

### 3.5 5 条最佳实践
1. **从广到窄**：初始查询别过严
2. **学习代码库术语**：第一轮常揭示命名约定
3. **追踪缺口**：显式 gap 识别驱动精炼
4. **"足够好"就停**：3 个高相关文件 > 10 个平庸文件
5. **自信排除**：低相关文件不会变相关

### 3.6 与 agent 集成
提供标准 prompt 模板，让子代理在检索上下文时遵循 4 步循环。

---

## 4. strategic-compact — 手动上下文精简

**文件**：`skills/strategic-compact/SKILL.md`（132 行）

### 4.1 解决的问题
自动 compaction 在**任意点**触发：
- 常在任务中途，丢失重要上下文
- 不感知逻辑任务边界
- 可能打断多步操作

### 4.2 战略精简时机

| 阶段转换 | 是否精简 | 原因 |
|---|---|---|
| Research → Planning | **是** | 研究上下文臃肿，计划是提炼产物 |
| Planning → Implementation | **是** | 计划在 TodoWrite/文件里，释放上下文给代码 |
| Implementation → Testing | 也许 | 测试引用近期代码则保留 |
| Debugging → Next feature | **是** | 调试痕迹污染无关工作上下文 |
| Mid-implementation | **否** | 丢失变量名/文件路径/部分状态代价大 |
| 失败尝试后 | **是** | 清除死胡同推理再试新方案 |

### 4.3 精简后什么留存

| 留存 | 丢失 |
|---|---|
| CLAUDE.md 指令 | 中间推理分析 |
| TodoWrite 任务列表 | 之前读过的文件内容 |
| Memory 文件 | 多步对话上下文 |
| Git 状态 | 工具调用历史 |
| 磁盘文件 | 口头表达的细微偏好 |

### 4.4 Hook 机制
`suggest-compact.js` 在 PreToolUse(Edit/Write) 触发：
1. 跟踪工具调用次数
2. 达阈值（默认 50 次）建议精简
3. 之后每 25 次提醒

### 4.5 Token 优化模式

**Trigger-Table 懒加载**：不预加载全部 skill，用关键词触发表，按需加载，baseline context 减少 50%+。

| Trigger | Skill | Load When |
|---|---|---|
| "test/tdd/coverage" | tdd-workflow | 用户提到测试 |
| "security/auth/xss" | security-review | 安全相关 |
| "deploy/ci/cd" | deployment-patterns | 部署上下文 |

### 4.6 关键设计哲学
- **建议而非强制**（:93）：Hook 告诉你"何时"，你决定"是否"
- **先写后精简**（:95）：精简前把重要上下文存到文件/memory
- **带摘要精简**（:97）：`/compact Focus on implementing auth middleware next`

---

## 5. cost-aware-llm-pipeline — LLM 成本优化

**文件**：`skills/cost-aware-llm-pipeline/SKILL.md`（184 行）

### 5.1 四大核心概念

| # | 概念 | 解决问题 |
|---|---|---|
| 1 | Model Routing | 简单任务用便宜模型，复杂才用贵的 |
| 2 | Immutable Cost Tracking | 累计花费追踪，不可变便于审计 |
| 3 | Narrow Retry Logic | 只重试瞬时错误，认证/参数错误立即失败 |
| 4 | Prompt Caching | 长系统提示缓存，避免重发 |

### 5.2 Model Routing 阈值

```python
_SONNET_TEXT_THRESHOLD = 10_000  # 字符
_SONNET_ITEM_THRESHOLD = 30     # 条目

# 超过任一阈值 → Sonnet，否则 Haiku（便宜 3-4x）
```

### 5.3 不可变 Cost Tracker
```python
@dataclass(frozen=True, slots=True)
class CostTracker:
    budget_limit: float = 1.00
    records: tuple[CostRecord, ...] = ()
    
    def add(self, record) -> "CostTracker":
        return CostTracker(budget_limit=self.budget_limit,
                          records=(*self.records, record))  # 返回新实例
```
**关键**：`add()` 返回新 tracker，永不 mutate self。便于调试、审计、并发安全。

### 5.4 重试策略

```python
_RETRYABLE_ERRORS = (APIConnectionError, RateLimitError, InternalServerError)
_MAX_RETRIES = 3
# AuthenticationError, BadRequestError → 立即抛出，不重试
```

### 5.5 定价参考（2025-2026）

| 模型 | 输入 $/1M | 输出 $/1M | 相对成本 |
|---|---|---|---|
| Haiku 4.5 | $0.80 | $4.00 | 1x |
| Sonnet 4.6 | $3.00 | $15.00 | ~4x |
| Opus 4.5 | $15.00 | $75.00 | ~19x |

### 5.6 组合管道
4 步组合：route model → check budget → call with retry+caching → track cost (immutable)。

### 5.7 反模式
- 所有请求都用最贵模型
- 所有错误都重试（浪费预算在永久失败上）
- 可变 cost tracking 状态
- 硬编码模型名（应用常量/config）
- 忽略重复系统提示的缓存

---

## 6. regex-vs-llm-structured-text — 正则 vs LLM 选型

**文件**：`skills/regex-vs-llm-structured-text/SKILL.md`（221 行）

### 6.1 核心洞察
> Regex handles 95-98% of cases cheaply and deterministically. Reserve expensive LLM calls for the remaining edge cases.

### 6.2 决策框架

```
文本格式一致且重复？
├── 是（>90% 遵循模式）→ 用 Regex
│   ├── Regex 处理 95%+ → 完成，不需要 LLM
│   └── Regex 处理 <95% → 仅边缘案例加 LLM
└── 否（自由形式，高度可变）→ 直接用 LLM
```

### 6.3 混合管道架构

```
源文本 → [Regex Parser] 95-98% → [Text Cleaner] → [Confidence Scorer]
                                                            │
                                              高置信 ≥0.95 → 直接输出
                                              低置信 <0.95 → [LLM Validator] → 输出
```

### 6.4 置信度评分规则

| 信号 | 扣分 |
|---|---|
| choices < 3 | -0.3 |
| answer 缺失 | -0.5 |
| text < 10 字符 | -0.2 |

低于 0.95 阈值 → 送 LLM 验证（用最便宜的 Haiku）。

### 6.5 生产实测指标（410 条目）

| 指标 | 数值 |
|---|---|
| Regex 成功率 | 98.0% |
| 低置信条目 | 8（2.0%） |
| 需要 LLM 调用 | ~5 |
| 对比全 LLM 节省 | ~95% |
| 测试覆盖 | 93% |

### 6.6 关键设计哲学
- **正则先行**：即使不完美也给改进基线
- **置信度编程化识别**：不靠"希望正则能用"，用分数判断
- **LLM 用最便宜模型**：Haiku 级别足够验证
- **不可变解析对象**：cleaning/validation 返回新实例
- **TDD 适用解析器**：先测已知模式，再测边缘案例

---

## 7. autonomous-loops — 自主循环模式谱系

**文件**：`skills/autonomous-loops/SKILL.md`（611 行，最长）

> **注意**：v1.8.0 标记为保留一个版本，canonical skill 名是 `continuous-agent-loop`。新循环指导应写在那里。

### 7.1 6 种循环模式谱系

| 模式 | 复杂度 | 适用场景 |
|---|---|---|
| Sequential Pipeline (`claude -p`) | 低 | 每日开发步骤、脚本化工作流 |
| NanoClaw REPL | 低 | 交互式持久会话 |
| Infinite Agentic Loop | 中 | 并行内容生成、spec 驱动工作 |
| Continuous Claude PR Loop | 中 | 多天迭代项目 + CI 门禁 |
| De-Sloppify Pattern | 附加 | 任何 Implementer 步骤后的清理 |
| Ralphinho / RFC-Driven DAG | 高 | 大特性、多单元并行 + merge queue |

### 7.2 模式 1：Sequential Pipeline
最简单的循环，把开发拆成 `claude -p` 调用序列：
```bash
claude -p "实现特性"  # Step 1
claude -p "清理"      # Step 2: De-sloppify
claude -p "验证"      # Step 3
claude -p "提交"      # Step 4
```
**核心洞察**：每个 `claude -p` 是全新 context window，步骤间无 context 泄漏。

### 7.3 模式 2：NanoClaw REPL
ECC 内置持久循环，session-aware：
```bash
node scripts/claw.js
CLAW_SESSION=my-project CLAW_SKILLS=tdd-workflow,security-review node scripts/claw.js
```
- 加载 `~/.claude/claw/{session}.md` 历史
- 每条消息带全历史发给 `claude -p`
- Markdown-as-database 持久化

### 7.4 模式 3：Infinite Agentic Loop
两 prompt 系统，编排并行子代理：
- **Prompt 1（Orchestrator）**：解析 spec → 扫输出目录 → 规划迭代 → 分配创意方向 → 管理波次
- **Prompt 2（Sub-Agents）**：接收全上下文 → 读分配编号 → 严格遵循 spec → 生成唯一输出

**关键洞察：唯一性通过分配实现**，不靠 agent 自我差异化。Orchestrator 给每个 agent 指定创意方向和迭代号。

### 7.5 模式 4：Continuous Claude PR Loop
生产级 shell 脚本，循环：创建分支 → `claude -p` → 提交 → PR → 等 CI → 自动修复 → 合并。

**跨迭代上下文桥梁**：`SHARED_TASK_NOTES.md`
```markdown
## Progress
- [x] 已加 auth 测试（迭代 1）
- [ ] 仍需：限流测试、错误边界测试
## Next Steps
- 下一步专注限流模块
```

**完成信号**：3 次连续输出 magic phrase → 停止循环，避免在已完成工作上浪费。

**CI 失败恢复**：`gh run view` 取日志 → 新 `claude -p` 修 → 推 → 重新等（最多 `--ci-retry-max` 次）。

### 7.6 模式 5：De-Sloppify Pattern
**附加模式**，给任何循环加清理步骤。

**问题**：LLM 实现 TDD 时会过度：
- 测 TypeScript 类型系统是否工作（`typeof x === 'string'`）
- 对类型系统已保证的事加运行时检查
- 测框架行为而非业务逻辑
- 过度错误处理

**为什么不用负面指令**：
> "don't test type systems" 会让模型对**所有**测试犹豫，跳过合法边缘测试，质量不可预测下降。

**解决方案**：分开 pass
```bash
claude -p "实现特性，TDD，充分测试"     # Step 1: 让它充分
claude -p "审查变更，移除测试/代码冗余"  # Step 2: 专注清理
```

**核心洞察**：
> Two focused agents outperform one constrained agent.

### 7.7 模式 6：Ralphinho / RFC-Driven DAG
最复杂的模式，RFC 驱动多代理 DAG 编排。

**架构**：
```
RFC/PRD → AI 分解 → 工作单元 + 依赖 DAG
                         │
          Ralph Loop（最多 3 轮）:
          按 DAG 层顺序执行:
            每单元独立 worktree:
              Research → Plan → Implement → Test → Review
            （深度按复杂度 tier）
            Merge Queue: rebase → 测试 → land 或 evict
```

**复杂度 Tier 决定管道深度**：

| Tier | 管道阶段 |
|---|---|
| trivial | implement → test |
| small | implement → test → code-review |
| medium | research → plan → implement → test → PRD-review + code-review → review-fix |
| large | + final-review |

**Author-Bias 消除**：每阶段独立 agent 进程 + 独立 context window。**审查者从不写它审查的代码**，消除自我审查盲区。

**Merge Queue with Eviction**：
- rebase 冲突 → EVICT（捕获冲突上下文）
- 测试失败 → EVICT（捕获测试输出）
- 通过 → fast-forward main
- 被驱逐的单元带完整上下文重新进入下一轮 Ralph

**关键设计原则**：
1. 确定性执行（前置分解锁定并行度和顺序）
2. 人工审查在杠杆点（工作计划是最高杠杆干预点）
3. 关注点分离（每阶段独立 context + 独立 agent）
4. 带上下文的冲突恢复（不是盲目重试）
5. Tier 驱动深度（简单变更跳过研究/审查）
6. 可恢复工作流（全状态存 SQLite，从任意点恢复）

### 7.8 选择决策树
```
单一聚焦变更？
├─ 是 → Sequential Pipeline 或 NanoClaw
└─ 否 → 有书面 spec/RFC？
         ├─ 是 → 需要并行实现？
         │        ├─ 是 → Ralphinho
         │        └─ 否 → Continuous Claude
         └─ 否 → 需要同物多变体？
                  ├─ 是 → Infinite Agentic Loop
                  └─ 否 → Sequential + De-Sloppify
```

### 7.9 6 条反模式
1. 无退出条件的无限循环（必须有 max-runs/cost/duration/signal）
2. 迭代间无上下文桥梁（用 `SHARED_TASK_NOTES.md` 或文件系统状态）
3. 同一失败盲目重试（捕获错误上下文喂下次）
4. 用负面指令而非清理 pass
5. 所有 agent 一个 context window（审查者不应是作者）
6. 并行工作忽略文件重叠（需 merge 策略）

---

## 跨 skill 协作关系

```
                continuous-learning-v2（观察所有工具调用）
                         │
                         │ 学习到的 instinct
                         ▼
    ┌────────────────────────────────────────┐
    │     自主循环（autonomous-loops）       │
    │                                        │
    │  Sequential / NanoClaw / Infinite /   │
    │  Continuous-Claude / Ralphinho         │
    └────────────────────────────────────────┘
          │                    │
          ▼                    ▼
    iterative-retrieval    strategic-compact
    （子代理取上下文）     （何时精简 context）
          │
          ▼
    cost-aware-llm-pipeline + regex-vs-llm
    （LLM 调用成本与选型）
```

**协作逻辑**：
- `continuous-learning-v2` 在所有循环运行时持续观察，积累 instinct
- `autonomous-loops` 提供循环架构，内部用 `claude -p` 调用
- `iterative-retrieval` 解决循环中子代理的上下文获取问题
- `strategic-compact` 决定循环迭代间何时精简 context
- `cost-aware-llm-pipeline` 控制循环中每次 LLM 调用的成本
- `regex-vs-llm` 决定循环中文本解析用正则还是 LLM

---

## 共性设计模式

这 7 个 skill 共享以下设计约定：

1. **When to Activate 首章**：明确激活条件
2. **对比表驱动**：v1/v2、各模式间、各 tier 间都用对比表
3. **决策树/流程图**：复杂选择用 ASCII 决策树
4. **反模式章节**：明确"不要做什么"及原因
5. **真实数据指标**：`cost-aware-llm-pipeline` 给定价表，`regex-vs-llm` 给 410 条目实测
6. **命令清单**：底部列可用命令/配置
7. **交叉引用 Related**：指向关联 skill 或外部资源
8. **Hook 配置示例**：`strategic-compact` 和 `continuous-learning-v2` 都给 settings.json 片段

---

## 下一篇

- [ECC Skill 分析（三）：语言与平台篇](./ECC-Skill-分析-三-语言与平台篇.md) — 涵盖 perl-patterns、perl-security、perl-testing、liquid-glass-design、swift-concurrency-6-2、plankton-code-quality 共 6 个 skill
