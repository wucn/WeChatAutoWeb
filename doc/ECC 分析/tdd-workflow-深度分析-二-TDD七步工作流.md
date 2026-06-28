# tdd-workflow 深度分析（二）：TDD 七步工作流

> 源文件：`skills/tdd-workflow/SKILL.md`（:63-171 行）
> 本篇聚焦：7 步工作流（Step 1-7）+ RED 验证规则 + 提交规范
> 系列第 2 篇，共 5 篇

## 引言：从原则到执行

本篇把第 1 篇的 4 个原则落地为**可执行的 7 步流程**——这是整个 skill 的核心：

```
Step 1: Write User Journeys    ── 写用户旅程
Step 2: Generate Test Cases    ── 生成测试用例
Step 3: Run Tests (RED)        ── 跑测试（应失败）
Step 4: Implement Code         ── 写最小实现
Step 5: Run Tests Again (GREEN)── 跑测试（应通过）
Step 6: Refactor               ── 重构
Step 7: Verify Coverage        ── 验证覆盖率
```

每一步都有**验证门禁**——不通过就不能进下一步。

## 一、整体流程图

```
    ┌─────────────────────────────────────┐
    │ Step 1: 写用户旅程                    │
    │   As a [role], I want [action]...    │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ Step 2: 生成测试用例                  │
    │   describe/it + 边界 + 错误路径       │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ Step 3: 跑测试（RED）   ← 门禁        │
    │   必须失败，且失败原因正确             │
    │   [Git] test: commit（RED 检查点）   │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ Step 4: 写最小实现                    │
    │   只让测试通过，不多写                 │
    │   [Git] stage 但不 commit            │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ Step 5: 跑测试（GREEN） ← 门禁        │
    │   之前失败的测试现在通过               │
    │   [Git] fix: commit（GREEN 检查点）  │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ Step 6: 重构（可选）                  │
    │   改代码质量，保持绿色                 │
    │   [Git] refactor: commit             │
    └──────────────────┬──────────────────┘
                       ▼
    ┌─────────────────────────────────────┐
    │ Step 7: 验证覆盖率    ← 门禁          │
    │   npm run test:coverage ≥ 80%        │
    └─────────────────────────────────────┘
```

## 二、Step 1: Write User Journeys（写用户旅程）

> 源文件 :65-72

### 2.1 模板

```
As a [role], I want to [action], so that [benefit]
```

**3 个要素**：

| 要素 | 含义 | 例子 |
|---|---|---|
| `[role]` | 谁用 | user / admin / creator |
| `[action]` | 做什么 | search markets semantically |
| `[benefit]` | 为什么 | find relevant markets without exact keywords |

**示例**：

```
As a user, I want to search for markets semantically,
so that I can find relevant markets even without exact keywords.
```

### 2.2 为什么从用户旅程开始

```
直接写测试:
   it('returns markets', ...)   ← 测什么？为什么？

从旅程开始:
   "用户想语义搜索市场"
   ↓ 倒推
   需要 searchMarkets(query) 返回相关市场
   ↓ 倒推
   测试: it('returns relevant markets for query')
```

> **💡 旅程即需求**
>
> | 起点 | 风险 |
> |---|---|
> | 直接写测试 | 测的是"实现想测的"，可能漏用户真正要的 |
> | 从旅程开始 | 测的是"用户要的"，保证不偏离价值 |

### 2.3 旅程的粒度

```
好的旅程（业务价值清晰）:
   "As a user, I want to search markets semantically"

差的旅程（实现细节）:
   "As a user, I want Redis vector search to return 5 results"
   ↑ 暴露实现，违背"测行为不测实现"
```

| 好旅程 | 差旅程 |
|---|---|
| 描述用户价值 | 描述实现方式 |
| 业务语言 | 技术术语 |
| 稳定（需求不变就不变） | 脆弱（实现变就要改） |

## 三、Step 2: Generate Test Cases（生成测试用例）

> 源文件 :74-96

### 3.1 从旅程到用例

```typescript
// (:78-94)
describe('Semantic Search', () => {
  it('returns relevant markets for query', async () => {
    // 正常路径
  })

  it('handles empty query gracefully', async () => {
    // 边界：空输入
  })

  it('falls back to substring search when Redis unavailable', async () => {
    // 错误路径 + 降级
  })

  it('sorts results by similarity score', async () => {
    // 业务规则：排序
  })
})
```

**4 类用例**：

| 用例 | 类型 | 目的 |
|---|---|---|
| `returns relevant markets` | Happy path | 正常功能 |
| `handles empty query` | 边界 | 空输入 |
| `falls back when Redis unavailable` | 错误路径 + 降级 | 容错 |
| `sorts by similarity score` | 业务规则 | 排序逻辑 |

### 3.2 用例生成的覆盖矩阵

```
              输入维度
              ┌──────────┬──────────┬──────────┐
              │ 正常     │ 边界     │ 异常     │
   ───────────┼──────────┼──────────┼──────────┤
   功能       │ ✓ happy  │ ✓ empty  │ ✓ invalid│
   排序       │ ✓ sorted │ ✓ single │ -        │
   降级       │ -        │ -        │ ✓ Redis↓ │
   性能       │ -        │ ✓ large  │ -        │
```

每个旅程至少覆盖：**1 个 happy + N 个边界 + M 个错误路径**。

### 3.3 describe/it 的组织

```typescript
describe('Semantic Search', () => {        // 旅程名
  it('returns relevant markets', ...)       // 具体行为
  it('handles empty query', ...)            // 每个用例独立
})
```

| 层级 | 作用 |
|---|---|
| `describe` | 分组（一个旅程/一个组件） |
| `it` / `test` | 单个用例（一个行为） |
| `expect` | 断言（一个或多个） |

> **⚠️ 与"One Assert Per Test"的矛盾**
>
> 第 5 篇会详述：Best Practices 说"One Assert Per Test"（:442），但本步示例一个 `it` 内可能有多个 `expect`（:212-214 的 API 测试有 3 个 expect）。
>
> **理解**："One Assert"应理解为"One Behavior Per Test"——一个测试聚焦一个行为，但验证该行为可能需要多个 assert。

## 四、Step 3: Run Tests — They Should Fail（RED 门禁）

> 源文件 :97-125

### 4.1 基本操作

```bash
# (:98-101)
npm test
# Tests should fail - we haven't implemented yet
```

### 4.2 RED 的硬性要求

源文件 :103：

```
This step is mandatory and is the RED gate for all production changes.
```

**RED 是门禁**——不确认 RED，就不许改生产代码（:118）。

### 4.3 ⭐ RED 验证的两条路径（核心规则）

源文件 :105-116 给出 RED 的两种合法形态：

```
RED 验证
   │
   ├─ Runtime RED（运行时 RED）
   │    ① 相关测试目标编译成功
   │    ② 新/改的测试确实被执行
   │    ③ 结果是 RED（失败）
   │
   └─ Compile-time RED（编译时 RED）
        ① 新测试新引用了 buggy 代码路径
        ② 编译失败本身就是 intended RED 信号
```

**两条路径的对照**：

| 维度 | Runtime RED | Compile-time RED |
|---|---|---|
| 编译 | 通过 | **失败** |
| 测试执行 | 执行了 | 未执行（编译就挂） |
| RED 信号 | 测试断言失败 | 编译错误 |
| 适用 | 动态语言/运行时错误 | 静态类型/未实现的接口 |

### 4.4 Runtime RED 的 3 个条件

```
① 编译成功
   ↓ 测试能跑起来
② 测试被执行
   ↓ 不是被 skip / 被 filter 掉
③ 结果 RED
   ↓ 断言失败
```

**任一不满足都不是合法 RED**：

| 失败情况 | 原因 | 不算 RED |
|---|---|---|
| 编译失败 | 语法错 | ❌（除非走 Compile-time RED） |
| 测试被 skip | `it.skip` | ❌ |
| 测试通过 | 实现已存在 / 测试有 bug | ❌（假绿） |

### 4.5 Compile-time RED 的条件

```
① 新测试新引用了 buggy/未实现代码
   ↓ 比如 import 了还不存在的函数
② 编译失败是 intended（预期的）
   ↓ 不是无关语法错
```

> **💡 Compile-time RED 的意义**
>
> 强类型语言（TS/Java/Rust）里，"引用未实现的接口"直接编译失败。这本身就是一个合法的 RED 信号——**测试逼出了"接口必须存在"**。
>
> | 语言 | Compile-time RED 适用 |
> |---|---|
> | TypeScript | ✅（引用未导出函数编译失败） |
> | Java | ✅（引用未实现接口编译失败） |
> | Rust | ✅（引用未定义函数编译失败） |
> | Python | ❌（运行时才报错，只能 Runtime RED） |

### 4.6 RED 的失败原因必须正确

源文件 :113-116：

```
- In either case, the failure is caused by the intended business-logic
  bug, undefined behavior, or missing implementation
- The failure is not caused only by unrelated syntax errors, broken
  test setup, missing dependencies, or unrelated regressions
- A test that was only written but not compiled and executed does
  not count as RED.
```

**3 类"假 RED"**：

| 假 RED | 说明 | 不算 |
|---|---|---|
| 无关语法错 | 测试本身语法错 | ❌ |
| 测试 setup 坏 | beforeAll 抛错 | ❌ |
| 缺依赖 | import 不存在的库 | ❌ |

**真 RED**：失败原因必须是"业务逻辑 bug / 未定义行为 / 实现缺失"。

```
真 RED:
   测试: expect(searchMarkets('election')).toBe([' election market '])
   失败原因: searchMarkets is not defined
   ↑ 业务实现缺失 ✓

假 RED:
   测试: expect(searchMarkets('election')).toBe(...)
   失败原因: SyntaxError: Unexpected token
   ↑ 测试语法错 ✗（不是实现缺失）
```

### 4.7 ⚠️ "写了但没跑"不算 RED

源文件 :116：

```
A test that was only written but not compiled and executed
does not count as RED.
```

> **💡 这条规则防什么**
>
> | 行为 | 问题 |
> |---|---|
> | 写了测试就声称 RED | 没编译可能藏语法错 |
> | 没跑就说失败 | 可能实际是通过（假绿） |
>
> **规则**：必须**编译 + 执行 + 失败**三连，才是 RED。

### 4.8 RED 阶段的 Git 检查点

源文件 :120-124：

```
If the repository is under Git, create a checkpoint commit
immediately after this stage is validated.

Recommended commit message format:
- test: add reproducer for <feature or bug>
```

**提交时机**：RED **验证后**才提交，不是写完测试就提交。

```
写测试 → 跑测试确认 RED → 验证失败原因正确 → commit
                                              ↑
                                              这里才提交
```

| 时机 | 是否提交 | 原因 |
|---|---|---|
| 写完测试 | ❌ | 还没验证 RED |
| 跑了但没确认原因 | ❌ | 可能是假 RED |
| **确认 RED + 原因正确** | ✅ | 证据充分 |

## 五、Step 4: Implement Code（写最小实现）

> 源文件 :126-137

### 5.1 核心原则：最小实现

```typescript
// (:129-134)
// Implementation guided by tests
export async function searchMarkets(query: string) {
  // Implementation here
}
```

**最小实现**：只写让测试通过的最少代码，不多写。

```
错误做法（过度实现）:
   实现 searchMarkets + 顺便实现 searchUsers + 加缓存 + 加日志
   ↑ 测试没要求这些，是"提前优化"

正确做法（最小实现）:
   只实现让 it('returns relevant markets') 通过的逻辑
   ↑ 测试驱动，不多不少
```

> **💡 为什么最小实现**
>
> | 做法 | 后果 |
> |---|---|
> | 最小实现 | 每行代码都有测试覆盖 |
> | 过度实现 | 无测试的代码 = 无安全网 |
>
> "每写一行没测试的代码，就是在制造未来的 bug。"

### 5.2 Git：stage 但不 commit

源文件 :136：

```
If the repository is under Git, stage the minimal fix now but
defer the checkpoint commit until GREEN is validated in Step 5.
```

**Step 4 的 Git 操作**：

| 操作 | Step 4 | Step 5 |
|---|---|---|
| `git add` | ✅ stage | （已 stage） |
| `git commit` | ❌ 不提交 | ✅ GREEN 后提交 |

> **⚠️ 为什么 stage 但不 commit**
>
> | 直接 commit 的风险 | 说明 |
> |---|---|
> | 实现可能没让测试通过 | 假 GREEN commit |
> | 要回退 | 已 commit 要 reset |
>
> **规则**：实现先 stage，跑测试确认 GREEN 后才 commit。GREEN commit 才是合法证据。

### 5.3 Step 3 → Step 4 的门禁

```
Step 3 RED 验证通过
   ↓ 门禁
Step 4 才能改生产代码
   ↓
   原则: "Do not edit production code until RED is confirmed."
```

源文件 :118 明确：**RED 确认前不许动生产代码**。

## 六、Step 5: Run Tests Again — GREEN 门禁

> 源文件 :138-153

### 6.1 基本操作

```bash
# (:139-142)
npm test
# Tests should now pass
```

### 6.2 GREEN 的验证要求

源文件 :144：

```
Rerun the same relevant test target after the fix and confirm
the previously failing test is now GREEN.
```

**3 个要点**：

| 要点 | 说明 |
|---|---|
| 重跑**同一个**测试目标 | 不是跑别的测试 |
| 确认**之前失败的**现在通过 | 不是新测试通过 |
| 才能 refactor | GREEN 是 refactor 的前提 |

### 6.3 GREEN 阶段的 Git 检查点

源文件 :148-152：

```
If the repository is under Git, create a checkpoint commit
immediately after GREEN is validated.

Recommended commit message format:
- fix: <feature or bug>
```

**提交时机**：GREEN **验证后**才提交。

```
Step 4 写实现 → Step 5 跑测试确认 GREEN → commit
                                          ↑
                                          fix: commit
```

### 6.4 RED → GREEN 的完整提交链

```
① test: add reproducer for semantic search   ← RED commit
   （测试已编译+执行+失败）
   │
   │  [Step 4 写实现，stage]
   │
   ② fix: implement semantic search           ← GREEN commit
   （实现让测试通过）
```

**两个 commit 的证据链**：

| commit | 证明 |
|---|---|
| ① `test:` | 测试确实失败过（RED） |
| ② `fix:` | 实现确实修复了（GREEN） |

## 七、Step 6: Refactor（重构）

> 源文件 :154-165

### 7.1 核心原则：保持绿色

```
Improve code quality while keeping tests green
```

**重构的 4 个方向**：

| 方向 | 说明 |
|---|---|
| Remove duplication | 消除重复（DRY） |
| Improve naming | 改善命名 |
| Optimize performance | 性能优化 |
| Enhance readability | 可读性 |

### 7.2 重构的安全保障

```
重构前: 测试全绿
   ↓ 改代码
重构中: 随时跑测试
   ↓ 测试还绿
重构后: 测试仍绿
   ↓ 安全
```

> **💡 测试是重构的安全网**
>
> | 没测试重构 | 有测试重构 |
> |---|---|
> | 赌博（改坏了不知道） | 测试兜底（改坏了立即红） |
> | 害怕改动 | 放心改 |
>
> 这正是源文件结尾说的："Tests are the safety net that enables confident refactoring"。

### 7.3 重构的 Git 检查点

源文件 :161-164：

```
If the repository is under Git, create a checkpoint commit
immediately after refactoring is complete and tests remain green.

Recommended commit message format:
- refactor: clean up after <feature or bug> implementation
```

**提交时机**：重构完成 + 测试仍绿。

```
Step 5 GREEN → Step 6 重构 → 跑测试仍绿 → refactor: commit
                                              ↑
                                              重构检查点（可选）
```

### 7.4 Refactor 是可选的

源文件 :57-60 说 refactor commit 是 optional。如果实现已经够好，可以跳过 Step 6。

```
RED commit → GREEN commit → (可选 refactor commit) → Step 7
```

## 八、Step 7: Verify Coverage（验证覆盖率）

> 源文件 :166-171

### 8.1 基本操作

```bash
# (:167-170)
npm run test:coverage
# Verify 80%+ coverage achieved
```

### 8.2 覆盖率是最后门禁

```
RED ✓ → GREEN ✓ → Refactor ✓ → Coverage ✓
                                   ↑
                                   最后门禁
```

**覆盖率不达标的处理**（源文件未详述，但合理推断）：

```
覆盖率 < 80%
   ↓
补充测试（回到 Step 2 思路）
   ↓
重跑覆盖率
   ↓
达标 → 完成
```

> **⚠️ 源文件未给未覆盖行的处理流程**
>
> Step 7 只说"验证 80%"，没说"低于 80% 怎么办"。第 4 篇会补充：应查看 coverage report 找未覆盖行，针对性补测试。

## 九、7 步的门禁体系

### 9.1 三个硬门禁

| 门禁 | 在哪步 | 不通过则 |
|---|---|---|
| **RED 门禁** | Step 3 | 不许改生产代码 |
| **GREEN 门禁** | Step 5 | 不许 refactor |
| **Coverage 门禁** | Step 7 | 不算完成 |

### 9.2 门禁的依赖链

```
RED 门禁（Step 3）
   ↓ 通过
才能写实现（Step 4）
   ↓
GREEN 门禁（Step 5）
   ↓ 通过
才能重构（Step 6）
   ↓
Coverage 门禁（Step 7）
   ↓ 通过
才算完成
```

**任何门禁不通过，不能前进**。

### 9.3 Git 提交的门禁对应

| 门禁 | Git commit | message |
|---|---|---|
| RED 门禁 | Step 3 后 | `test: add reproducer for X` |
| GREEN 门禁 | Step 5 后 | `fix: X` |
| Refactor（可选） | Step 6 后 | `refactor: clean up after X` |

**commit 即门禁证据**：每个门禁通过都有一个对应 commit。

## 十、与 examples/CLAUDE.md 的呼应

通用模板（examples/CLAUDE.md）的测试约定：

```typescript
// examples/CLAUDE.md 的测试部分
- TDD: write tests first
- 80% coverage minimum
- Unit + Integration + E2E
```

本 skill 把这三条落地为 7 步流程：
- "write tests first" → Step 1-3
- "80% coverage" → Step 7
- "Unit + Integration + E2E" → Step 2 生成不同层级用例

## 十一、设计哲学

### 11.1 门禁驱动（Gate-Driven）

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| RED 是门禁 | 防假绿 | 永远通过的测试无价值 |
| GREEN 是门禁 | 确认实现有效 | 重构基于未验证的实现 |
| Coverage 是门禁 | 兜底覆盖 | 自以为测够了实际没 |
| 门禁有 commit 证据 | 可追溯 | 无法验证流程真的执行 |

### 11.2 最小增量（Minimal Increment）

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 最小实现 | 每行有测试 | 过度实现无覆盖 |
| 一次只做一步 | 聚焦 | 多步混做易错 |
| 每步有 commit | 增量可追溯 | 大 commit 难 review |

### 11.3 证据可验证（Verifiable Evidence）

```
不是"我做了 TDD"
而是:
   - RED commit 证明测试失败过
   - GREEN commit 证明实现修复了
   - Coverage report 证明覆盖率达标
```

## 十二、反模式汇总

### 12.1 旅程反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 跳过 Step 1 直接写测试 | 偏离用户价值 | 先写旅程 |
| 旅程写实现细节 | 脆弱 | 写业务价值 |

### 12.2 RED 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 写了测试就说 RED | 可能假绿 | 编译+执行+失败三连 |
| 失败原因无关 | 假 RED | 失败必须是业务缺失 |
| RED 前 commit | 证据不充分 | 验证后才 commit |
| RED 前改生产代码 | 破坏门禁 | RED 确认后才改 |

### 12.3 实现反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 过度实现 | 无覆盖代码 | 最小实现 |
| GREEN 前 commit | 假 GREEN | GREEN 验证后 commit |
| 一次实现很多 | 难定位 | 一次让测试通过 |

### 12.4 重构反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 无测试重构 | 赌博 | 测试兜底 |
| 重构改测试 | 失去安全网 | 重构不改测试 |
| 重构不跑测试 | 可能破坏 | 随时跑测试 |

## 十三、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| Step 1 | 从用户旅程开始（As a role...） | 标准 |
| Step 1 | 旅程写业务价值非实现 | HIGH |
| Step 2 | 每旅程覆盖 happy + 边界 + 错误路径 | HIGH |
| Step 3 | RED 是门禁，不通过不许改生产代码 | **CRITICAL** |
| Step 3 | RED 须编译+执行+失败三连 | **CRITICAL** |
| Step 3 | Runtime RED 或 Compile-time RED 均可 | 标准 |
| Step 3 | 失败原因必须是业务缺失（非语法错） | HIGH |
| Step 3 | 写了但没跑不算 RED | **CRITICAL** |
| Step 3 | RED 验证后才 commit（`test:`） | HIGH |
| Step 4 | 最小实现，不过度 | HIGH |
| Step 4 | stage 但不 commit | HIGH |
| Step 5 | GREEN 是门禁，不通过不许 refactor | **CRITICAL** |
| Step 5 | 重跑同一测试目标确认 GREEN | HIGH |
| Step 5 | GREEN 验证后才 commit（`fix:`） | HIGH |
| Step 6 | 重构保持测试绿色 | HIGH |
| Step 6 | 重构不改测试 | HIGH |
| Step 6 | refactor commit 可选 | 标准 |
| Step 7 | 覆盖率 80% 是最后门禁 | HIGH |
| Git | 每门禁一个 commit | **CRITICAL** |
| Git | 不提前 squash | HIGH |
| Git | commit message 带阶段前缀 + 证据 | HIGH |

---

## 下一篇

- [tdd-workflow 深度分析（三）：测试模式与文件组织](./tdd-workflow-深度分析-三-测试模式与文件组织.md) — Jest/Vitest Unit、API Integration、Playwright E2E、目录结构
