const test = require("node:test");
const assert = require("node:assert/strict");

require("../rules.js");

test("页面范围同时匹配主域名、子域名和指定路径", () => {
  assert.equal(
    RuleEngine.matchesPage("https://*.example.com/topics/*", "https://example.com/topics/1"),
    true
  );
  assert.equal(
    RuleEngine.matchesPage("https://*.example.com/topics/*", "https://www.example.com/topics/2?q=all"),
    true
  );
  assert.equal(
    RuleEngine.matchesPage("https://*.example.com/topics/*", "https://www.example.com/members/2"),
    false
  );
});

test("页面范围转换为对应的站点授权范围", () => {
  assert.equal(
    RuleEngine.permissionPattern("https://www.example.com/topics/*"),
    "https://www.example.com/*"
  );
});

test("完整规则通过验证并被规范化", () => {
  const rule = RuleEngine.normalizeRule({
    id: 42,
    name: " 主题链接 ",
    enabled: true,
    pagePattern: " https://www.example.com/* ",
    linkSelector: " a.topic ",
    mode: "compatible"
  });

  assert.equal(RuleEngine.validateRule(rule).valid, true);
  assert.deepEqual(rule, {
    id: "42",
    name: "主题链接",
    enabled: true,
    pagePattern: "https://www.example.com/*",
    linkSelector: "a.topic",
    excludeSelector: "",
    mode: "compatible"
  });
});

test("导出的规则集可以预览并重新导入", () => {
  const exported = RuleEngine.createRuleSet([{
    id: "local-id",
    name: "主题链接",
    enabled: true,
    pagePattern: "https://www.example.com/*",
    linkSelector: "a.topic",
    excludeSelector: "a.pagination",
    mode: "force"
  }], {
    title: "示例规则",
    description: "用于测试规则集格式。",
    homepage: "https://example.com/rules"
  });
  const parsed = RuleEngine.parseRuleSet(exported);

  assert.equal(parsed.valid, true);
  assert.equal(parsed.value.title, "示例规则");
  assert.deepEqual(parsed.value.rules[0], {
    id: "import-0",
    name: "主题链接",
    enabled: true,
    pagePattern: "https://www.example.com/*",
    linkSelector: "a.topic",
    excludeSelector: "a.pagination",
    mode: "force"
  });
});

test("不支持的规则集版本不会进入导入预览", () => {
  const parsed = RuleEngine.parseRuleSet({
    format: "open-in-new-tab-rules",
    version: 2,
    rules: [{}]
  });

  assert.equal(parsed.valid, false);
  assert.equal(parsed.error, "规则文件格式或版本不受支持。");
});
