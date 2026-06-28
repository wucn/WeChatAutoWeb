# tdd-workflow 深度分析（零）：总纲

> 源文件：`skills/tdd-workflow/SKILL.md`（共 463 行）
> 系列导论，共 5 篇深度分析的前置说明
> 阅读本文后再按需进入各专题篇

## 一、这个 skill 是什么

### 1.1 定位

`tdd-workflow` 是 ECC 插件库中的一个 **skill**，为 Claude Code 提供测试驱动开发（TDD）的完整工作流。它是 ECC 测试体系的**流程权威**——所有写功能、修 bug、重构的任务都应激活本 skill，按 Red-Green-Refactor 循环推进。

| 属性 | 值 |
|---|---|
| 名称 | `tdd-workflow` |
| 类型 | skill（Markdown + YAML frontmatter） |
| 来源 | ECC（origin: ECC） |
| 规模 | 463 行 |
| 技术栈 | Node.js / Jest / Vitest / Playwright / Next.js / Supabase / Redis / OpenAI |
| 风格 | **流程驱动**（7 步工作流 + Git 检查点） |
| 语言 | TypeScript + Bash + YAML |

**frontmatter 定义**（源文件 :1-5）：

```yaml
---
name: tdd-workflow
description: Use this skill when writing new features, fixing bugs, or
  refactoring code. Enforces test-driven development with 80%+ coverage
  including unit, integration, and E2E tests.
origin: ECC
---
```

### 1.2 它解决什么问题

为"如何写出**有测试兜底、可放心重构**的代码"提供一套**可严格执行的 TDD 流程**。不是泛泛的"要写测试"，而是带每一步该做什么、Git 怎么提交、RED 怎么验证、覆盖率怎么卡门槛的工程流程。

```
tdd-workflow skill
   │
   ├─ 不是 → "要写测试"（纯口号）
   │
   └─ 是   → Step 3 的 RED 验证规则：
             "Runtime RED: 测试编译通过 + 被执行 + 结果 RED
              Compile-time RED: 测试引用了 bug 代码 + 编译失败即 RED
              A test that was only written but not compiled
              and executed does not count as RED."
             （具体到验证条件）
```

### 1.3 与前两个 skill 的风格差异

| 对比项 | backend-patterns | security-review | **tdd-workflow** |
|---|---|---|---|
| 驱动方式 | 代码模板（接口+类） | 检查清单（FAIL/PASS） | **流程步骤**（7 步 + Git 检查点） |
| 侧重 | 怎么搭（架构） | 怎么防（漏洞） | **怎么推进**（开发流程） |
| 输出物 | 可复用代码模式 | 可勾选验证项 | **可执行的步骤序列** |
| 核心隐喻 | 分层 | 攻击面 | **Red-Green-Refactor 循环** |
| 篇幅分配 | 按层分（DB/API/Auth） | 按漏洞域分（10 个） | **按步骤分**（7 步 + 模式 + 反模式） |

### 1.4 客户端类比：skill 是什么

| ECC 概念 | iOS 类比 | Android 类比 |
|---|---|---|
| tdd-workflow | Apple 的 "Test-Driven Development in Swift" 指南 | Android 的 "Testing" 官方指南 |
| Red-Green-Refactor | XCTest 先写失败测试 → 实现 → 重构 | JUnit 先写失败 → 实现 → 重构 |
| Git Checkpoints | 每阶段一个 commit（不可 squash） | 同 |
| 80% 覆盖率门槛 | Xcode Code Coverage ≥ 80% | JaCoCo ≥ 80% |
| E2E (Playwright) | XCUITest（UI 自动化） | Espresso / UI Automator |

## 二、什么时候激活（When to Activate）

源文件 :11-18 列出 5 个触发场景：

| # | 触发场景 | 中文 | 覆盖工作流 |
|---|---|---|---|
| 1 | Writing new features or functionality | 写新功能 | Step 1-7 全流程 |
| 2 | Fixing bugs or issues | 修 bug | Step 2-7（从复现用例开始） |
| 3 | Refactoring existing code | 重构 | Step 6 + 测试兜底 |
| 4 | Adding API endpoints | 加 API | Step 1-7 + Integration 测试 |
| 5 | Creating new components | 建组件 | Step 1-7 + Unit 测试 |

**触发全景图**：

```
代码开发任务
   │
   ├─ 新功能?    → 场景 1 → 第 2 篇（七步全流程）
   ├─ 修 bug?    → 场景 2 → 第 2 篇（Step 2 复现用例起步）
   ├─ 重构?      → 场景 3 → 第 5 篇（持续测试 + 第 2 篇 Step 6）
   ├─ 加 API?    → 场景 4 → 第 3 篇（Integration 模式）+ 第 2 篇
   └─ 建组件?    → 场景 5 → 第 3 篇（Unit 模式）+ 第 2 篇
```

## 三、源文件章节地图

源文件按 9 个大章节组织（共 463 行）：

| 章节 | 源文件行号 | 行数 | 主题 |
|---|---|---|---|
| When to Activate | :11-18 | ~8 | 触发场景 |
| Core Principles | :19-62 | ~44 | 4 原则（Tests First / Coverage / Test Types / Git Checkpoints） |
| TDD Workflow Steps | :63-171 | ~109 | **7 步工作流**（核心） |
| Testing Patterns | :172-307 | ~136 | Unit / Integration / E2E + 文件组织 |
| Mocking External Services | :308-344 | ~37 | Supabase / Redis / OpenAI Mock |
| Test Coverage Verification | :345-367 | ~23 | 覆盖率门槛 |
| Common Testing Mistakes | :368-415 | ~48 | 3 对 FAIL/PASS |
| Continuous Testing | :416-438 | ~23 | Watch / PreCommit / CI |
| Best Practices + Success Metrics | :439-463 | ~25 | 10 条最佳实践 + 成功指标 |

**章节规模分布**：

```
Testing Patterns    ██████████████████████████  136 行  ← 最大（3 种模式代码）
TDD Workflow Steps  ████████████████████        109 行  ← 核心流程
Core Principles     ████████                     44 行
Common Mistakes     █████████                    48 行
Mocking             ███████                      37 行
Coverage            █████                        23 行
Continuous Testing  █████                        23 行
Best Practices      █████                        25 行
When to Activate    ██                            8 行  ← 最小
```

## 四、5 篇分析的拆分逻辑

9 个章节按**TDD 实践维度**重组为 5 篇：

```
源文件章节                        深度分析篇目
─────────────────────────────────────────────────
Core Principles        ───→  一、核心原则与测试分层
                              （Tests First + Coverage + Test Types + Git Checkpoints）

TDD Workflow Steps     ───→  二、TDD 七步工作流
                              （Red-Green-Refactor + RED 验证规则 + 提交规范）

Testing Patterns       ───→  三、测试模式与文件组织
Test File Organization        （Unit / Integration / E2E + 目录结构）

Mocking                ┐
Coverage Verification  ┘───→  四、依赖隔离与覆盖率
                              （Supabase/Redis/OpenAI Mock + 80% 门槛）

Common Mistakes        ┐
Continuous Testing     ├────→  五、反模式与持续测试
Best Practices         │      （3 对反模式 + Watch/CI + 10 条实践 + 指标）
Success Metrics        ┘
```

### 4.1 分组原则

| 分组 | 共同主题 | 含章节 |
|---|---|---|
| 一 | **哲学基础**：为什么 TDD、测什么、Git 怎么配合 | Core Principles |
| 二 | **执行流程**：7 步怎么走、RED/GREEN 怎么验证 | TDD Workflow Steps |
| 三 | **代码模式**：三种测试怎么写、文件怎么放 | Testing Patterns + File Org |
| 四 | **质量保证**：依赖怎么隔离、覆盖率怎么卡 | Mocking + Coverage |
| 五 | **工程化**：反模式 + 持续集成 + 最佳实践 | Mistakes + Continuous + Best |

### 4.2 篇目与源章节映射表

| 篇目 | 标题 | 对应源章节 | 源行号 |
|---|---|---|---|
| 一 | 核心原则与测试分层 | Core Principles | :19-62 |
| 二 | TDD 七步工作流 | TDD Workflow Steps | :63-171 |
| 三 | 测试模式与文件组织 | Testing Patterns + File Org | :172-307 |
| 四 | 依赖隔离与覆盖率 | Mocking + Coverage | :308-367 |
| 五 | 反模式与持续测试 | Mistakes + Continuous + Best + Metrics | :368-463 |

## 五、阅读顺序建议

### 5.1 按角色推荐

| 角色 | 推荐阅读顺序 | 理由 |
|---|---|---|
| TDD 新手 | 一 → 二 → 三 → 四 → 五 | 先哲学后流程后细节 |
| 后端开发者 | 二 → 三 → 四 → 一 | 先流程（最常用），再模式，再隔离 |
| 前端开发者 | 三（Unit/E2E）→ 二 → 五 | 先测试模式，再流程，再反模式 |
| DevOps / SRE | 五 → 四 → 二 | 先持续测试 + CI，再覆盖率，再流程 |
| 技术 leader | 一 → 二 → 五 | 先原则定调，再流程，再工程化 |

### 5.2 按问题定位

| 你遇到的问题 | 直接看哪篇 |
|---|---|
| 不知道 TDD 怎么开始 | 二（七步流程） |
| 测试该写哪种 | 三（三种模式） |
| Mock 怎么写 | 四（依赖隔离） |
| 覆盖率不达标 | 四（覆盖率门槛） |
| 测试很脆老断 | 五（反模式） |
| CI 怎么集成测试 | 五（持续测试） |
| Git 提交怎么配合 TDD | 一（Git Checkpoints）+ 二（提交规范） |
| 重构怎么放心改 | 二（Step 6 Refactor）+ 五（测试兜底） |

## 六、核心设计原则总览（跨篇）

tdd-workflow 贯穿 5 篇的核心原则：

| 核心原则 | 体现篇目 | 说明 |
|---|---|---|
| Tests BEFORE Code | 一、二 | 先写失败测试，再写实现 |
| Red-Green-Refactor | 二 | 三阶段循环，每阶段有验证门禁 |
| RED 必须被验证 | 二 | 不能只写不跑，必须编译+执行+失败 |
| 80% 覆盖率硬门槛 | 一、四 | branches/functions/lines/statements 全 80% |
| 三层测试金字塔 | 一、三 | Unit（多）→ Integration（中）→ E2E（少） |
| Git 检查点 | 一、二 | RED/GREEN/Refactor 各一个 commit，不提前 squash |
| 测行为不测实现 | 五 | 测用户可见行为，不测内部 state |
| 语义选择器 | 五 | 用 role/data-testid，不用 CSS class |
| 测试隔离 | 五 | 每个测试自备数据，不互相依赖 |
| 依赖隔离 | 四 | 外部服务全 Mock，Unit 测试不触网络 |

## 七、已发现问题汇总

本系列按"暴露冲突，不要折中"原则标记的问题：

| # | 问题 | 所在篇 | 源行号 | 严重度 |
|---|---|---|---|---|
| 1 | E2E 用 `waitForTimeout(600)` 硬等待 | 三、五 | :248 | ⚠️ 反模式 |
| 2 | E2E 用 `input[placeholder=...]` 选择器 | 三、五 | :245 | ⚠️ 与反模式章节矛盾 |
| 3 | Supabase Mock 链式调用冗长脆弱 | 四 | :312-323 | ⚠️ 维护成本高 |
| 4 | "One Assert Per Test" 与示例多 assert 矛盾 | 五 | :442 vs :212-214 | ⚠️ 规则不一致 |
| 5 | 两处测试速度指标不一致（<30s vs <50ms） | 五 | :457 vs :448 | ⚠️ 待统一 |
| 6 | Git Checkpoints 规则表述复杂（弹性大） | 一、二 | :57-61 | ⚠️ 易误解 |
| 7 | Step 4 说"stage 但 defer commit"与 Step 5 才 commit | 二 | :136, :148 | ⚠️ 流程需理清 |
| 8 | Mock 返回固定数据，无错误路径 Mock | 四 | :316-319 | ⚠️ 覆盖不全 |
| 9 | Coverage Verification 无未覆盖行的处理流程 | 四 | :345-367 | ⚠️ 缺补全指引 |

**最值得注意的矛盾（#4）**：

```
Best Practices（:442）:
   "One Assert Per Test - Focus on single behavior"

示例（:212-214）:
  it('returns markets successfully', async () => {
    ...
    expect(response.status).toBe(200)        // assert 1
    expect(data.success).toBe(true)          // assert 2
    expect(Array.isArray(data.data)).toBe(true)  // assert 3
  }
   ↓ 一个测试 3 个 assert，与"One Assert"矛盾
```

> **修复方向**：要么把"One Assert"改为"One Behavior Per Test"（一个行为可多 assert），要么把示例拆成多个测试。

## 八、与其他 skill / agent 的协作

tdd-workflow 是 ECC 测试生态的核心，多处协作：

| 协作对象 | 协作点 | 关系 |
|---|---|---|
| `security-review` | 安全测试用例 | security-review 给 4 类安全测试，tdd-workflow 给测试框架与流程 |
| `backend-patterns` | 测试后端代码 | backend-patterns 的 Repository/Service 用 tdd-workflow 测 |
| `golang-testing` / `python-testing` 等 | 语言专属测试 | tdd-workflow 给流程，语言 skill 给语法 |
| `/tdd` command | 斜杠命令 | command 调用本 skill 的工作流 |
| planner / tdd-guide agent | 代理执行 | agent 按 7 步推进 |
| examples/CLAUDE.md | 测试约定落地 | 把"80% 覆盖率"写成项目规则 |

**协作边界图**：

```
                ┌──────────────────────┐
                │ examples/CLAUDE.md   │ ← 项目级测试约定
                └──────────┬───────────┘
                           │ 落地
                           ▼
   ┌────────────────────────────────────────┐
   │      tdd-workflow（本 skill）           │
   │   7 步流程 + 3 种模式 + Mock + 反模式     │
   └──┬─────────────┬───────────────┬───────┘
      │             │               │
      ▼             ▼               ▼
  ┌────────┐   ┌──────────┐    ┌──────────────┐
  │security│   │backend-  │    │golang-testing│
  │-review │   │patterns  │    │python-testing│
  │(安全   │   │(被测对象)│    │(语言语法)    │
  │ 测试)  │   │          │    │              │
  └────────┘   └──────────┘    └──────────────┘
      │
      ▼
  ┌──────────┐
  │/tdd      │ ← 斜杠命令调用本 skill
  │command   │
  └──────────┘
```

## 九、写作风格说明（本系列的约定）

沿用前两个系列的约定，并针对 tdd-workflow 的流程驱动风格调整：

| 约定 | 说明 |
|---|---|
| 源行号引用 | 引用源文件标注行号，如 `(:63-171)` |
| 流程图优先 | 7 步流程、Red-Green-Refactor 用 ASCII 流程图 |
| 规则表格化 | 硬性规则用"规则 / 说明 / 严重度"三列表 |
| 客户端类比 | TDD 概念附 iOS + Android 类比 |
| 步骤拆解 | 每步讲清楚"做什么 / 为什么 / 验证条件" |
| 反模式详述 | 每个 FAIL 例子讲清楚"为什么危险" |
| 暴露冲突 | 规则与示例矛盾明确标注 |
| 跨 skill 协作 | 说明与 security-review / backend-patterns 的分工 |
| 规则总结表 | 每篇结尾汇总 + 严重度 |

## 十、篇目索引

| # | 文件 | 核心内容 |
|---|---|---|
| 零 | `tdd-workflow-深度分析-零-总纲.md` | 本文：skill 定位、章节地图、阅读指南 |
| 一 | `tdd-workflow-深度分析-一-核心原则与测试分层.md` | Tests Before Code、80% 覆盖率、Unit/Integration/E2E 金字塔、Git Checkpoints |
| 二 | `tdd-workflow-深度分析-二-TDD七步工作流.md` | 7 步流程、RED 验证规则（Runtime/Compile-time）、GREEN 验证、提交规范 |
| 三 | `tdd-workflow-深度分析-三-测试模式与文件组织.md` | Jest/Vitest Unit、API Integration、Playwright E2E、目录结构 |
| 四 | `tdd-workflow-深度分析-四-依赖隔离与覆盖率.md` | Supabase/Redis/OpenAI Mock、4 维覆盖率门槛 |
| 五 | `tdd-workflow-深度分析-五-反模式与持续测试.md` | 3 对反模式、Watch/PreCommit/CI、10 条最佳实践、成功指标 |

**建议入门路径**：先读本文（零）建立全局认知 → 按第五节的角色推荐进入对应篇目。

---

> **系列状态**：总纲已完成，5 篇深度分析进行中
> **源文件箴言**：Tests are not optional. They are the safety net that enables confident refactoring, rapid development, and production reliability.（:463）
