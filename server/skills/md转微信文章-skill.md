---
name: md-to-wechat
description: 读取 markdown 设计方案/技术文档，生成可一键复制到微信公众号编辑器的 HTML 文章。采用原生 table 布局 + 全内联样式，抗微信样式清洗，保留排版、颜色、流程图。
---

# md 转微信公众号文章 skill

## 用途
输入一个 markdown 文件（设计方案/技术文档），输出一个 HTML 文件。
浏览器打开该 HTML → 点击「复制为微信格式」→ 粘贴到微信公众号编辑器，**排版、颜色、流程图全部保留**。

## 微信兼容性铁律（必须逐条遵守）

这些规则是用大量踩坑换来的，**违反任何一条都会导致粘贴后样式崩坏**：

| # | 规则 | 原因 |
|---|---|---|
| 1 | **流程图必须用原生 `<table>` 布局** | 微信会重写 `div` 的结构，但不会动 `<table>/<tr>/<td>` |
| 2 | **所有样式内联 `style="..."`**，不用 class | 微信不认外部 CSS 和 class 选择器 |
| 3 | **居中用 `<td align="center">` + `text-align:center` 双保险** | 单靠 CSS 的 `margin:auto` 或 `display:table` 在微信里经常失效 |
| 4 | **代码块/目录树用 `<table>` 布局**，每行一个 `<tr><td>`，不用 `<pre>`/`<div>` 或 `white-space:pre` | 微信粘贴时会剥 `<div>` 的 `background-color`（深色底消失，浅色字糊在白底上）和 `white-space:pre`（换行缩进乱）；`<table>` 的背景和结构都扛清洗，每行 `<tr>` 天然换行 |
| 5 | **颜色用 `background-color`**，不用 `background` 简写 | 简写在粘贴时偶发丢失，`background-color` 稳定 |
| 6 | **箭头/连线用 Unicode 字符**（`↓` `→` `↻`），不用 SVG/mermaid | mermaid 依赖 JS 渲染，SVG 的 marker defs 会被微信清洗 |
| 7 | **不依赖 JS 渲染内容** | 微信编辑器不执行 script；内容必须是静态 HTML（复制按钮的 JS 例外，它只在本地浏览器跑） |
| 8 | **复制时纯 `cloneNode`，不烘焙 `getComputedStyle`** | 烘焙会用 computed 值搅乱已内联的样式；全内联后克隆即完整 |
| 9 | **紧凑代码段风格**：节点 `padding:5px 12px`、`margin:2px`、字号 `13px` | 微信里间距会放大，源头收紧才显得不臃肿 |

## 组件映射（md → 微信 HTML）

| md 元素 | 微信 HTML 组件 |
|---|---|
| 开头说明块 `> 📖 **本文介绍**` | 开头说明卡片 `<div>`（白底 + 绿色引用块 + 适用场景表格 + 蓝色思路块） |
| `## 标题` | 卡片 `<div>`（白底 + 彩色 h2 小标签） |
| 段落/列表 | `<p>` 内联彩色 `<span>` 标签强调 |
| 流程/步骤 | `<table>` 流程图：节点 `<span>` + `↓` 箭头 `<tr>` |
| 表格 | 原生 `<table>`（每个 td/th 内联 border） |
| 代码块/目录树 | 深色背景 `<table>`，**每行一个 `<tr><td>`**，缩进用 `&nbsp;`，`td` 显式 `border:none` |
| 重点关键词 | `<b style="color:#374151">` |
| 状态标签 | `<span style="display:inline-block;background-color:#xxx;color:#fff;padding:1px 7px;border-radius:8px">` |

## 配色板（技术文章，鲜艳但不花哨）

正文朴素（`#1f2937`/`#6b7280`），彩色只用在标题标签、流程节点、表头、代码高亮：
- 紫 `#7c3aed` / 粉 `#ec4899` / 橙 `#f97316` / 青 `#22d3ee` / 绿 `#10b981` / 蓝 `#3b82f6` / 红 `#ef4444` / 黄 `#f59e0b`
- 节点底色用浅一档（如紫用 `#a855f7`），核心节点加 `border:2px solid` 强调

## HTML 模板骨架

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,"PingFang SC",sans-serif; background:#f6f7f9; padding:28px 12px; color:#1f2937; line-height:1.5; }
  .copy-btn { margin-top:14px; padding:8px 22px; background-color:#1f2937; color:#fff; border:none; border-radius:6px; font-size:14px; cursor:pointer; font-family:inherit; }
  .copy-btn:hover { background-color:#7c3aed; }
  .copy-btn.done { background-color:#059669; }
</style>
</head>
<body>
<div id="container" style="max-width:620px; margin:0 auto;">

  <!-- 标题区 -->
  <div style="text-align:center; margin-bottom:22px; padding-bottom:16px; border-bottom:3px solid #7c3aed;">
    <h1 style="font-size:21px; color:#1f2937; margin:0;">【文章标题】</h1>
    <p style="margin-top:8px; color:#6b7280; font-size:13px;">【副标题】</p>
    <div><button class="copy-btn" id="copyBtn" onclick="copyForWechat()">📋 复制为微信格式</button></div>
  </div>

  <!-- 开头说明卡片（必加） -->
  <div style="background-color:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:14px;">
    <div style="background-color:#f0fdf4; border-left:3px solid #10b981; padding:10px 12px; border-radius:0 4px 4px 0; margin-bottom:12px;">
      <p style="margin:0 0 6px 0; color:#065f46; font-size:14px; font-weight:600;">📖 本文介绍</p>
      <p style="margin:0; color:#6b7280; line-height:1.6; font-size:13px;">【一句话概括主题：解决什么问题 / 分析什么技术 / 总结什么经验】</p>
    </div>
    <table cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; font-size:13px;">
      <tr>
        <td style="padding:6px 8px; background-color:#f3f4f6; color:#374151; border:1px solid #e5e7eb; font-weight:600; width:90px;">适用场景</td>
        <td style="padding:6px 8px; color:#6b7280; border:1px solid #e5e7eb;">【谁适合看：遇到类似问题的工程师 / 某领域从业者】</td>
      </tr>
      <tr>
        <td style="padding:6px 8px; background-color:#f3f4f6; color:#374151; border:1px solid #e5e7eb; font-weight:600;">收获预期</td>
        <td style="padding:6px 8px; color:#6b7280; border:1px solid #e5e7eb;">【读完能得到什么：一套排查思路 / 一个技术方案 / 某类问题的解决模板】</td>
      </tr>
    </table>
    <div style="background-color:#eff6ff; border-left:3px solid #3b82f6; padding:10px 12px; border-radius:0 4px 4px 0; margin-top:12px;">
      <p style="margin:0 0 6px 0; color:#1e40af; font-size:14px; font-weight:600;">🧭 文章思路</p>
      <p style="margin:0; color:#6b7280; line-height:1.6; font-size:13px;">【整体脉络：① xxx → ② xxx → ③ xxx，按什么顺序展开】</p>
    </div>
  </div>

  <!-- 每个章节 = 一个卡片 -->
  <div style="background-color:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:14px;">
    <h2 style="background-color:#7c3aed; color:#fff; display:inline-block; padding:5px 12px; border-radius:5px; font-size:14px; margin:0 0 10px 0;">【章节标题】</h2>
    <p style="color:#6b7280; line-height:1.6; margin:0 0 10px 0; font-size:13px;">【正文，<b style="color:#374151;">重点</b>】</p>

    <!-- 流程图（table 布局） -->
    <table align="center" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; background-color:#f9fafb; border-radius:6px;">
      <tr><td align="center" style="text-align:center; border:none; padding:3px 8px;"><span style="display:inline-block; background-color:#a855f7; color:#fff; padding:5px 12px; border-radius:5px; font-size:13px; font-weight:600;">节点1</span></td></tr>
      <tr><td align="center" style="text-align:center; border:none; padding:1px 8px; color:#9ca3af; font-size:14px; line-height:1;">↓</td></tr>
      <tr><td align="center" style="text-align:center; border:none; padding:3px 8px;"><span style="display:inline-block; background-color:#ec4899; color:#fff; padding:5px 12px; border-radius:5px; font-size:13px; font-weight:600;">节点2</span></td></tr>
    </table>
  </div>

  <!-- 代码块（table 布局，每行一个 tr） -->
  <table cellpadding="0" cellspacing="0" style="width:100%; background-color:#0f172a; border-radius:6px; border-collapse:collapse;">
    <tr><td style="padding:2px 12px; color:#e2e8f0; font-family:'SF Mono',Menlo,monospace; font-size:12px; line-height:2; border:none;">第一行</td></tr>
    <tr><td style="padding:2px 12px; color:#e2e8f0; font-family:'SF Mono',Menlo,monospace; font-size:12px; line-height:2; border:none;">第二行&nbsp;&nbsp;<span style="color:#34d399;">高亮</span></td></tr>
  </table>

</div>

<script>
  function copyForWechat() {
    const btn = document.getElementById('copyBtn');
    const source = document.getElementById('container');
    const clone = source.cloneNode(true);
    clone.querySelectorAll('.copy-btn').forEach(b => { const p = b.parentElement; if (p) p.remove(); });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:620px;background:#fff;';
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    const range = document.createRange();
    range.selectNodeContents(clone);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      document.execCommand('copy');
      btn.textContent = '✓ 已复制，去公众号 Ctrl+V';
      btn.classList.add('done');
      setTimeout(() => { btn.textContent = '📋 复制为微信格式'; btn.classList.remove('done'); }, 3000);
    } catch (e) { btn.textContent = '复制失败，请手动选中'; }
    sel.removeAllRanges();
    document.body.removeChild(wrap);
  }
</script>
</body>
</html>
```

## 执行流程

1. **读取 md**：用 Read 读取目标 markdown 文件
2. **解析结构**：识别 `##` 章节标题、表格、有序/无序列表、代码块、流程性描述（"A → B → C"、"步骤1/2/3"）
3. **识别开头说明块**：检测 md 开头的 `> 📖 **本文介绍**` 引用块，提取"本文介绍"、"适用场景"、"收获预期"、"文章思路"四个字段
4. **生成开头说明卡片**：把提取的字段填入 HTML 模板骨架中的开头说明卡片（绿色引用块 + 适用场景表格 + 蓝色思路块）
5. **映射章节组件**：按「组件映射」表，把每个 `##` 章节转成对应微信 HTML 组件（白底卡片 + 彩色 h2 标签）
6. **配色分配**：按章节顺序循环分配配色板的颜色给 h2 标签和流程节点，核心/关键节点用黄 `#f59e0b` + border 强调
7. **Write 输出**：生成 `<原文件名>-微信.html`，与原 md 同目录
8. **自检**：跑下面的验证清单

## 验证清单（生成后逐条核对）

- [ ] 开头说明卡片存在：白底卡片 + 绿色引用块（📖 本文介绍）+ 适用场景表格 + 蓝色思路块（🧭 文章思路）
- [ ] 所有元素样式都是内联 `style="..."`，没有 class（除 `.copy-btn`）
- [ ] 所有流程图是 `<table>`，不是 `<div>` 套结构
- [ ] 每个 `<td>` 同时有 `align="center"` 和 `text-align:center`
- [ ] 颜色用 `background-color`，不是 `background`
- [ ] 箭头是 Unicode `↓`/`→`，没有 SVG/mermaid
- [ ] 代码块/目录树是 `<table>` 布局，每行一个 `<tr><td>`，没有 `<pre>`/外层 `<div>` 包裹
- [ ] 复制函数是纯 `cloneNode`，没有 `getComputedStyle` 烘焙
- [ ] 节点 padding/margin/字号是紧凑值（5px/2px/13px 量级）

## 注意事项

- **正文朴素，结构彩色**：背景用干净浅灰 `#f6f7f9`，正文深灰；彩色只出现在标题标签、流程节点、表头、代码高亮——这是技术文章的质感。
- **垂直排版**：公众号在手机端是窄屏单列，不要用并排/网格，全部纵向堆叠。
- **容器宽度 620px**：接近公众号正文区域宽度，所见即所得。
- **表格 td 必须显式 `border`**：否则微信会给表格加默认边框。

## 分段生成模式（长文章）

当输入文章 **段数 > 3** 或 **字符数 > 12000** 时，由工程层（`generate.ts` 的 `streamGenerateHtml`）自动切换为分段生成：按 `^## ` 切分章节，每段独立调用 AI，最后本地拼接为完整 HTML。

> **💡 为什么需要分段**
>
> | 现象 | 原因 |
> |---|---|
> | 长文章一次性生成 HTML 超时 | LLM 单次推理耗时长，litellm 网关 180s 硬限制 |
> | 分段后每段 30-150s 内完成 | 单段输入小，LLM 推理快，不触网关超时 |
> | 网关 504 自动重试 3 次 | 偶发超时可恢复 |

### 两种模式对比

| 模式 | 触发条件 | 输入 | AI 输出 | system prompt |
|---|---|---|---|---|
| 完整模式 | 段数 ≤ 3 且字符 ≤ 12000 | 整篇 article.md | 完整 HTML 文档（含骨架） | skill 原文 + "输出完整 HTML" |
| 片段模式 | 段数 > 3 或字符 > 12000 | 单个 `##` 章节 md | 单个卡片 div HTML 片段 | skill 原文 + "只输出卡片 div 片段" |

### 片段模式额外约束

当 AI 收到片段模式的 system prompt 时，**必须严格遵守**：

1. **只输出卡片 div HTML 片段**，不含 `<!DOCTYPE>` / `<html>` / `<head>` / `<body>` / `<div id="container">` 骨架
2. **不要复制按钮、不要 `<script>`、不要 `<style>`**（这些由工程层在拼接时补齐）
3. 卡片 div 模板：
   ```html
   <div style="background-color:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:14px;">
     <h2 style="background-color:#7c3aed; color:#fff; display:inline-block; padding:5px 12px; border-radius:5px; font-size:14px; margin:0 0 10px 0;">章节标题</h2>
     <!-- 正文内容 -->
   </div>
   ```
4. 配色按章节顺序循环（工程层会告知当前是第几段，AI 自行选对应色）：
   - 第 1 段：紫 `#7c3aed`
   - 第 2 段：粉 `#ec4899`
   - 第 3 段：橙 `#f97316`
   - 第 4 段：青 `#22d3ee`
   - 第 5 段：绿 `#10b981`
   - 第 6 段及以后：蓝 `#3b82f6`
5. 其余规则（table 布局、内联样式、`background-color`、Unicode 箭头、代码块用 table 每行一个 `<tr>`）与完整模式完全一致

### 拼接规则（工程层执行，AI 不需要关心）

```
完整 HTML = HTML 骨架
            + 标题区（从 article.md 提取主标题）
            + N 个卡片 div 片段（AI 分段输出）
            + 复制按钮 + <script>
```

> **💡 AI 在片段模式下的职责边界**
>
> | 职责 | 归属 |
> |---|---|
> | 切分章节、判断阈值 | 工程层（generate.ts） |
> | 单段 md → 卡片 div HTML | AI |
> | 拼接骨架 + 片段 | 工程层（generate.ts） |
> | 配色选择 | AI（按段序号） |
> | 流程图/表格/代码块渲染 | AI（与完整模式一致） |

