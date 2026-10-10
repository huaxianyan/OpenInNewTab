// 把发布说明文件与追加的「## 构建信息」表拼成 GitHub Release 正文。
//
//   node scripts/build-release-body.mjs 2.2.0
//   node scripts/build-release-body.mjs            # 版本号取 manifest.json
//
// 正文 = docs/release-notes-<版本>.md + 空行 + 「## 构建信息」表（版本 + 产物 SHA-256）。
// 说明文件本身保持简短，产物信息由这里追加，和发布规范一致。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));
const version = (process.argv[2] || manifest.version).replace(/^v/, "");
const tag = `v${version}`;

const notesPath = path.join(projectRoot, "docs", `release-notes-${version}.md`);
if (!fs.existsSync(notesPath)) {
  console.error(`发布说明不存在：${notesPath}`);
  process.exit(1);
}
const notes = fs.readFileSync(notesPath, "utf8").replace(/\s+$/, "");

const archiveName = `OpenInNewTab-${version}.zip`;
const archivePath = path.join(projectRoot, "dist", archiveName);
if (!fs.existsSync(archivePath)) {
  console.error(`发布包不存在：${archivePath}`);
  console.error(`先运行 pwsh -File ./scripts/package.ps1 生成。`);
  process.exit(1);
}
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex").toUpperCase();

const body = [
  notes,
  "",
  "## 构建信息",
  "",
  "| 项目 | 值 |",
  "| --- | --- |",
  `| 版本 | \`${tag}\` |`,
  `| ${archiveName} SHA-256 | \`${sha256}\` |`,
  ""
].join("\n");

const outPath = path.join(projectRoot, "build", `release-body-${version}.md`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body);
console.log(`已生成 ${outPath}`);
console.log(`版本：${tag}`);
console.log(`产物：${archiveName}`);
console.log(`SHA256：${sha256}`);
console.log(`正文行数：${body.split("\n").length - 1}`);
