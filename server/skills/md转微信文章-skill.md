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
| 4 | **代码块/目录树每行一个 `<div>`**，不用 `<pre>` 或 `white-space:pre` | 微信会剥掉 `white-space:pre`，导致换行缩进全乱；每行 div 天然换行 |
| 5 | **颜色用 `background-color`**，不用 `background` 简写 | 简写在粘贴时偶发丢失，`background-color` 稳定 |
| 6 | **箭头/连线用 Unicode 字符**（`↓` `→` `↻`），不用 SVG/mermaid | mermaid 依赖 JS 渲染，SVG 的 marker defs 会被微信清洗 |
| 7 | **不依赖 JS 渲染内容** | 微信编辑器不执行 script；内容必须是静态 HTML（复制按钮的 JS 例外，它只在本地浏览器跑） |
| 8 | **复制时纯 `cloneNode`，不烘焙 `getComputedStyle`** | 烘焙会用 computed 值搅乱已内联的样式；全内联后克隆即完整 |
| 9 | **紧凑代码段风格**：节点 `padding:5px 12px`、`margin:2px`、字号 `13px` | 微信里间距会放大，源头收紧才显得不臃肿 |

## 组件映射（md → 微信 HTML）

| md 元素 | 微信 HTML 组件 |
|---|---|
| `## 标题` | 卡片 `<div>`（白底 + 彩色 h2 小标签） |
| 段落/列表 | `<p>` 内联彩色 `<span>` 标签强调 |
| 流程/步骤 | `<table>` 流程图：节点 `<span>` + `↓` 箭头 `<tr>` |
| 表格 | 原生 `<table>`（每个 td/th 内联 border） |
| 代码块/目录树 | 深色背景 `<div>`，**每行一个 `<div>`**，缩进用 `&nbsp;` |
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

  <!-- 代码块（每行一个 div） -->
  <div style="background-color:#0f172a; border-radius:6px; padding:12px; font-family:'SF Mono',Menlo,monospace; font-size:12px; line-height:2;">
    <div style="color:#e2e8f0;">第一行</div>
    <div style="color:#e2e8f0;">第二行&nbsp;&nbsp;<span style="color:#34d399;">高亮</span></div>
  </div>

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
3. **映射组件**：按上面「组件映射」表，把每个 md 元素转成对应微信 HTML 组件
4. **套模板生成**：用 HTML 模板骨架，填入转换后的内容；每个章节用一个卡片 div；流程描述转 table 流程图
5. **配色分配**：按章节顺序循环分配配色板的颜色给 h2 标签和流程节点，核心/关键节点用黄 `#f59e0b` + border 强调
6. **Write 输出**：生成 `<原文件名>-微信.html`，与原 md 同目录
7. **自检**：跑下面的验证清单

## 验证清单（生成后逐条核对）

- [ ] 所有元素样式都是内联 `style="..."`，没有 class（除 `.copy-btn`）
- [ ] 所有流程图是 `<table>`，不是 `<div>` 套结构
- [ ] 每个 `<td>` 同时有 `align="center"` 和 `text-align:center`
- [ ] 颜色用 `background-color`，不是 `background`
- [ ] 箭头是 Unicode `↓`/`→`，没有 SVG/mermaid
- [ ] 代码块/目录树是每行一个 `<div>`，没有 `<pre>`
- [ ] 复制函数是纯 `cloneNode`，没有 `getComputedStyle` 烘焙
- [ ] 节点 padding/margin/字号是紧凑值（5px/2px/13px 量级）

## 注意事项

- **正文朴素，结构彩色**：背景用干净浅灰 `#f6f7f9`，正文深灰；彩色只出现在标题标签、流程节点、表头、代码高亮——这是技术文章的质感。
- **垂直排版**：公众号在手机端是窄屏单列，不要用并排/网格，全部纵向堆叠。
- **容器宽度 620px**：接近公众号正文区域宽度，所见即所得。
- **表格 td 必须显式 `border`**：否则微信会给表格加默认边框。
