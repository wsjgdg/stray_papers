import { defineConfig } from '@playwright/test';

// F3：Electron 窗口级冒烟配置。需先产出打包产物（见 test:electron 说明）再运行。
export default defineConfig({
  testDir: '.',
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list']],
  // 不自动启动 web server：Electron 主进程内已拉起后端（ELECTRON_PORT=8790）。
  workers: 1,
});
