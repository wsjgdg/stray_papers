/**
 * Node 原生跑 TS 数据层时，补齐「不带后缀的相对导入」→ .ts。
 * 仅供 scripts/*.mjs 校验脚本使用（node --import ./scripts/ts-ext-resolve.mjs），
 * 不参与构建、不影响 vite/tsc 的解析规则。
 */
import { registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      const isRelative =
        specifier.startsWith("./") ||
        specifier.startsWith("../") ||
        specifier.startsWith("/")
      if (isRelative && !/\.[mc]?[jt]sx?$|node:/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw error
    }
  },
})
