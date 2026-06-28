import fs from 'node:fs';
import path from 'node:path';

const projectId = '1782440011168-0b8fit';
const fragmentsDir = path.join('./data/projects', projectId, 'fragments');

// 读取所有片段
const fragments = [];
for (let i = 0; i < 8; i++) {
  const fragFile = path.join(fragmentsDir, `${i}.html`);
  if (fs.existsSync(fragFile)) {
    fragments.push(fs.readFileSync(fragFile, 'utf-8'));
    console.log(`读取片段${i}: ${fragFile}`);
  } else {
    console.log(`缺失片段${i}`);
  }
}

console.log(`共读取 ${fragments.length} 个片段`);

// 拼接 HTML
const title = '引言：数据入口的三道防线';

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

// 写入 output.html
const outputPath = path.join('./data/projects', projectId, 'output.html');
fs.writeFileSync(outputPath, fullHtml, 'utf-8');
console.log(`写入完整 HTML: ${outputPath}`);
console.log(`大小: ${fullHtml.length} 字符`);

// 清理 fragments 目录
fs.rmSync(fragmentsDir, { recursive: true, force: true });
console.log('已清理临时片段目录');