# ECC Skill 详细分析（三）：语言与平台篇

> 生成日期：2026-06-23 ｜ 分析对象：6 个语言/平台/质量管控类 Skill
> 系列文档：本篇为 Skill 分析系列第 3 篇（完结篇）

## 本篇涵盖

| # | Skill | origin | 字数 | 定位 |
|---|---|---|---|---|
| 1 | `perl-patterns` | ECC | ~1900 | 现代 Perl 5.36+ 惯用模式 |
| 2 | `perl-security` | ECC | ~2000 | Perl 安全模式（taint/注入/SQLi） |
| 3 | `perl-testing` | ECC | ~1800 | Perl 测试（Test2::V0/prove/Devel::Cover） |
| 4 | `liquid-glass-design` | ECC | ~1100 | iOS 26 Liquid Glass 设计系统 |
| 5 | `swift-concurrency-6-2` | ECC | ~900 | Swift 6.2 Approachable Concurrency |
| 6 | `plankton-code-quality` | community | ~1120 | 写入时代码质量强制 |

---

## 1. perl-patterns — 现代 Perl 惯用模式

**文件**：`skills/perl-patterns/SKILL.md`（505 行）

### 1.1 设计意图
把 Perl 从"祖传脚本"拉到现代标准，以 `use v5.36` 为分水岭，定义现代 Perl 的惯用写法。

### 1.2 五大核心原则

| 原则 | 旧写法 | 现代写法 |
|---|---|---|
| `use v5.36` 一行搞定 | `use strict; use warnings; use feature 'say','signatures'; no warnings 'experimental::signatures';` | `use v5.36;` |
| 子程序签名 | `my ($x,$y) = @_; $port //= 5432;` | `sub connect_db($host, $port=5432, $timeout=30) { ... }` |
| 上下文敏感 | — | `@copy = @items;` vs `$count = @items;` |
| 后缀解引用 | `@{ $data->{users} }` | `$data->{users}->@*` |
| `isa` 操作符 (5.32+) | `blessed($o) && $o->isa('X')` | `$obj isa 'My::Class'` |

### 1.3 错误处理三阶段
- `eval/die`：基础模式
- `Try::Tiny`：可靠异常处理
- 原生 `try/catch` (5.40+)：`try { ... } catch ($e) { ... }`

### 1.4 现代 OO 谱系

| 方案 | 适用 | 特点 |
|---|---|---|
| Moo | 轻量 OO（推荐） | 无 metaprotocol 开销 |
| Moose | 需要元协议时 | 重型 |
| 原生 `class` (5.38+, Corinna) | 实验性 | `field $x :param; method ...` |

**Moo Roles**：`Role::Serializable` + `with` 组合，类似 trait。

### 1.5 正则现代写法
- **命名捕获** + `/x` flag：`(?<timestamp> ...)` + `$+{timestamp}`
- **预编译模式**：`qr//` 编译一次多次用

### 1.6 文件 I/O 关键规则
- **三参数 open**：`open my $fh, '<:encoding(UTF-8)', $path`（带 `autodie` 免 `or die`）
- **禁两参数 open**：`open FH, $path`（shell 注入风险，见 perl-security）
- **Path::Tiny**：`path('config','app.json')->slurp_utf8`

### 1.7 工具链
- **perltidy**：`.perltidyrc` 格式化
- **perlcritic**：`.perlcriticrc` 静态检查
- **cpanfile + carton**：依赖管理（`carton exec -- perl bin/myapp`）

### 1.8 反模式（6 条）
1. 两参数 open（安全风险）
2. 间接对象语法 `new Foo` → `Foo->new`
3. 过度依赖 `$_`
4. `no strict 'refs'`
5. 全局变量做配置（应用 `use constant` 或 Moo 属性）
6. 字符串 `eval` 加载模块（注入风险，用 `Module::Runtime`）

### 1.9 速查表
文档末尾 12 行对照表，把每个 legacy pattern 映射到 modern replacement，便于 AI 快速迁移代码。

---

## 2. perl-security — Perl 安全模式

**文件**：`skills/perl-security/SKILL.md`（504 行）

### 2.1 设计意图
Perl 专用的深度安全指南，覆盖 taint mode、注入防护、Web 安全、perlcritic 策略。与 `perl-patterns` 形成"编码 + 安全"双 skill。

### 2.2 核心机制：Taint Mode

```perl
#!/usr/bin/perl -T
```

- 外部数据自动标 tainted：`$ARGV[0]`、`$ENV{PATH}`、`<STDIN>`、`$ENV{QUERY_STRING}`
- tainted 数据**不能**用于不安全操作
- 必须显式 untaint：`if ($input =~ /^([a-zA-Z0-9_]{3,30})$/) { return $1; }`（`$1` 自动 untainted）

**反模式**：`$input =~ /^(.*)$/s; return $1;` — 接受任何内容，让 taint mode 失效。

### 2.3 输入验证原则

**Allowlist > Blocklist**：
- ✓ 定义允许字段集合 `qw(name email created_at)`
- ✗ 黑名单 `[<>"';&|]` 永远不完整

**长度约束**：`die if length($text) > 10_000`

### 2.4 ReDoS 防护
禁止嵌套量词：
- ✗ `qr/^(a+)+$/`（指数级回溯）
- ✗ `qr/^([a-zA-Z]+)*$/`
- ✓ `qr/^a+$/`（单量词）
- ✓ `qr/^[a-zA-Z]++$/`（possessive 5.10+）
- ✓ `qr/^(?>a+)$/`（atomic group）
- ✓ `alarm()` 超时包裹

### 2.5 文件操作三原则
1. **三参数 open + 词法文件句柄**
2. **TOCTOU 防护**：`sysopen(O_CREAT | O_EXCL)` 原子创建
3. **路径遍历防护**：`realpath()` + 检查 `$real =~ /^\Q$base_real\E/`

### 2.6 进程执行
- ✓ **列表形式** `system(@cmd)` 无 shell 插值
- ✓ `IPC::Run3` 安全捕获输出
- ✗ 字符串形式 `system("grep -r '$pattern'")` — shell 注入
- ✗ 反引号 `\`ls $user_dir\`` — 注入

### 2.7 SQL 注入防护
- ✓ DBI 占位符 `WHERE email = ?`
- ✓ **动态列 allowlist**：列名/方向不能参数化，必须 allowlist 验证后插入
- ✗ 字符串插值 SQL
- ✓ DBIx::Class 自动生成参数化查询

### 2.8 Web 安全四件套
| 威胁 | 防护 |
|---|---|
| XSS | `HTML::Entities::encode_entities()` + 模板自动转义 |
| CSRF | `Crypt::URandom` 生成 token + 常量时间比较 |
| 会话 | Secure + HttpOnly + SameSite cookies |
| 头部 | CSP / X-Frame-Options / HSTS via `after_dispatch` hook |

### 2.9 perlcritic 安全策略
`.perlcriticrc` 配置 7 条安全策略（severity 3-5）：
- `RequireThreeArgOpen` (5)
- `RequireCheckedSyscalls` (4)
- `ProhibitStringyEval` (5)
- `ProhibitBacktickOperators` (4)
- `RequireTaintChecking` (5)
- `ProhibitTwoArgOpen` (5)
- `ProhibitBarewordFileHandles` (5)

### 2.10 12 项安全速查表
覆盖 taint / 输入验证 / 文件 / 进程 / SQL / HTML / CSRF / 会话 / HTTP 头 / 依赖 / 正则 / 错误消息。

### 2.11 反模式（8 条）
两参数 open / 字符串 system / SQL 插值 / eval 用户输入 / 信任 `$ENV` / 偷懒 untaint / 原始 HTML / 未验证重定向。

---

## 3. perl-testing — Perl 测试模式

**文件**：`skills/perl-testing/SKILL.md`（476 行）

### 3.1 设计意图
Perl 专用 TDD 实现，配合 `tdd-workflow`（通用方法论）落地到 Perl 代码。

### 3.2 测试框架对比

| 框架 | 状态 | 用途 |
|---|---|---|
| Test::More | 旧标准（核心模块） | 维护遗留代码 |
| **Test2::V0** | 现代推荐 | 新项目首选 |

**Test2::V0 优势**：
- hash/array builders 做深度比较
- 更好的失败诊断
- 干净的 subtest 作用域
- 可扩展 `Test2::Tools::*`
- 向后兼容 Test::More

### 3.3 Test2::V0 深度比较

```perl
is($user->to_hash, hash {
    field name  => 'Alice';
    field email => match(qr/\@example\.com$/);
    field age   => validator(sub { $_ >= 18 });
    etc();   # 忽略其他字段
}, 'user has expected fields');
```

- `hash {}` / `array {}` / `bag {}`（无序比较）
- `match(qr//)` / `validator(sub{})` / `DNE()`（Does Not Exist）

### 3.4 异常测试
```perl
like(dies { divide(10, 0) }, qr/Division by zero/, 'dies on zero');
ok(lives { divide(10, 2) }, 'division succeeds');
```

### 3.5 prove 命令体系
- `prove -l` — 含 lib/
- `prove -lv` — verbose
- `prove -lr -j8` — 递归 + 8 并行
- `--state=failed` — 只跑上次失败的
- `--formatter TAP::Formatter::JUnit` — CI 输出
- `.proverc` 配置文件

### 3.6 Mocking
- `Test::MockModule` — mock 方法，自动 scope 恢复
- ✗ 禁止 monkey-patching（`*MyApp::API::fetch_user = sub{}` 泄漏跨测试）

### 3.7 覆盖率
```bash
cover -test
cover -report html
# CI 失败阈值
cover -test && cover -report text -select '^lib/' \
  | perl -ne 'if (/Total.*?(\d+\.\d+)/) { exit 1 if $1 < 80 }'
```
目标 80%+。

### 3.8 集成测试
- 数据库：内存 SQLite `DBI->connect('dbi:SQLite:dbname=:memory:')`
- API：mock HTTP::Tiny

### 3.9 DO / DON'T
- ✓ TDD / Test2::V0 / subtests / mock 边界 / `prove -l` / 80%+ 覆盖
- ✗ 测实现细节 / 共享状态 / 忘 `done_testing` / 过度 mock / 用 Test::More 写新项目

### 3.10 常见陷阱
- 忘 `done_testing` — 静默 bug
- 缺 `-l` flag — 找不到模块
- 过度 mock — 只测了 mock 本身
- `our` 变量泄漏 — 用 `my` 隔离

---

## 4. liquid-glass-design — iOS 26 设计系统

**文件**：`skills/liquid-glass-design/SKILL.md`（280 行）
> 注意：此 skill 无 `origin` 字段

### 4.1 设计意图
Apple iOS 26 新设计语言 "Liquid Glass" 的实现指南，覆盖 SwiftUI / UIKit / WidgetKit 三套集成。

### 4.2 SwiftUI 核心模式

```swift
Text("Hello")
    .glassEffect()  // 默认 regular + capsule
```

**自定义**：
- `.regular.tint(.orange).interactive()` — 着色 + 交互
- 形状：`.capsule` / `.rect(cornerRadius:)` / `.circle`
- 按钮样式：`.buttonStyle(.glass)` / `.glassProminent`

### 4.3 GlassEffectContainer（多元素必备）
```swift
GlassEffectContainer(spacing: 40.0) {
    HStack(spacing: 40.0) {
        // 多个 .glassEffect() 视图
    }
}
```
- `spacing` 控制**合并距离** — 越近越融合
- 启用 morphing 和性能优化

### 4.4 高级特性

| 特性 | API | 用途 |
|---|---|---|
| Union | `glassEffectUnion(id:namespace:)` | 多视图合并为单玻璃形状 |
| Morphing | `glassEffectID("pencil", in: namespace)` + `withAnimation` | 出现/消失平滑过渡 |
| 侧栏延伸 | `ScrollView` 内容到容器边缘 | 系统自动处理 under-sidebar |

### 4.5 UIKit 集成
- `UIGlassEffect()` + `UIVisualEffectView`
- `UIGlassContainerEffect` 多元素
- Scroll edge effects：`scrollView.topEdgeEffect.style = .automatic`
- Toolbar：`hidesSharedBackground = true` 退出共享背景

### 4.6 WidgetKit 集成
- **渲染模式检测**：`@Environment(\.widgetRenderingMode)` 区分 `.accented`（tinted）vs 全彩
- **Accent Groups**：`widgetAccentable()` 建立视觉层级
- **Accented 图片**：`widgetAccentedRenderingMode(.monochrome)`
- **容器背景**：`.containerBackground(for: .widget) { ... }`

### 4.7 6 项关键设计决策
| 决策 | 理由 |
|---|---|
| GlassEffectContainer 包裹 | 性能优化 + 启用 morphing |
| `spacing` 参数 | 控制合并距离 |
| `@Namespace` + `glassEffectID` | 平滑 morphing 过渡 |
| `interactive()` 显式 opt-in | 不是所有玻璃都该响应触摸 |
| UIKit UIGlassContainerEffect | 与 SwiftUI 一致 |
| Accented 渲染模式 | 系统在 tinted 主屏应用着色玻璃 |

### 4.8 反模式
- 多个独立 `.glassEffect()` 不包 container
- 嵌套过多玻璃效果（性能 + 视觉）
- 玻璃加到每个视图（应只给交互元素/工具栏/卡片）
- UIKit 忘 `clipsToBounds = true`
- 忽略 accented 模式（破坏 tinted 主屏）
- 玻璃后用不透明背景（破坏半透明）

---

## 5. swift-concurrency-6-2 — Swift 6.2 并发模型

**文件**：`skills/swift-concurrency-6-2/SKILL.md`（217 行）
> 注意：此 skill 无 `origin` 字段

### 5.1 设计意图
Swift 6.2 "Approachable Concurrency" 的采用指南：**默认单线程，并发显式 opt-in**，消除数据竞争。

### 5.2 核心问题：隐式后台卸载

Swift 6.1 及更早，async 函数可能隐式 offload 到后台线程，导致数据竞争：

```swift
// Swift 6.1: ERROR — 'photoProcessor' 跨 actor 风险
@MainActor final class StickerModel {
    func extractSticker(...) async {
        return await photoProcessor.extractSticker(...)  // 跨线程
    }
}

// Swift 6.2: OK — async 默认留在调用 actor
// 同样代码不再有数据竞争
```

### 5.3 四大核心模式

| 模式 | 解决问题 |
|---|---|
| **Isolated Conformances** | MainActor 类型可安全 conform 非 isolated 协议 |
| **Global/Static 保护** | `@MainActor` 标注 static 属性 |
| **MainActor 默认推断** | 免手动 `@MainActor` 注解（opt-in 模式） |
| **`@concurrent` 显式后台** | 真正需要并行时显式 opt-in |

### 5.4 `@concurrent` 使用四步
1. 容器类型标 `nonisolated`
2. 函数加 `@concurrent`
3. 加 `async`
4. 调用处加 `await`

```swift
nonisolated final class PhotoProcessor {
    @concurrent
    static func extractSubject(from data: Data) async -> Sticker { ... }
}
```

> **重要警告**：需启用 SE-0466 + SE-0461 build settings。未启用则此代码有数据竞争。

### 5.5 Isolated Conformance
```swift
extension StickerModel: @MainActor Exportable {  // 注意 @MainActor
    func export() { photoProcessor.exportAsPNG() }
}
```
- 编译器保证 conformance 只在 main actor 使用
- 非 isolated 上下文使用 → 编译错误

### 5.6 6 项关键设计决策

| 决策 | 理由 |
|---|---|
| 默认单线程 | 最自然的代码无数据竞争 |
| Async 留调用 actor | 消除隐式 offload |
| Isolated conformances | 免 unsafe workaround |
| `@concurrent` 显式 | 后台执行是刻意选择 |
| MainActor 默认推断 | 减少 `@MainActor` 样板 |
| Opt-in 采用 | 非破坏性迁移 |

### 5.7 迁移步骤
1. Xcode > Swift Compiler > Concurrency 启用
2. SPM 用 `SwiftSettings` API
3. 用 swift.org/migration 工具
4. 先启用 MainActor defaults（app targets）
5. profile 后给热点加 `@concurrent`
6. 充分测试（数据竞争变编译错误）

### 5.8 反模式
- 给每个 async 函数加 `@concurrent`（多数不需要后台）
- 用 `nonisolated` 压制编译错误而不理解隔离
- 保留 `DispatchQueue` 老模式（actors 提供同样安全）
- 跳过 `model.availability` 检查
- 跟编译器对着干（报数据竞争就是真有问题）
- 假设 async 都在后台跑（6.2 默认留在调用 actor）

---

## 6. plankton-code-quality — 写入时质量强制

**文件**：`skills/plankton-code-quality/SKILL.md`（237 行，`origin: community`）

### 6.1 设计意图
Plankton（credit: @alxfazio）的集成参考。在**每次文件编辑**时跑 formatter + linter + Claude 子进程修复，而非只在 commit 时。

### 6.2 三阶段架构

```
Phase 1: Auto-Format (静默)
├─ ruff format / biome / shfmt / taplo / markdownlint
├─ 静默修复 40-50% 问题
└─ 无输出到主代理

Phase 2: Collect Violations (JSON)
├─ 跑 linters 收集未修复违规
└─ 返回 {line, column, code, message, linter}

Phase 3: Delegate + Verify
├─ spawn claude -p 子进程
├─ 按复杂度路由模型:
│   ├─ Haiku (120s): 格式/import/style
│   ├─ Sonnet (300s): 复杂度/重构
│   └─ Opus (600s): 类型系统/深度推理
├─ 重跑 Phase 1+2 验证
└─ Exit 0 干净 / Exit 2 仍有违规
```

### 6.3 主代理可见性

| 场景 | 代理看到 | Hook exit |
|---|---|---|
| 无违规 | 无 | 0 |
| 全部被子进程修复 | 无 | 0 |
| 子进程后仍有违规 | `[hook] N violation(s) remain` | 2 |
| 建议性（重复/旧工具） | `[hook:advisory] ...` | 0 |

**核心**：主代理只看到子进程修不了的问题，大部分质量透明解决。

### 6.4 配置保护（防规则博弈）
LLM 会修改 `.ruff.toml`/`biome.json` 关闭规则而非修代码。Plankton 三层防护：

1. **PreToolUse hook**：`protect_linter_configs.sh` 阻止编辑 linter 配置
2. **Stop hook**：`stop_config_guardian.sh` 用 `git diff` 检测会话末配置变更
3. **受保护文件列表**：`.ruff.toml`、`biome.json`、`.shellcheckrc`、`.yamllint`、`.hadolint.yaml` 等

### 6.5 包管理器强制
PreToolUse hook 拦截旧包管理器：
- `pip`/`pip3`/`poetry`/`pipenv` → 阻止（用 `uv`）
- `npm`/`yarn`/`pnpm` → 阻止（用 `bun`）
- 例外：`npm audit`/`npm view`/`npm publish`

### 6.6 与 ECC 互补关系

| 关注点 | ECC | Plankton |
|---|---|---|
| 代码质量 | PostToolUse hooks (Prettier, tsc) | PostToolUse hooks (20+ linters + 子进程) |
| 安全扫描 | AgentShield, security-reviewer | bandit (Python), Semgrep (TS) |
| 配置保护 | — | PreToolUse + Stop hook |
| 包管理器 | 检测 + 设置 | 强制（阻止旧 PM） |
| CI 集成 | — | git pre-commit |
| 模型路由 | 手动 `/model opus` | 自动（违规复杂度 → tier） |

### 6.7 推荐组合
1. 装 ECC 作为插件（agents/skills/commands/rules）
2. 加 Plankton hooks 做写入时质量强制
3. 用 AgentShield 做安全审计
4. 用 ECC 的 `verification-loop` 作为 PR 前最后门禁

### 6.8 Hook 冲突处理
ECC 的 Prettier hook 与 Plankton 的 biome formatter 在 JS/TS 冲突：
- **解决**：用 Plankton 时禁用 ECC 的 Prettier PostToolUse hook（Plankton 的 biome 更全面）
- 两者可在不同文件类型共存

### 6.9 配置参考
`config.json` 控制：
- 启用语言（python/shell/yaml/json/toml/dockerfile/markdown/typescript）
- `volume_threshold`：违规数 > 此值自动升级到更高模型 tier
- `subprocess_delegation: false`：跳过 Phase 3，只报告违规

### 6.10 环境变量覆盖
- `HOOK_SKIP_SUBPROCESS=1` — 跳 Phase 3
- `HOOK_SUBPROCESS_TIMEOUT=N` — 覆盖 tier 超时
- `HOOK_DEBUG_MODEL=1` — 日志模型选择
- `HOOK_SKIP_PM=1` — 绕过包管理器强制

### 6.11 ECC v1.8 增强
- **可复制 Hook Profile**：`ECC_HOOK_PROFILE=strict` + `ECC_QUALITY_GATE_FIX=true`
- **Language Gate Table**：TS/JS 用 Biome（Prettier 回退）；Python 用 Ruff；Go 用 gofmt
- **Config Tamper Guard**：标记 `biome.json`/`.eslintrc*`/`tsconfig.json`/`pyproject.toml` 变更需显式 review
- **CI 集成**：本地 hook 命令同样用于 CI
- **健康指标**：edits flagged / 平均修复时间 / 重复违规 / merge 阻止

---

## 跨 skill 协作关系

```
                    ┌─ perl-patterns（编码规范）
                    │         │
                    │         ▼
                    ├─ perl-security（安全模式）
Perl 生态 ──────────┤         │
                    │         ▼
                    └─ perl-testing（测试模式）
                              │
                              ▼
                    tdd-workflow（通用方法论约束）

iOS 平台 ───── liquid-glass-design（UI 设计）
              swift-concurrency-6-2（并发模型）
                       │
                       ▼
              （与 perl-* 同构：语言/平台 + 安全 + 测试）

质量强制 ───── plankton-code-quality（写入时强制）
              │
              ├─ 与 ECC PostToolUse hooks 互补
              ├─ 与 ECC verification-loop 串联为门禁
              └─ 自动模型路由（Haiku/Sonnet/Opus）
```

**协作逻辑**：
- Perl 三件套（patterns/security/testing）形成语言完整闭环
- iOS 两个 skill（liquid-glass + swift-concurrency）覆盖 UI + 并发
- Plankton 作为社区 skill，与 ECC 的 hooks 互补而非重叠
- 所有 skill 共享"FAIL/PASS 双示例 + 反模式 + 速查表"模式

---

## 三篇 Skill 分析的总体回顾

| 篇 | 主题 | skill 数 | 核心贡献 |
|---|---|---|---|
| 一 | 工程方法论 | 6 | backend / TDD / 安全 / 调研 / Go 模式 / Go 测试 |
| 二 | AI 与上下文管理 | 7 | 学习系统 / 检索 / 精简 / 成本 / 选型 / 自主循环 |
| 三 | 语言与平台 | 6 | Perl 三件套 / iOS 设计 / Swift 并发 / 质量强制 |

**19 个 skill 的共性设计模式**：

1. **Frontmatter 三字段**：`name` + `description`（含触发条件）+ `origin`（ECC/community）
2. **When to Activate 首章**：明确激活场景
3. **FAIL/PASS 或 BAD/GOOD 双示例**：反例和正例对照
4. **代码块带语言标记**：```perl / ```swift / ```python
5. **反模式章节**：明确"不要做什么"及原因
6. **速查表**：底部放对照表或命令清单
7. **交叉引用**：`see skill: xxx` 或 `Related` 章节
8. **Remember 结尾**：一行总结强化核心理念

**核心设计哲学**：
- **可执行**：每个 skill 都给可直接复制的代码模板
- **可审计**：TDD-_workflow 强制 Git checkpoint，plankton 强制配置保护
- **可演化**：continuous-learning-v2 把学习变成实时、原子、置信度加权
- **可组合**：skill 之间通过"see skill: xxx"解耦，避免内容重复

---

## 系列文档完结

本系列共 3 篇，覆盖用户指定的 19 个 skill：
1. [ECC Skill 分析（一）：工程方法论篇](./ECC-Skill-分析-一-工程方法论篇.md)
2. [ECC Skill 分析（二）：AI 与上下文管理篇](./ECC-Skill-分析-二-AI与上下文管理篇.md)
3. [ECC Skill 分析（三）：语言与平台篇](./ECC-Skill-分析-三-语言与平台篇.md)（本文）

如需深入分析某个具体 skill 的某一部分（如 plankton 的三阶段实现细节、continuous-learning-v2 的 instinct 数据流、autonomous-loops 的 Ralphinho DAG 实现），可继续指定。
