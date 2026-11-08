# 滚动乐团 · ScrollOrchestra

一个完全自包含、零后端依赖的纯前端音乐创作 / 乐理编曲网页应用。所有数据存于浏览器本地，AI 能力为可选增强。

- 数据持久化：浏览器 **IndexedDB**（作品 / 成绩 / 关卡），昵称存 `localStorage`
- AI 能力：**可选**。配置你自己的 OpenAI 兼容 Key 后启用；不配置则全部本地功能照常运行
- 外部依赖：**无**。不连接任何远端后端或登录 / 计费服务

## 技术栈

- Vite 8 + React 19 + TypeScript
- Tailwind CSS 3 + Radix UI + GSAP + Recharts
- 包管理：npm
- 本地存储：IndexedDB（经 `src/lib/localStore.ts`）

## 快速开始

```bash
npm install --legacy-peer-deps   # 安装依赖（含 esbuild 平台二进制，需联网一次）
npm run dev        # 开发服务器，http://localhost:8000
npm run build      # 类型检查(tsc -b) + 生产构建到 dist/
npm run preview    # 预览生产构建，http://localhost:8000
```

> 一键启动（稳定 cmd 窗口，单窗口，不用 bat）：
> - 双击 `start.cmd`（推荐）——它在**同一个 cmd 窗口**里调用 `start.ps1`，不会闪退、不会开多个窗口。
> - 或手动在 cmd 里运行 `powershell -ExecutionPolicy Bypass -File start.ps1`（或先 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 一次，之后直接 `start.ps1`）。
> 脚本在当前窗口内自动安装依赖（如缺失）并拉起 dev server、打开浏览器，结束时有 `Read-Host` 兜底。**改 `.env` 后必须重启本脚本**——Vite 只在启动时读 `.env`，运行中改文件不会热加载。

> 生产构建产物是纯静态文件，可由任意静态服务器托管（或 `npm run preview`）。
> 当前使用 `BrowserRouter` + `base "/"`；如需 `file://` 直接双击打开，请将 `vite.config.ts` 的 `base` 改为 `"./"` 并改用 `HashRouter`。

## AI 配置（可选，已内置默认）

默认主供应商为 **Agnes AI**，并自动配置 **BigModel（智谱）** 作为降级供应商。填好 `.env` 即可开箱即用：

| 变量 | 含义 | 必填 |
| --- | --- | --- |
| `AI_BASE_URL` | 主供应商 OpenAI 兼容接口基址（不含 `/chat/completions`） | 启用 AI 时必填 |
| `AI_API_KEY` | 主供应商 API Key（Bearer） | 启用 AI 时必填 |
| `AI_MODEL` | 主模型名，如 `agnes-2.5-flash` | 启用 AI 时必填 |
| `AI_FALLBACK_BASE_URL` | 降级供应商基址，默认 `https://open.bigmodel.cn/api/paas/v4` | 否 |
| `AI_FALLBACK_API_KEY` | 降级供应商 Key；留空则关闭降级 | 否 |
| `AI_FALLBACK_MODEL` | 降级模型，默认 `glm-4.7-flash` | 否 |
| `AI_XFYUN_APPID` | 讯飞开放平台 APPID（仅「朗读设置」里选「讯飞云端」时需要） | 否 |
| `AI_XFYUN_API_KEY` | 讯飞 APIKey | 否 |
| `AI_XFYUN_API_SECRET` | 讯飞 APISecret | 否 |

> 变量前缀是 `AI_`，由 `vite.config.ts` 的 `envPrefix` 暴露给前端。
> 主请求失败时自动改用降级供应商；二者均未配置时，AI 指挥台 / 智能配词优雅降级（提示「未配置」），其余功能不受影响。
> `AI_XFYUN_*` 会出现在浏览器包里（和 `AI_API_KEY` 一样是客户端可见），仅适合自用，别用生产密钥。

## 朗读引擎（TTS）

指挥回复的朗读支持三种引擎，在「朗读」汉堡菜单里切换，选择持久化在 `localStorage`：

| 引擎 | 是否需要密钥 | 音色 | 说明 |
| --- | --- | --- | --- |
| 本地语音 | 否 | 本机浏览器语音（Web Speech） | 零依赖；但本机中文语音多为同一引擎别名，**不同性格听感无差别** |
| Edge 免费云端 | 否 | 微软神经语音（晓晓 / 云希 / 晓伊 / 云扬） | **推荐**：浏览器直连微软 Edge 语音服务，无需密钥，音色最自然；按指挥性格自动选不同神经音色 |
| 讯飞云端 | 是（`AI_XFYUN_APPID` + `AI_XFYUN_API_KEY` + `AI_XFYUN_API_SECRET`） | 讯飞中文发音人（晓燕 / 究许 / 静儿 / 小萍） | WebSocket + HMAC-SHA256 鉴权，每日 500 次免费调用；按指挥性格自动选不同音色（可用，但自然度略逊于 Edge） |

> 默认用本地语音。要获得**可分辨且自然的不同音色**，**最推荐 Edge 免费云端**（无需密钥、音色最佳、四性格各选不同神经语音）；讯飞云端也可用，但自然度不如 Edge，且需密钥、每日限 500 次。
>
> ⚠ 早前反馈「Edge 云端全是低沉男声、听感无差别」，实为**音高（pitch）滑杆被拉到极低**所致，并非引擎 bug——把音高调回正常区间，四性格区分度立即恢复。语速/音高在「朗读」菜单调节。
>
> Edge 免费云端：浏览器通过 WebSocket 直连微软语音服务，鉴权令牌在前端用 `crypto.subtle` 现算，不经过任何后端。
> 讯飞云端：浏览器通过 WebSocket 直连 `tts-api.xfyun.cn/v2/tts`，签名在前端用 `crypto.subtle` 现算（HMAC-SHA256），每日 500 次免费；密钥出现在浏览器包里，仅适合个人自用。

## 功能与模块

- **乐团指挥**（ConductorPanel）：向指挥提问，获取乐理 / 编曲 / 练法建议；支持把建议一键应用到画布、生成画布体检报告、导出对话记录。
- **朗读（TTS）**：朗读指挥回复，支持三引擎（本地 / Edge 免费云端 / 讯飞云端），按指挥性格自动切换不同神经音色；可在「朗读」菜单调节语速 / 音高、开启自动朗读、选择引擎。
- **本地数据**：作品 / 成绩 / 关卡存于 IndexedDB，昵称存于 `localStorage`，跨会话保留。
- **AI 指挥台 / 智能配词**（可选）：配置后即可使用；未配置时优雅提示「未配置」，其余功能不受影响。

## 目录结构（核心）

| 模块 | 文件 |
| --- | --- |
| 本地存储（IndexedDB 读写） | `src/lib/localStore.ts` |
| 社交 / 分数数据 | `src/lib/social.ts` |
| AI 调用（OpenAI 兼容） | `src/lib/aiConfig.ts`、`src/lib/llm.ts` |
| 智能体（单次 chat 调用） | `src/lib/agent.ts` |
| 本地昵称 / 账号 | `src/lib/auth.ts` |
| 指挥面板 UI | `src/components/home/ConductorPanel.tsx` |
| 朗读引擎（本地 / Edge 免费 / 讯飞） | `src/lib/tts/`（edgeClient / xunfeiClient / voices / ssml / index） |
| 语音音量 | `src/lib/voiceVolume.ts` |

## 验证状态

- [x] `npm install` 依赖安装
- [x] `npm run build` 通过（tsc -b + vite build）
- [x] 浏览器零后端运行（无头冒烟：0 控制台错误、0 外部请求）
