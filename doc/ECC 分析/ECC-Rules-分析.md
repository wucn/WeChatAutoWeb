# ECC Rules 详细分析

> 生成日期：2026-06-23 ｜ 分析对象：`rules/` 目录下通用规则 + 13 种语言专属规则
> 文件路径：`rules/{common|<lang>}/{coding-style|testing|patterns|hooks|security}.md`

## 概览

ECC 的 `rules/` 是**分层规则系统**：一层通用规则（`common/`）+ 多层语言专属规则（`typescript/`、`golang/`、`python/` 等）。

> **Rules vs Skills 的关键区别**（来自 rules/README.md:94-97）：
> - **Rules** 定义广泛适用的标准、约定、检查清单（"做什么"）
> - **Skills** 提供具体任务的可操作参考材料（"怎么做"）
> - 语言专属规则文件引用相关 skill

## 目录结构

```
rules/
├── README.md                    # 规则系统说明
├── common/                      # 通用规则（必装，语言无关）
│   ├── coding-style.md          # 编码风格（immutability/KISS/DRY/YAGNI）
│   ├── git-workflow.md           # Git 工作流
│   ├── testing.md                # 测试要求（80% 覆盖 + TDD）
│   ├── performance.md            # 性能指南
│   ├── patterns.md               # 设计模式
│   ├── hooks.md                  # Hooks 系统
│   ├── agents.md                 # 代理使用
│   └── security.md               # 安全指南
├── typescript/                  # TypeScript/JavaScript
├── angular/                     # Angular
├── python/                      # Python（含 fastapi.md）
├── golang/                      # Go
├── web/                         # Web/前端（含 design-quality.md, performance.md）
├── swift/                       # Swift
├── php/                         # PHP
├── ruby/                        # Ruby/Rails
├── arkts/                       # HarmonyOS/ArkTS
├── cpp/                         # C++
├── csharp/                      # C#
├── dart/                        # Dart
├── fsharp/                      # F#
├── java/                        # Java
├── kotlin/                      # Kotlin
├── perl/                        # Perl
└── zh/                          # 中文翻译（README + 9 个规则）
```

**统计**：8 个 common 文件 + 13 种语言 × 5 文件 = 约 73 个规则文件 + 中文翻译。

## 每个语言目录的标准 5 文件

| 文件 | 内容 |
|---|---|
| `coding-style.md` | 格式化工具、命名、错误处理模式 |
| `testing.md` | 测试框架、覆盖工具、测试组织 |
| `patterns.md` | 语言专属设计模式 |
| `hooks.md` | PostToolUse hooks（formatter/linter/type checker） |
| `security.md` | 密钥管理、安全扫描工具 |

**每个语言文件首行**（约定）：
```
> This file extends [common/xxx.md](../common/xxx.md) with <Language> specific content.
```

## 通用规则详解（common/）

### 1. coding-style.md — 编码风格

**核心原则**：
- **Immutability (CRITICAL)**：ALWAYS 创建新对象，NEVER mutate
  - ✗ `modify(original, field, value)` — 原地修改
  - ✓ `update(original, field, value)` — 返回新副本
- **KISS**：最简可行方案，避免过早优化
- **DRY**：提取重复逻辑（真实重复才抽象，非投机）
- **YAGNI**：不建未需特性/抽象

**文件组织**：MANY SMALL FILES > FEW LARGE FILES
- 200-400 行典型，800 max
- 按特性/领域组织，非按类型

**命名约定**：
- 变量/函数：`camelCase`
- 布尔：`is/has/should/can` 前缀
- 接口/类型/组件：`PascalCase`
- 常量：`UPPER_SNAKE_CASE`
- 自定义 hook：`camelCase` + `use` 前缀

**代码异味**：深嵌套（用 early return）、magic number、长函数

**完成检查清单**：7 项（可读命名 / <50 行函数 / <800 行文件 / <4 层嵌套 / 错误处理 / 无硬编码 / 不可变）

### 2. testing.md — 测试要求

**强制标准**：
- **最低 80% 覆盖率**
- 三类测试全要：Unit + Integration + E2E
- **TDD 强制工作流**：RED → GREEN → REFACTOR → 验证 80%+

**测试结构**：AAA 模式（Arrange-Act-Assert）

**命名**：描述行为
- `returns empty array when no markets match query`
- `throws error when API key is missing`
- `falls back to substring search when Redis is unavailable`

**失败排查**：用 `tdd-guide` agent / 检查测试隔离 / 验证 mock / 修实现不修测试

### 3. security.md — 安全指南

**提交前强制 8 项检查**：
- 无硬编码密钥
- 所有用户输入已验证
- SQL 注入防护（参数化查询）
- XSS 防护（HTML 清洗）
- CSRF 保护启用
- 认证/授权已验证
- 所有端点限流
- 错误消息不泄露敏感数据

**密钥管理**：永不硬编码，必用环境变量/密钥管理器，启动验证，轮换暴露密钥

**安全响应协议**：发现问题 → STOP → 用 `security-reviewer` agent → 修 CRITICAL → 轮换密钥 → 全代码库排查同类问题

### 4. hooks.md — Hooks 系统

**3 种 Hook 类型**：
- **PreToolUse**：工具执行前（验证、参数修改）
- **PostToolUse**：工具执行后（自动格式化、检查）
- **Stop**：会话结束时（最终验证）

**自动接受权限**：谨慎使用，信任且定义明确的计划才启用，探索性工作禁用，永不 `dangerously-skip-permissions`，用 `allowedTools` 配置

**TodoWrite 最佳实践**：跟踪多步任务 / 验证理解 / 实时引导 / 显示颗粒度实现步骤

### 5. 其他 common 规则
- `git-workflow.md`：提交格式、PR 流程
- `performance.md`：性能指南
- `patterns.md`：设计模式
- `agents.md`：代理使用

## 语言专属规则示例：golang/coding-style.md

**frontmatter**（路径匹配）：
```yaml
---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
```

**内容**：
- 首行：`> This file extends common/coding-style.md with Go specific content.`
- **Formatting**：`gofmt` + `goimports` 强制，无风格争论
- **Design Principles**：Accept interfaces, return structs / 小接口（1-3 方法）
- **Error Handling**：`fmt.Errorf("failed to create user: %w", err)` 带上下文包装
- **Reference**：`See skill: golang-patterns for comprehensive Go idioms and patterns.`

**关键**：语言规则**简短**（30 行），把详细模式委托给 skill。规则说"做什么 + 基本约定"，skill 说"怎么做 + 完整模式库"。

## 规则优先级机制

> **Language-specific rules take precedence**（specific overrides general）

类似 CSS specificity 或 `.gitignore` 优先级：
- `rules/common/` 定义通用默认
- `rules/golang/`、`rules/python/` 等在语言惯用不同时覆盖默认

**覆盖标记**：common 规则中可被覆盖的部分标记：
> **Language note**: This rule may be overridden by language-specific rules for languages where this pattern is not idiomatic.

**示例**（README:127-129）：
- `common/coding-style.md` 推荐 immutability
- `golang/coding-style.md` 可覆盖：Go 惯用 pointer receivers 做结构体 mutation，此处 Go 惯用 mutation 优先

## 安装方式

### 方式 1：安装脚本（推荐）
```bash
./install.sh typescript          # 装通用 + 单语言
./install.sh typescript python   # 装通用 + 多语言
```

### 方式 2：手动安装
```bash
# 创建 ECC 命名空间
mkdir -p ~/.claude/rules/ecc
cp -r rules/common ~/.claude/rules/ecc/
cp -r rules/typescript ~/.claude/rules/ecc/  # 按技术栈选
```

> **重要警告**：复制整个目录，**不要**用 `/*` flatten。common 和语言专属目录有同名文件，flatten 会覆盖 common 规则并破坏 `../common/` 相对引用。

## 添加新语言的标准流程

1. 创建 `rules/<lang>/` 目录
2. 添加 5 个文件（coding-style/testing/patterns/hooks/security）
3. 每个文件首行 `> This file extends [common/xxx.md](../common/xxx.md) with <Language> specific content.`
4. 引用已有 skill 或在 `skills/` 创建新 skill

## .claude/rules/（项目内置规则）

除 `rules/` 目录外，项目根 `.claude/rules/` 还有 2 个规则：
- `everything-claude-code-guardrails.md`：ECC 自身的提交工作流、架构、代码风格约定
- `node.md`：Node.js 专用规则（CommonJS、ESLint、c8 覆盖、hook 开发规范）

这些是**项目自身开发**用的规则，不是给用户安装的通用规则。

## 中文翻译（zh/）

`rules/zh/` 提供 README + 9 个规则的中文版：
- README.md
- coding-style.md / git-workflow.md / development-workflow.md
- hooks.md / patterns.md / performance.md / security.md / testing.md
- code-review.md

## Rules 设计哲学

1. **分层覆盖**：common 定默认，语言专属覆盖非惯用部分（类 CSS specificity）
2. **简短引用**：规则文件简短，详细模式委托给 skill（"Rules 告诉做什么，Skills 告诉怎么做"）
3. **路径匹配**：语言规则 frontmatter 用 `paths` 字段限定适用文件（如 `**/*.go`）
4. **相对引用**：语言文件用 `../common/xxx.md` 引用通用对应
5. **命名空间隔离**：安装到 `~/.claude/rules/ecc/`，避免与非 ECC 规则包冲突
6. **检查清单驱动**：common/security 用 8 项 checklist，common/coding-style 用 7 项
7. **Agent 引用**：规则引用 agent（`security-reviewer`、`tdd-guide`）做执行

## Rules 与 Skill/Agent/Command 的协作

```
rules/common/security.md（标准：8 项检查）
        │
        │ 引用
        ▼
agents/security-reviewer.md（执行体：有 tools/model）
        │
        │ see skill
        ▼
skills/security-review/SKILL.md（知识库：10 个安全域 + FAIL/PASS 示例）
        ▲
        │ 命令入口
        │
commands/security-scan.md（/security-scan 命令）
```

**完整链路**：
- **Rule** 定义"提交前必须 8 项安全检查"（标准）
- **Command** `/security-scan` 触发审查（入口）
- **Agent** `security-reviewer` 执行审查（执行体）
- **Skill** `security-review` 提供 10 个安全域的详细模式（知识库）

## 完结

Rules 分析完成。ECC 的规则系统是"分层 + 覆盖 + 引用 skill"的经典设计，保证通用性同时支持语言特化。如需深入某个语言规则（如 `web/design-quality.md`、`python/fastapi.md`、`arkts/` 全套），可继续指定。
