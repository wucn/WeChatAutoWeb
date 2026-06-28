# ECC Agents & Skills 总览

> 生成日期：2026-06-23 ｜ 来源：`agents/*.md` + `skills/*/SKILL.md` frontmatter
> 统计：60 agents + 231 skills

---

## 如何使用本文档

1. 浏览下面分类列表，找到感兴趣的 agent 或 skill
2. 记下它的名字
3. 告诉我「详细分析 XXX」，我会读取完整文件并输出：frontmatter、完整流程、输出格式、关键设计哲学、与其它组件的协作关系

---

## Part 1: Agents（执行体，共 60 个）

> 每个 agent = `name` + `description` + `tools`（权限白名单）+ `model`（opus/sonnet）
> 定位：有 tools 和 model 的子代理，被主代理 delegate 后激活

### Agent 设计模式速查

```yaml
---
name: xxx
 description: <使用时机说明，主代理据此路由>
tools: ["Read", "Grep", "Glob", "Bash"]  # 最小授权
model: sonnet  # 或 opus
---
```
正文 6 段：Prompt Defense Baseline → 角色定位 → 流程 → 检查清单 → 输出格式 → 判定阈值

### 代码审查 (Reviewers)（21）

| name | model | tools | description |
|---|---|---|---|
| `code-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code. MUST BE USED for all code chang |
| `comment-analyzer` | sonnet | Read,  Grep,  Glob | Analyze code comments for accuracy, completeness, maintainability, and comment rot risk. |
| `cpp-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert C++ code reviewer specializing in memory safety, modern C++ idioms, concurrency, and performance. Use for all C++ code changes. MUST BE USED for C++ projects. |
| `csharp-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert C# code reviewer specializing in .NET conventions, async patterns, security, nullable reference types, and performance. Use for all C# code changes. MUST BE USED for C# proj |
| `database-reviewer` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | PostgreSQL database specialist for query optimization, schema design, security, and performance. Use PROACTIVELY when writing SQL, creating migrations, designing schemas, or troubl |
| `django-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert Django code reviewer specializing in ORM correctness, DRF patterns, migration safety, security misconfigurations, and production-grade Django practices. Use for all Django c |
| `fastapi-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Reviews FastAPI applications for async correctness, dependency injection, Pydantic schemas, security, OpenAPI quality, testing, and production readiness. |
| `flutter-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Flutter and Dart code reviewer. Reviews Flutter code for widget best practices, state management patterns, Dart idioms, performance pitfalls, accessibility, and clean architecture  |
| `fsharp-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert F# code reviewer specializing in functional idioms, type safety, pattern matching, computation expressions, and performance. Use for all F# code changes. MUST BE USED for F# |
| `go-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert Go code reviewer specializing in idiomatic Go, concurrency patterns, error handling, and performance. Use for all Go code changes. MUST BE USED for Go projects. |
| `healthcare-reviewer` | opus | Read,  Grep,  Glob | Reviews healthcare application code for clinical safety, CDSS accuracy, PHI compliance, and medical data integrity. Specialized for EMR/EHR, clinical decision support, and health i |
| `java-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert Java code reviewer for Spring Boot and Quarkus projects. Automatically detects the framework and applies the appropriate review rules. Covers layered architecture, JPA/Panac |
| `kotlin-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Kotlin and Android/KMP code reviewer. Reviews Kotlin code for idiomatic patterns, coroutine safety, Compose best practices, clean architecture violations, and common Android pitfal |
| `mle-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Production machine-learning engineering reviewer for data contracts, feature pipelines, training reproducibility, offline/online evaluation, model serving, monitoring, and rollback |
| `network-config-reviewer` | sonnet | Read,  Grep | Reviews router and switch configurations for security, correctness, stale references, risky change-window commands, and missing operational guardrails. |
| `python-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert Python code reviewer specializing in PEP 8 compliance, Pythonic idioms, type hints, security, and performance. Use for all Python code changes. MUST BE USED for Python proje |
| `rust-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert Rust code reviewer specializing in ownership, lifetimes, error handling, unsafe usage, and idiomatic patterns. Use for all Rust code changes. MUST BE USED for Rust projects. |
| `security-reviewer` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Security vulnerability detection and remediation specialist. Use PROACTIVELY after writing code that handles user input, authentication, API endpoints, or sensitive data. Flags sec |
| `silent-failure-hunter` | sonnet | Read,  Grep,  Glob,  Bash | Review code for silent failures, swallowed errors, bad fallbacks, and missing error propagation. |
| `swift-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert Swift code reviewer specializing in protocol-oriented design, value semantics, ARC memory management, Swift Concurrency, and idiomatic patterns. Use for all Swift code chang |
| `typescript-reviewer` | sonnet | Read,  Grep,  Glob,  Bash | Expert TypeScript/JavaScript code reviewer specializing in type safety, async correctness, Node/web security, and idiomatic patterns. Use for all TypeScript and JavaScript code cha |

### 构建问题修复 (Build Resolvers)（10）

| name | model | tools | description |
|---|---|---|---|
| `build-error-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Build and TypeScript error resolution specialist. Use PROACTIVELY when build fails or type errors occur. Fixes build/type errors only with minimal diffs, no architectural edits. Fo |
| `cpp-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | C++ build, CMake, and compilation error resolution specialist. Fixes build errors, linker issues, and template errors with minimal changes. Use when C++ builds fail. |
| `dart-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Dart/Flutter build, analysis, and dependency error resolution specialist. Fixes `dart analyze` errors, Flutter compilation failures, pub dependency conflicts, and build_runner issu |
| `django-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Django/Python build, migration, and dependency error resolution specialist. Fixes pip/Poetry errors, migration conflicts, import errors, Django configuration issues, and collectsta |
| `go-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Go build, vet, and compilation error resolution specialist. Fixes build errors, go vet issues, and linter warnings with minimal changes. Use when Go builds fail. |
| `java-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Java/Maven/Gradle build, compilation, and dependency error resolution specialist. Automatically detects Spring Boot or Quarkus and applies framework-specific fixes. Fixes build err |
| `kotlin-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Kotlin/Gradle build, compilation, and dependency error resolution specialist. Fixes build errors, Kotlin compiler errors, and Gradle issues with minimal changes. Use when Kotlin bu |
| `pytorch-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | PyTorch runtime, CUDA, and training error resolution specialist. Fixes tensor shape mismatches, device errors, gradient issues, DataLoader problems, and mixed precision failures wi |
| `rust-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Rust build, compilation, and dependency error resolution specialist. Fixes cargo build errors, borrow checker issues, and Cargo.toml problems with minimal changes. Use when Rust bu |
| `swift-build-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Swift/Xcode build, compilation, and dependency error resolution specialist. Fixes swift build errors, Xcode build failures, SPM dependency issues, and code signing problems with mi |

### 架构与规划 (Architecture)（8）

| name | model | tools | description |
|---|---|---|---|
| `a11y-architect` | sonnet | Read,  Write,  Edit,  Grep,  Glob | Accessibility Architect specializing in WCAG 2.2 compliance for Web and Native platforms. Use PROACTIVELY when designing UI components, establishing design systems, or auditing cod |
| `architect` | opus | Read,  Grep,  Glob | Software architecture specialist for system design, scalability, and technical decision-making. Use PROACTIVELY when planning new features, refactoring large systems, or making arc |
| `chief-of-staff` | opus | Read,  Grep,  Glob,  Bash,  Edit,  Write | Personal communication chief of staff that triages email, Slack, LINE, and Messenger. Classifies messages into 4 tiers (skip/info_only/meeting_info/action_required), generates draf |
| `code-architect` | sonnet | Read,  Grep,  Glob,  Bash | Designs feature architectures by analyzing existing codebase patterns and conventions, then providing implementation blueprints with concrete files, interfaces, data flow, and buil |
| `gan-planner` | opus | Read,  Write,  Grep,  Glob | GAN Harness — Planner agent. Expands a one-line prompt into a full product specification with features, sprints, evaluation criteria, and design direction. |
| `homelab-architect` | sonnet | Read,  Grep | Designs home and small-lab network plans from hardware inventory, goals, and operator experience level, with safe staged changes and rollback guidance. |
| `network-architect` | sonnet | Read,  Grep | Designs enterprise or multi-site network architecture from requirements, using existing network skills for focused routing, validation, automation, and troubleshooting detail. |
| `planner` | opus | Read,  Grep,  Glob | Expert planning specialist for complex features and refactoring. Use PROACTIVELY when users request feature implementation, architectural changes, or complex refactoring. Automatic |

### 测试与评估 (Testing)（5）

| name | model | tools | description |
|---|---|---|---|
| `e2e-runner` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | End-to-end testing specialist using Vercel Agent Browser (preferred) with Playwright fallback. Use PROACTIVELY for generating, maintaining, and running E2E tests. Manages test jour |
| `gan-evaluator` | opus | Read,  Write,  Bash,  Grep,  Glob | GAN Harness — Evaluator agent. Tests the live running application via Playwright, scores against rubric, and provides actionable feedback to the Generator. |
| `gan-generator` | opus | Read,  Write,  Edit,  Bash,  Grep,  Glob | GAN Harness — Generator agent. Implements features according to the spec, reads evaluator feedback, and iterates until quality threshold is met. |
| `pr-test-analyzer` | sonnet | Read,  Grep,  Glob,  Bash | Review pull request test coverage quality and completeness, with emphasis on behavioral coverage and real bug prevention. |
| `tdd-guide` | sonnet | Read,  Write,  Edit,  Bash,  Grep | Test-Driven Development specialist enforcing write-tests-first methodology. Use PROACTIVELY when writing new features, fixing bugs, or refactoring code. Ensures 80%+ test coverage. |

### 工程效能 (Engineering)（8）

| name | model | tools | description |
|---|---|---|---|
| `code-explorer` | sonnet | Read,  Grep,  Glob | Deeply analyzes existing codebase features by tracing execution paths, mapping architecture layers, and documenting dependencies to inform new development. |
| `code-simplifier` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Simplifies and refines code for clarity, consistency, and maintainability while preserving behavior. Focus on recently modified code unless instructed otherwise. |
| `conversation-analyzer` | sonnet | Read,  Grep | Use this agent when analyzing conversation transcripts to find behaviors worth preventing with hooks. Triggered by /hookify without arguments. |
| `harness-optimizer` | sonnet | Read,  Grep,  Glob,  Bash,  Edit | Analyze and improve the local agent harness configuration for reliability, cost, and throughput. |
| `loop-operator` | sonnet | Read,  Grep,  Glob,  Bash,  Edit | Operate autonomous agent loops, monitor progress, and intervene safely when loops stall. |
| `performance-optimizer` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Performance analysis and optimization specialist. Use PROACTIVELY for identifying bottlenecks, optimizing slow code, reducing bundle sizes, and improving runtime performance. Profi |
| `refactor-cleaner` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Dead code cleanup and consolidation specialist. Use PROACTIVELY for removing unused code, duplicates, and refactoring. Runs analysis tools (knip, depcheck, ts-prune) to identify de |
| `type-design-analyzer` | sonnet | Read,  Grep,  Glob | Analyze type design for encapsulation, invariant expression, usefulness, and enforcement. |

### 文档 (Docs)（2）

| name | model | tools | description |
|---|---|---|---|
| `doc-updater` | haiku | Read,  Write,  Edit,  Bash,  Grep,  Glob | Documentation and codemap specialist. Use PROACTIVELY for updating codemaps and documentation. Runs /update-codemaps and /update-docs, generates docs/CODEMAPS/*, updates READMEs an |
| `docs-lookup` | sonnet | Read,  Grep,  mcp__context7__resolve-library-id,  mcp__context7__query-docs | When the user asks how to use a library, framework, or API or needs up-to-date code examples, use Context7 MCP to fetch current documentation and return answers with examples. Invo |

### 开源工具 (OpenSource)（3）

| name | model | tools | description |
|---|---|---|---|
| `opensource-forker` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Fork any project for open-sourcing. Copies files, strips secrets and credentials (20+ patterns), replaces internal references with placeholders, generates .env.example, and cleans  |
| `opensource-packager` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | Generate complete open-source packaging for a sanitized project. Produces CLAUDE.md, setup.sh, README.md, LICENSE, CONTRIBUTING.md, and GitHub issue templates. Makes any repo immed |
| `opensource-sanitizer` | sonnet | Read,  Grep,  Glob,  Bash | Verify an open-source fork is fully sanitized before release. Scans for leaked secrets, PII, internal references, and dangerous files using 20+ regex patterns. Generates a PASS/FAI |

### 业务内容 (Business)（1）

| name | model | tools | description |
|---|---|---|---|
| `seo-specialist` | sonnet | Read,  Grep,  Glob,  WebSearch,  WebFetch | SEO specialist for technical SEO audits, on-page optimization, structured data, Core Web Vitals, and content/keyword mapping. Use for site audits, meta tag reviews, schema markup,  |

### 行业专用 (Domain)（1）

| name | model | tools | description |
|---|---|---|---|
| `harmonyos-app-resolver` | sonnet | Read,  Write,  Edit,  Bash,  Grep,  Glob | HarmonyOS application development expert specializing in ArkTS and ArkUI. Reviews code for V2 state management compliance, Navigation routing patterns, API usage, and performance b |

### 其他 (Other)（1）

| name | model | tools | description |
|---|---|---|---|
| `network-troubleshooter` | sonnet | Read,  Bash,  Grep | Diagnoses network connectivity, routing, DNS, interface, and policy symptoms with a read-only OSI-layer workflow and evidence-backed root cause summary. |

---

## Part 2: Skills（知识包，共 231 个）

> 每个 skill = `name` + `description` + `origin`（ECC/community）
> 定位：无 tools、无 model 的知识库，被 agent 或主代理按需引用

### Skill 设计模式速查

```yaml
---
name: xxx
description: <什么时候激活 + 提供什么知识>
origin: ECC  # 或 community
---
```
正文典型章节：When to Activate → Core Principles → Patterns → Best Practices → Checklist → Related

### AI 代理工程 (Agentic Engineering)（15）

| name | origin | description |
|---|---|---|
| `agent-harness-construction` | ECC | Design and optimize AI agent action spaces, tool definitions, and observation formatting for higher completion rates. |
| `agent-introspection-debugging` | ECC | Structured self-debugging workflow for AI agent failures using capture, diagnosis, contained recovery, and introspection reports. |
| `agent-payment-x402` | community | Add x402 payment execution to AI agents with per-task budgets, spending controls, and non-custodial wallets. Supports Base through agentwallet-sdk and X Layer through OKX Payments / OKX Agent Payments |
| `agent-sort` | ECC | Build an evidence-backed ECC install plan for a specific repo by sorting skills, commands, rules, hooks, and extras into DAILY vs LIBRARY buckets using parallel repo-aware review passes. Use when ECC  |
| `agentic-os` | ECC | Build persistent multi-agent operating systems on Claude Code. Covers kernel architecture, specialist agents, slash commands, file-based memory, scheduled automation, and state management without exte |
| `autonomous-agent-harness` | ECC | Transform Claude Code into a fully autonomous agent system with persistent memory, scheduled operations, computer use, and task queuing. Replaces standalone agent frameworks (Hermes, AutoGPT) by lever |
| `autonomous-loops` | ECC | Patterns and architectures for autonomous Claude Code loops — from simple sequential pipelines to RFC-driven multi-agent DAG systems. |
| `blueprint` | community | >- |
| `claude-devfleet` | community | Orchestrate multi-agent coding tasks via Claude DevFleet — plan projects, dispatch parallel agents in isolated worktrees, monitor progress, and read structured reports. |
| `council` | ECC | Convene a four-voice council for ambiguous decisions, tradeoffs, and go/no-go calls. Use when multiple valid paths exist and you need structured disagreement before choosing. |
| `dmux-workflows` | ECC | Multi-agent orchestration using dmux (tmux pane manager for AI agents). Patterns for parallel agent workflows across Claude Code, Codex, OpenCode, and other harnesses. Use when running multiple agent  |
| `enterprise-agent-ops` | ECC | Operate long-lived agent workloads with observability, security boundaries, and lifecycle management. |
| `llm-trading-agent-security` | ECC direct-port adaptation | Security patterns for autonomous trading agents with wallet or transaction authority. Covers prompt injection, spend limits, pre-send simulation, circuit breakers, MEV protection, and key handling. |
| `safety-guard` | ECC | Use this skill to prevent destructive operations when working on production systems or running agents autonomously. |
| `workspace-surface-audit` | ECC | Audit the active repo, MCP servers, plugins, connectors, env surfaces, and harness setup, then recommend the highest-value ECC-native skills, hooks, agents, and operator workflows. Use when the user w |

### 测试与评估 (Testing)（25）

| name | origin | description |
|---|---|---|
| `agent-architecture-audit` | oh-my-agent-check | Full-stack diagnostic for agent and LLM applications. Audits the 12-layer agent stack for wrapper regression, memory pollution, tool discipline failures, hidden repair loops, and rendering corruption. |
| `agent-eval` | ECC | Head-to-head comparison of coding agents (Claude Code, Aider, Codex, etc.) on custom tasks with pass rate, cost, time, and consistency metrics |
| `agentic-engineering` | ECC | Operate as an agentic engineer using eval-first execution, decomposition, and cost-aware model routing. |
| `ai-regression-testing` | ECC | Regression testing strategies for AI-assisted development. Sandbox-mode API testing without database dependencies, automated bug-check workflows, and patterns to catch AI blind spots where the same mo |
| `benchmark` | ECC | Use this skill to measure performance baselines, detect regressions before/after PRs, and compare stack alternatives. |
| `blender-motion-state-inspection` | ECC | Use this skill when inspecting Blender characters, rigs, poses, animation retargeting, ground contact, facing direction, or model-vs-motion alignment where screenshots alone are not enough. |
| `browser-qa` | ECC | Use this skill to automate visual testing and UI interaction verification using browser automation after deploying features. |
| `canary-watch` | ECC | Use this skill to monitor and verify a deployed URL after releases — checks HTTP endpoints, SSE streams, static assets, console errors, and performance regressions after deploys, merges, or dependency |
| `click-path-audit` | community | Trace every user-facing button/touchpoint through its full state change sequence to find bugs where functions individually work but cancel each other out, produce wrong final state, or leave the UI in |
| `continuous-agent-loop` | ECC | Patterns for continuous autonomous agent loops with quality gates, evals, and recovery controls. |
| `cpp-testing` | ECC | Use only when writing/updating/fixing C++ tests, configuring GoogleTest/CTest, diagnosing failing or flaky tests, or adding coverage/sanitizers. |
| `e2e-testing` | ECC | Playwright E2E testing patterns, Page Object Model, configuration, CI/CD integration, artifact management, and flaky test strategies. |
| `eval-harness` | ECC | Formal evaluation framework for Claude Code sessions implementing eval-driven development (EDD) principles |
| `gan-style-harness` | ECC-community | GAN-inspired Generator-Evaluator agent harness for building high-quality applications autonomously. Based on Anthropic's March 2026 harness design paper. |
| `healthcare-eval-harness` | Health1 Super Speciality Hospitals — contributed by Dr. Keyur Patel | Patient safety evaluation harness for healthcare application deployments. Automated test suites for CDSS accuracy, PHI exposure, clinical workflow integrity, and integration compliance. Blocks deploym |
| `iterative-retrieval` | ECC | Pattern for progressively refining context retrieval to solve the subagent context problem |
| `knowledge-ops` | ECC | Knowledge base management, ingestion, sync, and retrieval across multiple storage layers (local files, MCP memory, vector stores, Git repos). Use when the user wants to save, organize, sync, deduplica |
| `mle-workflow` | ECC | Production machine-learning engineering workflow for data contracts, reproducible training, model evaluation, deployment, monitoring, and rollback. Use when building, reviewing, or hardening ML system |
| `quarkus-tdd` | ECC | Test-driven development for Quarkus 3.x LTS using JUnit 5, Mockito, REST Assured, Camel testing, and JaCoCo. Use when adding features, fixing bugs, or refactoring event-driven services. |
| `pubmed-database` | community | Direct PubMed and NCBI E-utilities search workflows for biomedical literature, MeSH queries, PMID lookup, citation retrieval, and API-backed literature monitoring. |
| `scholar-evaluation` | community | Structured scholarly-work evaluation for papers, proposals, literature reviews, methods sections, evidence quality, citation support, and research-writing feedback. |
| `skill-stocktake` | ECC | Use when auditing Claude skills and commands for quality. Supports Quick Scan (changed skills only) and Full Stocktake modes with sequential subagent batch evaluation. |
| `springboot-tdd` | ECC | Test-driven development for Spring Boot using JUnit 5, Mockito, MockMvc, Testcontainers, and JaCoCo. Use when adding features, fixing bugs, or refactoring. |
| `tdd-workflow` | ECC | Use this skill when writing new features, fixing bugs, or refactoring code. Enforces test-driven development with 80%+ coverage including unit, integration, and E2E tests. |
| `windows-desktop-e2e` | ECC | E2E testing for Windows native desktop apps (WPF, WinForms, Win32/MFC, Qt) using pywinauto and Windows UI Automation. |

### 语言/前后端模式 (Languages & Frontend/Backend)（58）

| name | origin | description |
|---|---|---|
| `android-clean-architecture` | ECC | Clean Architecture patterns for Android and Kotlin Multiplatform projects — module structure, dependency rules, UseCases, Repositories, and data layer patterns. |
| `angular-developer` | ECC | Generates Angular code and provides architectural guidance. Trigger when creating projects, components, or services, or for best practices on reactivity (signals, linkedSignal, resource), forms, depen |
| `api-connector-builder` | ECC direct-port adaptation | Build a new API connector or provider by matching the target repo's existing integration pattern exactly. Use when adding one more integration without inventing a second architecture. |
| `api-design` | ECC | REST API design patterns including resource naming, status codes, pagination, filtering, error responses, versioning, and rate limiting for production APIs. |
| `compose-multiplatform-patterns` | ECC | Compose Multiplatform and Jetpack Compose patterns for KMP projects — state management, navigation, theming, performance, and platform-specific UI. |
| `cpp-coding-standards` | ECC | C++ coding standards based on the C++ Core Guidelines (isocpp.github.io). Use when writing, reviewing, or refactoring C++ code to enforce modern, safe, and idiomatic practices. |
| `csharp-testing` | ECC | C# and .NET testing patterns with xUnit, FluentAssertions, mocking, integration tests, and test organization best practices. |
| `dart-flutter-patterns` | ECC | Production-ready Dart and Flutter patterns covering null safety, immutable state, async composition, widget architecture, popular state management frameworks (BLoC, Riverpod, Provider), GoRouter navig |
| `dashboard-builder` | ECC direct-port adaptation | Build monitoring dashboards that answer real operator questions for Grafana, SigNoz, and similar platforms. Use when turning metrics into a working dashboard instead of a vanity board. |
| `defi-amm-security` | ECC direct-port adaptation | Security checklist for Solidity AMM contracts, liquidity pools, and swap flows. Covers reentrancy, CEI ordering, donation or inflation attacks, oracle manipulation, slippage, admin controls, and integ |
| `design-system` | ECC | Use this skill to generate or audit design systems, check visual consistency, and review PRs that touch styling. |
| `documentation-lookup` | ECC | Use up-to-date library and framework docs via Context7 MCP instead of training data. Activates for setup questions, API references, code examples, or when the user names a framework (e.g. React, Next. |
| `error-handling` | ECC | Patterns for robust error handling across TypeScript, Python, and Go. Covers typed errors, error boundaries, retries, circuit breakers, and user-facing error messages. |
| `flox-environments` | Flox | Create reproducible, cross-platform development environments with Flox — a declarative environment manager built on Nix. ALWAYS use this skill when the user needs to: set up a project with system-leve |
| `flutter-dart-code-review` | ECC | Library-agnostic Flutter/Dart code review checklist covering widget best practices, state management patterns (BLoC, Riverpod, Provider, GetX, MobX, Signals), Dart idioms, performance, accessibility,  |
| `foundation-models-on-device` | - | Apple FoundationModels framework for on-device LLM — text generation, guided generation with @Generable, tool calling, and snapshot streaming in iOS 26+. |
| `frontend-patterns` | ECC | Frontend development patterns for React, Next.js, state management, performance optimization, and UI best practices. |
| `fsharp-testing` | ECC | F# testing patterns with xUnit, FsUnit, Unquote, FsCheck property-based testing, integration tests, and test organization best practices. |
| `golang-patterns` | ECC | Idiomatic Go patterns, best practices, and conventions for building robust, efficient, and maintainable Go applications. |
| `golang-testing` | ECC | Go testing patterns including table-driven tests, subtests, benchmarks, fuzzing, and test coverage. Follows TDD methodology with idiomatic Go practices. |
| `hexagonal-architecture` | ECC | Design, implement, and refactor Ports & Adapters systems with clear domain boundaries, dependency inversion, and testable use-case orchestration across TypeScript, Java, Kotlin, and Go services. |
| `homelab-vlan-segmentation` | community | Segmenting home networks into VLANs for IoT, guest, trusted, and server traffic using UniFi, pfSense/OPNsense, and MikroTik — including switch trunk config, firewall rules, and wireless SSID mapping. |
| `java-coding-standards` | ECC | Java coding standards for Spring Boot and Quarkus services: naming, immutability, Optional usage, streams, exceptions, generics, CDI, reactive patterns, and project layout. Automatically applies frame |
| `kotlin-coroutines-flows` | ECC | Kotlin Coroutines and Flow patterns for Android and KMP — structured concurrency, Flow operators, StateFlow, error handling, and testing. |
| `kotlin-exposed-patterns` | ECC | JetBrains Exposed ORM patterns including DSL queries, DAO pattern, transactions, HikariCP connection pooling, Flyway migrations, and repository pattern. |
| `kotlin-ktor-patterns` | ECC | Ktor server patterns including routing DSL, plugins, authentication, Koin DI, kotlinx.serialization, WebSockets, and testApplication testing. |
| `kotlin-patterns` | ECC | Idiomatic Kotlin patterns, best practices, and conventions for building robust, efficient, and maintainable Kotlin applications with coroutines, null safety, and DSL builders. |
| `kotlin-testing` | ECC | Kotlin testing patterns with Kotest, MockK, coroutine testing, property-based testing, and Kover coverage. Follows TDD methodology with idiomatic Kotlin practices. |
| `laravel-plugin-discovery` | ECC | Discover and evaluate Laravel packages via LaraPlugins.io MCP. Use when the user wants to find plugins, check package health, or assess Laravel/PHP compatibility. |
| `laravel-tdd` | ECC | Test-driven development for Laravel with PHPUnit and Pest, factories, database testing, fakes, and coverage targets. |
| `liquid-glass-design` | - | iOS 26 Liquid Glass design system — dynamic glass material with blur, reflection, and interactive morphing for SwiftUI, UIKit, and WidgetKit. |
| `mcp-server-patterns` | ECC | Build MCP servers with Node/TypeScript SDK — tools, resources, prompts, Zod validation, stdio vs Streamable HTTP. Use Context7 or official MCP docs for latest API. |
| `motion-advanced` | - | Advanced motion patterns for React / Next.js — drag & drop, gestures, text animations, SVG path drawing, custom hooks, imperative sequences (useAnimate), loaders, and the full API decision tree. Requi |
| `motion-foundations` | - | Motion tokens, spring presets, performance rules, device adaptation, accessibility enforcement, and SSR safety for React / Next.js using motion/react. Foundation layer — all other motion skills depend |
| `motion-patterns` | - | Production-ready animation patterns for React / Next.js — button, modal, toast, stagger, page transitions, exit animations, scroll, and layout — built on motion-foundations tokens and springs. |
| `motion-ui` | ECC | Production-ready UI motion system for React/Next.js. Use when implementing animations, transitions, or motion patterns. |
| `nestjs-patterns` | ECC | NestJS architecture patterns for modules, controllers, providers, DTO validation, guards, interceptors, config, and production-grade TypeScript backends. |
| `netmiko-ssh-automation` | community | Safe Python Netmiko patterns for read-only collection, bounded batch SSH, TextFSM parsing, guarded config changes, timeouts, and network automation error handling. |
| `nodejs-keccak256` | ECC direct-port adaptation | Prevent Ethereum hashing bugs in JavaScript and TypeScript. Node's sha3-256 is NIST SHA3, not Ethereum Keccak-256, and silently breaks selectors, signatures, storage slots, and address derivation. |
| `perl-patterns` | ECC | Modern Perl 5.36+ idioms, best practices, and conventions for building robust, maintainable Perl applications. |
| `perl-security` | ECC | Comprehensive Perl security covering taint mode, input validation, safe process execution, DBI parameterized queries, web security (XSS/SQLi/CSRF), and perlcritic security policies. |
| `perl-testing` | ECC | Perl testing patterns using Test2::V0, Test::More, prove runner, mocking, coverage with Devel::Cover, and TDD methodology. |
| `prisma-patterns` | ECC | Prisma ORM patterns for TypeScript backends — schema design, query optimization, transactions, pagination, and critical traps like updateMany returning count not records, $transaction timeouts, migrat |
| `python-patterns` | ECC | Pythonic idioms, PEP 8 standards, type hints, and best practices for building robust, efficient, and maintainable Python applications. |
| `python-testing` | ECC | Python testing strategies using pytest, TDD methodology, fixtures, mocking, parametrization, and coverage requirements. |
| `quarkus-patterns` | ECC | Quarkus 3.x LTS architecture patterns with Camel for messaging, RESTful API design, CDI services, data access with Panache, and async processing. Use for Java Quarkus backend work with event-driven ar |
| `remotion-video-creation` | - | Best practices for Remotion - Video creation in React. 29 domain-specific rules covering 3D, animations, audio, captions, charts, transitions, and more. |
| `rust-patterns` | ECC | Idiomatic Rust patterns, ownership, error handling, traits, concurrency, and best practices for building safe, performant applications. |
| `rust-testing` | ECC | Rust testing patterns including unit tests, integration tests, async testing, property-based testing, mocking, and coverage. Follows TDD methodology. |
| `gget` | community | gget CLI and Python workflow for quick genomic database queries, sequence lookup, BLAST-style searches, enrichment checks, and reproducible bioinformatics evidence logs. |
| `springboot-patterns` | ECC | Spring Boot architecture patterns, REST API design, layered services, data access, caching, async processing, and logging. Use for Java Spring Boot backend work. |
| `springboot-security` | ECC | Spring Security best practices for authn/authz, validation, CSRF, secrets, headers, rate limiting, and dependency security in Java Spring Boot services. |
| `swift-actor-persistence` | ECC | Thread-safe data persistence in Swift using actors — in-memory cache with file-backed storage, eliminating data races by design. |
| `swift-concurrency-6-2` | - | Swift 6.2 Approachable Concurrency — single-threaded by default, @concurrent for explicit background offloading, isolated conformances for main actor types. |
| `swift-protocol-di-testing` | ECC | Protocol-based dependency injection for testable Swift code — mock file system, network, and external APIs using focused protocols and Swift Testing. |
| `swiftui-patterns` | - | SwiftUI architecture patterns, state management with @Observable, view composition, navigation, performance optimization, and modern iOS/macOS UI best practices. |
| `tinystruct-patterns` | ECC | Expert guidance for developing with the tinystruct Java framework. Use when working on the tinystruct codebase or any project built on tinystruct — including creating Application classes, @Action-mapp |
| `ui-to-vue` | community | Use when the user has UI screenshots or design exports that need batch conversion into Vue 3 components, especially with Vant, Element Plus, or Ant Design Vue. |

### 框架模式 (Framework Patterns)（12）

| name | origin | description |
|---|---|---|
| `backend-patterns` | ECC | Backend architecture patterns, API design, database optimization, and server-side best practices for Node.js, Express, and Next.js API routes. |
| `bun-runtime` | ECC | Bun as runtime, package manager, bundler, and test runner. When to choose Bun vs Node, migration notes, and Vercel support. |
| `cisco-ios-patterns` | community | Cisco IOS and IOS-XE review patterns for show commands, config hierarchy, wildcard masks, ACL placement, interface hygiene, and safe change-window verification. |
| `database-migrations` | ECC | Database migration best practices for schema changes, data migrations, rollbacks, and zero-downtime deployments across PostgreSQL, MySQL, and common ORMs (Prisma, Drizzle, Kysely, Django, TypeORM, gol |
| `django-celery` | ECC | Django + Celery async task patterns — configuration, task design, beat scheduling, retries, canvas workflows, monitoring, and testing. Use when adding background jobs, scheduled tasks, or async proces |
| `django-patterns` | ECC | Django architecture patterns, REST API design with DRF, ORM best practices, caching, signals, middleware, and production-grade Django apps. |
| `django-security` | ECC | Django security best practices, authentication, authorization, CSRF protection, SQL injection prevention, XSS prevention, and secure deployment configurations. |
| `django-tdd` | ECC | Django testing strategies with pytest-django, TDD methodology, factory_boy, mocking, coverage, and testing Django REST Framework APIs. |
| `django-verification` | ECC | Verification loop for Django projects: migrations, linting, tests with coverage, security scans, and deployment readiness checks before release or PR. |
| `dotnet-patterns` | ECC | Idiomatic C# and .NET patterns, conventions, dependency injection, async/await, and best practices for building robust, maintainable .NET applications. |
| `fastapi-patterns` | community | FastAPI patterns for async APIs, dependency injection, Pydantic request and response models, OpenAPI docs, tests, security, and production readiness. |
| `nextjs-turbopack` | ECC | Next.js 16+ and Turbopack — incremental bundling, FS caching, dev speed, and when to use Turbopack vs webpack. |

### 安全与 Web3 (Security/Web3)（5）

| name | origin | description |
|---|---|---|
| `evm-token-decimals` | ECC direct-port adaptation | Prevent silent decimal mismatch bugs across EVM chains. Covers runtime decimal lookup, chain-aware caching, bridged-token precision drift, and safe normalization for bots, dashboards, and DeFi tools. |
| `gateguard` | community | Fact-forcing gate that blocks Edit/Write/Bash (including MultiEdit) and demands concrete investigation (importers, data schemas, user instruction) before allowing the action. Measurably improves outpu |
| `security-scan` | ECC | Scan your Claude Code configuration (.claude/ directory) for security vulnerabilities, misconfigurations, and injection risks using AgentShield. Checks CLAUDE.md, settings.json, MCP servers, hooks, an |
| `skill-comply` | ECC | Visualize whether skills, rules, and agent definitions are actually followed — auto-generates scenarios at 3 prompt strictness levels, runs agents, classifies behavioral sequences, and reports complia |
| `x-api` | ECC | X/Twitter API integration for posting tweets, threads, reading timelines, search, and analytics. Covers OAuth auth patterns, rate limits, and platform-native content posting. Use when the user wants t |

### DevOps 与成本 (DevOps & Cost)（11）

| name | origin | description |
|---|---|---|
| `automation-audit-ops` | ECC | Evidence-first automation inventory and overlap audit workflow for ECC. Use when the user wants to know which jobs, hooks, connectors, MCP servers, or wrappers are live, broken, redundant, or missing  |
| `continuous-learning-v2` | ECC | Instinct-based learning system that observes sessions via hooks, creates atomic instincts with confidence scoring, and evolves them into skills/commands/agents. v2.1 adds project-scoped instincts to p |
| `continuous-learning` | ECC | [DEPRECATED - use continuous-learning-v2] Legacy v1 stop-hook skill extractor. v2 is a strict superset with instinct-based, project-scoped, hook-reliable learning. Do not invoke v1; route continuous l |
| `cost-aware-llm-pipeline` | ECC | Cost optimization patterns for LLM API usage — model routing by task complexity, budget tracking, retry logic, and prompt caching. |
| `cost-tracking` | community | Track and report Claude Code token usage, spending, and budgets from a local cost-tracking database. Use when the user asks about costs, spending, usage, tokens, budgets, or cost breakdowns by project |
| `deployment-patterns` | ECC | Deployment workflows, CI/CD pipeline patterns, Docker containerization, health checks, rollback strategies, and production readiness checklists for web applications. |
| `docker-patterns` | ECC | Docker and Docker Compose patterns for local development, container security, networking, volume strategies, and multi-service orchestration. |
| `laravel-security` | ECC | Laravel security best practices for authn/authz, validation, CSRF, mass assignment, file uploads, secrets, rate limiting, and secure deployment. |
| `laravel-verification` | ECC | Verification loop for Laravel projects: env checks, linting, static analysis, tests with coverage, security scans, and deployment readiness. |
| `network-config-validation` | community | Pre-deployment checks for router and switch configuration, including dangerous commands, duplicate addresses, subnet overlaps, stale references, management-plane risk, and IOS-style security hygiene. |
| `uncloud` | ECC | Use when managing an Uncloud cluster — deploying services, configuring Caddy ingress, adding static proxy routes for non-cluster devices, publishing ports, scaling, inspecting logs, or managing machin |

### 数据库 (Database)（4）

| name | origin | description |
|---|---|---|
| `clickhouse-io` | ECC | ClickHouse database patterns, query optimization, analytics, and data engineering best practices for high-performance analytical workloads. |
| `mysql-patterns` | ECC | MySQL and MariaDB schema, query, indexing, transaction, replication, and connection-pool patterns for production backends. |
| `postgres-patterns` | ECC | PostgreSQL database patterns for query optimization, schema design, indexing, and security. Based on Supabase best practices. |
| `redis-patterns` | ECC | Redis data structure patterns, caching strategies, distributed locks, rate limiting, pub/sub, and connection management for production applications. |

### 业务运营 (Business Ops)（8）

| name | origin | description |
|---|---|---|
| `carrier-relationship-management` | ECC | > |
| `customer-billing-ops` | ECC | Operate customer billing workflows such as subscriptions, refunds, churn triage, billing-portal recovery, and plan analysis using connected billing tools like Stripe. Use when the user needs to help a |
| `customs-trade-compliance` | ECC | > |
| `ecc-tools-cost-audit` | ECC | Evidence-first ECC Tools burn and billing audit workflow. Use when investigating runaway PR creation, quota bypass, premium-model leakage, duplicate jobs, or GitHub App cost spikes in the ECC Tools re |
| `energy-procurement` | ECC | > |
| `finance-billing-ops` | ECC | Evidence-first revenue, pricing, refunds, team-billing, and billing-model truth workflow for ECC. Use when the user wants a sales snapshot, pricing comparison, duplicate-charge diagnosis, or code-back |
| `healthcare-cdss-patterns` | Health1 Super Speciality Hospitals — contributed by Dr. Keyur Patel | Clinical Decision Support System (CDSS) development patterns. Drug interaction checking, dose validation, clinical scoring (NEWS2, qSOFA), alert severity classification, and integration into EMR workf |
| `uspto-database` | community | USPTO patent and trademark data workflow for official record lookup, PatentSearch queries, TSDR checks, assignment data, and reproducible IP research logs. |

### 内容创作 (Content)（7）

| name | origin | description |
|---|---|---|
| `article-writing` | ECC | Write articles, guides, blog posts, tutorials, newsletter issues, and other long-form content in a distinctive voice derived from supplied examples or brand guidance. Use when the user wants polished  |
| `brand-voice` | ECC | Build a source-derived writing style profile from real posts, essays, launch notes, docs, or site copy, then reuse that profile across content, outreach, and social workflows. Use when the user wants  |
| `content-engine` | ECC | Create platform-native content systems for X, LinkedIn, TikTok, YouTube, newsletters, and repurposed multi-platform campaigns. Use when the user wants social posts, threads, scripts, content calendars |
| `crosspost` | ECC | Multi-platform content distribution across X, LinkedIn, Threads, and Bluesky. Adapts content per platform using content-engine patterns. Never posts identical content cross-platform. Use when the user |
| `email-ops` | ECC | Evidence-first mailbox triage, drafting, send verification, and sent-mail-safe follow-up workflow for ECC. Use when the user wants to organize email, draft or send through the real mail surface, or pr |
| `fal-ai-media` | ECC | Unified media generation via fal.ai MCP — image, video, and audio. Covers text-to-image (Nano Banana), text/image-to-video (Seedance, Kling, Veo 3), text-to-speech (CSM-1B), and video-to-audio (ThinkS |
| `frontend-slides` | ECC | Create stunning, animation-rich HTML presentations from scratch or by converting PowerPoint files. Use when the user wants to build a presentation, convert a PPT/PPTX to web, or create slides for a ta |

### 工程基础 (Engineering Foundations)（16）

| name | origin | description |
|---|---|---|
| `ai-first-engineering` | ECC | Engineering operating model for teams where AI agents generate a large share of implementation output. |
| `architecture-decision-records` | ECC | Capture architectural decisions made during Claude Code sessions as structured ADRs. Auto-detects decision moments, records context, alternatives considered, and rationale. Maintains an ADR log so fut |
| `code-tour` | ECC | Create CodeTour `.tour` files — persona-targeted, step-by-step walkthroughs with real file and line anchors. Use for onboarding tours, architecture walkthroughs, PR tours, RCA tours, and structured "e |
| `codebase-onboarding` | ECC | Analyze an unfamiliar codebase and generate a structured onboarding guide with architecture map, key entry points, conventions, and a starter CLAUDE.md. Use when joining a new project or setting up Cl |
| `coding-standards` | ECC | Baseline cross-project coding conventions for naming, readability, immutability, and code-quality review. Use detailed frontend or backend skills for framework-specific patterns. |
| `configure-ecc` | ECC | Interactive installer for Everything Claude Code — guides users through selecting and installing skills and rules to user-level or project-level directories, verifies paths, and optionally optimizes i |
| `connections-optimizer` | ECC | Reorganize the user's X and LinkedIn network with review-first pruning, add/follow recommendations, and channel-specific warm outreach drafted in the user's real voice. Use when the user wants to clea |
| `content-hash-cache-pattern` | ECC | Cache expensive file processing results using SHA-256 content hashes — path-independent, auto-invalidating, with service layer separation. |
| `context-budget` | ECC | Audits Claude Code context window consumption across agents, skills, MCP servers, and rules. Identifies bloat, redundant components, and produces prioritized token-savings recommendations. |
| `data-scraper-agent` | community | Build a fully automated AI-powered data collection agent for any public source — job boards, prices, news, GitHub, sports, anything. Scrapes on a schedule, enriches data with a free LLM (Gemini Flash) |
| `deep-research` | ECC | Multi-source deep research using firecrawl and exa MCPs. Searches the web, synthesizes findings, and delivers cited reports with source attribution. Use when the user wants thorough research on any to |
| `ecc-guide` | community | Guide users through ECC's current agents, skills, commands, hooks, rules, install profiles, and project onboarding by reading the live repository surface before answering. |
| `exa-search` | ECC | Neural search via Exa MCP for web, code, and company research. Use when the user needs web search, code examples, company intel, people lookup, or AI-powered deep research with Exa's neural search eng |
| `git-workflow` | ECC | Git workflow patterns including branching strategies, commit conventions, merge vs rebase, conflict resolution, and collaborative development best practices for teams of all sizes. |
| `github-ops` | ECC | GitHub repository operations, automation, and management. Issue triage, PR management, CI/CD operations, release management, and security monitoring using the gh CLI. Use when the user wants to manage |
| `google-workspace-ops` | ECC | Operate across Google Drive, Docs, Sheets, and Slides as one workflow surface for plans, trackers, decks, and shared documents. Use when the user needs to find, summarize, edit, migrate, or clean up G |

### 其他 (Other)（70）

| name | origin | description |
|---|---|---|
| `accessibility` | ECC | Design, implement, and audit inclusive digital products using WCAG 2.2 Level AA |
| `ck` | community | Persistent per-project memory for Claude Code. Auto-loads project context on session start, tracks sessions with git activity, and writes to native memory. Commands run deterministic Node.js scripts — |
| `frontend-design-direction` | community | Set an ECC-specific frontend design direction for production UI work. Use when building or improving websites, dashboards, applications, components, landing pages, visual tools, or any web UI that nee |
| `healthcare-emr-patterns` | Health1 Super Speciality Hospitals — contributed by Dr. Keyur Patel | EMR/EHR development patterns for healthcare applications. Clinical safety, encounter workflows, prescription generation, clinical decision support integration, and accessibility-first UI for medical d |
| `healthcare-phi-compliance` | Health1 Super Speciality Hospitals — contributed by Dr. Keyur Patel | Protected Health Information (PHI) and Personally Identifiable Information (PII) compliance patterns for healthcare applications. Covers data classification, access control, audit trails, encryption,  |
| `hermes-imports` | ECC | Convert local Hermes operator workflows into sanitized ECC skills and release-pack artifacts. Use when preparing a Hermes workflow for public ECC reuse without leaking private workspace state, credent |
| `hipaa-compliance` | ECC direct-port adaptation | HIPAA-specific entrypoint for healthcare privacy and security work. Use when a task is explicitly framed around HIPAA, PHI handling, covered entities, BAAs, breach posture, or US healthcare compliance |
| `homelab-network-readiness` | community | Readiness checklist for homelab VLAN segmentation, local DNS filtering, and WireGuard-style remote access before changing router, firewall, DHCP, or VPN configuration. |
| `homelab-network-setup` | community | Practical home and homelab network planning for gateways, switches, access points, IP ranges, DHCP reservations, DNS, cabling, and common beginner mistakes. |
| `homelab-pihole-dns` | community | Pi-hole installation, blocklist management, DNS-over-HTTPS setup, DHCP integration, local DNS records, and troubleshooting broken DNS resolution on a home network. |
| `homelab-wireguard-vpn` | community | WireGuard VPN server setup, peer configuration, key generation, split tunneling vs full tunnel routing, and remote access to a home network from mobile and laptop clients. |
| `hookify-rules` | - | This skill should be used when the user asks to create a hookify rule, write a hook rule, configure hookify, add a hookify rule, or needs guidance on hookify rule syntax and patterns. |
| `inventory-demand-planning` | ECC | > |
| `investor-materials` | ECC | Create and update pitch decks, one-pagers, investor memos, accelerator applications, financial models, and fundraising materials. Use when the user needs investor-facing documents, projections, use-of |
| `investor-outreach` | ECC | Draft cold emails, warm intro blurbs, follow-ups, update emails, and investor communications for fundraising. Use when the user wants outreach to angels, VCs, strategic investors, or accelerators and  |
| `ios-icon-gen` | community | Generate iOS app icons as PNG imagesets for Xcode asset catalogs from SF Symbols (5000+ Apple-native) or Iconify API (275k+ open source icons from 200+ collections). Use when generating icons, creatin |
| `jira-integration` | ECC | Use this skill when retrieving Jira tickets, analyzing requirements, updating ticket status, adding comments, or transitioning issues. Provides Jira API patterns via MCP or direct REST calls. |
| `jpa-patterns` | ECC | JPA/Hibernate patterns for entity design, relationships, query optimization, transactions, auditing, indexing, pagination, and pooling in Spring Boot. |
| `laravel-patterns` | ECC | Laravel architecture patterns, routing/controllers, Eloquent ORM, service layers, queues, events, caching, and API resources for production apps. |
| `lead-intelligence` | ECC | AI-native lead intelligence and outreach pipeline. Replaces Apollo, Clay, and ZoomInfo with agent-powered signal scoring, mutual ranking, warm path discovery, source-derived voice modeling, and channe |
| `logistics-exception-management` | ECC | > |
| `make-interfaces-feel-better` | community | Apply concrete design-engineering details that make interfaces feel polished. Use when reviewing or improving UI spacing, typography, borders, shadows, motion, hit areas, icons, text wrapping, and int |
| `manim-video` | ECC | Build reusable Manim explainers for technical concepts, graphs, system diagrams, and product walkthroughs, then hand off to the wider ECC video stack if needed. Use when the user wants a clean animate |
| `market-research` | ECC | Conduct market research, competitive analysis, investor due diligence, and industry intelligence with source attribution and decision-oriented summaries. Use when the user wants market sizing, competi |
| `messages-ops` | ECC | Evidence-first live messaging workflow for ECC. Use when the user wants to read texts or DMs, recover a recent one-time code, inspect a thread before replying, or prove which message source was actual |
| `nanoclaw-repl` | ECC | Operate and extend NanoClaw v2, ECC's zero-dependency session-aware REPL built on claude -p. |
| `network-bgp-diagnostics` | community | Diagnostics-only BGP troubleshooting patterns for neighbor state, route exchange, prefix policy, AS path inspection, and safe evidence collection. |
| `network-interface-health` | community | Diagnose interface errors, drops, CRCs, duplex mismatches, flapping, speed negotiation issues, and counter trends on routers, switches, and Linux hosts. |
| `nutrient-document-processing` | ECC | Process, convert, OCR, extract, redact, sign, and fill documents using the Nutrient DWS API. Works with PDFs, DOCX, XLSX, PPTX, HTML, and images. |
| `nuxt4-patterns` | ECC | Nuxt 4 app patterns for hydration safety, performance, route rules, lazy loading, and SSR-safe data fetching with useFetch and useAsyncData. |
| `openclaw-persona-forge` | community | 为 OpenClaw AI Agent 锻造完整的龙虾灵魂方案。根据用户偏好或随机抽卡， 输出身份定位、灵魂描述(SOUL.md)、角色化底线规则、名字和头像生图提示词。 如当前环境提供已审核的生图 skill，可自动生成统一风格头像图片。 当用户需要创建、设计或定制 OpenClaw 龙虾灵魂时使用。 不适用于：微调已有 SOUL.md、非 OpenClaw 平台的角色设计、纯工具型无性格 Ag |
| `opensource-pipeline` | ECC | Open-source pipeline: fork, sanitize, and package private projects for safe public release. Chains 3 agents (forker, sanitizer, packager). Triggers: '/opensource', 'open source this', 'make this publi |
| `plan-orchestrate` | ECC | Read a plan document, decompose it into steps, design a per-step agent chain from the ECC catalogue, and emit ready-to-paste /orchestrate custom prompts. Generative only — never invokes /orchestrate i |
| `plankton-code-quality` | community | Write-time code quality enforcement using Plankton — auto-formatting, linting, and Claude-powered fixes on every file edit via hooks. |
| `product-capability` | ECC | Translate PRD intent, roadmap asks, or product discussions into an implementation-ready capability plan that exposes constraints, invariants, interfaces, and unresolved decisions before multi-service  |
| `product-lens` | ECC | Use this skill to validate the "why" before building, run product diagnostics, and pressure-test product direction before the request becomes an implementation contract. |
| `production-audit` | community | Local-evidence production readiness audit for shipped apps, pre-launch reviews, post-merge checks, and "what breaks in prod?" questions without sending repo data to an external audit service. |
| `production-scheduling` | ECC | > |
| `project-flow-ops` | ECC | Operate execution flow across GitHub and Linear by triaging issues and pull requests, linking active work, and keeping GitHub public-facing while Linear remains the internal execution layer. Use when  |
| `prompt-optimizer` | community | >- |
| `pytorch-patterns` | ECC | PyTorch deep learning patterns and best practices for building robust, efficient, and reproducible training pipelines, model architectures, and data loading. |
| `quality-nonconformance` | ECC | > |
| `quarkus-security` | ECC | Quarkus Security best practices for authentication, authorization, JWT/OIDC, RBAC, input validation, CSRF, secrets management, and dependency security. |
| `quarkus-verification` | ECC | Verification loop for Quarkus projects: build, static analysis, tests with coverage, security scans, native compilation, and diff review before release or PR. |
| `ralphinho-rfc-pipeline` | ECC | RFC-driven multi-agent DAG execution pattern with quality gates, merge queues, and work unit orchestration. |
| `recsys-pipeline-architect` | community | Design composable recommendation, ranking, and feed pipelines using the six-stage Source→Hydrator→Filter→Scorer→Selector→SideEffect framework popularized by xAI's open-sourced For You algorithm. Use t |
| `regex-vs-llm-structured-text` | ECC | Decision framework for choosing between regex and LLM when parsing structured text — start with regex, add LLM only for low-confidence edge cases. |
| `research-ops` | ECC | Evidence-first current-state research workflow for ECC. Use when the user wants fresh facts, comparisons, enrichment, or a recommendation built from current public evidence and any supplied local cont |
| `returns-reverse-logistics` | ECC | > |
| `rules-distill` | ECC | Scan skills to extract cross-cutting principles and distill them into rules — append, revise, or create new rule files |
| `santa-method` | "Ronald Skelton - Founder, RapportScore.ai" | Multi-agent adversarial verification with convergence loop. Two independent review agents must both pass before output ships. |
| `literature-review` | community | Systematic literature-review workflow for academic, biomedical, technical, and scientific topics, including search planning, source screening, synthesis, citation checks, and evidence logging. |
| `search-first` | ECC | Research-before-coding workflow. Search for existing tools, libraries, and patterns before writing custom code. Invokes the researcher agent. |
| `security-bounty-hunter` | ECC direct-port adaptation | Hunt for exploitable, bounty-worthy security issues in repositories. Focuses on remotely reachable vulnerabilities that qualify for real reports instead of noisy local-only findings. |
| `security-review` | ECC | Use this skill when adding authentication, handling user input, working with secrets, creating API endpoints, or implementing payment/sensitive features. Provides comprehensive security checklist and  |
| `seo` | ECC | Audit, plan, and implement SEO improvements across technical SEO, on-page optimization, structured data, Core Web Vitals, and content strategy. Use when the user wants better search visibility, SEO re |
| `skill-scout` | community | Search existing local, marketplace, GitHub, and web skill sources before creating a new skill. Use when the user wants to create, build, fork, or find a skill for a workflow. |
| `social-graph-ranker` | ECC | Weighted social-graph ranking for warm intro discovery, bridge scoring, and network gap analysis across X and LinkedIn. Use when the user wants the reusable graph-ranking engine itself, not the broade |
| `springboot-verification` | ECC | Verification loop for Spring Boot projects: build, static analysis, tests with coverage, security scans, and diff review before release or PR. |
| `strategic-compact` | ECC | Suggests manual context compaction at logical intervals to preserve context through task phases rather than arbitrary auto-compaction. |
| `team-builder` | community | Interactive agent picker for composing and dispatching parallel teams |
| `terminal-ops` | ECC | Evidence-first repo execution workflow for ECC. Use when the user wants a command run, a repo checked, a CI failure debugged, or a narrow fix pushed with exact proof of what was executed and verified. |
| `token-budget-advisor` | community | >- |
| `ui-demo` | ECC | Record polished UI demo videos using Playwright. Use when the user asks to create a demo, walkthrough, screen recording, or tutorial video of a web application. Produces WebM videos with visible curso |
| `unified-notifications-ops` | ECC | Operate notifications as one ECC-native workflow across GitHub, Linear, desktop alerts, hooks, and connected communication surfaces. Use when the real problem is alert routing, deduplication, escalati |
| `verification-loop` | ECC | A comprehensive verification system for Claude Code sessions. |
| `video-editing` | ECC | AI-assisted video editing workflows for cutting, structuring, and augmenting real footage. Covers the full pipeline from raw capture through FFmpeg, Remotion, ElevenLabs, fal.ai, and final polish in D |
| `videodb` | ECC | See, Understand, Act on video and audio. See- ingest from local files, URLs, RTSP/live feeds, or live record desktop; return realtime context and playable stream links. Understand- extract frames, bui |
| `visa-doc-translate` | - | Translate visa application documents (images) to English and create a bilingual PDF with original and translation |
| `vite-patterns` | ECC | Vite build tool patterns including config, plugins, HMR, env variables, proxy setup, SSR, library mode, dependency pre-bundling, and build optimization. Activate when working with vite.config.ts, Vite |

---

## 附：Agent vs Skill 协作关系

```
主代理 (Claude Code)
  │
  ├─ delegate → Agent（执行体）
  │     ├─ 定义流程 + 输出格式 + 判定阈值
  │     └─ 末尾 "see skill: xxx"
  │           ↓
  └─ 引用     Skill（知识包）
        └─ 提供模式库 + checklist + 示例代码
```

- Agent 决定"怎么干一次"
- Skill 提供"怎么干得对的标准"
- 两者通过 `see skill: xxx` 解耦
