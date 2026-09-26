// lz4js 无自带类型声明，这里按实际导出面补齐（compress/decompress 均为 Uint8Array → Uint8Array，同步）
declare module "lz4js" {
  export function compress(src: Uint8Array, maxSize?: number): Uint8Array
  export function decompress(src: Uint8Array, maxSize?: number): Uint8Array
}
