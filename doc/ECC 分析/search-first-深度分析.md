# search-first 深度分析：先调研再编码工作流

> 源文件：`skills/search-first/SKILL.md`（共 182 行，981 词）
> 单篇深度分析（规模较小，不拆多篇）
> 风格：决策驱动（Adopt / Extend / Compose / Build 四选一矩阵）

## 一、这个 skill 是什么

### 1.1 定位

`search-first` 是 ECC 插件库中的一个 **skill + slash command**（`/search-first`），强制"先搜索现成方案，再写自定义代码"的工作流。它把"开发者凭记忆造轮子"的坏习惯，系统化成一套可执行的调研流程。

| 属性 | 值 |
|---|---|
| 名称 | `search-first` |
| 类型 | skill（兼 slash command `/search-first`） |
| 来源 | ECC（origin: ECC） |
| 规模 | 182 行 / 981 词 |
| 风格 | **决策驱动**（4 种行动矩阵） |
| 触发 | 写新功能/加依赖/造工具前 |

**frontmatter**（:1-5）：

```yaml
---
name: search-first
description: Research-before-coding workflow. Search for existing tools,
  libraries, and patterns before writing custom code. Invokes the researcher agent.
origin: ECC
---
```

### 1.2 它解决什么问题

```
没有 search-first:
   "我要加个 dead link 检查" → 直接写 200 行解析+请求代码
   ↓
   - 重复造轮子（textlint-rule-no-dead-link 已存在）
   - 自己写的没经过生产考验
   - 维护成本高

有 search-first:
   "我要加 dead link 检查" → 先搜 npm → 发现 textlint-rule-no-dead-link
   → ADOPT（直接装）→ 0 行自定义代码
```

> **💡 核心价值：用"搜索"换"不写代码"**
>
> | 做法 | 自定义代码量 | 风险 |
> |---|---|---|
> | 直接写 | 多 | 高（未考验、需维护） |
> | search-first 后 ADOPT | 0 | 低（生产验证） |

### 1.3 与前几个 skill 的风格对比

| skill | 驱动方式 | 核心隐喻 |
|---|---|---|
| backend-patterns | 代码模板 | 分层架构 |
| security-review | 检查清单 | 攻击面 |
| tdd-workflow | 流程步骤 | Red-Green-Refactor |
| **search-first** | **决策矩阵** | **Adopt/Extend/Compose/Build** |

## 二、什么时候触发（Trigger）

源文件 :11-18 列出 4 个触发场景：

| # | 场景 | 中文 |
|---|---|---|
| 1 | Starting a new feature that likely has existing solutions | 新功能（可能有现成方案） |
| 2 | Adding a dependency or integration | 加依赖/集成 |
| 3 | The user asks "add X functionality" and you're about to write code | 用户说"加 X 功能"且你准备写码 |
| 4 | Before creating a new utility, helper, or abstraction | 造新工具/helper/抽象前 |

**触发判断**：

```
要写新代码?
   │
   ├─ 是 → 这功能常见吗?（dead link/HTTP client/校验...）
   │    ├─ 常见 → 触发 search-first
   │    └─ 罕见 → 可直接写
   │
   └─ 改现有代码 → 不触发（是重构，不是造新）
```

## 三、6 步工作流

源文件 :19-51 的流程图是本 skill 的核心：

```
    ┌─────────────────────────────────────┐
    │ 0. TOOL AVAILABILITY PREFLIGHT       │
    │    检查搜索渠道可用性                  │
    │    诚实报告跳过的渠道                  │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 1. NEED ANALYSIS                     │
    │    定义需要什么功能                    │
    │    识别语言/框架约束                   │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 2. PARALLEL SEARCH (researcher agent)│
    │    ┌────────┐ ┌────────┐ ┌────────┐ │
    │    │npm/PyPI│ │MCP/    │ │GitHub/ │ │
    │    │        │ │Skills  │ │Web     │ │
    │    └────────┘ └────────┘ └────────┘ │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 3. EVALUATE                          │
    │    评分：功能/维护/社区/文档/协议/依赖 │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 4. DECIDE                            │
    │    ┌───────┐ ┌────────┐ ┌───────┐   │
    │    │Adopt  │ │Extend  │ │Build  │   │
    │    │as-is  │ │/Wrap   │ │Custom │   │
    │    └───────┘ └────────┘ └───────┘   │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ 5. IMPLEMENT                        │
    │    装包 / 配 MCP / 写最小自定义代码    │
    └─────────────────────────────────────┘
```

### 3.1 Step 0：工具可用性预检（诚实原则）

源文件 :64-75 的 Step 0 是本 skill 最有设计感的一步：

> "Check only the channels that are relevant... report skipped channels honestly"

**5 个渠道的预检**：

| 渠道 | 检查命令 | 缺失时 |
|---|---|---|
| 仓库搜索 | `rg --files` + 定向 `rg` | 声明"仅检查了可见文件" |
| 包注册表 | `npm --version` / `pip --version` | 用 web/docs 搜索，不谎称覆盖 |
| GitHub CLI | `gh auth status` | 用公开 web 或本地 git 历史 |
| MCP/docs 工具 | 可用工具列表 / 本地 MCP 配置 | 回退官方文档/web |
| Skills 目录 | `ls ~/.claude/skills` | 说"无本地 skill 目录" |

> **⭐ 诚实报告原则（核心设计）**
>
> 源文件 :25 明确："report skipped channels honestly"。
>
> | 行为 | 问题 |
> |---|---|
> | 静默跳过（silent skipping） | 谎称"没找到"，实际没搜 |
> | 诚实报告"此渠道不可用" | 用户知道盲区，可补救 |
>
> 这条原则对应 Anti-Patterns 的 "Silent skipping"（:180）——**禁止静默跳过**。
>
> | 设计决策 | 为什么 | 如果不这么做 |
> |---|---|---|
> | 预检渠道可用性 | 避免依赖不存在的工具 | 调用到不存在的工具报错 |
> | 诚实报告跳过 | 让盲区可见 | 假"没找到"误导决策 |

### 3.2 Step 1：需求分析

```
Define what functionality is needed
Identify language/framework constraints
```

**2 个产出**：

| 产出 | 例子 |
|---|---|
| 功能定义 | "检查 markdown 里的死链" |
| 约束识别 | "Node.js 项目，需集成进 textlint" |

> **💡 约束先行**
>
> 先识别约束（语言/框架）再搜，否则搜到 Python 包无法用。例：搜"dead link checker"会出 Python 的 `lychee`（Rust）、Node 的 `textlint-rule-no-dead-link`，不先定约束会选错。

### 3.3 Step 2：并行搜索

源文件 :31-35 画了 3 路并行：

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│  npm /   │ │  MCP /   │ │  GitHub /│
│  PyPI    │ │  Skills  │ │  Web     │
└──────────┘ └──────────┘ └──────────┘
```

**3 个搜索源**：

| 源 | 找什么 |
|---|---|
| npm / PyPI | 包/库 |
| MCP / Skills | MCP 服务器 / Claude skill |
| GitHub / Web | 开源实现/模板/文档 |

> **💡 为什么并行**
>
> 3 个源覆盖不同生态：
> - npm/PyPI：成熟包
> - MCP/Skills：Claude 生态能力
> - GitHub：最前沿/小众实现
>
> 并行搜全，避免漏。

### 3.4 Step 3：评估（6 维评分）

源文件 :37-39：

```
Score candidates (functionality, maint, community, docs, license, deps)
```

**6 个评分维度**：

| 维度 | 含义 | 关键问题 |
|---|---|---|
| functionality | 功能匹配度 | 能直接用吗？ |
| maint | 维护活跃度 | 最近 commit？发布频率？ |
| community | 社区规模 | stars/下载量？ |
| docs | 文档质量 | 有 README/示例？ |
| license | 协议兼容 | MIT/Apache？还是 GPL？ |
| deps | 依赖体积 | 拉一堆传递依赖？ |

> **💡 license 维度的隐患**
>
> | 协议 | 商用 |
> |---|---|
> | MIT / Apache-2.0 | ✅ 可商用 |
> | GPL / AGPL | ⚠️ 传染性，可能要求开源 |
> | 无协议 | ❌ 默认全权保留，不能用 |
>
> 不查 license 直接用 GPL 包，可能让整个项目被迫开源。

### 3.5 Step 4：决策（4 选 1）

见下一节决策矩阵。

### 3.6 Step 5：实现

```
Install package / Configure MCP / Write minimal custom code
```

**3 种落地**：

| 决策 | 实现 |
|---|---|
| Adopt | `npm install` 直接用 |
| Extend | 装包 + 写薄 wrapper |
| Build | 写最小自定义代码（仍基于调研） |

## 四、决策矩阵（4 选 1）

源文件 :53-60 是本 skill 的核心决策表：

| Signal（信号） | Action（行动） | 说明 |
|---|---|---|
| Exact match, well-maintained, MIT/Apache | **Adopt** | 直接装直接用 |
| Partial match, good foundation | **Extend** | 装 + 写薄 wrapper |
| Multiple weak matches | **Compose** | 组合 2-3 个小包 |
| Nothing suitable found | **Build** | 写自定义（但基于调研） |

### 4.1 四种决策的对照

```
搜索结果
   │
   ├─ 完全匹配 + 维护好 + 协议友好 → ADOPT（0 自定义）
   │
   ├─ 部分匹配 + 基础好 → EXTEND（薄 wrapper）
   │
   ├─ 多个弱匹配 → COMPOSE（组合小包）
   │
   └─ 没合适的 → BUILD（写自定义，但有调研依据）
```

| 决策 | 自定义代码 | 风险 |
|---|---|---|
| Adopt | 0 | 最低 |
| Extend | 少 | 低 |
| Compose | 中（胶水） | 中 |
| Build | 多 | 高（但比盲目写好） |

> **💡 Build 不是失败，是"有依据的自造"**
>
> | 盲目 Build | search-first 后 Build |
> |---|---|
> | 没搜就写 | 搜了确实没有 |
> | 可能重复造轮子 | 确认无现成方案 |
> | 无依据 | 有调研依据 |
>
> search-first 后的 Build 是**经过验证的最后选择**，不是偷懒。

### 4.2 ⚠️ 决策矩阵与流程图的不一致

> **⚠️ 暴露冲突**
>
> | 位置 | 列出的选项 |
> |---|---|
> | Decision Matrix（:55-60） | Adopt / Extend / **Compose** / Build（4 种） |
> | Workflow 流程图的 DECIDE 框（:42-45） | Adopt / Extend / Build（**只 3 种，无 Compose**） |
>
> 流程图漏画了 Compose。应统一为 4 种，或在流程图补 Compose 分支。

## 五、两种使用模式

源文件 :62-103 给出 Quick Mode 和 Full Mode：

### 5.1 Quick Mode（内联，4 步脑内过）

```
0. 仓库里有吗? → rg 搜模块/测试
1. 是常见问题吗? → 搜 npm/PyPI
2. 有 MCP 吗? → 查 ~/.claude/settings.json
3. 有 skill 吗? → 查 ~/.claude/skills/
4. 有 GitHub 实现? → GitHub 代码搜
```

**适用**：小功能、加工具前。

### 5.2 Full Mode（agent 调用）

```text
Agent(subagent_type="general-purpose", prompt="
  Research existing tools for: [DESCRIPTION]
  Language/framework: [LANG]
  Constraints: [ANY]
  Search: npm/PyPI, MCP servers, Claude Code skills, GitHub
  Return: Structured comparison with recommendation
")
```

**适用**：非平凡功能、需深度调研。

> **⚠️ API 演进提示**
>
> 源文件 :102-103：
> > "Older Claude Code docs may call this `Task(...)`; use the current agent/subagent tool name"
>
> 说明 Claude Code 的 agent 调用 API 在演进（Task → Agent）。本 skill 显式标注兼容性，是良好的**前瞻性设计**。

### 5.3 两种模式的对照

| 维度 | Quick Mode | Full Mode |
|---|---|---|
| 执行者 | 自己（脑内 + 命令） | researcher agent |
| 耗时 | 秒级 | 分钟级 |
| 深度 | 浅（4 步） | 深（结构化对比） |
| 适用 | 小功能 | 复杂功能 |

## 六、搜索捷径（按类别）

源文件 :105-125 给出 4 类常用工具的捷径表：

### 6.1 四类捷径

| 类别 | 工具示例 |
|---|---|
| Development Tooling | eslint/ruff/textlint, prettier/black/gofmt, jest/pytest, husky/lint-staged |
| AI/LLM Integration | Claude SDK(Context7), Prompt 管理(MCP), 文档处理(unstructured/pdfplumber) |
| Data & APIs | httpx(Python)/ky(Node), zod(TS)/pydantic(Python), Database(先查 MCP) |
| Content & Publishing | remark/unified/markdown-it, sharp/imagemin |

> **⚠️ 捷径表的时效性风险**
>
> 这些具体包名/版本会随时间过时。本 skill 在 Step 3 的评估维度里有 "maint"（维护活跃度），但捷径表本身**未标注"需验证时效"**。
>
> | 风险 | 说明 |
> |---|---|
> | 包被废弃 | 如 `request` 已废弃，但可能还在捷径表 |
> | 更好的替代出现 | 如 `got` → `ky`/`undici` |
>
> 建议：用捷径表作起点，但 Step 3 评估时必查 maint 维度。

### 6.2 捷径表的使用方式

```
要加"HTTP client"?
   ↓ 查捷径表
   "Data & APIs → httpx(Python)/ky(Node)"
   ↓ 起点
   搜 httpx/ky → 评估 → 决策
```

捷径表是**已知好用的起点**，省去从零搜的步骤。

## 七、集成点（与其他 agent/skill 协作）

源文件 :127-145 列出 3 个集成点：

### 7.1 与 planner agent

```
planner 应在 Phase 1（架构审查）前调 researcher:
   Researcher → 找出可用工具
   Planner → 把工具纳入实现计划
   ↓ 避免"在计划里造轮子"
```

### 7.2 与 architect agent

```
architect 应向 researcher 咨询:
   - 技术栈决策
   - 集成模式发现
   - 现成参考架构
```

### 7.3 与 iterative-retrieval skill

```
组合用于渐进发现:
   Cycle 1: 广搜（npm/PyPI/MCP）
   Cycle 2: 详评 top 候选
   Cycle 3: 测项目约束兼容性
```

**协作链**：

```
planner ──→ researcher(search-first) ──→ architect
                │
                └─→ iterative-retrieval（多轮细化）
```

## 八、示例（3 个完整案例）

源文件 :147-174 给出 3 个端到端例子：

### 8.1 示例对照

| # | 需求 | 搜索 | 找到 | 决策 | 结果 |
|---|---|---|---|---|---|
| 1 | dead link 检查 | npm "markdown dead link checker" | textlint-rule-no-dead-link (9/10) | ADOPT | 0 自定义代码 |
| 2 | HTTP client wrapper | npm "http client retry" / PyPI "httpx retry" | got(Node)/httpx(Python) | ADOPT | 0 自定义代码 |
| 3 | config linter | npm "config linter schema" | ajv-cli (8/10) | ADOPT + EXTEND | 1 包 + 1 schema 文件 |

> **💡 3 个示例都选了 ADOPT**
>
> 源文件的 3 个例子全部落在 ADOPT/EXTEND，没有 Compose/Build 的例子。这暗示**大多数常见需求都能找到现成方案**——search-first 的价值正在于此。
>
> | 决策 | 示例数 | 启示 |
> |---|---|---|
> | Adopt | 2 | 最常见结果 |
> | Extend | 1（合并 Adopt） | 次常见 |
> | Compose | 0 | 较少见 |
> | Build | 0 | 最后选择 |

## 九、反模式（5 个）

源文件 :176-182 列出 5 个反模式：

| ❌ 反模式 | 问题 | 对应原则 |
|---|---|---|
| Jumping to code | 不搜就写 | Step 1-2 先搜 |
| Ignoring MCP | 不查 MCP 已有能力 | Step 2 三路含 MCP |
| Silent skipping | 渠道不可用却谎称"没找到" | Step 0 诚实报告 |
| Over-customizing | wrapper 包太厚，失去库的好处 | Extend 要"薄" |
| Dependency bloat | 为小功能装大包 | Step 3 评 deps 维度 |

### 9.1 反模式的设计闭环

```
Step 0 诚实报告 ←→ Anti-Pattern: Silent skipping
Step 2 含 MCP   ←→ Anti-Pattern: Ignoring MCP
Step 3 评 deps  ←→ Anti-Pattern: Dependency bloat
Step 4 Extend   ←→ Anti-Pattern: Over-customizing
Step 1-2 先搜   ←→ Anti-Pattern: Jumping to code
```

**5 个反模式恰好对应 5 个步骤的原则**——反模式不是额外列的，是工作流每步的"反面提醒"。

## 十、设计哲学

### 10.1 搜索优先于编码

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 先搜再写 | 用现成方案 | 重复造轮子 |
| 4 种决策含 Build | 承认有时需自造 | 强制用不合适的库 |
| Build 仍需调研 | 即使自造也要有依据 | 盲目造 |

### 10.2 诚实优先于完整

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| Step 0 预检渠道 | 知道盲区 | 依赖不存在的工具 |
| 诚实报告跳过 | 盲区可见 | 假"没找到"误导 |

### 10.3 并行优先于串行

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 3 路并行搜索 | 覆盖全生态 | 漏源 |
| 6 维评分 | 全面评估 | 只看功能漏协议 |

## 十一、与其他 skill 的协作

### 11.1 与 backend-patterns

| backend-patterns 场景 | search-first 介入 |
|---|---|
| 第 2 篇选 Redis | 先搜缓存方案（Redis/Memcached/平台原生） |
| 第 4 篇选限流存储 | 先搜限流库（express-rate-limit / rate-limiter-flexible） |
| 第 5 篇 Job Queue | 先搜队列库（BullMQ / Bee-Queue） |

### 11.2 与 tdd-workflow

| tdd-workflow 场景 | search-first 介入 |
|---|---|
| 选测试框架 | 先搜 Jest/Vitest 对比 |
| 选 Mock 庥 | 先搜 nock/msw 对比 |
| 选 E2E 工具 | 先搜 Playwright/Cypress 对比 |

### 11.3 与 security-review

| security-review 场景 | search-first 介入 |
|---|---|
| 选 DOMPurify | 先搜 HTML 净化库 |
| 选 helmet（安全头） | 先搜安全头中间件 |
| 选 npm audit 替代 | 先搜漏洞扫描工具 |

## 十二、客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| search-first | 先查 CocoaPods/SPM 有无现成库 | 先查 Maven/Gradle 依赖 |
| Adopt | `pod 'Alamofire'` 直接用 | `implementation 'retrofit'` 直接用 |
| Extend | Alamofire + 扩展封装 | Retrofit + 自定义 Converter |
| Build | 自己写网络层（少用） | 自己写（少用） |
| Decision Matrix | 选依赖时的决策树 | 同 |
| Step 0 预检 | 查 CocoaPods repo 是否可用 | 查 Maven Central 是否可达 |

## 十三、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 触发 | 写新功能/加依赖/造工具前触发 | HIGH |
| 流程 | 6 步：Preflight → Need → Search → Evaluate → Decide → Implement | **CRITICAL** |
| Step 0 | 预检渠道可用性 | HIGH |
| Step 0 | 诚实报告跳过的渠道（禁 silent skipping） | **CRITICAL** |
| Step 1 | 先定义需求 + 识别约束 | HIGH |
| Step 2 | 3 路并行搜索（npm/PyPI + MCP/Skills + GitHub/Web） | HIGH |
| Step 3 | 6 维评分（功能/维护/社区/文档/协议/依赖） | HIGH |
| Step 3 | 必查 license 兼容性 | **CRITICAL** |
| Step 3 | 必查维护活跃度（防废弃包） | HIGH |
| Step 4 | 4 选 1 决策（Adopt/Extend/Compose/Build） | **CRITICAL** |
| Step 4 | Build 是"有依据的最后选择"，非盲目 | HIGH |
| 决策 | 流程图应含 Compose（⚠️ 源图漏画） | ⚠️ 待修 |
| 模式 | Quick Mode（小功能，4 步脑内） | 标准 |
| 模式 | Full Mode（复杂功能，agent 调用） | 标准 |
| 模式 | Agent API 演进兼容（Task → Agent） | 标准 |
| 捷径 | 4 类捷径表作起点（⚠️ 需验证时效） | 标准 |
| 集成 | planner/architect 前置 researcher | HIGH |
| 集成 | 与 iterative-retrieval 组合多轮 | 标准 |
| 反模式 | 禁 Jumping to code | **CRITICAL** |
| 反模式 | 禁 Ignoring MCP | HIGH |
| 反模式 | 禁 Silent skipping | **CRITICAL** |
| 反模式 | 禁 Over-customizing（wrapper 要薄） | HIGH |
| 反模式 | 禁 Dependency bloat | HIGH |

---

> **核心箴言**：先搜再写。Adopt 优于 Extend 优于 Compose 优于 Build——但 Build 仍是合法选项，前提是经过调研确认无现成方案。
