# skill-stocktake 深度分析：技能盘点审计

> 源文件：`skills/skill-stocktake/SKILL.md`（共 194 行，1051 词）
> 单篇深度分析（规模较小，不拆多篇）
> 风格：审计驱动（5 种 verdict + reason 质量要求 + blind evaluation）

## 一、这个 skill 是什么

### 1.1 定位

`skill-stocktake` 是 ECC 插件库中的一个 **slash command**（`/skill-stocktake`），用"质量 checklist + AI 整体判断"审计所有 Claude skills 和 commands 的质量。它是 ECC 生态的**元 skill**——审计其他 skill（包括前面分析的 backend-patterns/security-review/tdd-workflow）。

| 属性 | 值 |
|---|---|
| 名称 | `skill-stocktake` |
| 类型 | slash command（`/skill-stocktake`） |
| 来源 | ECC（origin: ECC） |
| 规模 | 194 行 / 1051 词 |
| 风格 | **审计驱动**（5 种 verdict + 4 维度 + reason 质量门槛） |
| 产物 | `results.json`（审计结果缓存） |

**frontmatter**（:1-5）：

```yaml
---
name: skill-stocktake
description: "Use when auditing Claude skills and commands for quality.
  Supports Quick Scan (changed skills only) and Full Stocktake modes
  with sequential subagent batch evaluation."
origin: ECC
---
```

### 1.2 它解决什么问题

```
没有 skill-stocktake:
   skill 越积越多 → 内容重叠 / 过时 / 质量参差
   ↓ 无人审计
   - 重复 skill 浪费 context
   - 过时 skill 引用废弃 API
   - 低质 skill 误导开发

有 skill-stocktake:
   定期跑 /skill-stocktake → 逐个审计
   ↓
   - Keep：保留
   - Improve：改进
   - Update：更新过时引用
   - Retire：退役
   - Merge：合并到 X
   ↓ 保持 skill 库精炼
```

> **💡 核心价值：skill 库的"垃圾回收"**
>
> | 不审计 | 定期 stocktake |
> |---|---|
> | skill 无限膨胀 | 精炼可控 |
> | 重叠浪费 context | 去重 |
> | 过时引用误导 | 更新/退役 |
> | 低质 skill 拖累 | 改进/退役 |

### 1.3 与前几个 skill 的关系

| skill | 角色 | 与 skill-stocktake 关系 |
|---|---|---|
| backend-patterns | 被审计对象 | stocktake 会评估它 |
| security-review | 被审计对象 | 同上 |
| tdd-workflow | 被审计对象 | 同上 |
| search-first | 被审计对象 | 同上 |
| **skill-stocktake** | **审计者** | 元 skill，审计所有 |

### 1.4 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| /skill-stocktake | TestFlight 上线前的依赖审查 | Play Console 发布前的依赖检查 |
| Quick Scan | 只查改过的依赖 | 同 |
| Full Stocktake | 全量审查 | 同 |
| verdict（Keep/Retire） | 保留/移除依赖 | 同 |
| results.json | 审计报告缓存 | 同 |
| blind evaluation | 不分来源统一标准 | 同 |

## 二、扫描范围（Scope）

源文件 :11-31 定义扫描路径：

### 2.1 两个扫描路径

| 路径 | 说明 |
|---|---|
| `~/.claude/skills/` | 全局 skill（所有项目） |
| `{cwd}/.claude/skills/` | 项目级 skill（若目录存在） |

**关键**：路径**相对调用目录**（:13 "relative to the directory where it is invoked"）。

### 2.2 项目级 skill 的纳入

```bash
# 要含项目级 skill，从项目根跑
cd ~/path/to/my-project
/skill-stocktake
```

**逻辑**：

```
从项目根跑
   ↓
   检测 $PWD/.claude/skills/ 是否存在
   ├─ 存在 → 扫全局 + 项目级
   └─ 不存在 → 只扫全局
```

> **💡 Phase 1 必须明示扫描了哪些路径**
>
> 源文件 :20：
> > "At the start of Phase 1, the command explicitly lists which paths were found and scanned."
>
> 这与 search-first 的"诚实报告"原则呼应——**让盲区可见**。用户知道扫了什么、没扫什么。

## 三、两种模式（Modes）

源文件 :33-40 定义两种模式：

### 3.1 模式对照

| 模式 | 触发 | 耗时 |
|---|---|---|
| Quick Scan | `results.json` 存在（默认） | 5-10 min |
| Full Stocktake | `results.json` 不存在，或 `/skill-stocktake full` | 20-30 min |

### 3.2 智能切换

```
/skill-stocktake
   ↓
   检查 results.json 是否存在
   ├─ 存在 → Quick Scan（只评变化的）
   └─ 不存在 → Full Stocktake（全量）
```

> **💡 缓存驱动的模式选择**
>
> | 设计 | 好处 |
> |---|---|
> | 用 results.json 存在性切换 | 无需额外参数，自动选 |
> | Quick 只评变化 | 省时（5-10min vs 20-30min） |
> | Full 全量 | 首次或强制全审 |
>
> results.json 路径：`~/.claude/skills/skill-stocktake/results.json`（:40）

## 四、Quick Scan Flow（增量审计）

源文件 :42-55 的 7 步流程：

```
1. 读 results.json（上次结果）
   ↓
2. 跑 quick-diff.sh（对比变化）
   ↓
3. 输出 []?
   ├─ 是 → "No changes" 停止
   └─ 否 ↓
4. 只评变化的 skill（用 Phase 2 标准）
   ↓
5. 未变化的沿用上次结果
   ↓
6. 输出 diff
   ↓
7. save-results.sh 存新结果
```

### 4.1 增量的关键：quick-diff.sh

```bash
bash ~/.claude/skills/skill-stocktake/scripts/quick-diff.sh \
     ~/.claude/skills/skill-stocktake/results.json
```

**作用**：对比上次 results.json 记录的 mtime 与当前文件 mtime，找出变化的 skill。

> **💡 增量审计的效率**
>
> | 全量审计 | 增量审计 |
> |---|---|
> | 80 个 skill 全评 | 只评改动的 5 个 |
> | 20-30min | 5-10min |
> | 重复劳动 | 只评变化 |
>
> mtime 是增量检测的关键——文件改了 mtime 变，diff 即知。

### 4.2 ⚠️ heredoc 的跨平台风险

源文件 :55：

```bash
bash .../save-results.sh ... <<< "$EVAL_RESULTS"
```

`<<<`（here-string）是 bash 特性，**sh/Windows shell 不支持**。

> **⚠️ 跨平台隐患**
>
> | Shell | 支持 `<<<` |
> |---|---|
> | bash | ✅ |
> | zsh | ✅ |
> | dash/sh | ❌ |
> | Windows cmd/PS | ❌ |
>
> 在非 bash 环境会报错。应改用管道 `echo "$EVAL_RESULTS" | bash save-results.sh` 或写临时文件。

## 五、Full Stocktake Flow（全量审计 4 阶段）

源文件 :57-162 是本 skill 的核心——4 阶段全量审计：

```
Phase 1: Inventory        ← 盘点
   ↓
Phase 2: Quality Eval     ← 质量评估（核心）
   ↓
Phase 3: Summary Table    ← 汇总
   ↓
Phase 4: Consolidation    ← 整理（Retire/Merge/Improve/Update）
```

### 5.1 Phase 1 — Inventory（盘点）

```bash
bash ~/.claude/skills/skill-stocktake/scripts/scan.sh
```

**3 个产出**：

| 产出 | 说明 |
|---|---|
| 枚举 skill 文件 | 找出所有 SKILL.md |
| 提取 frontmatter | name/description |
| 收集 UTC mtime | 用于增量检测 |

**输出示例**：

```
Scanning:
  ✓ ~/.claude/skills/         (17 files)
  ✗ {cwd}/.claude/skills/    (not found — global skills only)
```

> **💡 诚实标注未找到的路径**
>
> `✗ (not found)` 与 search-first 的"诚实报告跳过"同原则——盲区可见。

### 5.2 Phase 2 — Quality Evaluation（核心）

源文件 :76-145 是本 skill 最详细的章节。

#### 5.2.1 用 general-purpose agent 评估

```text
Agent(
  subagent_type="general-purpose",
  prompt="
Evaluate the following skill inventory against the checklist.
[INVENTORY]
[CHECKLIST]
Return JSON for each skill:
{ \"verdict\": \"Keep\"|\"Improve\"|\"Update\"|\"Retire\"|\"Merge into [X]\", \"reason\": \"...\" }
"
)
```

**设计**：用 subagent 评估，避免主 context 被 skill 内容淹没。

#### 5.2.2 ⭐ Chunk guidance（分块处理）

源文件 :100：

> "Process ~20 skills per subagent invocation to keep context manageable. Save intermediate results to `results.json` (`status: in_progress`) after each chunk."

**分块策略**：

```
80 个 skill
   ↓ 每批 20 个
   ├─ 批 1（skill 1-20）→ agent 评估 → 存 results.json (in_progress)
   ├─ 批 2（21-40）→ agent 评估 → 存
   ├─ 批 3（41-60）→ agent 评估 → 存
   └─ 批 4（61-80）→ agent 评估 → 存 (completed)
```

> **💡 为什么分块**
>
> | 不分块 | 分块 |
> |---|---|
> | 80 个 skill 塞进一个 agent context | 每 20 个一批 |
> | context 爆 / 评估质量降 | context 可控 |
> | 中断全丢 | 中断可恢复 |

#### 5.2.3 ⭐ Resume detection（中断恢复）

源文件 :104：

> "If `status: in_progress` is found on startup, resume from the first unevaluated skill."

**恢复逻辑**：

```
启动
   ↓
   读 results.json
   ├─ status: completed → 正常跑
   ├─ status: in_progress → 从第一个未评的恢复
   └─ 无 results.json → 全量从头
```

> **💡 容错设计**
>
> Full Stocktake 要 20-30min，中途可能中断（网络/手误）。Resume 让中断不白费——已评的保留，只续未评的。

#### 5.2.4 Checklist（4 项检查）

源文件 :108-113：

```
- [ ] Content overlap with other skills checked
- [ ] Overlap with MEMORY.md / CLAUDE.md checked
- [ ] Freshness of technical references verified (WebSearch if tool names/CLI/APIs)
- [ ] Usage frequency considered
```

**4 项检查**：

| # | 检查 | 防什么 |
|---|---|---|
| 1 | 与其他 skill 内容重叠 | 重复 skill |
| 2 | 与 MEMORY.md/CLAUDE.md 重叠 | 内容应在项目规则而非 skill |
| 3 | 技术引用时效性（用 WebSearch 验） | 引用废弃 API/工具 |
| 4 | 使用频率 | 低频 skill 可退役 |

> **⚠️ Checklist 与 verdict 的对应不全清晰**
>
> 4 项 checklist 是"检查项"，5 种 verdict 是"结论"。但 checklist 未明确映射：
>
> | Checklist 项 | 影响 verdict |
> |---|---|
> | 重叠 → | Merge / Retire |
> | 与 MEMORY 重叠 → | Retire |
> | 引用过时 → | Update |
> | 低频 → | Retire |
>
> 但 Keep/Improve 的触发条件 checklist 没直接对应——靠下面的 4 维度整体判断。

#### 5.2.5 5 种 Verdict（结论）

源文件 :117-123：

| Verdict | 含义 |
|---|---|
| **Keep** | 有用且当前 |
| **Improve** | 值得留，但需具体改进 |
| **Update** | 引用技术过时（WebSearch 验） |
| **Retire** | 低质/过时/成本不对称 |
| **Merge into [X]** | 与另一 skill 大量重叠，指明合并目标 |

**verdict 决策树**：

```
评估 skill
   │
   ├─ 引用过时? → Update
   │
   ├─ 与他 skill 重叠多? → Merge into [X]
   │
   ├─ 低质/过时/低频? → Retire
   │
   ├─ 有用但需改? → Improve
   │
   └─ 有用且当前 → Keep
```

#### 5.2.6 ⭐⭐ Reason 质量要求（最核心的设计）

源文件 :131-144 是本 skill 最有"设计细节"的部分——reason 字段的质量门槛：

> "the `reason` field must be self-contained and decision-enabling"

**核心原则**：reason 必须**自包含 + 可决策**，不能只写"unchanged"。

**4 种 verdict 的 reason 要求**：

| Verdict | reason 必含 | Bad | Good |
|---|---|---|---|
| Retire | (1) 具体缺陷 (2) 替代方案 | "Superseded" | "disable-model-invocation: true already set; superseded by continuous-learning-v2 which covers all same patterns plus confidence scoring. No unique content remains." |
| Merge | 合并目标 + 整合内容 | "Overlaps with X" | "42-line thin content; Step 4 of chatlog-to-article already covers same workflow. Integrate the 'article angle' tip as a note in that skill." |
| Improve | 具体改什么（哪节/什么/目标大小） | "Too long" | "276 lines; Section 'Framework Comparison' (L80-140) duplicates ai-era-architecture-principles; delete it to reach ~150 lines." |
| Keep（mtime 变） | 重述原 verdict 依据 | "Unchanged" | "mtime updated but content unchanged. Unique Python reference explicitly imported by rules/python/; no overlap found." |

> **💡 为什么 reason 要自包含**
>
> | 不自包含 | 自包含 |
> |---|---|
> | "unchanged" → 用户要翻旧报告 | 一句话讲清，无需查 |
> | "Overlaps" → 与谁重叠？ | 指明目标 + 内容 |
> | 不可决策 | 可立即决定是否执行 |
>
> **reason 是给人看的决策依据**，不是给机器的状态标记。

#### 5.2.7 整体判断（4 维度）

源文件 :125-129 明确：**不是数值评分，是 AI 整体判断**。

> "Evaluation is **holistic AI judgment** — not a numeric rubric."

**4 个引导维度**：

| 维度 | 含义 |
|---|---|
| Actionability | 有代码/命令/步骤可立即行动 |
| Scope fit | name/trigger/内容对齐，不宽不窄 |
| Uniqueness | 不可被 MEMORY.md/CLAUDE.md/他 skill 替代 |
| Currency | 技术引用在当前环境有效 |

> **💡 为什么不用数值评分**
>
> | 数值评分 | 整体判断 |
> |---|---|
> | 4 维各打分加权 | AI 综合判断 |
> | 可量化但僵硬 | 灵活但需 AI 能力 |
> | 边界 case 难处理 | AI 可权衡 |
>
> 本 skill 选整体判断——**信任 AI 的综合能力**，但用 reason 质量门槛约束输出。

### 5.3 Phase 3 — Summary Table

源文件 :146-149：

```
| Skill | 7d use | Verdict | Reason |
|-------|--------|---------|--------|
```

**汇总表 4 列**：skill 名 + 7 天使用 + verdict + reason。

### 5.4 Phase 4 — Consolidation（整理）

源文件 :151-162 的 4 项整理：

#### 5.4.1 Retire / Merge（需用户确认）

```
present detailed justification per file before confirming:
   - 具体问题（重叠/过时/坏引用）
   - 替代方案（Retire: 哪个 skill/rule 覆盖；Merge: 目标 + 整合内容）
   - 移除影响（依赖的 skill / MEMORY.md 引用 / 工作流）
```

> **💡 删除/合并必须用户确认**
>
> 源文件 :153 + :193：
> - Phase 4 Retire/Merge 要"present detailed justification **before confirming with user**"
> - Notes: "Archive / delete operations always require **explicit user confirmation**"
>
> | 自动删 | 用户确认 |
> |---|---|
> | 快 | 慢但安全 |
> | 误删风险 | 用户把关 |
>
> 删除是不可逆操作，必须人确认。

#### 5.4.2 Improve（建议，用户决定）

```
present specific improvement suggestions:
   - 改什么 + 为什么（"trim 430→200 lines 因 X/Y 节重复 python-patterns"）
   - 用户决定是否执行
```

#### 5.4.3 Update（呈现更新内容 + 来源）

```
present updated content with sources checked
```

#### 5.4.4 MEMORY.md 压缩

```
Check MEMORY.md line count; propose compression if >100 lines
```

> **💡 MEMORY.md > 100 行就压缩**
>
> | MEMORY.md 行数 | 处理 |
> |---|---|
> | < 100 | 正常 |
> | > 100 | 提议压缩 |
>
> MEMORY.md 是 Claude 的项目记忆，过长会占 context。100 行是压缩阈值。

## 六、Results File Schema（结果缓存）

源文件 :163-188 定义 `results.json` 结构：

```json
{
  "evaluated_at": "2026-02-21T10:00:00Z",
  "mode": "full",
  "batch_progress": {
    "total": 80,
    "evaluated": 80,
    "status": "completed"
  },
  "skills": {
    "skill-name": {
      "path": "~/.claude/skills/skill-name/SKILL.md",
      "verdict": "Keep",
      "reason": "Concrete, actionable, unique value for X workflow",
      "mtime": "2026-01-15T08:30:00Z"
    }
  }
}
```

### 6.1 4 个顶层字段

| 字段 | 含义 |
|---|---|
| `evaluated_at` | 评估完成 UTC 时间 |
| `mode` | "full" / "quick" |
| `batch_progress` | 分批进度（total/evaluated/status） |
| `skills` | 各 skill 的评估结果 |

### 6.2 ⭐ evaluated_at 必须真实 UTC

源文件 :167-168：

> "Must be set to the actual UTC time of evaluation completion. Obtain via Bash: `date -u +%Y-%m-%dT%H:%M:%SZ`. Never use a date-only approximation like `T00:00:00Z`."

**3 条规则**：

| 规则 | 说明 |
|---|---|
| 真实 UTC | 用 `date -u` 取 |
| 含时分秒 | 不止日期 |
| 禁 `T00:00:00Z` 近似 | 这是"午夜近似"，不准 |

> **💡 为什么禁止 date-only 近似**
>
> | 真实时间 | 近似 `T00:00:00Z` |
> |---|---|
> | 2026-02-21T14:30:00Z（准） | 2026-02-21T00:00:00Z（差 14.5h） |
> | 增量 diff 准 | mtime 对比可能误判 |
>
> Quick Scan 靠 mtime 做增量，时间不准会导致**该评的没评 / 不该评的重复评**。

### 6.3 batch_progress 的 3 字段

```json
"batch_progress": {
  "total": 80,        // 总数
  "evaluated": 80,    // 已评
  "status": "completed"  // completed / in_progress
}
```

| status | 含义 |
|---|---|
| `completed` | 全评完 |
| `in_progress` | 评了一部分（可 resume） |

## 七、Notes（原则）

源文件 :190-194 的 3 条原则：

| # | 原则 | 含义 |
|---|---|---|
| 1 | Evaluation is blind | 不分来源（ECC/自写/自动提取）同一 checklist |
| 2 | Archive/delete 需用户确认 | 不可逆操作必确认 |
| 3 | No verdict branching by origin | 不因来源不同给不同 verdict |

> **⭐ Blind Evaluation（盲评）**
>
> 源文件 :192：评估**不分 skill 来源**——ECC 官方的、自己写的、自动提取的，用同一 checklist。
>
> | 区分来源 | 盲评 |
> |---|---|
> | "ECC 的就 Keep" | 一视同仁 |
> | 偏袒官方 | 客观 |
>
> 这保证审计**客观**——不因"官方"就放水。

## 八、设计哲学

### 8.1 审计驱动

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 5 种 verdict | 覆盖保留/改进/更新/退役/合并 | 只有 keep/delete 太粗 |
| reason 自包含 | 可决策 | 翻旧报告才懂 |
| 整体判断非数值 | 灵活权衡 | 僵硬评分漏边界 case |
| blind evaluation | 客观 | 偏袒官方 |

### 8.2 增量优先

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| Quick Scan（默认） | 省时 | 每次全量 20-30min |
| mtime 做增量检测 | 准确 | 内容 hash 更准但贵 |
| results.json 缓存 | 支持 Quick + Resume | 无缓存无法增量 |

### 8.3 容错与恢复

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| Chunk（每 20 一批） | 防 context 爆 | 一次全评质量降 |
| Resume（in_progress 恢复） | 中断不白费 | 中断全丢 |
| intermediate save | 每批后存 | 批间中断丢 |

### 8.4 安全优先

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| Retire/Merge 需确认 | 不可逆 | 误删 |
| 诚实报告未扫路径 | 盲区可见 | 假"全扫了" |
| evaluated_at 真实 UTC | 增量准 | 近似导致增量错 |

## 九、与其他 skill 的协作

### 9.1 审计前面分析的 skill

| 被审计 skill | 可能 verdict | reason 示例 |
|---|---|---|
| backend-patterns | Keep | "559 行，三层架构代码模板完整，与 api-design 协作边界清晰" |
| security-review | Keep（但限流示例需 Improve） | "限流示例用 express-rate-limit 默认内存存储，与 backend-patterns 硬性约束冲突，需配 Redis store 示例" |
| tdd-workflow | Improve（规则与示例不一致） | "One Assert Per Test(:442) 与示例多 assert(:212-214) 矛盾，应改 One Behavior Per Test" |
| search-first | Keep | "决策矩阵清晰，但流程图漏画 Compose 分支需修" |

### 9.2 与 search-first 的呼应

两个 skill 共享"诚实报告"原则：

| skill | 诚实体现 |
|---|---|
| search-first Step 0 | 诚实报告跳过的搜索渠道 |
| skill-stocktake Phase 1 | 诚实报告未找到的扫描路径 |

### 9.3 与 ECC 生态

```
skill-stocktake（审计者）
   ↓ 审计
   ├─ backend-patterns
   ├─ security-review
   ├─ tdd-workflow
   ├─ search-first
   └─ ... 所有 skill
   ↓
   results.json（审计结果）
   ↓
   Retire/Merge/Improve/Update
   ↓
   保持 skill 库精炼
```

## 十、反模式汇总

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| reason 写 "unchanged" | 不可决策 | 重述核心证据 |
| Retire 无替代方案 | 用户不知靠什么 | 指明哪个 skill/rule 覆盖 |
| Merge 不指目标 | 不知合到哪 | 指明目标 + 整合内容 |
| Improve 不具体 | 不知改哪 | 哪节/什么/目标大小 |
| 自动删 skill | 误删风险 | 用户确认 |
| 区分 skill 来源评 | 偏袒 | blind evaluation |
| evaluated_at 用近似 | 增量错 | 真实 UTC |
| 一次评 80 个 | context 爆 | 分块每 20 |
| 中断不保存 | 全丢 | 每批存 in_progress |

## 十一、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 范围 | 扫全局 + 项目级 skill | 标准 |
| 范围 | Phase 1 明示扫了哪些路径 | HIGH |
| 模式 | Quick Scan（results.json 存在时默认） | 标准 |
| 模式 | Full Stocktake（无 results.json 或 full 参数） | 标准 |
| Quick | 用 mtime diff 检测变化 | HIGH |
| Quick | 无变化则停止 | 标准 |
| Quick | 未变化沿用上次结果 | HIGH |
| Full-P1 | scan.sh 枚举 + frontmatter + mtime | 标准 |
| Full-P2 | 用 general-purpose agent 评估 | HIGH |
| Full-P2 | 分块每 ~20 skill 一批 | **CRITICAL** |
| Full-P2 | 每批后存 results.json (in_progress) | HIGH |
| Full-P2 | status: in_progress 可 resume | **CRITICAL** |
| Full-P2 | 4 项 checklist 检查 | HIGH |
| Full-P2 | 5 种 verdict（Keep/Improve/Update/Retire/Merge） | **CRITICAL** |
| Full-P2 | 整体判断（非数值评分） | 标准 |
| Full-P2 | 4 维度（Actionability/Scope fit/Uniqueness/Currency） | HIGH |
| Full-P2 | reason 必须自包含 + 可决策 | **CRITICAL** |
| Full-P2 | Retire reason 含缺陷 + 替代 | HIGH |
| Full-P2 | Merge reason 含目标 + 内容 | HIGH |
| Full-P2 | Improve reason 含具体改什么 | HIGH |
| Full-P2 | Keep（mtime 变）重述原依据，禁 "unchanged" | HIGH |
| Full-P3 | 汇总表 4 列（Skill/7d use/Verdict/Reason） | 标准 |
| Full-P4 | Retire/Merge 需用户确认 | **CRITICAL** |
| Full-P4 | Improve 建议由用户决定 | 标准 |
| Full-P4 | MEMORY.md > 100 行提议压缩 | HIGH |
| 缓存 | results.json 存结果 | HIGH |
| 缓存 | evaluated_at 真实 UTC（禁近似） | **CRITICAL** |
| 缓存 | batch_progress 含 total/evaluated/status | 标准 |
| 原则 | blind evaluation（不分来源） | HIGH |
| 原则 | 删/归档必用户确认 | **CRITICAL** |
| 跨平台 | save-results.sh 用 heredoc（⚠️ 非 bash 会失败） | ⚠️ 待修 |

---

> **核心箴言**：盲评（不分来源）+ 整体判断（非数值）+ reason 自包含（可决策）+ 删除必确认。skill 库需要定期"垃圾回收"，stocktake 就是回收器。
