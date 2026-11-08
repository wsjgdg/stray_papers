/**
 * 离线能力：只在正式构建里注册，开发与预览态不注册，避免缓存干扰调试。
 * 注册后断网也能打开继续玩；在线时始终走网络拿最新资源。
 */
if (
  import.meta.env.PROD &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        /* 离线能力不可用不影响游戏本体 */
      })
  })
}

export {}
