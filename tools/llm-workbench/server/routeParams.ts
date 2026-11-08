import type { Request } from 'express';

/**
 * 扁平路由参数。
 *
 * `@types/express` v5 把 `ParamsDictionary` 的值放宽为 `string | string[]`
 * ——为 path-to-regexp v8 的**具名通配**让路（`*splat` 的值是分段数组）。
 * 本仓库所有 `:param` 都是单段，用这个别名把语义收窄回字符串，
 * 避免在每个调用点写 cast：`app.get('/x/:id', (req: Request<FlatParams>, res) => ...)`。
 */
export type FlatParams = Record<string, string>;

/**
 * 取具名通配（`*splat`）捕获的剩余路径，归一化成 Express 4 的整串语义。
 *
 * 差异（已用 express@4.22.3 与 express@5.2.1 逐 URL 实测对齐）：
 * - v4 `req.params[0]`：不含拖尾斜杠的整串；零段时为 `''`
 * - v5 `req.params.splat`：分段数组；零段时为 `undefined`
 *
 * 故 `join('/')` 还原整串，`undefined` 还原为空串。
 */
export const wildcardPath = (req: Request): string => {
  const raw = (req.params as Record<string, unknown>).splat;
  if (Array.isArray(raw)) return raw.join('/');
  return typeof raw === 'string' ? raw : '';
};
