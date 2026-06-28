# ECC Skill 详细分析（一）：工程方法论篇

> 生成日期：2026-06-23 ｜ 分析对象：6 个工程基础类 Skill
> 文件路径：`skills/{name}/SKILL.md`
> 系列文档：本篇为 Skill 分析系列第 1 篇，共 3 篇

## 本篇涵盖

| # | Skill | origin | 字数 | 定位 |
|---|---|---|---|---|
| 1 | `backend-patterns` | ECC | ~1572 | 后端架构模式（Node/Express/Next.js） |
| 2 | `tdd-workflow` | ECC | ~1769 | 测试驱动开发方法论 |
| 3 | `security-review` | ECC | ~1683 | 安全检查清单与模式 |
| 4 | `search-first` | ECC | ~600 | 编码前先调研工作流 |
| 5 | `golang-patterns` | ECC | ~1900 | Go 惯用模式 |
| 6 | `golang-testing` | ECC | ~1800 | Go 测试模式与 TDD |

---

## 1. backend-patterns — 后端架构模式

**文件**：`skills/backend-patterns/SKILL.md`（558 行）

### 1.1 设计意图
为 Node.js / Express / Next.js API 路由提供一套**分层架构模式库**，覆盖从 API 设计到日志监控的全链路。定位是"模式参考"，不是教程。

### 1.2 核心章节结构
```
When to Activate → API Design → Database → Caching → Error Handling
→ Auth → Rate Limiting → Background Jobs → Logging
```

### 1.3 关键模式

| 模式 | 解决问题 | 代码示例要点 |
|---|---|---|
| Repository Pattern | 隔离数据访问 | `SupabaseMarketRepository` 实现 `MarketRepository` 接口 |
| Service Layer | 业务逻辑与数据访问分离 | `MarketService` 持有 repo，做 vector search + 排序 |
| Middleware (HOF) | 横切关注点 | `withAuth(handler)` 包裹验证逻辑 |
| N+1 Prevention | 避免循环查询 | 批量 `getUsers(ids)` + `Map` 索引 |
| Cache-Aside | 减少重复 DB 查询 | Redis `get` → miss → DB → `setex` 5min |
| Transaction | 多表原子写入 | Supabase `rpc()` 调 SQL 函数，EXCEPTION 回滚 |
| Retry with Backoff | 网络抖动 | `Math.pow(2, i) * 1000` 指数退避 |
| Centralized Error | 统一错误响应 | `ApiError` 类 + ZodError 分支处理 |
| Job Queue | 异步任务 | 内存队列 `add()` → `process()` 循环 |
| Structured Logging | 可观测性 | JSON 格式 + requestId 上下文 |

### 1.4 关键设计哲学
- **FAIL/PASS 双示例**：每个模式都给 BAD 和 GOOD 两段代码对照，让 AI 能识别"反面模式"。
- **强调事务边界**：事务用 SQL 函数 `rpc()` 实现，而非客户端事务，避免网络调用混入事务。
- **限流显式约束**（:433-440）："Rate limiting must use a shared store such as Redis... Do not use per-process in-memory counters for production APIs" —— 明确禁止错误做法。
- **交叉引用**（:440）：把 HTTP 契约委托给 `api-design`，滥用场景委托给 `security-review`，不重复造轮子。

### 1.5 使用场景
当 AI 在写后端代码、设计 API、排查 N+1、加缓存时，主代理会注入这个 skill 作为"标准答案库"。

---

## 2. tdd-workflow — 测试驱动开发方法论

**文件**：`skills/tdd-workflow/SKILL.md`（460 行）

### 2.1 设计意图
强制"测试先行"纪律，定义 RED-GREEN-REFACTOR 循环的**每一步证据要求**和**Git checkpoint 规范**。

### 2.2 核心流程

```
Step 1: 写 User Journey        Step 2: 生成测试用例
Step 3: 跑测试（必须 FAIL）      ← RED gate
Step 4: 写最小实现
Step 5: 跑测试（必须 PASS）      ← GREEN gate
Step 6: 重构（保持测试绿）
Step 7: 验证覆盖率 ≥ 80%
```

### 2.3 关键约束（最严格的部分）

**RED gate 的严格定义**（:103-118）：
- 必须是 Runtime RED（测试编译通过、被执行、失败）或 Compile-time RED（编译失败即证据）
- 失败必须由"目标 bug/缺失实现"导致，不能是语法错误、依赖缺失、无关回归
- **"只写了测试但没编译执行，不算 RED"**
- **"在确认 RED 状态前，不得修改生产代码"**

**Git checkpoint 规范**（:50-61）：
- 每个 TDD 阶段后必须 checkpoint commit
- commit 必须描述阶段 + 证据
- 只统计当前分支、当前任务的 commit
- 不算其他分支、早期无关工作、远端分支历史的 commit
- 在认定 checkpoint 满足前，必须验证 commit 可从当前 HEAD 到达

**推荐 commit 格式**：
- `test: add reproducer for <feature or bug>`（RED 证据）
- `fix: <feature or bug>`（GREEN 证据）
- `refactor: clean up after <feature or bug>`（重构完成）

### 2.4 测试模式清单

| 测试类型 | 工具 | 示例 |
|---|---|---|
| Unit | Jest/Vitest | React 组件 `render` + `fireEvent` |
| Integration | NextRequest | API 路由 `GET(request)` 直测 |
| E2E | Playwright | 多步用户流，语义选择器 |
| Mock | jest.mock | Supabase/Redis/OpenAI 全部 mock |

### 2.5 反模式（明确禁止）
- 测试内部状态而非行为
- 用 CSS class 做选择器（应语义化或 data-testid）
- 测试间共享状态（每个测试自建数据）
- 测试实现细节而非用户可见行为

### 2.6 与 Git 的强耦合
这个 skill 把 TDD 流程和 Git 提交历史**绑定**起来，每个阶段产出可审计的 commit 证据。这是它区别于普通 TDD 文档的核心：**让 TDD 可验证、可追溯**。

---

## 3. security-review — 安全检查清单

**文件**：`skills/security-review/SKILL.md`（500 行）

### 3.1 设计意图
提供 OWASP 级别的安全检查清单，覆盖 10 个安全域，每个域都给 FAIL/PASS 对照 + Verification Steps。

### 3.2 10 个安全域

| # | 域 | 核心规则 |
|---|---|---|
| 1 | Secrets Management | 硬编码密钥禁用，必须 `process.env` + 启动验证 |
| 2 | Input Validation | Zod schema 校验，文件上传检查 size/type/extension |
| 3 | SQL Injection | 禁止字符串拼接，必须参数化 |
| 4 | Auth & Authz | Token 用 httpOnly cookie（非 localStorage），RLS 启用 |
| 5 | XSS Prevention | DOMPurify 清洗 HTML，CSP 严格配置 |
| 6 | CSRF Protection | 状态变更操作必须 CSRF token + SameSite=Strict |
| 7 | Rate Limiting | 所有 API 端点限流，昂贵操作更严格 |
| 8 | Sensitive Data | 日志不记录密码/card，错误消息对外通用 |
| 9 | Blockchain (Solana) | 验证钱包签名，交易前检查余额/收款方 |
| 10 | Dependency Security | `npm audit` clean，锁文件提交，Dependabot 启用 |

### 3.3 关键设计哲学
- **每个域三段式**：FAIL 示例 → PASS 示例 → Verification Steps checklist
- **CSP 严格默认**（:211-214）："Start strict and loosen only with a documented removal plan. Do not default to `'unsafe-inline'` or `'unsafe-eval'`" —— 把 unsafe-inline 当"临时兼容债务"。
- **Pre-Deployment Checklist**（:472-492）：16 项强制检查，部署前必须全过。
- **Solana 专项**：包含区块链特有的钱包签名验证、交易验证模式。

### 3.4 与其他 skill 的边界
这个 skill 专注"安全检查清单"，不重复 `backend-patterns` 的限流实现细节，也不重复 `api-design` 的 HTTP 契约。

---

## 4. search-first — 编码前先调研

**文件**：`skills/search-first/SKILL.md`（183 行，最短）

### 4.1 设计意图
系统化"写代码前先找现成方案"的工作流，防止重复造轮子。

### 4.2 核心 5 步流程

```
0. TOOL AVAILABILITY PREFLIGHT    ← 先确认搜索渠道可用
1. NEED ANALYSIS                 ← 定义需求 + 语言/框架约束
2. PARALLEL SEARCH               ← researcher agent 并行搜 npm/PyPI/MCP/GitHub
3. EVALUATE                      ← 打分（功能/维护/社区/文档/许可证/依赖）
4. DECIDE                        ← Adopt / Extend / Compose / Build
5. IMPLEMENT                    ← 安装包 / 配置 MCP / 写最小自定义代码
```

### 4.3 决策矩阵

| 信号 | 动作 |
|---|---|
| 精确匹配、维护良好、MIT/Apache | **Adopt** — 直接安装使用 |
| 部分匹配、基础好 | **Extend** — 安装 + 薄包装 |
| 多个弱匹配 | **Compose** — 组合 2-3 个小包 |
| 无合适方案 | **Build** — 自定义，但基于调研 |

### 4.4 关键设计哲学
- **Step 0 Preflight**（:64-75）：这是这个 skill 最独特的部分。在报告"没找到"之前，必须先**诚实声明哪些搜索渠道可用、哪些被跳过**。
- **Anti-Pattern: Silent skipping**（:180）：明确禁止"搜索渠道不可用却报告 nothing found"。
- **工具可用性表**（:69-75）：列出 5 个渠道（repo search / package registry / GitHub CLI / MCP/docs / skills directory）的检查命令和缺失时的回退。
- **与 agent 协作**（:88-100）：提供 `Agent(subagent_type="general-purpose", ...)` 的调用模板，把搜索委托给 researcher 子代理。

### 4.5 三个实例
- "Add dead link checking" → ADOPT `textlint-rule-no-dead-link`，零自定义代码
- "Add HTTP client wrapper" → ADOPT `got`/`httpx`，零自定义代码
- "Add config file linter" → ADOPT + EXTEND `ajv-cli` + 自定义 schema

### 4.6 集成点
明确说明与 `planner`、`architect`、`iterative-retrieval` 三个组件的协作方式，是"工作流编排"类 skill 的典型。

---

## 5. golang-patterns — Go 惯用模式

**文件**：`skills/golang-patterns/SKILL.md`（675 行，最长之一）

### 5.1 设计意图
为 Go 项目提供 idiomatic patterns，覆盖错误处理、并发、接口、包结构、struct 设计、性能优化。

### 5.2 三大核心原则

| 原则 | 含义 | 代码示例 |
|---|---|---|
| Simplicity over Cleverness | 代码要显而易见 | 反例：用 IIFE 包裹简单逻辑 |
| Make Zero Value Useful | 零值即可用 | `bytes.Buffer`、`sync.Mutex` 零值直接用 |
| Accept Interfaces, Return Structs | 参数接口，返回具体类型 | `ProcessData(r io.Reader) (*Result, error)` |

### 5.3 关键模式清单

| 类别 | 模式 | 要点 |
|---|---|---|
| Error Handling | Wrap with context | `fmt.Errorf("load %s: %w", path, err)` |
| Error Handling | Custom error types | `ValidationError` struct + sentinel errors |
| Error Handling | errors.Is/As | 类型断言而非字符串匹配 |
| Error Handling | Never ignore | 禁止 `_ =`，除非 best-effort cleanup |
| Concurrency | Worker Pool | `sync.WaitGroup` + `for job := range jobs` |
| Concurrency | Context timeout | `context.WithTimeout` + `defer cancel()` |
| Concurrency | Graceful shutdown | `signal.Notify` + `server.Shutdown(ctx)` |
| Concurrency | errgroup | `errgroup.WithContext` 协调多 goroutine |
| Concurrency | Avoid leaks | buffered channel + `select { case ch <- data: case <-ctx.Done() }` |
| Interface | Small & focused | 单方法接口，组合而非继承 |
| Interface | Define at consumer | 接口定义在使用方包，非提供方 |
| Interface | Type assertion | `if f, ok := w.(Flusher); ok` 可选行为 |
| Struct | Functional Options | `WithTimeout(d)` + `NewServer(addr, opts...)` |
| Struct | Embedding | `*Logger` 嵌入获得 `Log()` 方法 |
| Performance | Preallocate slices | `make([]Result, 0, len(items))` |
| Performance | sync.Pool | 频繁分配复用 |
| Performance | strings.Builder | 禁止循环内 `+=` 拼接 |

### 5.4 项目结构标准
```
cmd/myapp/main.go    ← 入口
internal/            ← 私有包（handler/service/repository/config）
pkg/client/          ← 公共 API 客户端
api/v1/              ← API 定义（proto/OpenAPI）
testdata/            ← 测试 fixtures
```

### 5.5 反模式（明确禁止）
- 长函数用 naked returns
- 用 panic 做控制流
- context 放 struct 字段（应作为第一个参数）
- 混用值接收者和指针接收者

### 5.6 速查表（:627-636）
8 条 Go idioms 一行总结，便于 AI 快速检索。

---

## 6. golang-testing — Go 测试模式

**文件**：`skills/golang-testing/SKILL.md`（720 行）

### 6.1 设计意图
Go 专用的 TDD 实现细节，补充 `tdd-workflow`（通用方法论）在 Go 语境下的具体写法。

### 6.2 与 tdd-workflow 的关系

| 维度 | tdd-workflow | golang-testing |
|---|---|---|
| 语言 | 通用（TS 示例） | Go 专用 |
| 抽象层 | 方法论 + Git checkpoint | 代码模式 |
| 焦点 | 流程纪律 + 证据 | table-driven/benchmark/fuzz |

### 6.3 核心测试模式

| 模式 | 用途 | 关键 API |
|---|---|---|
| Table-Driven Tests | 批量用例最小代码 | `[]struct{name, input, want}` + `t.Run` |
| Subtests | 组织相关测试 | `t.Run("Create", func(t *testing.T){...})` |
| Parallel Subtests | 加速 | `t.Parallel()` + `tt := tt` 捕获 |
| Test Helpers | 复用 setup | `t.Helper()` + `t.Cleanup()` |
| Temp Files | 文件测试 | `t.TempDir()` 自动清理 |
| Golden Files | 快照测试 | `testdata/*.golden` + `-update` flag |
| Interface Mocking | 依赖隔离 | `MockUserRepository{GetUserFunc: ...}` |
| Benchmarks | 性能测试 | `b.ResetTimer()` + `b.N` 循环 |
| Fuzzing (Go 1.18+) | 随机输入发现 bug | `f.Add(seed)` + `f.Fuzz(func)` |

### 6.4 覆盖率目标

| 代码类型 | 目标 |
|---|---|
| 关键业务逻辑 | 100% |
| 公共 API | 90%+ |
| 一般代码 | 80%+ |
| 生成代码 | 排除 |

### 6.5 命令速查（:647-679）
14 条 `go test` 命令变体：`-race`、`-coverprofile`、`-short`、`-timeout`、`-bench`、`-fuzz`、`-count=10`（检测 flaky）等。

### 6.6 反模式
- 直接测试私有函数（应通过公共 API）
- 用 `time.Sleep()`（应用 channel/condition）
- 忽略 flaky 测试
- mock 一切（优先集成测试）

---

## 跨 skill 协作关系图

```
                    search-first
                        │
                        ▼
                   planner/architect
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  backend-patterns  golang-patterns  security-review
        │               │               │
        │               ▼               │
        │          golang-testing       │
        │                               │
        └───────────┬───────────────────┘
                    ▼
              tdd-workflow（方法论约束所有测试）
```

**协作规则**：
- `search-first` 决定"用现成方案还是自建"
- `backend-patterns` / `golang-patterns` 提供具体语言的模式库
- `security-review` 在所有实现中并行检查安全
- `golang-testing` 把 `tdd-workflow` 的方法论落地到 Go 代码
- `tdd-workflow` 作为顶层方法论，约束所有测试先行

---

## 共性设计模式总结

这 6 个 skill 共享以下设计约定：

1. **frontmatter 三字段**：`name` + `description`（含触发条件）+ `origin: ECC`，无 tools/model（skill 是知识包）
2. **首章 When to Activate**：明确列出激活场景，让主代理能自动路由
3. **FAIL/PASS 双示例**：每个模式都给反例和正例对照
4. **代码块带语言标记**：```typescript / ```go / ```bash，便于语法高亮
5. **交叉引用**：通过 `see skill: xxx` 解耦，不重复内容
6. **反模式章节**：明确列出"不要做什么"
7. **命令速查表**：底部放常用命令，便于复制
8. **Remember 结尾**：一行总结，强化核心理念

---

## 下一篇

- [ECC Skill 分析（二）：AI 与上下文管理篇](./ECC-Skill-分析-二-AI与上下文管理篇.md) — 涵盖 continuous-learning、continuous-learning-v2、iterative-retrieval、strategic-compact、cost-aware-llm-pipeline、regex-vs-llm-structured-text、autonomous-loops 共 7 个 skill
