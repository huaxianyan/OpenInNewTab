"use strict";

// rule-sets/ 目录与 index.json 的唯一维护入口。
// CLI 脚本（sync-rule-index.mjs / export-chrome-rules.mjs）和测试都从这里取逻辑，
// 避免在多个脚本里各写一份文件列表规则。

const fs = require("node:fs");
const path = require("node:path");

require("../rules.js");
const { RuleEngine } = globalThis;

const projectRoot = path.resolve(__dirname, "..");
const ruleSetsDirectory = path.join(projectRoot, "rule-sets");
const indexPath = path.join(ruleSetsDirectory, "index.json");

const DEFAULT_INDEX_TITLE = "OpenInNewTab 社区规则";
const DEFAULT_INDEX_DESCRIPTION = "选择适合目标网站的规则集，导入前可以查看并取消不需要的规则。";
const DEFAULT_HOMEPAGE = "https://github.com/huaxianyan/OpenInNewTab/tree/main/rule-sets";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// 索引里列出的规则文件：目录下所有 .json，排除 index.json 自身，按文件名排序。
function listRuleSetFiles() {
  return fs.readdirSync(ruleSetsDirectory)
    .filter((name) => name.toLowerCase().endsWith(".json") && name !== "index.json")
    .sort((a, b) => a.localeCompare(b, "en"));
}

// 保留 index.json 里人工写的 title / description，只重算 files。
function buildIndex(existingIndex) {
  return {
    format: RuleEngine.RULE_INDEX_FORMAT,
    version: RuleEngine.RULE_INDEX_VERSION,
    title: existingIndex?.title || DEFAULT_INDEX_TITLE,
    description: existingIndex?.description || DEFAULT_INDEX_DESCRIPTION,
    files: listRuleSetFiles()
  };
}

function serializeIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

// 逐个校验规则文件；任何一个不合法都会抛错，避免把坏文件写进索引。
function validateRuleSetFiles(files = listRuleSetFiles()) {
  for (const fileName of files) {
    const parsed = RuleEngine.parseRuleSet(readJson(path.join(ruleSetsDirectory, fileName)));
    if (!parsed.valid) {
      throw new Error(`规则文件无效：${fileName}：${parsed.error}`);
    }
  }
}

function syncRuleIndex({ check = false } = {}) {
  const files = listRuleSetFiles();
  validateRuleSetFiles(files);

  const existing = fs.existsSync(indexPath) ? readJson(indexPath) : null;
  const serialized = serializeIndex(buildIndex(existing));
  const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : null;

  if (current === serialized) {
    return { changed: false, written: false, files };
  }
  if (check) {
    return { changed: true, written: false, files };
  }
  fs.writeFileSync(indexPath, serialized);
  return { changed: true, written: true, files };
}

// 站点命名沿用 RuleEngine.siteName，保证扩展导出与仓库脚本产出同名文件。
const siteName = RuleEngine.siteName;

module.exports = {
  DEFAULT_HOMEPAGE,
  DEFAULT_INDEX_DESCRIPTION,
  DEFAULT_INDEX_TITLE,
  RuleEngine,
  buildIndex,
  indexPath,
  listRuleSetFiles,
  projectRoot,
  readJson,
  ruleSetsDirectory,
  serializeIndex,
  siteName,
  syncRuleIndex,
  validateRuleSetFiles
};
