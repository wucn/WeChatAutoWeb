# backend-patterns 深度分析（零）：总纲

> 源文件：`skills/backend-patterns/SKILL.md`（共 559 行，~1572 词）
> 系列导论，共 5 篇深度分析的前置说明
> 阅读本文后再按需进入各专题篇

## 一、这个 skill 是什么

### 1.1 定位

`backend-patterns` 是 ECC 插件库中的一个 **skill**（领域知识包），为 Claude Code 提供后端开发的架构模式与最佳实践。

| 属性 | 值 |
|---|---|
| 名称 | `backend-patterns` |
| 类型 | skill（Markdown + YAML frontmatter） |
| 来源 | ECC（origin: ECC） |
| 规模 | 559 行 / ~1572 词 |
| 技术栈 | Node.js / Express / Next.js API routes |
| 语言 | TypeScript |

**frontmatter 定义**（源文件 :1-5）：

```yaml
---
name: backend-patterns
description: Backend architecture patterns, API design, database optimization,
  and server-side best practices for Node.js, Express, and Next.js API routes.
origin: ECC
---
```

### 1.2 它解决什么问题

为"如何写出**可扩展、可维护**的服务端应用"提供一套**可落地的代码模板**。不是空泛的"架构原则"，而是带具体接口定义、类型签名、SQL 语句、错误处理实现的工程参考。

```
backend-patterns skill
   │
   ├─ 不是 → "分层是个好主意"（纯概念）
   │
   └─ 是   → Repository 接口这样定义：
             interface Repository<T> {
               findById(id): Promise<T | null>
               ...
             }
             （具体到代码）
```

### 1.3 客户端类比：skill 是什么

| ECC 概念 | iOS 类比 | Android 类比 |
|---|---|---|
| skill（领域知识包） | Framework 的开发指南（如 CoreData 编程指南） | Android Jetpack 的官方文档 |
| `backend-patterns` | Apple 的 "Server-side Swift" 最佳实践 | Android 的 "Server architecture" 指南 |
| skill 激活 | 按需加载对应领域的规则 | 按需参考对应 guide |
| 代码模板 | Xcode 的 File Template | Android Studio 的 Live Template |

## 二、什么时候激活（When to Activate）

源文件 :11-20 列出 7 个触发场景，覆盖后端开发的核心维度：

| # | 触发场景 | 中文 | 覆盖章节 |
|---|---|---|---|
| 1 | Designing REST or GraphQL API endpoints | 设计 REST/GraphQL API | API Design Patterns (:21) |
| 2 | Implementing repository, service, or controller layers | 实现 Repository/Service/Controller 分层 | 散布于分层相关内容 |
| 3 | Optimizing database queries (N+1, indexing, connection pooling) | 优化数据库查询 | Database Patterns (:129) |
| 4 | Adding caching (Redis, in-memory, HTTP cache headers) | 添加缓存 | Caching Strategies (:206) |
| 5 | Setting up background jobs or async processing | 搭建后台任务/异步处理 | Background Jobs & Queues (:442) |
| 6 | Structuring error handling and validation for APIs | 组织错误处理与校验 | Error Handling Patterns (:264) |
| 7 | Building middleware (auth, logging, rate limiting) | 构建中间件（鉴权/日志/限流） | Auth (:346) / Rate Limiting (:431) / Logging (:497) |

**触发全景图**：

```
后端开发任务
   │
   ├─ API 设计?        → 场景 1 → 第 3 篇
   ├─ 分层架构?        → 场景 2 → 第 1 篇
   ├─ 数据库性能?      → 场景 3 → 第 2 篇
   ├─ 缓存?            → 场景 4 → 第 2 篇
   ├─ 后台任务?        → 场景 5 → 第 5 篇
   ├─ 错误处理?        → 场景 6 → 第 3 篇
   └─ 鉴权/限流/日志?  → 场景 7 → 第 4 篇 + 第 5 篇
```

## 三、源文件章节地图

源文件按 9 个 `##` 章节组织（共 559 行）：

| 章节 | 源文件行号 | 行数 | 主题 |
|---|---|---|---|
| When to Activate | :11-20 | ~10 | 触发场景 |
| API Design Patterns | :21-128 | ~108 | RESTful URL、HTTP 方法、Repository Pattern |
| Database Patterns | :129-205 | ~77 | N+1 防护、事务边界、SQL 函数 |
| Caching Strategies | :206-263 | ~58 | Redis Cache-Aside、缓存失效 |
| Error Handling Patterns | :264-345 | ~82 | ApiError、集中式 errorHandler、重试退避 |
| Authentication & Authorization | :346-430 | ~85 | JWT 验证、RBAC、HOF 中间件 |
| Rate Limiting | :431-441 | ~11 | 限流硬性约束 |
| Background Jobs & Queues | :442-496 | ~55 | JobQueue 泛型类 |
| Logging & Monitoring | :497-559 | ~63 | 结构化日志、requestId |

**章节规模分布**：

```
API Design    ████████████████████  108 行  ← 最大
Database      ███████████████        77 行
Error         ████████████████       82 行
Auth          ████████████████       85 行
Caching       █████████████           58 行
Jobs          ███████████             55 行
Logging       ████████████            63 行
Rate Limit    ██                      11 行  ← 最小（硬性约束段落）
```

## 四、5 篇分析的拆分逻辑

源文件的 9 个章节按**设计维度**重组为 5 篇深度分析，每篇聚焦一个主题：

```
源文件章节                           深度分析篇目
─────────────────────────────────────────────────
API Design (:21)          ┐
                          ├─→  三、API 设计与错误处理
Error Handling (:264)     ┘

Database (:129)           ┐
                          ├─→  二、数据库与缓存
Caching (:206)            ┘

Auth (:346)               ┐
                          ├─→  四、鉴权与限流
Rate Limiting (:431)      ┘

Background Jobs (:442)    ┐
                          ├─→  五、后台任务与可观测
Logging (:497)            ┘

分层相关内容（散布）     ───→  一、架构与分层
```

### 4.1 拆分原则

| 原则 | 说明 |
|---|---|
| 按设计维度聚合 | 把"数据存储"相关（DB + 缓存）合为一篇，而非按源文件机械拆分 |
| 每篇一个聚焦主题 | 避免一篇内主题跳跃，利于深度展开 |
| 接口/类型先行 | 每篇先讲数据结构定义，再讲行为 |
| 跨篇引用 | 错误处理篇的 `ApiError` 被鉴权篇引用，保持一致性 |

### 4.2 篇目与源章节映射表

| 篇目 | 标题 | 对应源章节 | 源行号 |
|---|---|---|---|
| 一 | 架构与分层 | Repository Pattern + Service + Middleware | :38-128（散布） |
| 二 | 数据库与缓存 | Database Patterns + Caching Strategies | :129-263 |
| 三 | API 设计与错误处理 | API Design Patterns + Error Handling | :21-34, 264-345 |
| 四 | 鉴权与限流 | Authentication & Authorization + Rate Limiting | :346-441 |
| 五 | 后台任务与可观测 | Background Jobs & Queues + Logging & Monitoring | :442-559 |

## 五、阅读顺序建议

### 5.1 按角色推荐

| 角色 | 推荐阅读顺序 | 理由 |
|---|---|---|
| 后端新手 | 一 → 二 → 三 → 四 → 五 | 先架构后细节，循序渐进 |
| API 设计者 | 三 → 四 → 一 | 先定契约（API/错误），再讲鉴权，最后落地架构 |
| 性能优化 | 二 → 五 | 先查 N+1，再看异步与可观测 |
| 安全审查 | 四 → 三 | 先鉴权限流，再错误处理的安全边界 |
| 架构师 | 一 → 二 → 五 | 先分层，再数据层，再运维层 |

### 5.2 按问题定位

| 你遇到的问题 | 直接看哪篇 |
|---|---|
| 接口很慢，N+1 查询 | 二 |
| 错误响应格式乱 | 三 |
| 401 还是 403 分不清 | 四 |
| 上线后任务丢失 | 五 |
| 代码分层混乱 | 一 |
| 缓存怎么失效 | 二 |

## 六、核心设计决策总览（跨篇）

backend-patterns 贯穿 5 篇的核心设计原则：

| 核心原则 | 体现篇目 | 说明 |
|---|---|---|
| 分层解耦 | 一 | Repository/Service/Middleware 各司其职 |
| 类型先行 | 一、二、三、四 | 接口定义先于实现（Repository<T> / ApiResponse<T> / JWTPayload） |
| 统一契约 | 三 | 所有响应走 `{success, data/error}` 格式 |
| 集中式错误处理 | 三 | 一个 `errorHandler` 处理 3 类错误 |
| 数据一致性优先 | 二 | 事务边界 + Redis Cache-Aside |
| 声明式鉴权 | 四 | HOF 装饰器，业务代码不混入鉴权 |
| 共享存储硬性约束 | 四 | 限流必须用 Redis/网关，禁止内存计数器 |
| 可观测贯穿 | 五 | requestId 串联请求生命周期 |
| 安全边界 | 三、四 | 错误信息分级暴露，未知错误不泄露细节 |

## 七、已发现问题汇总

5 篇分析中按"暴露冲突，不要折中"原则标记的问题：

| # | 问题 | 所在篇 | 源行号 | 严重度 |
|---|---|---|---|---|
| 1 | `JWTPayload.role` 与 `User.role` 枚举不一致 | 四 | :356 / :395 | ⚠️ BUG |
| 2 | `replace('Bearer ', '')` 不容错 | 四 | :369 | ⚠️ 需改进 |
| 3 | `hasPermission` 未防 undefined（新 role 未配置崩溃） | 四 | :404-406 | ⚠️ 隐患 |
| 4 | `JobQueue.execute` 是 private 无法 override | 五 | :475-477 | ⚠️ 缺陷 |
| 5 | `JobQueue` 内存队列生产禁用 | 五 | :447-478 | CRITICAL |
| 6 | `fetchWithRetry` 不区分错误类型全重试 | 三 | :288-309 | ⚠️ 需改进 |
| 7 | `errorHandler` 未知错误用 `console.error` 而非 logger | 三、五 | :220 | ⚠️ 整合建议 |
| 8 | requestId 在 handler 生成而非 middleware | 五 | :543 | ⚠️ 可改进 |
| 9 | Logger 单例无日志级别过滤 | 五 | :539 | ⚠️ 局限 |

**修复优先级**：

```
紧急（生产前必修）
   ├─ #5  内存队列 → 换 Redis-backed
   └─ #1  role 枚举不一致 → 统一为 3 种

重要（尽快修）
   ├─ #2  Bearer 提取容错
   ├─ #3  hasPermission 防 undefined
   └─ #4  execute 改 protected/abstract

改进（迭代优化）
   ├─ #6  fetchWithRetry 区分错误类型
   ├─ #7  errorHandler 接入 logger
   ├─ #8  requestId 提升到 middleware
   └─ #9  Logger 增加级别过滤
```

## 八、与其他 skill / agent 的协作

backend-patterns 不是孤岛，它与 ECC 生态多处协作：

| 协作对象 | 协作点 | 说明 |
|---|---|---|
| `api-design` skill | HTTP 契约 | 限流响应格式、429 规范委托给它 |
| `security-review` skill | 安全审查 | 密码哈希、敏感数据泄露、滥用检测 |
| `cost-aware-llm-pipeline` skill | 重试策略 | `_RETRYABLE_ERRORS` 区分错误重试 |
| `continuous-learning` skill | 模式提取 | 从日志/错误中提炼可复用模式 |
| examples/CLAUDE.md | 契约落地 | 把 `ApiResponse`、鉴权等约定落地成代码 |
| planner / code-reviewer agent | 代码审查 | 审查后端代码是否符合 backend-patterns |

**协作边界图**：

```
                    ┌─────────────────────┐
                    │ examples/CLAUDE.md  │ ← 契约定义
                    └──────────┬──────────┘
                               │ 落地
                               ▼
        ┌──────────────────────────────────────┐
        │       backend-patterns（本 skill）    │
        │  架构 + 数据 + API + 鉴权 + 可观测      │
        └──┬──────────────┬──────────────┬─────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────┐   ┌─────────────┐  ┌────────────────┐
    │api-design│   │security-    │  │cost-aware-llm- │
    │(HTTP契约)│   │review(安全) │  │pipeline(重试)  │
    └──────────┘   └─────────────┘  └────────────────┘
```

## 九、写作风格说明（本系列的约定）

为保持 5 篇风格一致，遵循统一约定：

| 约定 | 说明 |
|---|---|
| 源行号引用 | 引用源文件代码标注行号，如 `(:346-386)` |
| 代码块语言标记 | 用 ```typescript / ```yaml 等 |
| 规则表格化 | 硬性规则用"规则 / 说明 / 严重度"三列表 |
| 客户端类比 | 服务端概念附 iOS + Android 类比 |
| 流程图优先 | 有步骤/分支的逻辑用 ASCII 流程图 |
| 反模式列表 | 每篇列禁止做法及原因 |
| 暴露冲突 | 发现的不一致/缺陷明确标注，不折中 |
| 规则总结表 | 每篇结尾汇总所有规则 + 严重度 |
| 下一篇链接 | 每篇结尾链接下一篇 |

## 十、篇目索引

| # | 文件 | 核心内容 |
|---|---|---|
| 零 | `backend-patterns-深度分析-零-总纲.md` | 本文：skill 定位、章节地图、阅读指南 |
| 一 | `backend-patterns-深度分析-一-架构与分层.md` | Repository / Service / Middleware 三层架构、接口定义、依赖注入 |
| 二 | `backend-patterns-深度分析-二-数据库与缓存.md` | N+1 防护、事务边界、Redis Cache-Aside 完整实现 |
| 三 | `backend-patterns-深度分析-三-API设计与错误处理.md` | RESTful 规范、统一响应格式、ApiError、集中式 errorHandler、重试退避 |
| 四 | `backend-patterns-深度分析-四-鉴权与限流.md` | JWT 验证、RBAC 权限矩阵、HOF 装饰器、限流硬性约束 |
| 五 | `backend-patterns-深度分析-五-后台任务与可观测.md` | JobQueue 泛型类、结构化日志、requestId 上下文传递 |

**建议入门路径**：先读本文（零）建立全局认知 → 按第五节的角色推荐进入对应篇目。

---

> **系列状态**：全部 5 篇已完成（12/12 文档，含 7 篇第一批概览 + 本总纲）
