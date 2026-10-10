// 根据 rule-sets/ 目录内容自动重写 index.json，新增或删除规则文件后运行即可。
//
//   node scripts/sync-rule-index.mjs              # 写入 index.json
//   node scripts/sync-rule-index.mjs --check      # 只检查是否同步（不写文件）
//   node scripts/sync-rule-index.mjs --validate   # 只校验规则文件是否合法
//
// 会保留 index.json 里人工维护的 title / description，只重算 files 列表。
// GitHub Actions 在合并到 main 后会自动运行本脚本，贡献者不需要手工维护索引。

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { indexPath, listRuleSetFiles, syncRuleIndex, validateRuleSetFiles } = require("./rule-sets-lib.js");

const flags = new Set(process.argv.slice(2));
const checkOnly = flags.has("--check");
const validateOnly = flags.has("--validate");

try {
  if (validateOnly) {
    const files = listRuleSetFiles();
    validateRuleSetFiles(files);
    console.log(`已校验 ${files.length} 个规则文件，全部有效。`);
    process.exit(0);
  }

  const result = syncRuleIndex({ check: checkOnly });

  if (!result.changed) {
    console.log(`rule-sets/index.json 已是最新，共 ${result.files.length} 个规则集。`);
    process.exit(0);
  }

  if (checkOnly) {
    console.error("rule-sets/index.json 与目录内容不一致。");
    console.error("运行 node scripts/sync-rule-index.mjs 重新生成后再提交。");
    process.exit(1);
  }

  console.log(`已更新 ${indexPath}`);
  console.log(`共 ${result.files.length} 个规则集：${result.files.join(", ")}`);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
