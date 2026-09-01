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
