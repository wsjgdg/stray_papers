// 浮窗位置/尺寸持久化：存到 Electron userData 下的 JSON，避免每次启动都回到默认右上角。
const fs = require('node:fs');
const path = require('node:path');

let file = null;
function ensure(app) {
  if (!file) file = path.join(app.getPath('userData'), 'float-settings.json');
  return file;
}

function getBounds(app) {
  try {
    const raw = fs.readFileSync(ensure(app), 'utf8');
    const b = JSON.parse(raw);
    if (typeof b.x === 'number' && typeof b.y === 'number') return b;
  } catch {
    /* 无存档或损坏，返回 null 走默认位置 */
  }
  return null;
}

function setBounds(app, bounds) {
  try {
    fs.writeFileSync(ensure(app), JSON.stringify(bounds));
  } catch {
    /* 写入失败（权限/路径）静默忽略 */
  }
}

module.exports = { getBounds, setBounds };
