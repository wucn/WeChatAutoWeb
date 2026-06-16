# WeChatAutoWeb

读取 markdown 设计思路文档，调用 AI 生成**微信公众号格式 HTML** 与**可复用的 Claude skill 定义**。HTML 采用原生 table 布局 + 全内联样式 + 复制按钮，抗微信样式清洗，粘贴到公众号编辑器后排版、颜色、流程图全部保留。

本地全栈应用，AI 通过 creads 配置的 litellm 代理接入（默认模型 `glm-5-2[1m]`）。

## 功能

| 模块 | 说明 |
|---|---|
| AI 设置 | 配置 litellm 代理地址 / API Key / 模型，一键测试连通性 |
| 项目管理 | 新建 / 删除项目，每个项目独立保存设计思路与生成产物 |
| 设计思路 | 统一编辑器：直接编写、导入 md、保存/另存为；沉淀多份设计文档供择优 |
| 识别优化补充 | AI 读取选中设计，列出**结构化优化点**（可编辑/勾选），「确定应用」后按章节并入原文档 |
| 生成 HTML | 基于选中设计 → 内置转换规则 → 调 AI → 写入微信 HTML（SSE 实时进度） |
| 生成 skill | 基于选中设计 → 调 AI → 生成 Claude skill 定义（frontmatter + 规则） |
| 强制停止 | 中止在途 AI 请求 |
| 预览/下载 | HTML iframe 预览 / 源码 / 下载；skill 源码 / 下载 .md |

> 生成 HTML 与生成 skill 是**两个独立按钮**，都基于「当前选中的设计思路」。

## 技术栈

- **后端**：Express + TypeScript（tsx 运行，端口 3456）
- **前端**：Vite + React 18 + TypeScript + shadcn/ui + Tailwind CSS（端口 5173）
- **AI**：litellm 代理（Anthropic 兼容端点 `/v1/messages`）
- **根**：concurrently 同时启动前后端

## 目录结构

```
WeChatAutoWeb/
├── package.json              # 根：concurrently 起 server + web
├── shared/models.ts          # 可选模型清单（前后端共享）
├── server/                   # Express 后端
│   ├── src/
│   │   ├── index.ts          # 启动 + 路由挂载
│   │   ├── config.ts         # AI 配置读写 + 脱敏
│   │   ├── ai.ts             # 连通性测试
│   │   ├── storage.ts        # 项目数据模型 / 路径 / 迁移 / 设计目录
│   │   ├── projects.ts       # 项目 CRUD + 设计思路/输出读写 + 路由
│   │   └── generate.ts       # 优化点分析 / 生成 HTML / 生成 skill（SSE）+ 停止
│   ├── skills/
│   │   └── md转微信文章-skill.md   # 内置 md→html 转换规则（system prompt）
│   ├── examples/
│   │   └── wechatAutoWeb.md        # 示例设计思路素材
│   ├── config/ai.json        # AI 配置（含 key，已 gitignore）
│   └── data/projects/<id>/   # 运行时数据（meta + designs/ + output.html + skill.md）
└── web/                      # Vite + React 前端
    └── src/
        ├── App.tsx           # 路由 + 顶部导航
        ├── pages/            # Settings / Projects / ProjectDetail
        ├── lib/api.ts        # 后端 API 封装
        └── components/ui/    # shadcn 组件
```

### 单项目数据目录

```
server/data/projects/<id>/
  meta.json        # name / selectedDesign / 时间戳
  designs/         # 设计思路目录：手写 / 导入 / 优化合并后的多份 .md
  output.html      # 由选中设计生成的微信 HTML
  skill.md         # 由选中设计生成的 Claude skill 定义
```

## 快速开始

```bash
# 安装依赖（根 / server / web 三处）
npm install
npm -C server install
npm -C web install

# 启动（同时起后端 3456 + 前端 5173）
npm run dev
```

浏览器打开 http://localhost:5173

## 使用流程

1. **配置 AI**：顶部「设置」→ 填 Base URL（默认 `https://litellm.spaccez.com`）、API Key、模型 → 点「测试连通」确认可用 → 保存
2. **新建项目**：顶部「项目」→ 输入名称 → 新建
3. **编辑设计思路**：进入项目 → 「1·设计思路」→ 直接编写或「导入 md」→ 保存
4. **识别优化补充**（可选）：选中一份设计 → 点「识别优化补充」→ AI 列出优化点清单 → 审阅/编辑/勾选 → 点「确定应用」合并进原文档 → 可反复多次
5. **生成产物**：选中设计 → 点左侧「生成 HTML」或「生成 skill」（两个独立按钮）→ 观察实时进度 → 生成完成自动跳转
6. **查看结果**：HTML → 预览 / 源码 / 下载；skill → 源码 / 下载 .md
7. **发布 HTML**：用浏览器打开下载的 .html → 点页面内「复制为微信格式」→ 粘贴到公众号编辑器

> 运行中可随时点「停止」中止 AI 请求。

## 数据存储

| 文件 | 内容 | 是否提交 |
|---|---|---|
| `server/config/ai.json` | AI 配置（含 API Key） | 否（gitignore） |
| `server/data/projects/<id>/` | 项目数据（meta + designs/ + output.html + skill.md） | 否（运行时生成） |
| `server/config/ai.example.json` | AI 配置模板 | 是 |
| `server/skills/md转微信文章-skill.md` | 内置 md→html 转换规则 | 是 |

## 设计依据

- 微信兼容性规则、组件映射、配色板、HTML 模板：`server/skills/md转微信文章-skill.md`
- 原始设计文档：`server/examples/wechatAutoWeb.md`
