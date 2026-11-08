import fs from 'node:fs';

const report = JSON.parse(fs.readFileSync('public/dishes/_candidates/_report.json', 'utf8'));
const picked = fs
  .readdirSync('public/dishes')
  .filter((f) => f.endsWith('.jpg'))
  .map((f) => f.replace(/\.jpg$/, ''));

const rows = [];
for (const dish of picked) {
  const cands = report.filter((x) => x.dish === dish);
  const used = cands.find((x) => x.file.replace(/\\/g, '/').endsWith(`${dish}-1.jpg`)) ?? cands[0];
  if (used) rows.push(`| ${dish} | ${used.host} | ${used.page} |`);
}
rows.sort((a, b) => a.localeCompare(b, 'zh'));

const md = `# 菜品图片来源

这些图由 \`npm run photos:bing\` 从 Bing 图片搜索抓取（脚本按域名优先取菜谱站/门户站的图），
再人工过目替换过几张。**版权归原作者与原站点，本仓库仅作 1024 造物节演示使用**。
若要正式商用，请按上表出处逐一取得授权，或换成自有素材。

| 菜名 | 来源域名 | 原页面 |
|---|---|---|
${rows.join('\n')}
`;

fs.writeFileSync('public/dishes/SOURCES.md', md);
console.log('sources rows', rows.length);
