// 清洗 bing4a 批次名单：去掉空行与含反斜杠/换行的坏行（来源：generated TS 解析噪声）
import fs from "node:fs";

const file = process.argv[2] || "bing4a-batch2.txt";
const lines = fs
  .readFileSync(file, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.includes("\\") && !/[\r\n]/.test(l));
fs.writeFileSync(file, [...new Set(lines)].join("\n"));
console.log("cleaned lines:", lines.length);
