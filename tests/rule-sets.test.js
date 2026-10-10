const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("../rules.js");
const ruleSetsLib = require("../scripts/rule-sets-lib.js");

const ruleSetsDirectory = path.join(__dirname, "..", "rule-sets");

test("默认上游中的每个社区规则都可以进入导入预览", () => {
  const index = JSON.parse(fs.readFileSync(path.join(ruleSetsDirectory, "index.json"), "utf8"));
  const parsedIndex = RuleEngine.parseRuleIndex(
    index,
    "https://rules.example.com/rule-sets/index.json"
  );
  assert.equal(parsedIndex.valid, true);

  for (const fileName of index.files) {
    const content = JSON.parse(fs.readFileSync(path.join(ruleSetsDirectory, fileName), "utf8"));
    const parsed = RuleEngine.parseRuleSet(content);
    assert.equal(parsed.valid, true, `${fileName} 应该是有效规则集`);
  }
});

test("index.json 生成结果固定使用 LF", () => {
  const serialized = ruleSetsLib.serializeIndex(
    ruleSetsLib.buildIndex(ruleSetsLib.readJson(ruleSetsLib.indexPath))
  );
  assert.equal(serialized.includes("\r"), false, "生成结果不应包含 CR");
  assert.equal(serialized.endsWith("\n"), true, "生成结果应以换行结尾");
});

test("索引同步检查忽略 CRLF 与 LF 的差异", () => {
  const serialized = ruleSetsLib.serializeIndex(
    ruleSetsLib.buildIndex(ruleSetsLib.readJson(ruleSetsLib.indexPath))
  );
  const crlf = serialized.replace(/\n/g, "\r\n");

  assert.equal(ruleSetsLib.normalizeNewlines(crlf), serialized);
  assert.notEqual(crlf, serialized, "测试前提：CRLF 版本应与 LF 版本字节不同");
});

test("本地 index.json 与目录内容一致", () => {
  const result = ruleSetsLib.syncRuleIndex({ check: true });
  assert.equal(result.changed, false, "rule-sets/index.json 应与 rule-sets/*.json 保持同步");
});
