# Release Checklist（发版流程）

约定：版本号用 `npm version <patch|minor|major>` 提升（同步改 package.json 并打 `v*` tag）；
发版说明维护在根目录 `CHANGELOG.md`（Keep a Changelog 格式）。

## 步骤

1. **门禁确认**：main 分支 CI 全绿（lint / typecheck / coverage ≥70% / build）；`npm run test:integration` 本地通过。
2. **更新 CHANGELOG.md**：把 `Unreleased` 段拆到新版本段（版本号 + 日期），空出新的 `Unreleased`。
3. **打版本**：`npm version <x.y.z> -m "chore(release): v<x.y.z>"`，然后 `git push --follow-tags origin main`。
4. **CI 打包**：`v*` tag 自动触发 `package` job，构建 NSIS 安装包并上传 artifact（Setup.exe / blockmap / latest.yml）。
5. **GitHub Release**：基于该 tag 创建 Release，下载 CI 产物并上传；生成校验文件：
   `sha256sum release/*.exe > SHA256SUMS.txt`（Windows 可用 `certutil -hashfile <exe> SHA256`）。
6. **桌面冒烟**（两项都要）：覆盖安装 + 全新安装 → 启动非黑屏 → 托盘菜单逐项 → 浮窗显示/拖拽 → 代理加 key → 非流式 + 流式各一发 → 缓存命中 → 重启进程数据仍在 → 卸载后 `%APPDATA%` 数据处置符合预期。
7. **收尾**：如有版本徽章/文档引用，同步更新。

## 已知坑

- **NSIS 工具链首跑**：electron-builder 首次下载 winCodeSign/nsis，需前台运行且超时 >420s。
- **无代码签名**：SmartScreen 会拦截安装包；发布页附 SHA256SUMS 供校验，README 说明「仍要运行」处置方式。
- **asar 临时关闭**：`package.json` 中 `"asar": false` 是黑屏排查期的临时手段，恢复 asar（A5）前必须完整桌面实测。
- **端口顺延**：后端端口被占会自动 +1，Electron 主窗绑定实际端口（A3 已处理），发版冒烟时留意日志中的实际端口。
