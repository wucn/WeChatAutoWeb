import fs from 'node:fs';
import path from 'node:path';

// 读取配置
const config = JSON.parse(fs.readFileSync('./config/ai.json', 'utf-8'));
const baseUrl = config.baseUrl.replace(/\/+$/, '');
const apiKey = config.apiKey;
const model = config.model;
const timeout = (config.timeout || 120) * 1000;

console.log('配置:', { baseUrl, model, timeout: timeout + 'ms' });

// 读取 skill 规则
const skillPath = './skills/md转微信文章-skill.md';
const rules = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf-8') : '';

// 分段生成系统提示（简化版，减少复杂度）
const fragmentSystem = `把用户给出的 markdown 文章片段转成微信公众号文章的 HTML 卡片片段。

输出要求：
1. 只输出 HTML 片段（一个 <div> 卡片），不要 <!DOCTYPE>、<html>、<head>、<body>、<script>、<style>
2. 卡片样式：background-color:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:14px
3. h2 标题：background-color 按段顺序循环（紫#7c3aed→粉#ec4899→橙#f97316→青#22d3ee→绿#10b981→蓝#3b82f6）
4. 代码块用深色背景 #0f172a，每行一个 <tr>
5. 表格用原生 <table>，样式内联
6. 所有样式内联，不使用 class

只输出 HTML，不要 markdown 代码围栏，不要解释。`;

// 读取 article 并分段
const article = fs.readFileSync('./data/projects/1782440011168-0b8fit/article.md', 'utf-8');
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

console.log('分段数:', sections.length);
for (let i = 0; i < sections.length; i++) {
  const exists = fs.existsSync(`./data/projects/1782440011168-0b8fit/fragments/${i}.html`);
  console.log(`段${i}: ${sections[i].slice(0, 40).replace(/\n/g, ' ')}... ${exists ? '✓已存在' : '待生成'}`);
}

// 颜色循环
const colors = ['#ec4899', '#f97316', '#22d3ee', '#10b981', '#3b82f6'];

async function generateFragment(index) {
  let content = sections[index];
  const color = colors[(index - 2) % colors.length]; // 从第2段开始用新颜色
  const fragmentsDir = './data/projects/1782440011168-0b8fit/fragments';
  const fragFile = path.join(fragmentsDir, `${index}.html`);

  // 检查是否已存在
  if (fs.existsSync(fragFile)) {
    console.log(`跳过段${index}（已存在）`);
    return true;
  }

  // 如果内容过长，截断到2000字符（避免超时）
  const MAX_LEN = 2000;
  if (content.length > MAX_LEN) {
    console.log(`段${index}过长(${content.length}字符)，截断到${MAX_LEN}字符`);
    content = content.slice(0, MAX_LEN) + '\n\n...（内容过长已截断）';
  }

  console.log(`生成段${index}，长度: ${content.length} 字符，颜色: ${color}`);
  console.log(`内容预览: ${content.slice(0, 100).replace(/\n/g, ' ')}...`);

  const url = `${baseUrl}/v1/chat/completions`;
  const body = {
    model: model,
    max_tokens: 16384,
    messages: [
      { role: 'system', content: fragmentSystem },
      { role: 'user', content: content }
    ]
  };

  console.log('发送请求...');
  const startTime = Date.now();

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`响应收到，耗时: ${elapsed}s，状态: ${resp.status}`);

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`段${index}失败: ${resp.status} ${resp.statusText}`);
      console.error('响应内容:', text.slice(0, 500));
      return false;
    }

    const data = await resp.json();
    let html = data.choices?.[0]?.message?.content || '';

    console.log(`原始返回长度: ${html.length}`);

    html = html.trim()
      .replace(/^\s*```[a-zA-Z]*\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    if (!html) {
      console.error(`段${index}返回为空`);
      return false;
    }

    fs.writeFileSync(fragFile, html, 'utf-8');
    console.log(`段${index}完成，写入: ${fragFile}，大小: ${html.length}`);
    return true;
  } catch (e) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(`段${index}异常 (${elapsed}s):`, e.message);
    return false;
  }
}

// 生成剩余片段（从第2段开始）
async function main() {
  console.log('\n开始生成剩余片段...\n');

  for (let i = 2; i < sections.length; i++) {
    console.log(`\n===== 处理段${i} =====`);
    const ok = await generateFragment(i);
    if (!ok) {
      console.log(`\n中断，已完成到段${i-1}`);
      process.exit(1);
    }
    // 每段之间休息2秒
    if (i < sections.length - 1) {
      console.log('等待2秒...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n所有片段生成完成！');
}

main().catch(e => {
  console.error('主流程异常:', e);
  process.exit(1);
});