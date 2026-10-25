# 部署与更新手册（给其他 agent / 协作者）

本项目由 **WorkBuddy 应用托管**（http-service），入口 `npm start`，监听 `PORT`（默认 3000）。
线上地址：`https://huaxia-explore.app.workbuddy.host/`，**所有路径都必须带 `?sharecode=`**，否则网关返回 403。

---

## 一、标准流程（5 步）

```bash
cd <workspace>/spot-visual

# 1. 同步（main 可能被并行会话推进，先拉再改）
git fetch origin main
git status -sb          # 若 behind，先 rebase 或 merge，别直接开发

# 2. 改代码

# 3. 门禁（两条都要过）
npx tsc --noEmit
npm run build           # 会跑 next build + 生成图片清单 + 注入 sharecode

# 4. 本地自测（可选）
node server.mjs         # 或 npm start（会重新 build，慢）
# 打开 http://localhost:3000/food

# 5. 提交并推送（SSH，HTTPS 在本机不通）
git add <具体文件>       # 别用 git add -A，工作区常有别模块的 WIP
git commit -m "feat(xxx): ..."
git push origin HEAD:main
```

## 二、部署

用托管平台的 deploy 工具，参数固定：

| 参数 | 值 |
|---|---|
| appName | `华夏探索` |
| directory | `<workspace>\spot-visual` |
| domainPrefix | `huaxia-explore` |
| language | `node` |
| startCmd | `npm start` |
| userAskedToPublish | `true` |

部署成功会返回同一个 shareLink（域名不变）。**部署会重新 build**，所以本地 build 通过即可。

## 三、部署后验证

```bash
# 页面
curl -o /dev/null -w "%{http_code}\n" "https://huaxia-explore.app.workbuddy.host/food?sharecode=N25J3RDNKG&v=$(date +%s)"

# 关键文案/元素（例）
curl -s "https://huaxia-explore.app.workbuddy.host/food?sharecode=N25J3RDNKG" | grep -o "菜肴级钠 [0-9]* / 432"
```

注意：
- **必须带 `sharecode`**，否则 403
- 部署后**首次请求可能慢或 404**（CDN 回源），等 60–90 秒再验，或重试一次
- 加 `&v=<时间戳>` 绕开 CDN 缓存，否则看到的可能是旧版本

## 四、必踩的坑

| 坑 | 现象 | 处理 |
|---|---|---|
| **sharecode 透传** | 页面能开但接口/静态数据 403 | 新增的 `fetch` 一律用 `withSharecode(url)`；新增页面用 `useSearchParams` 拼 `?sharecode=` |
| **图片清单是生成的** | 加了图但页面不显示 | 跑 `npm run photos`（= build-dish-manifest），再 build |
| **`useSearchParams` 预渲染报错** | `next build` 在 `/about` 失败 | 页面必须包 `<Suspense>`，参考 `src/app/about/page.tsx` |
| **`.genie` 标记文件** | 删掉后托管面板找不到应用 | 不要删 workspace 根目录的 `.<appId>.genie` |
| **git 历史分叉** | `push` 报 non-fast-forward | `git fetch` → `git rebase origin/main`（有冲突先解决）→ 再推；**不要 force push** |
| **`git add -A`** | 把别的模块 WIP 一起提交 | 只 add 自己改的文件 |
| **CRLF** | 脚本里做多行字符串替换匹配不到 | 读文件后先 `.replace(/\r\n/g,'\n')` |
| **中文路径** | pdf/图片脚本 FileNotFound | Python 用 `r"C:\..."` 绝对路径；bash 里用 `/c/...` |

## 五、构建产物与生成文件（勿手改）

| 文件 | 由谁生成 |
|---|---|
| `src/lib/dish-photos.generated.ts` | `scripts/build-dish-manifest.mjs` |
| `src/lib/dish-sodium.generated.ts` | `scripts/gen-dish-sodium.py`（含人工确认名单 MANUAL/BLOCK） |
| `src/lib/dish-impact.generated.ts` | `scripts/gen-dish-impact.py` |
| `src/lib/ingredient-city.generated.ts` | `scripts/gen-city-ingredients.mjs` |
| 页面里的 sharecode 注入 | `scripts/inject-sharecode.mjs`（build 时自动跑） |

## 六、回滚

```bash
git log --oneline -5
git revert <commit>        # 生成反向提交，再推
# 或用平台重新部署上一个 commit 的状态
```

不要用 `git reset --hard` + force push，会和其他会话的并行提交冲突。
