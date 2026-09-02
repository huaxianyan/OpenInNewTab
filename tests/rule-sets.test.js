const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("../rules.js");

const ruleSetsDirectory = path.join(__dirname, "..", "rule-sets");

test("默认上游中的每个社区规则都可以进入导入预览", () => {
  const index = JSON.parse(fs.readFileSync(path.join(ruleSetsDirectory, "index.json"), "utf8"));
  const parsedIndex = RuleEngine.parseRuleIndex(
    index,
    "https://rules.example.com/rule-sets/index.json"
  );
  assert.equal(parsedIndex.valid, true);
  assert.deepEqual(index.files, ["v2ex.json", "nga.json", "psnine.json"]);

  for (const fileName of index.files) {
    const content = JSON.parse(fs.readFileSync(path.join(ruleSetsDirectory, fileName), "utf8"));
    const parsed = RuleEngine.parseRuleSet(content);
    assert.equal(parsed.valid, true, `${fileName} 应该是有效规则集`);
  }
});
