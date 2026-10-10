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

test("排除选择器列表不会拆开括号和属性中的逗号", () => {
  assert.deepEqual(
    RuleEngine.splitSelectorList("a.pagination, :is(a.author, a.avatar), a[data-name='a,b']"),
    ["a.pagination", ":is(a.author, a.avatar)", "a[data-name='a,b']"]
  );
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

test("规则上游索引将相对文件地址解析到当前站点", () => {
  const parsed = RuleEngine.parseRuleIndex({
    format: "open-in-new-tab-rule-index",
    version: 1,
    title: "示例上游",
    files: ["v2ex.json", "nested/other.json"]
  }, "https://rules.example.com/community/index.json");

  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.value.files, [
    "https://rules.example.com/community/v2ex.json",
    "https://rules.example.com/community/nested/other.json"
  ]);
});

test("规则上游不能引用未获授权的其他站点", () => {
  const parsed = RuleEngine.parseRuleIndex({
    format: "open-in-new-tab-rule-index",
    version: 1,
    files: ["https://other.example.com/rules.json"]
  }, "https://rules.example.com/index.json");

  assert.equal(parsed.valid, false);
  assert.equal(parsed.error, "规则文件必须与规则上游位于同一站点。");
});

test("站点文件名沿用仓库命名约定", () => {
  assert.equal(RuleEngine.siteName("www.v2ex.com"), "v2ex");
  assert.equal(RuleEngine.siteName("bbs.nga.cn"), "nga");
  assert.equal(RuleEngine.siteName("psnine.com"), "psnine");
});

test("社区导出按站点分组并生成规则文件名", () => {
  const rules = [
    RuleEngine.normalizeRule({ name: "a", pagePattern: "https://www.v2ex.com/*", linkSelector: "a", mode: "compatible" }),
    RuleEngine.normalizeRule({ name: "b", pagePattern: "https://www.v2ex.com/t/*", linkSelector: "b", mode: "force" }),
    RuleEngine.normalizeRule({ name: "c", pagePattern: "https://psnine.com/*", linkSelector: "a", mode: "compatible" })
  ];

  const groups = RuleEngine.groupRulesByHost(rules);
  assert.deepEqual([...groups.keys()], ["www.v2ex.com", "psnine.com"]);
  assert.equal(groups.get("www.v2ex.com").length, 2);

  const names = RuleEngine.ruleSetFileNames([...groups.keys()]);
  assert.equal(names.get("www.v2ex.com"), "v2ex.json");
  assert.equal(names.get("psnine.com"), "psnine.json");
});

test("同站不同子域导致重名时文件名不冲突", () => {
  const names = RuleEngine.ruleSetFileNames(["www.example.com", "shop.example.com"]);
  const values = [...names.values()];

  assert.equal(values[0], "example.json");
  assert.equal(new Set(values).size, 2);
  assert.match(values[1], /^example-shop-example-com\.json$/);
});
