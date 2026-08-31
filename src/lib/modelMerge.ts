// 纯函数：模型列表合并与启用集计算（无副作用，便于单元测试）
// 背景：自动获取模型时，必须把「自动拉取的模型」与「用户手动添加的模型」合并，
// 否则重新拉取会覆盖清空用户已录入的清单（bankofai 等 /models 返回空时的兜底场景）。

/**
 * 合并已存在的模型清单与本次自动获取到的清单，去重。
 * - 顺序：保留 existing 在前，新 fetched 追加在后（保持用户已添加项的相对顺序）。
 * - 空/undefined 的 existing 安全处理为 []。
 */
export function mergeModels(
  existing: string[] | undefined | null,
  fetched: string[],
): string[] {
  return Array.from(new Set([...(existing ?? []), ...fetched]));
}

/**
 * 计算启用集：
 * - prevEnabled 为空（首次 / 无记录）→ 默认全部启用（merged 全量）。
 * - 否则只保留此前已启用的项，避免重新拉取后把用户手动关闭的模型又打开。
 */
export function computeEnabledModels(
  merged: string[],
  prevEnabled: string[] | undefined | null,
): string[] {
  if (!prevEnabled || prevEnabled.length === 0) return merged;
  return merged.filter((m) => prevEnabled.includes(m));
}
