# tdd-workflow 深度分析（五）：反模式与持续测试

> 源文件：`skills/tdd-workflow/SKILL.md`（:368-463 行）
> 本篇聚焦：Common Testing Mistakes + Continuous Testing + Best Practices + Success Metrics
> 系列第 5 篇（完结篇），共 5 篇

## 引言：避开陷阱 + 工程化

本篇覆盖"测试的反模式 + 持续集成 + 最佳实践 + 成功指标"：

```
反模式与持续测试
   │
   ├─ Common Testing Mistakes     ← 3 对 FAIL/PASS
   │     - 测实现 vs 测行为
   │     - 脆弱选择器 vs 语义选择器
   │     - 测试依赖 vs 测试隔离
   │
   ├─ Continuous Testing          ← 持续测试
   │     - Watch Mode
   │     - Pre-Commit Hook
   │     - CI/CD Integration
   │
   ├─ Best Practices              ← 10 条最佳实践
   │
   └─ Success Metrics             ← 成功指标
```

## 一、Common Testing Mistakes（常见反模式）

> 源文件 :368-415 | 3 对 FAIL/PASS

### 1.1 反模式 1：测实现 vs 测行为

**FAIL**：

```typescript
// (:372-374)
// Don't test internal state
expect(component.state.count).toBe(5)
```

**PASS**：

```typescript
// (:378-380)
// Test what users see
expect(screen.getByText('Count: 5')).toBeInTheDocument()
```

**为什么测实现是反模式**：

```
测实现（state.count）:
   组件内部状态名变了（count → counter）
   ↓ 测试就断
   即使 UI 行为没变

测行为（用户看到"Count: 5"）:
   UI 显示"Count: 5"
   ↓ 无论内部怎么改，显示对就过
   稳定
```

| 测什么 | 脆弱度 | 重构影响 |
|---|---|---|
| 内部 state | 高 | 重命名就断 |
| 用户可见行为 | 低 | 重构不影响 |

> **💡 测行为不测实现**
>
> | 实现 | 行为 |
> |---|---|
> | `state.count` | `getByText('Count: 5')` |
> | 内部函数名 | 输入→输出 |
> | 私有方法 | 公开 API 响应 |
> | 数据结构 | 用户看到的数据 |

### 1.2 反模式 2：脆弱选择器 vs 语义选择器

**FAIL**：

```typescript
// (:385)
// Breaks easily
await page.click('.css-class-xyz')
```

**PASS**：

```typescript
// (:391-392)
// Resilient to changes
await page.click('button:has-text("Submit")')
await page.click('[data-testid="submit-button"]')
```

**为什么 CSS class 脆弱**：

```
CSS class 选择器:
   设计师改样式 → class 名变 → 测试断
   ↓ 但功能没变

语义选择器:
   button:has-text("Submit") → 只要按钮还叫 Submit 就过
   data-testid="submit" → 只要 testid 不变就过
   ↓ 与样式无关
```

| 选择器 | 脆弱原因 | 稳定选择器 |
|---|---|---|
| `.css-class-xyz` | 样式变就断 | `data-testid` |
| `#root > div > span` | 结构变就断 | `getByRole` |
| `input[placeholder=...]` | 文案变就断 | `data-testid` |

> **⚠️ 与第 3 篇 E2E 示例的矛盾**
>
> 源文件 E2E 示例（第 3 篇 :245）用了 `input[placeholder="Search markets"]`，与本反模式的"用 data-testid"建议不完全一致。placeholder 属于中等脆弱度，应优先用 `data-testid`。

### 1.3 反模式 3：无测试隔离 vs 独立测试

**FAIL**：

```typescript
// (:398-399)
// Tests depend on each other
test('creates user', () => { /* ... */ })
test('updates same user', () => { /* depends on previous test */ })
```

**PASS**：

```typescript
// (:405-413)
// Each test sets up its own data
test('creates user', () => {
  const user = createTestUser()
  // Test logic
})

test('updates user', () => {
  const user = createTestUser()   // 各自造数据
  // Update logic
})
```

**为什么测试不能互相依赖**：

```
依赖的测试:
   ① creates user → 创建 user id=1
   ② updates same user → 依赖 id=1 存在
   ↓
   ① 失败 → ② 也失败（连锁）
   ② 单独跑 → 失败（没数据）
   并行跑 → 顺序不确定 → 时过时不过

独立的测试:
   ① creates user → 自造数据
   ② updates user → 自造数据
   ↓
   ① 失败不影响 ②
   任意顺序跑都过
   可并行
```

| 依赖 | 独立 |
|---|---|
| 连锁失败 | 各自独立 |
| 顺序敏感 | 任意顺序 |
| 不能并行 | 可并行 |
| 难定位 | 失败隔离 |

### 1.4 三对反模式的核心原则

| 反模式 | 核心原则 |
|---|---|
| 测实现 → 测行为 | 测用户视角 |
| 脆弱选择器 → 语义 | 测稳定契约 |
| 无隔离 → 独立 | 测试自包含 |

## 二、Continuous Testing（持续测试）

> 源文件 :416-438

### 2.1 Watch Mode（开发时）

```bash
# (:419-421)
npm test -- --watch
# Tests run automatically on file changes
```

**Watch 的工作流**：

```
改代码
   ↓ 文件变化
   ↓ Watch 检测
   ↓ 自动跑相关测试
   ↓ 即时反馈
```

| 模式 | 触发 | 反馈速度 |
|---|---|---|
| 手动跑 | 每次敲命令 | 慢 |
| `--watch` | 文件保存 | 快 |
| `--watchAll` | 所有文件变 | 中 |

> **💡 Watch 让 TDD 流畅**
>
> TDD 的 Red-Green-Refactor 循环需要频繁跑测试。Watch 让"保存即跑"，不用每次敲命令，循环更顺畅。

### 2.2 Pre-Commit Hook（提交时）

```bash
# (:425-428)
# Runs before every commit
npm test && npm run lint
```

**Pre-Commit 的作用**：

```
git commit
   ↓ 触发 pre-commit hook
   ↓ 跑 npm test && npm run lint
   ├─ 通过 → commit 成功
   └─ 失败 → commit 被阻止
```

| 关卡 | 阻止什么 |
|---|---|
| `npm test` | 测试失败的代码入库 |
| `npm run lint` | lint 错误的代码入库 |

> **💡 Pre-Commit 是本地门禁**
>
> | 关卡 | 位置 | 速度 |
> |---|---|---|
> | Pre-Commit Hook | 本地 | 快（阻止坏 commit） |
> | CI | 远端 | 慢（commit 已入库） |
>
> Pre-Commit 在 commit 前拦截，避免坏代码进仓库。但要注意：hook 要快（< 30s），否则影响开发体验。

### 2.3 CI/CD Integration（集成时）

```yaml
# (:431-437)
# GitHub Actions
- name: Run Tests
  run: npm test -- --coverage
- name: Upload Coverage
  uses: codecov/codecov-action@v3
```

**CI 的两步**：

```
Push / PR
   ↓
   ① Run Tests（跑测试 + 覆盖率）
   ├─ 失败 → 阻止合并
   └─ 通过 ↓
   ② Upload Coverage（上传报告）
   ↓
   Codecov 可视化
```

| 步骤 | 作用 |
|---|---|
| `npm test -- --coverage` | 跑测试 + 收集覆盖率 |
| `codecov-action` | 上传覆盖率到 Codecov |

### 2.4 三层持续测试的对照

| 层级 | 时机 | 速度 | 目的 |
|---|---|---|---|
| Watch | 文件保存 | 秒级 | 开发反馈 |
| Pre-Commit | git commit | < 30s | 阻止坏 commit |
| CI | push/PR | 分钟级 | 阻止坏合并 |

```
开发 ──Watch──→ 提交 ──PreCommit──→ push ──CI──→ 合并
  ↑                ↑                  ↑
  秒级             <30s               分钟级
  反馈             阻 commit          阻 merge
```

### 2.5 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| Watch Mode | Xcode 的 "Test on build" | Gradle 的 continuous build |
| Pre-Commit Hook | Xcode 的 Build Phase 脚本 | Gradle 的 pre-commit task |
| CI/CD | Xcode Cloud | GitHub Actions / Bitrise |
| Coverage Upload | Xcode Code Coverage → SonarQube | JaCoCo → Codecov |

## 三、Best Practices（10 条最佳实践）

> 源文件 :439-451

### 3.1 10 条实践

| # | 实践 | 说明 |
|---|---|---|
| 1 | Write Tests First | 始终 TDD |
| 2 | One Assert Per Test | 聚焦单一行为 |
| 3 | Descriptive Test Names | 解释测什么 |
| 4 | Arrange-Act-Assert | 清晰结构 |
| 5 | Mock External Dependencies | 隔离 Unit 测试 |
| 6 | Test Edge Cases | Null/empty/large |
| 7 | Test Error Paths | 不只 happy path |
| 8 | Keep Tests Fast | Unit < 50ms |
| 9 | Clean Up After Tests | 无副作用 |
| 10 | Review Coverage Reports | 找覆盖缺口 |

### 3.2 ⚠️ "One Assert Per Test" 的矛盾

源文件 :442：

```
2. One Assert Per Test - Focus on single behavior
```

但源文件示例（第 3 篇 :212-214）一个测试有 3 个 assert：

```typescript
it('returns markets successfully', async () => {
  expect(response.status).toBe(200)              // assert 1
  expect(data.success).toBe(true)                // assert 2
  expect(Array.isArray(data.data)).toBe(true)    // assert 3
})
```

> **⚠️ 规则与示例不一致**
>
> | 解读 | 说明 |
> |---|---|
> | 字面"One Assert" | 一个测试一个 expect → 示例违规 |
> | "One Behavior" | 一个测试一个行为（可多 expect 验证）→ 示例合规 |
>
> **修复方向**：把"One Assert Per Test"改为"One Behavior Per Test"，明确允许多 assert 验证同一行为。
>
> | 场景 | 一个 expect 够吗 |
> |---|---|
> | 验证函数返回值 | 够 |
> | 验证 API 响应 | 不够（status + body） |
> | 验证 UI 渲染 | 不够（多个元素） |

### 3.3 Descriptive Test Names（描述性测试名）

```
差的名字:
   it('test1', ...)
   it('works', ...)

好的名字:
   it('returns relevant markets for query', ...)
   it('handles empty query gracefully', ...)
   it('falls back when Redis unavailable', ...)
```

| 好名字 | 说明 |
|---|---|
| 描述行为 | "returns relevant markets" |
| 含条件 | "when Redis unavailable" |
| 可读 | 失败时一眼看出测什么 |

### 3.4 Arrange-Act-Assert（AAA）

```
it('xxx', () => {
  // Arrange - 准备
  const input = '...'

  // Act - 操作
  const result = fn(input)

  // Assert - 断言
  expect(result).toBe('...')
})
```

| 段 | 职责 |
|---|---|
| Arrange | 准备数据/mock |
| Act | 调用被测 |
| Assert | 验证结果 |

> **💡 AAA 的可读性**
>
> AAA 让测试结构清晰，读测试像读"给 X 输入，做 Y，期望 Z"。

### 3.5 ⚠️ 测试速度指标的不一致

源文件有两处速度指标：

| 出处 | 指标 |
|---|---|
| :448 Best Practices #8 | "Unit tests < 50ms each" |
| :457 Success Metrics | "Fast test execution (< 30s for unit tests)" |

> **⚠️ 两个指标不一致**
>
> | 指标 | 含义 |
> |---|---|
> | `< 50ms each` | 单个 Unit 测试 < 50ms |
> | `< 30s` | 整个 Unit 测试套件 < 30s |
>
> 这两个其实是**不同维度**（单测 vs 全套），但表述易混淆。应明确：
> - 单个 Unit 测试 < 50ms
> - 全套 Unit 测试 < 30s（约 600 个测试 × 50ms）

## 四、Success Metrics（成功指标）

> 源文件 :452-459

### 4.1 6 个指标

```
- 80%+ code coverage achieved
- All tests passing (green)
- No skipped or disabled tests
- Fast test execution (< 30s for unit tests)
- E2E tests cover critical user flows
- Tests catch bugs before production
```

### 4.2 指标的分类

| 指标 | 类型 | 衡量什么 |
|---|---|---|
| 80%+ coverage | 量 | 覆盖度 |
| All passing | 质 | 健康 |
| No skipped | 完整性 | 无遗漏 |
| < 30s | 速度 | 效率 |
| E2E covers critical | 覆盖 | 关键路径 |
| Catch bugs before prod | 价值 | 预防 |

### 4.3 "No skipped tests" 的意义

```
it.skip('todo: test this', ...)   ← 跳过的测试
```

**跳过的测试 = 已知的债务**：

| 情况 | 风险 |
|---|---|
| 跳过 1 个 | 小债务 |
| 跳过 N 个 | 大债务，可能藏 bug |
| 跳过后遗忘 | 永远不测 |

> **💡 为什么禁止 skip**
>
> | 允许 skip | 禁止 skip |
> |---|---|
> | 债务累积 | 强制测全 |
> | skip 的可能藏 bug | 全跑无遗漏 |
> | "以后补"→ 永远不补 | 现在就测 |
>
> 源文件要求 **No skipped or disabled tests**——要么测，要么删，不许 skip。

### 4.4 "Tests catch bugs before production" 的价值

这是最终极的指标——测试是否**真的拦住了 bug**。

| 测试质量 | 表现 |
|---|---|
| 好测试 | bug 在 CI 被拦，不上线 |
| 差测试 | 测试全绿，但 bug 上线（假绿） |
| 无测试 | bug 直接上线 |

> **💡 覆盖率 ≠ 拦 bug**
>
> | 指标 | 能否保证拦 bug |
> |---|---|
> | 80% 覆盖率 | ❌（可能断言错） |
> | All passing | ❌（可能假绿） |
> | **Catch bugs before prod** | ✅（终极验证） |
>
> 最后一个指标是"测试是否有效"的终极度量——用"线上 bug 数"反向验证。

## 五、反模式与持续测试的协作

### 5.1 反模式影响持续测试

```
反模式 → 测试脆 → CI 频繁假失败 → 开发者忽略 CI
   ↓
   "测试又红了，肯定是老问题" → 不修 → 真 bug 混过

无反模式 → 测试稳 → CI 失败即真 bug → 重视 CI
```

| 测试稳定性 | CI 信任度 |
|---|---|
| 脆（反模式多） | 低（常假阳性） |
| 稳（无反模式） | 高（失败即真问题） |

### 5.2 持续测试放大反模式

```
Watch 模式:
   测试脆 → 每次保存都失败 → 干扰开发
   测试稳 → 即时反馈 → 加速 TDD

CI:
   测试慢 → CI 跑 30 分钟 → 拖慢合并
   测试快 → CI 几分钟 → 流畅
```

反模式在持续测试下**问题被放大**——Watch/CI 频繁跑，脆测试频繁断。

## 六、与其他 skill 的协作

### 6.1 与 backend-patterns 的协作

| backend-patterns 关注点 | 本篇对应 |
|---|---|
| 重构（第 1 篇） | 本篇"测行为不测实现"让重构不破坏测试 |
| 错误处理（第 3 篇） | 本篇"测错误路径"覆盖 errorHandler |
| 后台任务（第 5 篇） | 本篇 Watch/CI 让 JobQueue 改动有兜底 |

### 6.2 与 security-review 的协作

| security-review 关注点 | 本篇对应 |
|---|---|
| 安全测试用例 | 本篇 Pre-Commit/CI 把安全测试纳入门禁 |
| 限流测试 | 本篇"测错误路径"含 429 |

### 6.3 与 examples/CLAUDE.md 的呼应

通用模板的测试约定：

```typescript
// examples/CLAUDE.md
- Pre-commit hooks run tests
- CI gates on test + coverage
```

本篇落地：
- "Pre-commit hooks run tests" → 本篇 Pre-Commit Hook
- "CI gates on test + coverage" → 本篇 CI/CD Integration

## 七、设计哲学

### 7.1 测用户视角

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 测行为非实现 | 重构不破坏 | 重命名就断 |
| 语义选择器 | 与样式无关 | 样式变就断 |
| 描述性测试名 | 可读 | 失败难定位 |

### 7.2 测试独立

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 每测试自备数据 | 独立 | 连锁失败 |
| 不互相依赖 | 任意顺序 | 顺序敏感 |
| 清理副作用 | 无污染 | 后续测试受影响 |

### 7.3 持续反馈

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| Watch 即时反馈 | TDD 流畅 | 手动跑慢 |
| Pre-Commit 拦截 | 阻坏 commit | 坏代码入库 |
| CI 门禁 | 阻坏合并 | 坏代码上线 |

### 7.4 度量驱动改进

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| 覆盖率指标 | 找缺口 | 自以为够 |
| 速度指标 | 防慢 | 测试拖慢 CI |
| "拦 bug"指标 | 验证有效 | 假绿不知 |

## 八、反模式汇总（综合）

### 8.1 反模式章节的 3 对

| ❌ FAIL | ✅ PASS |
|---|---|
| 测内部 state | 测用户可见行为 |
| CSS class 选择器 | data-testid / 语义 |
| 测试互相依赖 | 每测试自备数据 |

### 8.2 持续测试反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| Pre-Commit 跑全套 | 慢 | 只跑相关 |
| CI 不卡覆盖率 | 覆盖下滑 | 卡 80% 门槛 |
| 跳过测试（it.skip） | 债务 | 要么测要么删 |
| 不上传覆盖率 | 无可视化 | Codecov 上传 |

### 8.3 最佳实践反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 测试名 "test1" | 不可读 | 描述行为 |
| 无 AAA 结构 | 混乱 | Arrange-Act-Assert |
| 只测 happy path | 漏边界 | 边界 + 错误路径 |
| 测试慢（> 50ms） | 拖慢 CI | 保持快 |

## 九、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| 反模式 | 测行为非实现（不测 state） | **CRITICAL** |
| 反模式 | 用语义选择器（非 CSS class） | HIGH |
| 反模式 | 用 data-testid 兜底 | HIGH（⚠️ E2E 示例用了 placeholder） |
| 反模式 | 测试独立，不互相依赖 | **CRITICAL** |
| 反模式 | 每测试自备数据 | HIGH |
| 反模式 | 测试后清理副作用 | HIGH |
| 持续 | Watch 模式开发 | 标准 |
| 持续 | Pre-Commit 跑 test + lint | HIGH |
| 持续 | Pre-Commit 要快（< 30s） | HIGH |
| 持续 | CI 跑 test + coverage | **CRITICAL** |
| 持续 | CI 卡覆盖率门槛 | HIGH |
| 持续 | 上传覆盖率到 Codecov | 标准 |
| 实践 | Write Tests First | **CRITICAL** |
| 实践 | One Behavior Per Test（非 One Assert） | HIGH（⚠️ 源文件表述待改） |
| 实践 | 描述性测试名 | 标准 |
| 实践 | AAA 结构 | 标准 |
| 实践 | Mock 外部依赖 | HIGH |
| 实践 | 测边界 + 错误路径 | HIGH |
| 实践 | Unit < 50ms each | HIGH |
| 实践 | 清理副作用 | HIGH |
| 实践 | Review 覆盖率报告 | HIGH |
| 指标 | 80%+ 覆盖率 | HIGH |
| 指标 | 全绿 | HIGH |
| 指标 | 无 skip 测试 | HIGH |
| 指标 | 全套 Unit < 30s | 标准（⚠️ 与 < 50ms 维度不同需明确） |
| 指标 | E2E 覆盖关键流 | HIGH |
| 指标 | 测试拦住线上 bug | **CRITICAL** |

---

## 系列完结

至此，tdd-workflow skill 的 5 篇深度分析全部完成：

| # | 文件 | 主题 |
|---|---|---|
| 零 | `tdd-workflow-深度分析-零-总纲.md` | skill 定位、章节地图、阅读指南 |
| 一 | `tdd-workflow-深度分析-一-核心原则与测试分层.md` | Tests Before Code、80% 覆盖率、三层金字塔、Git Checkpoints |
| 二 | `tdd-workflow-深度分析-二-TDD七步工作流.md` | 7 步流程、RED 验证规则（Runtime/Compile-time）、GREEN 门禁、提交规范 |
| 三 | `tdd-workflow-深度分析-三-测试模式与文件组织.md` | Jest Unit、API Integration、Playwright E2E、目录结构 |
| 四 | `tdd-workflow-深度分析-四-依赖隔离与覆盖率.md` | Supabase/Redis/OpenAI Mock、4 维覆盖率门槛 |
| 五 | `tdd-workflow-深度分析-五-反模式与持续测试.md` | 3 对反模式、Watch/PreCommit/CI、10 条实践、成功指标 |

**关键发现**：本系列标记的最值得注意的问题是规则与示例的不一致——"One Assert Per Test"（:442）与示例多 assert（:212-214）矛盾，E2E 反模式章节禁脆弱选择器但 E2E 示例用了 `placeholder` 选择器（:245），以及两处测试速度指标维度不一致（:448 vs :457）。这些需在 skill 层面统一表述。
