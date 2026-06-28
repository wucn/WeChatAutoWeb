# tdd-workflow 深度分析（一）：核心原则与测试分层

> 源文件：`skills/tdd-workflow/SKILL.md`（:19-62 行）
> 本篇聚焦：Core Principles（Tests Before Code + Coverage + Test Types + Git Checkpoints）
> 系列第 1 篇，共 5 篇

## 引言：TDD 的哲学基础

本篇覆盖"为什么 TDD、测什么、Git 怎么配合"——TDD 的哲学地基：

```
核心原则
   │
   ├─ ① Tests BEFORE Code     ← 先写测试再写代码
   │
   ├─ ② Coverage Requirements ← 80% 覆盖率 + 边界
   │
   ├─ ③ Test Types            ← 三层测试金字塔
   │     - Unit
   │     - Integration
   │     - E2E
   │
   └─ ④ Git Checkpoints       ← 每阶段一个 commit
```

这四个原则是后面 7 步工作流（第 2 篇）的理论基础。

## 一、Tests BEFORE Code（先写测试）

> 源文件 :21-23

### 1.1 核心规则

```
ALWAYS write tests first, then implement code to make tests pass.
```

**TDD 的核心循环**：

```
    ┌─────────────────────────────────────┐
    │ ① 写测试（描述期望行为）              │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ② 跑测试（应该失败 — RED）            │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ③ 写最小代码让测试通过（GREEN）        │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ ④ 重构（保持绿色）                    │
    └─────────────────────────────────────┘
```

### 1.2 为什么测试要在前

| 顺序 | 结果 | 原因 |
|---|---|---|
| **先测试后代码**（TDD） | 测试驱动设计，接口自然 | 测试逼迫你先想"怎么用" |
| 先代码后测试 | 测试迁就实现，覆盖差 | 已有实现会限制测试视角 |
| 不写测试 | 重构无兜底，bug 上线 | 没有安全网 |

> **💡 测试即设计反馈**
>
> 写测试时如果发现"难测"，说明设计有问题：
>
> | 难测的信号 | 设计问题 |
> |---|---|
> | 依赖一堆外部服务 | 耦合太紧，需依赖注入 |
> | 要 mock 大量东西 | 职责过多，需拆分 |
> | 测试要造复杂状态 | 状态管理混乱 |
> | 一个测试要测很多 | 函数职责过多 |
>
> TDD 用"难测度"倒逼好设计。

### 1.3 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| 先写测试 | XCTest 先写 `func testXxx()` | JUnit 先写 `@Test fun xxx()` |
| RED 失败 | `XCTAssertEqual` 失败（红叉） | `assertEquals` 失败 |
| GREEN 通过 | 实现后全绿 | 实现后全绿 |
| 重构保绿 | 改实现不改测试，仍绿 | 同 |

## 二、Coverage Requirements（覆盖率要求）

> 源文件 :24-29

### 2.1 核心规则

```
- Minimum 80% coverage (unit + integration + E2E)
- All edge cases covered
- Error scenarios tested
- Boundary conditions verified
```

**4 项要求**：

| # | 要求 | 含义 |
|---|---|---|
| 1 | 最低 80% 覆盖率 | 三类测试合计 ≥ 80% |
| 2 | 所有边界用例 | Null / undefined / empty / large |
| 3 | 错误路径 | 不只测 happy path |
| 4 | 边界条件 | 数值上下限、数组首尾 |

### 2.2 80% 的合理性

```
覆盖率:
   0%  ─────────── 无测试，重构即赌博
   50% ─────────── 覆盖一半，盲区大
   80% ─────────── 关键路径覆盖（本 skill 门槛）
   95% ─────────── 极高，边际收益递减
   100% ────────── 不现实，且 100% 不等于无 bug
```

> **💡 为什么是 80% 不是 100%**
>
> | 覆盖率 | 收益 | 成本 |
> |---|---|---|
> | 0→80% | 高（覆盖核心路径） | 低 |
> | 80→95% | 中（覆盖边缘路径） | 中 |
> | 95→100% | 低（多为异常分支/防御代码） | 极高 |
>
> 80% 是"收益/成本"的最佳平衡点。100% 覆盖率不等于无 bug——测试可能断言错误。

### 2.3 覆盖率的 4 个维度

第 4 篇会详述，这里先给概览：

| 维度 | 含义 |
|---|---|
| `branches` | 分支覆盖（if/else 两边都测） |
| `functions` | 函数覆盖（每个函数都被调） |
| `lines` | 行覆盖（每行都执行） |
| `statements` | 语句覆盖（每条语句都跑） |

源文件要求 4 维**全部** 80%+，不是平均 80%。

### 2.4 边界用例清单

```
典型边界:
   ├─ Null / undefined / nil
   ├─ 空字符串 / 空数组 / 空对象
   ├─ 0 / 负数 / 最大值
   ├─ 超长字符串（ReDoS / 溢出）
   ├─ 特殊字符（SQL/HTML/路径）
   ├─ 并发输入（同时多个请求）
   └─ 时区/夏令时边界
```

| 边界类型 | 测试目的 |
|---|---|
| 空值 | 防空指针/默认行为 |
| 极值 | 防溢出/越界 |
| 特殊字符 | 防注入/转义 |
| 并发 | 防竞争条件 |

## 三、Test Types（测试类型）

> 源文件 :30-49

### 3.1 三层测试金字塔

```
                    E2E
                   █████        ← 少（关键流程）
                  ███████       慢、贵、脆
                 ██████████
                Integration
               ██████████████   ← 中（API/DB）
              █████████████████  适中
             Unit
            ████████████████████ ← 多（函数/组件）
           ████████████████████████ 快、便宜、稳定
```

| 层级 | 数量 | 速度 | 范围 | 成本 |
|---|---|---|---|---|
| Unit | 多 | < 50ms | 单函数/组件 | 低 |
| Integration | 中 | 秒级 | API + DB | 中 |
| E2E | 少 | 分钟级 | 完整用户流 | 高 |

### 3.2 Unit Tests（单元测试）

源文件 :32-37：

```
- Individual functions and utilities
- Component logic
- Pure functions
- Helpers and utilities
```

**测什么**：

| 测 | 不测 |
|---|---|
| 纯函数（输入→输出） | 网络请求 |
| 组件逻辑（props→渲染） | 数据库 |
| 工具函数 | 文件系统 |
| Helpers | 外部 API |

> **💡 Unit 测试必须隔离外部依赖**
>
> Unit 测试要**快且稳定**，所以一切外部服务（DB/Redis/API）都要 Mock。详见第 4 篇。

### 3.3 Integration Tests（集成测试）

源文件 :38-42：

```
- API endpoints
- Database operations
- Service interactions
- External API calls
```

**测什么**：

| 测 | 说明 |
|---|---|
| API endpoints | 路由 → 响应（含中间件） |
| Database operations | 真实 DB 或测试 DB |
| Service interactions | Service 层连 Repository |
| External API calls | 真实调用或 Mock 外部 |

> **💡 Integration 与 Unit 的边界**
>
> | 维度 | Unit | Integration |
> |---|---|---|
> | 外部依赖 | 全 Mock | 真实/测试 DB |
> | 速度 | < 50ms | 秒级 |
> | 测的是 | 单个函数 | 多层协作 |
> | 失败定位 | 精确到函数 | 需排查链路 |

### 3.4 E2E Tests（端到端测试）

源文件 :44-48：

```
- Critical user flows
- Complete workflows
- Browser automation
- UI interactions
```

**测什么**：

| 测 | 说明 |
|---|---|
| Critical user flows | 登录、搜索、下单等核心流 |
| Complete workflows | 从入口到完成的完整路径 |
| Browser automation | 真实浏览器（Playwright） |
| UI interactions | 点击、输入、导航 |

> **💡 E2E 只测关键路径**
>
> E2E 慢且脆（UI 变化易断），**只测核心用户流**，不测每个细节。细节交给 Unit/Integration。
>
> | 测试类型 | 覆盖策略 |
> |---|---|
> | E2E | 5-10 个关键流（登录、搜索、支付） |
> | Integration | 每个 API 端点 |
> | Unit | 每个函数/组件 |

### 3.5 三层的职责分工

```
用户点"搜索"按钮
   │
   ├─ E2E: 验证从点击到看到结果的完整流
   │    （浏览器自动化，慢）
   │
   ├─ Integration: 验证 /api/search 返回正确数据
   │    （API + DB，中速）
   │
   └─ Unit: 验证 searchMarkets(query) 函数逻辑
        （纯函数，快）
```

**互补关系**：E2E 验证"整条链路通"，Integration 验证"接口契约对"，Unit 验证"单点逻辑对"。

## 四、Git Checkpoints（Git 检查点）

> 源文件 :50-62

### 4.1 核心规则

```
- If the repository is under Git, create a checkpoint commit
  after each TDD stage
- Do not squash or rewrite these checkpoint commits until the
  workflow is complete
- Each checkpoint commit message must describe the stage and
  the exact evidence captured
```

**3 条硬性规则**：

| # | 规则 | 含义 |
|---|---|---|
| 1 | 每阶段一个 commit | RED / GREEN / Refactor 各提交 |
| 2 | 不提前 squash | 工作流未完成前不合并/改写 |
| 3 | commit message 描述阶段+证据 | 不是 "wip"，要写清"RED validated"等 |

### 4.2 检查点提交模型

```
TDD 工作流的提交序列:

   ① test: add reproducer for <feature>     ← RED 检查点
      （失败测试已编译+执行+失败）
   │
   ② fix: <feature or bug>                  ← GREEN 检查点
   │  （最小实现，测试通过）
   │
   ③ refactor: clean up after <feature>     ← Refactor 检查点（可选）
      （重构，测试仍绿）
```

源文件 :57-60 的紧凑模型：

| commit | 阶段 | 必需 |
|---|---|---|
| 1 | failing test added + RED validated | 必需 |
| 2 | minimal fix applied + GREEN validated | 必需 |
| 3 | refactor complete + tests green | 可选 |

### 4.3 为什么不提前 squash

```
提前 squash 的危害:
   ① ──②──③ squash → 一个大 commit
   ↓
   丢失"RED 验证"的证据
   ↓
   review 时看不到"测试确实失败过"
   ↓
   无法证明测试有效（可能测试永远通过——假绿）
```

> **💡 Checkpoint 即证据**
>
> | commit | 证明什么 |
> |---|---|
> | RED commit | 测试确实失败过（不是假绿） |
> | GREEN commit | 实现确实让测试通过 |
> | Refactor commit | 重构没破坏测试 |
>
> 保留这些 commit 让**代码审查**和**事后追溯**能验证 TDD 流程真的执行了。

### 4.4 ⚠️ Checkpoint 规则的复杂性

源文件 :50-62 的规则有弹性但表述复杂：

| 规则 | 弹性 |
|---|---|
| :54 "只算当前分支当前任务的 commit" | 严格 |
| :55 "不算其他分支/无关历史" | 严格 |
| :56 "commit 必须 HEAD 可达且属于当前任务序列" | 严格 |
| :61 "若 test commit 对应 RED 且 fix commit 对应 GREEN，无需额外 evidence-only commit" | 弹性 |

> **⚠️ 易误解点**
>
> :61 说"无需额外 evidence-only commit"，但 :58-60 已经把 evidence 合并到 test/fix commit 里了。初读容易困惑"到底要不要单独提交 evidence"。
>
> **理解**：test commit 本身就是 RED 证据，fix commit 本身就是 GREEN 证据，**不需要**再单独提一个"evidence" commit。evidence 是 commit message 里描述的，不是单独的 commit。

### 4.5 commit message 的证据要求

```
差的 message:
   - "wip"
   - "fix bug"
   - "add tests"

好的 message（带证据）:
   - "test: add reproducer for semantic search fallback"
     （描述了阶段 = test，特性 = semantic search fallback）
   - "fix: implement Redis fallback for semantic search"
     （描述了阶段 = fix，做了什么 = Redis fallback）
```

| message 要素 | 例子 |
|---|---|
| 阶段前缀 | `test:` / `fix:` / `refactor:` |
| 特性描述 | `semantic search fallback` |
| 证据（可选） | `RED validated` / `GREEN validated` |

### 4.6 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| Git checkpoint | 每阶段一个 commit | 同 |
| 不提前 squash | 不用 `git squash` 合并 TDD commits | 同 |
| RED commit | "test: add failing test for X" | 同 |
| commit 带证据 | message 写"RED validated" | 同 |
| 只算当前分支 | 不算 feature 分支的旧 commit | 同 |

## 五、四个原则的协作

### 5.1 原则间的依赖关系

```
① Tests BEFORE Code
   ↓ 决定了
② Coverage Requirements（测多少）
   ↓ 决定了
③ Test Types（用什么测）
   ↓ 配合
④ Git Checkpoints（怎么提交）
```

| 原则 | 回答的问题 |
|---|---|
| ① Tests Before | 什么时候写测试？ |
| ② Coverage | 要测多少？ |
| ③ Test Types | 用哪种测试？ |
| ④ Git Checkpoints | 怎么提交？ |

### 5.2 与 7 步工作流的对应

这 4 个原则在第 2 篇的 7 步中落地：

| 原则 | 落地步骤 |
|---|---|
| ① Tests Before | Step 1-3（写旅程→写用例→跑失败） |
| ② Coverage | Step 7（验证覆盖率） |
| ③ Test Types | Step 2（生成不同层级的用例） |
| ④ Git Checkpoints | Step 3/5/6 各一个 commit |

## 六、与 backend-patterns / security-review 的协作

### 6.1 测什么代码

| 被测对象 | 来自哪个 skill | 用什么测 |
|---|---|---|
| Repository/Service | backend-patterns | Unit + Integration |
| API 路由 | backend-patterns | Integration |
| 鉴权（JWT/RBAC） | backend-patterns 第 4 篇 | Unit（验签）+ Integration（端点） |
| 安全用例 | security-review 第 4 篇 | 4 类安全测试 |
| 错误处理 | backend-patterns 第 3 篇 | Unit（ApiError）+ Integration（errorHandler） |

### 6.2 与 security-review 安全测试的对接

security-review 第 4 篇给出 4 类安全测试：

```typescript
test('requires authentication', ...)   // 401
test('requires admin role', ...)       // 403
test('rejects invalid input', ...)     // 400
test('enforces rate limits', ...)      // 429
```

这些测试**用 tdd-workflow 的框架与流程**跑：
- 用 Jest/Vitest（第 3 篇 Unit 模式）
- 纳入 CI（第 5 篇持续测试）
- 走 Red-Green-Refactor（第 2 篇）

### 6.3 职责分工

| 关注点 | tdd-workflow | security-review |
|---|---|---|
| 测试流程 | ✅ 7 步 + Git 检查点 | ❌ 不涉及 |
| 测试框架 | ✅ Jest/Playwright 用法 | ❌ 不涉及 |
| 安全测试用例 | ❌ 不给具体用例 | ✅ 4 类用例 |
| 覆盖率门槛 | ✅ 80% | ❌ 不涉及 |
| 测试反模式 | ✅ 3 对 FAIL/PASS | ❌ 不涉及 |

## 七、设计哲学

### 7.1 TDD 的核心哲学

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 先测试 | 测试驱动设计 | 测试迁就实现 |
| 80% 门槛 | 收益成本平衡 | 0% 赌博 / 100% 浪费 |
| 三层金字塔 | 各层互补 | 全 E2E 太慢 / 全 Unit 漏集成 |
| Git 检查点 | 保留证据 | 假绿无法发现 |
| 不提前 squash | 保留 RED 证据 | review 看不到流程 |

### 7.2 测试即设计工具

TDD 不只是"写测试"，而是**用测试倒逼设计**：

```
难测 → 设计差 → 重构设计 → 好测 → 好设计
```

| 难测信号 | 设计改进 |
|---|---|
| 依赖多 | 依赖注入 |
| Mock 多 | 职责拆分 |
| 状态复杂 | 状态简化 |
| 多 assert | 单一职责 |

### 7.3 证据驱动（Evidence-Driven）

Git Checkpoints 体现"证据驱动"哲学：

```
不是"我觉得测试有效"
而是"RED commit 证明测试失败过"
   "GREEN commit 证明实现让它通过"
   "Refactor commit 证明重构没破坏"
```

## 八、反模式汇总

### 8.1 顺序反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 先写代码再补测试 | 测试迁就实现 | Tests BEFORE Code |
| 不写测试 | 无安全网 | 至少 80% 覆盖 |
| 只测 happy path | 边界/错误漏掉 | 边界 + 错误路径都测 |

### 8.2 覆盖率反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 追求 100% | 边际收益低 | 80% 门槛 |
| 只看 lines 覆盖 | 漏分支 | 4 维全 80% |
| 覆盖率 = 质量 | 可能断言错 | 覆盖率 + 断言质量 |

### 8.3 测试类型反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 全 E2E | 太慢太脆 | 金字塔分布 |
| 全 Unit | 漏集成问题 | 三层互补 |
| E2E 测细节 | 脆弱 | E2E 只测关键流 |

### 8.4 Git 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 提前 squash | 丢证据 | 工作流完成才 squash |
| message 写 "wip" | 无证据 | 写阶段 + 特性 |
| 多个阶段一个 commit | 证据混 | 每阶段一个 commit |
| 算其他分支的 commit | 证据错位 | 只算当前分支当前任务 |

## 九、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 顺序 | Tests BEFORE Code | **CRITICAL** |
| 覆盖率 | 最低 80%（unit + integration + E2E 合计） | HIGH |
| 覆盖率 | 4 维（branches/functions/lines/statements）全 80% | HIGH |
| 覆盖率 | 所有边界用例覆盖 | HIGH |
| 覆盖率 | 错误路径必测 | HIGH |
| 类型 | Unit 测纯函数/组件逻辑 | 标准 |
| 类型 | Integration 测 API/DB/Service | 标准 |
| 类型 | E2E 只测关键用户流 | HIGH |
| 类型 | 三层金字塔分布（Unit 多 E2E 少） | HIGH |
| 类型 | Unit 必须隔离外部依赖 | HIGH |
| Git | 每阶段一个 checkpoint commit | **CRITICAL** |
| Git | 不提前 squash | HIGH |
| Git | message 描述阶段 + 证据 | HIGH |
| Git | 只算当前分支当前任务的 commit | HIGH |
| Git | commit 必须 HEAD 可达 | HIGH |
| Git | RED/GREEN 各一个 commit，Refactor 可选 | 标准 |
| Git | evidence 合并到 test/fix commit，无需单独 | 标准 |

---

## 下一篇

- [tdd-workflow 深度分析（二）：TDD 七步工作流](./tdd-workflow-深度分析-二-TDD七步工作流.md) — User Journeys → Generate Cases → RED → Implement → GREEN → Refactor → Coverage，含 RED 验证规则
