import fs from 'node:fs';
import path from 'node:path';

// 读取配置
const config = JSON.parse(fs.readFileSync('./config/ai.json', 'utf-8'));
const baseUrl = config.baseUrl.replace(/\/+$/, '');
const apiKey = config.apiKey;
const model = config.model;
const projectId = '1782440011168-0b8fit';
const designFile = 'security-review-深度分析-二-鉴权与Web攻击防护.md';
const url = `${baseUrl}/v1/chat/completions`; // 全局变量

// 读取设计思路
const designPath = `./data/projects/${projectId}/designs/${designFile}`;
const designContent = fs.readFileSync(designPath, 'utf-8');
console.log('设计思路长度:', designContent.length);

// 生成微信文章
console.log('\n===== 第一步：生成微信文章 =====\n');

const articleSystem = `你是微信公众号技术文章编辑。把用户给出的设计思路转化成结构清晰的技术文章片段。

输出要求：
1. 如果输入是开头部分，必须生成"本文介绍"卡片：说明文章主题、适用场景、收获预期、文章思路
2. 按 ## 标题组织章节
3. 代码块、表格、流程图保持原样
4. 每个表格后加 💡 解释块
5. 客户端类比对照表保留

只输出文章片段内容，不要 markdown 代码围栏包裹。`;

async function generateArticle() {
  // 设计思路按标题拆分成小块（每块不超过 3000 字符）
  const MAX_LEN = 3000;
  const lines = designContent.split('\n');
  const chunks = [];
  let current = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 遇到 ## 或 ### 标题，检查是否需要拆分
    if (/^##\s+/.test(line) || /^###\s+/.test(line)) {
      const currentLen = current.join('\n').length;

      // 如果当前块超过阈值，先保存
      if (currentLen > MAX_LEN) {
        chunks.push(current.join('\n'));
        current = [line];
      } else {
        current.push(line);
      }
    } else {
      current.push(line);

      // 即使没有标题，如果累积太长也要拆分
      if (current.join('\n').length > MAX_LEN) {
        chunks.push(current.join('\n'));
        current = [];
      }
    }
  }

  // 保存最后一块
  if (current.length > 0) {
    chunks.push(current.join('\n'));
  }

  console.log('拆分成', chunks.length, '个片段');
  for (let i = 0; i < chunks.length; i++) {
    console.log(`片段${i}: ${chunks[i].slice(0, 50).replace(/\n/g, ' ')}... (${chunks[i].length}字符)`);
  }

  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`\n生成文章片段${i+1}/${chunks.length}，长度:${chunk.length}`);

    const body = {
      model: model,
      max_tokens: 16384,
      messages: [
        { role: 'system', content: articleSystem },
        { role: 'user', content: chunk }
      ]
    };

    const startTime = Date.now();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`响应耗时: ${elapsed}s，状态: ${resp.status}`);

    if (!resp.ok) {
      const text = await resp.text();
      console.error('请求失败:', resp.status, text.slice(0, 500));
      // 继续尝试下一个片段，不要完全失败
      results.push('');
      continue;
    }

    const data = await resp.json();
    let text = data.choices?.[0]?.message?.content || '';
    text = text.trim().replace(/^\s*```[a-zA-Z]*\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    results.push(text);
    console.log(`片段${i+1}完成，输出长度:${text.length}`);

    if (i < chunks.length - 1) {
      console.log('等待2秒...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return results.filter(r => r).join('\n\n');
}

async function main() {
  // 生成微信文章
  const article = await generateArticle();
  if (!article) {
    console.log('微信文章生成失败');
    process.exit(1);
  }

  const articlePath = `./data/projects/${projectId}/article.md`;
  fs.writeFileSync(articlePath, article, 'utf-8');
  console.log('微信文章已保存:', articlePath);

  // 按 ## 拆分生成 HTML 片段
  console.log('\n===== 第二步：生成 HTML 片段 =====\n');

  const lines = article.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) sections.push(current.join('\n'));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) sections.push(current.join('\n'));

  console.log('文章分段数:', sections.length);

  const fragmentSystem = `把用户给出的 markdown 文章片段转成微信公众号 HTML 卡片片段。

输出要求：
1. 只输出 HTML 片段（一个 <div> 卡片），不要 <!DOCTYPE>、<html>、<head>、<body>、<script>、<style>
2. 卡片样式：background-color:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:14px
3. h2 标题用彩色标签样式：background-color:#7c3aed（紫）; color:#fff; display:inline-block; padding:5px 12px; border-radius:5px
4. 代码块用深色背景 #0f172a，每行一个 <tr>
5. 表格用原生 <table>，样式内联
6. 所有样式内联

只输出 HTML，不要 markdown 代码围栏。`;

  const fragmentsDir = `./data/projects/${projectId}/fragments`;
  fs.mkdirSync(fragmentsDir, { recursive: true });

  const colors = ['#7c3aed', '#ec4899', '#f97316', '#22d3ee', '#10b981', '#3b82f6'];
  const MAX_CHUNK = 2000;

  for (let i = 0; i < sections.length; i++) {
    let content = sections[i];

    // 检查长度，必要时拆分
    const subChunks = [];
    if (content.length > MAX_CHUNK) {
      const parts = content.split(/\n###\s+|\n\n\n+/);
      let cur = '';
      for (const p of parts) {
        if ((cur + p).length > MAX_CHUNK && cur) {
          subChunks.push(cur);
          cur = p;
        } else {
          cur += (cur ? '\n\n' : '') + p;
        }
      }
      if (cur) subChunks.push(cur);
      console.log(`段${i}过长(${content.length}字符)，拆成${subChunks.length}个子片段`);
    } else {
      subChunks.push(content);
    }

    const subResults = [];
    for (let si = 0; si < subChunks.length; si++) {
      const sub = subChunks[si];
      console.log(`生成段${i}子${si+1}/${subChunks.length}，长度:${sub.length}`);

      const body = {
        model: model,
        max_tokens: 16384,
        messages: [
          { role: 'system', content: fragmentSystem },
          { role: 'user', content: sub }
        ]
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('请求失败:', resp.status);
        process.exit(1);
      }

      const data = await resp.json();
      let html = data.choices?.[0]?.message?.content || '';
      html = html.trim().replace(/^\s*```[a-zA-Z]*\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      subResults.push(html);

      await new Promise(r => setTimeout(r, 2000));
    }

    const fullFragment = subResults.join('\n\n');
    const fragFile = path.join(fragmentsDir, `${i}.html`);
    fs.writeFileSync(fragFile, fullFragment, 'utf-8');
    console.log(`段${i}完成，写入:${fragFile}`);
  }

  // 拼接完整 HTML
  console.log('\n===== 第三步：拼接完整 HTML =====\n');

  const fragments = [];
  for (let i = 0; i < sections.length; i++) {
    const fragFile = path.join(fragmentsDir, `${i}.html`);
    fragments.push(fs.readFileSync(fragFile, 'utf-8'));
  }

  // 提取标题
  const titleMatch = article.match(/^#\s+(.+?)\s*$/m) || article.match(/^##\s+(.+?)\s*$/m);
  const title = titleMatch ? titleMatch[1].replace(/^[一二三四五六七八九十]+、\s*/, '') : '微信文章';

  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,"PingFang SC",sans-serif; background-color:#f6f7f9; padding:28px 12px; color:#1f2937; line-height:1.5; }
  .copy-btn { margin-top:14px; padding:8px 22px; background-color:#1f2937; color:#fff; border:none; border-radius:6px; font-size:14px; cursor:pointer; font-family:inherit; }
  .copy-btn:hover { background-color:#7c3aed; }
  .copy-btn.done { background-color:#059669; }
</style>
</head>
<body>
<div id="container" style="max-width:620px; margin:0 auto;">
  <div style="text-align:center; margin-bottom:22px; padding-bottom:16px; border-bottom:3px solid #7c3aed;">
    <h1 style="font-size:21px; color:#1f2937; margin:0;">${title}</h1>
    <div><button class="copy-btn" id="copyBtn" onclick="copyForWechat()">📋 复制为微信格式</button></div>
  </div>
  ${fragments.join('\n\n')}
</div>
<script>
function copyForWechat() {
  const btn = document.getElementById('copyBtn');
  const source = document.getElementById('container');
  const clone = source.cloneNode(true);
  clone.querySelectorAll('.copy-btn').forEach(b => { const p = b.parentElement; if (p) p.remove(); });
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:620px;background-color:#fff;';
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
</html>`;

  const outputPath = `./data/projects/${projectId}/output.html`;
  fs.writeFileSync(outputPath, fullHtml, 'utf-8');
  console.log('完整 HTML 已保存:', outputPath);

  // 清理临时文件
  fs.rmSync(fragmentsDir, { recursive: true, force: true });
  console.log('已清理临时片段目录');

  console.log('\n===== 完成 =====\n');
}

main().catch(e => {
  console.error('主流程异常:', e);
  process.exit(1);
});