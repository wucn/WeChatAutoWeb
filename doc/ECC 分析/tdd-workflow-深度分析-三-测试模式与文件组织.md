# tdd-workflow 深度分析（三）：测试模式与文件组织

> 源文件：`skills/tdd-workflow/SKILL.md`（:172-307 行）
> 本篇聚焦：Unit Test Pattern + API Integration Pattern + E2E Pattern + Test File Organization
> 系列第 3 篇，共 5 篇

## 引言：三种测试怎么写

本篇把第 1 篇的"三层金字塔"落地为**具体代码模式**：

```
测试模式
   │
   ├─ Unit Test（Jest/Vitest）       ← 组件/函数
   ├─ API Integration Test           ← API 端点
   ├─ E2E Test（Playwright）         ← 完整用户流
   │
   └─ Test File Organization         ← 文件怎么放
```

## 一、Unit Test Pattern（单元测试模式）

> 源文件 :174-199 | 工具：Jest / Vitest + Testing Library

### 1.1 完整示例

```typescript
// (:175-198)
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button Component', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click</Button>)

    fireEvent.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

### 1.2 测试的三段式（AAA）

每个 `it` 遵循 Arrange-Act-Assert：

```
it('calls onClick when clicked', () => {
  // Arrange（准备）
  const handleClick = jest.fn()
  render(<Button onClick={handleClick}>Click</Button>)

  // Act（操作）
  fireEvent.click(screen.getByRole('button'))

  // Assert（断言）
  expect(handleClick).toHaveBeenCalledTimes(1)
})
```

| 段 | 作用 | 示例 |
|---|---|---|
| Arrange | 准备组件 + mock | `render(<Button>)` + `jest.fn()` |
| Act | 触发行为 | `fireEvent.click` |
| Assert | 验证结果 | `expect(...).toHaveBeenCalledTimes(1)` |

### 1.3 Testing Library 的查询 API

```typescript
screen.getByText('Click me')        // 文本
screen.getByRole('button')          // 语义角色
```

**查询优先级**（Testing Library 官方推荐）：

| 优先级 | 查询方式 | 例子 |
|---|---|---|
| 1 | `getByRole` | `getByRole('button')` |
| 2 | `getByLabelText` | `getByLabelText('Email')` |
| 3 | `getByPlaceholderText` | `getByPlaceholderText('Search')` |
| 4 | `getByText` | `getByText('Click me')` |
| 5 | `getByDisplayValue` | `getByDisplayValue('test')` |
| 6 | `getByAltText` | `getByAltText('logo')` |
| 7 | `getByTitle` | `getByTitle('submit')` |
| 8 | `getByTestId` | `getByTestId('submit-btn')` |

> **💡 为什么 getByRole 优先**
>
> `getByRole` 基于**语义角色**查询，与"用户怎么感知"一致：
>
> | 查询 | 脆弱度 | 用户视角 |
> |---|---|---|
> | `getByRole('button')` | 低 | ✅ 用户也看到按钮 |
> | `getByText('Click me')` | 中 | 文本变就断 |
> | `getByClassName('btn-xyz')` | 高 | ❌ 用户看不到 class |
> | `getByTestId('btn')` | 低 | ✅ 但需额外加属性 |

### 1.4 jest.fn() 的用法

```typescript
const handleClick = jest.fn()              // 创建 mock 函数
fireEvent.click(...)
expect(handleClick).toHaveBeenCalledTimes(1)  // 验证调用次数
expect(handleClick).toHaveBeenCalledWith(arg) // 验证调用参数
```

| 断言 | 验证 |
|---|---|
| `toHaveBeenCalledTimes(n)` | 调用了 n 次 |
| `toHaveBeenCalledWith(arg)` | 用某参数调用 |
| `not.toHaveBeenCalled()` | 没被调用 |

### 1.5 三个测试覆盖的三种行为

| 测试 | 行为 | 类型 |
|---|---|---|
| `renders with correct text` | 渲染输出 | 展示 |
| `calls onClick when clicked` | 交互回调 | 交互 |
| `is disabled when disabled prop` | 状态控制 | 属性 |

**组件测试的典型维度**：展示 + 交互 + 状态。

### 1.6 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| Jest | XCTest | JUnit |
| Testing Library | 暂无直接对应（XCUITest 偏 UI） | Espresso |
| `render(<Button>)` | `loadView()` | `ActivityScenario.launch()` |
| `screen.getByRole` | `app.buttons['Submit']` | `onView(withRole Button)` |
| `jest.fn()` | `XCTStub` / mock | `Mockito.mock()` |
| `fireEvent.click` | `button.tap()` | `performClick()` |

## 二、API Integration Test Pattern（API 集成测试模式）

> 源文件 :201-230

### 2.1 完整示例

```typescript
// (:202-229)
import { NextRequest } from 'next/server'
import { GET } from './route'

describe('GET /api/markets', () => {
  it('returns markets successfully', async () => {
    const request = new NextRequest('http://localhost/api/markets')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
  })

  it('validates query parameters', async () => {
    const request = new NextRequest('http://localhost/api/markets?limit=invalid')
    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('handles database errors gracefully', async () => {
    // Mock database failure
    const request = new NextRequest('http://localhost/api/markets')
    // Test error handling
  })
})
```

### 2.2 与 Unit 测试的差异

| 维度 | Unit（Button） | Integration（API） |
|---|---|---|
| 被测 | 单组件 | API 路由函数 |
| 入口 | `render(<Button>)` | `GET(request)` |
| 依赖 | 全 mock | 真实 DB（或测试 DB） |
| 验证 | 渲染/交互 | HTTP 状态码 + 响应体 |
| 速度 | < 50ms | 秒级 |

### 2.3 直接调用路由函数

```typescript
const response = await GET(request)   // 直接调，不起服务器
```

**特点**：不通过 HTTP 服务器，**直接 import 路由函数**调用。

| 方式 | 优点 | 缺点 |
|---|---|---|
| 直接调函数（源文件） | 快、简单 | 不测中间件链 |
| 起 supertest 服务器 | 测完整中间件 | 慢、复杂 |

> **💡 源文件用"直接调函数"的取舍**
>
> 本 skill 选择直接调 `GET(request)`，**跳过了中间件链**（鉴权、限流、日志）。这意味着：
>
> | 覆盖 | 不覆盖 |
> |---|---|
> | 路由函数逻辑 | 中间件（鉴权/限流） |
> | 响应格式 | HTTP 层（header/status line） |
> | 参数校验 | 路由匹配 |
>
> 中间件层的测试应另写（或用 supertest）。security-review 第 4 篇的 4 类安全测试可补这部分。

### 2.4 三个测试覆盖的三类场景

| 测试 | 场景 | 状态码 |
|---|---|---|
| `returns markets successfully` | Happy path | 200 |
| `validates query parameters` | 参数错误 | 400 |
| `handles database errors gracefully` | 错误路径 | （未写完） |

**API 测试的典型维度**：成功 + 参数校验 + 错误处理。

### 2.5 ⚠️ 错误路径测试未写完

```typescript
// (:224-228)
it('handles database errors gracefully', async () => {
  // Mock database failure
  const request = new NextRequest('http://localhost/api/markets')
  // Test error handling     ← 只写了注释，没实现
})
```

> **⚠️ 源文件这个测试是半成品**
>
> 只写了注释 `// Test error handling`，没有实际的 mock + assert。生产用例应：
>
> ```typescript
> it('handles database errors gracefully', async () => {
>   jest.spyOn(db, 'query').mockRejectedValue(new Error('DB down'))
>   const request = new NextRequest('http://localhost/api/markets')
>   const response = await GET(request)
>   expect(response.status).toBe(500)
> })
> ```

### 2.6 响应格式的断言

```typescript
expect(response.status).toBe(200)
expect(data.success).toBe(true)
expect(Array.isArray(data.data)).toBe(true)
```

**与 backend-patterns 第 3 篇的呼应**：

backend-patterns 定义统一响应格式：

```typescript
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }
```

本测试验证的就是这个契约：`data.success === true` + `data.data` 是数组。

## 三、E2E Test Pattern（端到端测试模式）

> 源文件 :232-283 | 工具：Playwright

### 3.1 完整示例

```typescript
// (:234-263)
import { test, expect } from '@playwright/test'

test('user can search and filter markets', async ({ page }) => {
  // 导航
  await page.goto('/')
  await page.click('a[href="/markets"]')

  // 验证页面加载
  await expect(page.locator('h1')).toContainText('Markets')

  // 搜索
  await page.fill('input[placeholder="Search markets"]', 'election')

  // ⚠️ 硬等待
  await page.waitForTimeout(600)

  // 验证结果
  const results = page.locator('[data-testid="market-card"]')
  await expect(results).toHaveCount(5, { timeout: 5000 })

  // 验证内容
  const firstResult = results.first()
  await expect(firstResult).toContainText('election', { ignoreCase: true })

  // 筛选
  await page.click('button:has-text("Active")')

  // 验证筛选
  await expect(results).toHaveCount(3)
})
```

### 3.2 E2E 测试的结构

```
① 导航（goto + click）
   ↓
② 验证页面加载（expect h1）
   ↓
③ 操作（fill + click）
   ↓
④ 验证结果（expect results）
   ↓
⑤ 再操作（click filter）
   ↓
⑥ 验证最终（expect filtered）
```

### 3.3 Playwright 的自动重试机制

```typescript
await expect(results).toHaveCount(5, { timeout: 5000 })
```

**Playwright 的 `expect` 是自动重试的**：

```
expect(locator).toHaveCount(5)
   ↓
   立即检查: count === 5?
   ├─ 是 → 通过
   └─ 否 → 等一会再查（直到 timeout: 5000ms）
```

| 断言类型 | 自动重试 |
|---|---|
| `expect(locator).toHaveCount(n)` | ✅ 重试 |
| `expect(locator).toContainText(x)` | ✅ 重试 |
| `expect(page).toHaveURL(/.../)` | ✅ 重试 |
| `expect(handleClick).toHaveBeenCalledTimes(1)`（jest） | ❌ 不重试 |

> **💡 自动重试是 E2E 的关键**
>
> E2E 面对异步加载，断言必须能等。Playwright 的 `expect` 自动重试让测试**不需要手动 sleep**。

### 3.4 ⚠️ 硬等待反模式

```typescript
// (:248)
await page.waitForTimeout(600)   // ❌ 硬等待 600ms
```

> **⚠️ 这是反模式**
>
> | 问题 | 说明 |
> |---|---|
> | 慢 | 永远等 600ms，即使结果早到 |
> | 脆弱 | 慢机器上 600ms 不够，测试断 |
> | 不必要 | Playwright 的 `expect` 自动重试 |
>
> **正确做法**：直接 `expect(results).toHaveCount(5, { timeout: 5000 })`，删掉 `waitForTimeout`。
>
> | 方式 | 速度 | 稳定性 |
> |---|---|---|
> | `waitForTimeout(600)` + 断言 | 慢（固定 600ms） | 脆（慢机器断） |
> | 直接断言（自动重试） | 快（结果到就过） | 稳（timeout 内重试） |

### 3.5 ⚠️ 选择器的矛盾

源文件 E2E 用了多种选择器：

```typescript
await page.click('a[href="/markets"]')                          // :239
await page.fill('input[placeholder="Search markets"]', '...')   // :245  ⚠️
await expect(page.locator('h1')).toContainText('Markets')       // :242
const results = page.locator('[data-testid="market-card"]')     // :251  ✓
await page.click('button:has-text("Active")')                   // :259
```

而源文件 :382-393 的反模式章节明确说**不要用脆弱选择器**：

```
### FAIL: WRONG: Brittle Selectors
await page.click('.css-class-xyz')

### PASS: CORRECT: Semantic Selectors
await page.click('button:has-text("Submit")')
await page.click('[data-testid="submit-button"]')
```

> **⚠️ `input[placeholder="..."]` 的争议**
>
> | 选择器 | 脆弱度 | 评价 |
> |---|---|---|
> | `input[placeholder="Search markets"]` | 中 | placeholder 改了就断 |
> | `[data-testid="search-input"]` | 低 | ✅ 推荐 |
> | `button:has-text("Active")` | 低 | ✅ 语义 |
> | `.css-class-xyz` | 高 | ❌ 反模式 |
>
> 源文件 E2E 示例用 `placeholder` 选择器，与反模式章节的"用 data-testid"建议**不完全一致**。应统一用 `data-testid`。

### 3.6 E2E 的第二个示例：创建市场

```typescript
// (:265-282)
test('user can create a new market', async ({ page }) => {
  await page.goto('/creator-dashboard')

  // 填表单
  await page.fill('input[name="name"]', 'Test Market')
  await page.fill('textarea[name="description"]', 'Test description')
  await page.fill('input[name="endDate"]', '2025-12-31')

  // 提交
  await page.click('button[type="submit"]')

  // 验证成功消息
  await expect(page.locator('text=Market created successfully')).toBeVisible()

  // 验证跳转
  await expect(page).toHaveURL(/\/markets\/test-market/)
})
```

**E2E 验证的 3 层**：

| 层 | 验证 |
|---|---|
| UI 反馈 | "Market created successfully" 可见 |
| 路由 | URL 跳转到 `/markets/test-market/` |
| 数据 | （本例未验证，生产应查 DB） |

> **⚠️ E2E 未验证数据层**
>
> 本例验证了 UI 消息 + URL 跳转，但**没验证市场真的存进 DB**。完整 E2E 应加：
>
> ```typescript
> const market = await db.markets.findUnique({ where: { slug: 'test-market' } })
> expect(market).toBeTruthy()
> ```

### 3.7 客户端类比

| 服务端概念 | iOS 类比 | Android 类比 |
|---|---|---|
| Playwright | XCUITest | Espresso / UI Automator |
| `page.goto(url)` | `XCUIApplication().launch()` | `ActivityScenario.launch()` |
| `page.click(selector)` | `app.buttons['X'].tap()` | `onView(...).perform(click())` |
| `page.fill(input, text)` | `textField.text = x` | `onView(...).perform(typeText)` |
| `expect(locator).toBeVisible()` | `XCTAssertTrue(element.exists)` | `onView(...).check(matches(isDisplayed()))` |
| `toHaveURL(/.../)` | 验证导航 | 验证当前 Activity |

## 四、Test File Organization（测试文件组织）

> 源文件 :285-306

### 4.1 目录结构

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   ├── Button.test.tsx          # Unit tests
│   │   └── Button.stories.tsx       # Storybook
│   └── MarketCard/
│       ├── MarketCard.tsx
│       └── MarketCard.test.tsx
├── app/
│   └── api/
│       └── markets/
│           ├── route.ts
│           └── route.test.ts         # Integration tests
└── e2e/
    ├── markets.spec.ts               # E2E tests
    ├── trading.spec.ts
    └── auth.spec.ts
```

### 4.2 三种放置策略

| 测试类型 | 放置 | 命名 |
|---|---|---|
| Unit | **紧邻被测文件** | `Button.test.tsx`（同目录） |
| Integration | **紧邻路由** | `route.test.ts`（同目录） |
| E2E | **独立 e2e 目录** | `markets.spec.ts` |

### 4.3 就近放置 vs 集中放置

```
就近放置（源文件采用）:
   src/components/Button/
     ├─ Button.tsx
     └─ Button.test.tsx     ← 测试和生产代码同目录
   ↓ 优点: 找测试 = 找代码
   ↓ 缺点: 生产 build 含测试文件（需配置排除）

集中放置:
   src/components/Button.tsx
   tests/components/Button.test.tsx
   ↓ 优点: 生产代码干净
   ↓ 缺点: 找测试要跨目录
```

> **💡 源文件选"就近放置"的理由**
>
> | 优势 | 说明 |
> |---|---|
> | 可发现性 | 改 Button.tsx 时一眼看到测试 |
> | 移动方便 | 移组件连同测试一起 |
> | 命名清晰 | `xxx.test.ts` 约定俗成 |
>
> 配置 build 排除 `*.test.*` 即可避免测试进生产。

### 4.4 E2E 用 .spec.ts 后缀

| 后缀 | 用途 |
|---|---|
| `.test.tsx` / `.test.ts` | Unit / Integration（Jest） |
| `.spec.ts` | E2E（Playwright） |

**后缀区分工具**：Jest 默认匹配 `*.test.*`，Playwright 默认匹配 `*.spec.*`。

### 4.5 Storybook 的协同

```
Button/
  ├─ Button.tsx
  ├─ Button.test.tsx       ← 测试行为
  └─ Button.stories.tsx    ← 展示状态（可视化）
```

| 文件 | 作用 |
|---|---|
| `Button.tsx` | 实现 |
| `Button.test.tsx` | 自动化测试 |
| `Button.stories.tsx` | 视觉状态展示（Storybook） |

三者互补：测试验证逻辑，Storybook 验证视觉。

## 五、三种模式的选择决策

### 5.1 该用哪种测试

```
要测什么?
   │
   ├─ 单个函数/组件逻辑 → Unit
   │
   ├─ API 端点契约     → Integration
   │
   └─ 完整用户流       → E2E
```

### 5.2 三种模式的对比

| 维度 | Unit | Integration | E2E |
|---|---|---|---|
| 工具 | Jest/Vitest | Jest（直接调函数） | Playwright |
| 速度 | < 50ms | 秒级 | 分钟级 |
| 依赖 | 全 mock | 真实 DB | 真实浏览器+服务 |
| 数量 | 多 | 中 | 少 |
| 文件 | `*.test.tsx` | `*.test.ts` | `*.spec.ts` |
| 放置 | 就近 | 就近 | 独立 e2e/ |
| 验证 | 函数/组件行为 | HTTP 响应 | 完整用户流 |

## 六、与 backend-patterns / security-review 的协作

### 6.1 测 backend-patterns 的代码

| backend-patterns 产物 | 用什么测 | 模式 |
|---|---|---|
| Repository `findById` | Unit（mock DB） | Unit Pattern |
| Service `createUser` | Unit（mock Repository） | Unit Pattern |
| API 路由 `GET /api/markets` | Integration（直接调函数） | API Pattern |
| errorHandler | Unit（构造错误，验证响应） | Unit Pattern |
| JobQueue | Unit（mock execute） | Unit Pattern |

### 6.2 测 security-review 的安全用例

security-review 第 4 篇的 4 类安全测试用本篇的模式：

| security-review 测试 | 用本篇哪种模式 |
|---|---|
| `requires authentication`（401） | API Integration Pattern |
| `requires admin role`（403） | API Integration Pattern |
| `rejects invalid input`（400） | API Integration Pattern |
| `enforces rate limits`（429） | API Integration Pattern（或 E2E） |

### 6.3 职责分工

| 关注点 | tdd-workflow（本篇） | backend-patterns | security-review |
|---|---|---|---|
| 测试代码模式 | ✅ Jest/Playwright 用法 | ❌ | ❌ |
| 被测代码 | ❌ | ✅ 提供 | ❌ |
| 安全测试用例 | ❌ | ❌ | ✅ 提供 |
| 文件组织 | ✅ 目录结构 | ❌ | ❌ |

## 七、设计哲学

### 7.1 查询即用户视角

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| `getByRole` 优先 | 与用户感知一致 | 按实现查询，实现变就断 |
| `data-testid` 兜底 | 显式标记 | 用 placeholder/class 等易变属性 |

### 7.2 自动重试优于硬等待

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| `expect(locator)` 自动重试 | 快+稳 | `waitForTimeout` 慢+脆 |

### 7.3 测试就近生产代码

| 设计决策 | 为什么 | 如果不这么做 |
|---|---|---|
| `*.test.ts` 同目录 | 可发现 | 集中放置难找 |
| 后缀区分工具 | `.test` vs `.spec` | 工具混跑 |

## 八、反模式汇总

### 8.1 Unit 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 按类名查询 | 脆弱 | `getByRole` |
| 测内部 state | 测实现 | 测用户可见行为 |
| 一个测试多行为 | 难定位 | 一行为一测试 |

### 8.2 Integration 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 只测 happy path | 漏错误 | happy + 参数错 + 错误路径 |
| 错误路径写注释不实现 | 假测试 | 写 mock + assert |
| 不验证响应格式 | 契约漏 | assert status + body |

### 8.3 E2E 反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| `waitForTimeout` | 慢+脆 | 自动重试 `expect` |
| `placeholder` 选择器 | 脆弱 | `data-testid` |
| 不验证数据层 | 假成功 | 加 DB 查询验证 |
| 测太多细节 | 脆 | 只测关键流 |

### 8.4 组织反模式

| ❌ 反模式 | 问题 | ✅ 正确做法 |
|---|---|---|
| 测试集中放 | 难找 | 就近放置 |
| 后缀混乱 | 工具混跑 | `.test` / `.spec` 区分 |
| 测试进生产 build | 体积大 | 配置排除 `*.test.*` |

## 九、规则总结表

| 类别 | 规则 | 严重度 |
|---|---|---|
| Unit | 用 Testing Library 查询（getByRole 优先） | HIGH |
| Unit | 遵循 AAA（Arrange-Act-Assert） | 标准 |
| Unit | 一个测试聚焦一个行为 | HIGH |
| Unit | 用 `jest.fn()` mock 回调 | 标准 |
| Unit | 覆盖展示+交互+状态三个维度 | 标准 |
| Integration | 直接调路由函数 | 标准 |
| Integration | 测 happy + 参数错 + 错误路径 | HIGH |
| Integration | 验证 status + body 格式 | HIGH |
| Integration | 错误路径要写完整 mock + assert | HIGH（⚠️ 源文件半成品） |
| E2E | 用 Playwright `expect` 自动重试 | **CRITICAL** |
| E2E | 禁用 `waitForTimeout` 硬等待 | **CRITICAL**（⚠️ 源文件用了） |
| E2E | 用 `data-testid` / 语义选择器 | HIGH（⚠️ 源文件用了 placeholder） |
| E2E | 只测关键用户流 | HIGH |
| E2E | 验证 UI + 路由 + 数据三层 | HIGH（⚠️ 源文件缺数据层） |
| 组织 | Unit/Integration 就近放置 | 标准 |
| 组织 | E2E 独立 e2e/ 目录 | 标准 |
| 组织 | `.test.*` 与 `.spec.*` 区分工具 | 标准 |
| 组织 | build 排除 `*.test.*` | HIGH |

---

## 下一篇

- [tdd-workflow 深度分析（四）：依赖隔离与覆盖率](./tdd-workflow-深度分析-四-依赖隔离与覆盖率.md) — Supabase/Redis/OpenAI Mock、4 维覆盖率门槛
