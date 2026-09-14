import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

// F3：Electron 窗口级冒烟（替代纯模块级 vitest 的盲区）。
//
// 运行前提（本机，非 CI 默认门禁）：
//   1) 产打包产物： npm run electron:build:portable   （输出 release/win-unpacked/LLM Workbench.exe）
//   2) 装测试运行器： npm i -D @playwright/test && npx playwright install   （_electron 用项目自带 electron，无需下载浏览器）
//   3) 需显示：Windows 直接跑；Linux 用 xvfb-run 包裹
//   4) 运行： npm run test:electron
//
// 依赖未装 / 无显示时本文件不参与 CI（未并入 `npm test`），仅作回归基线交付。

const EXE = path.resolve(process.cwd(), 'release/win-unpacked', 'LLM Workbench.exe');
const PORT = 8790;

test('启动后主窗口加载，首 tab（本地代理）渲染，且 /api/health 就绪', async () => {
  const app = await electron.launch({ executablePath: EXE });
  const win = await app.firstWindow();

  // 窗口标题
  await expect(win).toHaveTitle(/LLM Workbench/i);

  // 首 tab 内容渲染：本地代理面板可见
  await expect(win.getByText('本地代理', { exact: false }).first()).toBeVisible({
    timeout: 20000,
  });

  // 后端健康自检（主进程内已拉起 server.cjs）
  const healthy = await app.evaluate(async (port: number) => {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      return r.ok;
    } catch {
      return false;
    }
  }, PORT);
  expect(healthy).toBe(true);

  // 统一端点模型目录可用
  const models = await app.evaluate(async (port: number) => {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/v1/models`);
      return r.ok;
    } catch {
      return false;
    }
  }, PORT);
  expect(models).toBe(true);

  await app.close();
});
