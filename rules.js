(() => {
  "use strict";

  const MATCH_PATTERN = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/i;
  const MODES = new Set(["compatible", "force"]);
  const RULE_SET_FORMAT = "open-in-new-tab-rules";
  const RULE_SET_VERSION = 1;

  function escapeRegExp(value) {
    return value.replace(/[|\\{}()[\]^$+?.-]/g, "\\$&");
  }

  function parsePattern(pattern) {
    if (typeof pattern !== "string") return null;
    const match = pattern.trim().match(MATCH_PATTERN);
    if (!match) return null;

    return {
      scheme: match[1].toLowerCase(),
      host: match[2].toLowerCase(),
      path: match[3]
    };
  }

  function hostMatches(patternHost, hostname) {
    if (patternHost === "*") return true;
    if (!patternHost.startsWith("*.")) return hostname === patternHost;

    const base = patternHost.slice(2);
    return hostname === base || hostname.endsWith(`.${base}`);
  }

  function matchesPage(pattern, url) {
    const parsed = parsePattern(pattern);
    if (!parsed) return false;

    let target;
    try {
      target = new URL(url);
    } catch {
      return false;
    }

    const targetScheme = target.protocol.slice(0, -1).toLowerCase();
    const schemeMatches = parsed.scheme === "*"
      ? targetScheme === "http" || targetScheme === "https"
      : targetScheme === parsed.scheme;

    if (!schemeMatches || !hostMatches(parsed.host, target.hostname.toLowerCase())) {
      return false;
    }

    const pathPattern = escapeRegExp(parsed.path).replace(/\*/g, ".*");
    const path = `${target.pathname}${target.search}${target.hash}`;
    return new RegExp(`^${pathPattern}$`).test(path);
  }

  function permissionPattern(pagePattern) {
    const parsed = parsePattern(pagePattern);
    if (!parsed || parsed.scheme === "file" || parsed.scheme === "ftp") return null;
    return `${parsed.scheme}://${parsed.host}/*`;
  }

  function validateRule(rule, validateSelector) {
    if (!rule || typeof rule !== "object") {
      return { valid: false, error: "规则内容无效。" };
    }
    if (!rule.name || !rule.name.trim()) {
      return { valid: false, field: "name", error: "请填写规则名称。" };
    }
    if (!parsePattern(rule.pagePattern) || !permissionPattern(rule.pagePattern)) {
      return {
        valid: false,
        field: "pagePattern",
        error: "页面范围格式无效，例如 https://www.example.com/*。"
      };
    }
    if (!rule.linkSelector || !rule.linkSelector.trim()) {
      return { valid: false, field: "linkSelector", error: "请填写链接选择器。" };
    }
    if (validateSelector) {
      try {
        validateSelector(rule.linkSelector);
        if (rule.excludeSelector) validateSelector(rule.excludeSelector);
      } catch {
        return { valid: false, field: "linkSelector", error: "CSS 选择器格式无效。" };
      }
    }
    if (!MODES.has(rule.mode)) {
      return { valid: false, field: "mode", error: "请选择打开方式。" };
    }
    return { valid: true };
  }

  function normalizeRule(rule) {
    return {
      id: String(rule.id ?? ""),
      name: String(rule.name ?? "").trim(),
      enabled: rule.enabled !== false,
      pagePattern: String(rule.pagePattern ?? "").trim(),
      linkSelector: String(rule.linkSelector ?? "").trim(),
      excludeSelector: String(rule.excludeSelector || "").trim(),
      mode: MODES.has(rule.mode) ? rule.mode : "compatible"
    };
  }

  function ruleIdentity(rule) {
    return `${rule.pagePattern}\n${rule.linkSelector}`;
  }

  function createRuleSet(rules, metadata = {}) {
    return {
      format: RULE_SET_FORMAT,
      version: RULE_SET_VERSION,
      title: String(metadata.title || "OpenInNewTab 规则").trim(),
      description: String(metadata.description || "").trim(),
      homepage: String(metadata.homepage || "").trim(),
      rules: rules.map((rule) => {
        const normalized = normalizeRule(rule);
        return {
          name: normalized.name,
          enabled: normalized.enabled,
          pagePattern: normalized.pagePattern,
          linkSelector: normalized.linkSelector,
          excludeSelector: normalized.excludeSelector,
          mode: normalized.mode
        };
      })
    };
  }

  function parseRuleSet(input, validateSelector) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { valid: false, error: "规则文件内容无效。" };
    }
    if (input.format !== RULE_SET_FORMAT || input.version !== RULE_SET_VERSION) {
      return { valid: false, error: "规则文件格式或版本不受支持。" };
    }
    if (!Array.isArray(input.rules) || input.rules.length === 0) {
      return { valid: false, error: "规则文件中没有可导入的规则。" };
    }

    const rules = [];
    for (let index = 0; index < input.rules.length; index += 1) {
      const rule = normalizeRule({ ...input.rules[index], id: `import-${index}` });
      const validation = validateRule(rule, validateSelector);
      if (!validation.valid) {
        return {
          valid: false,
          error: `第 ${index + 1} 条规则无效：${validation.error}`
        };
      }
      rules.push(rule);
    }

    return {
      valid: true,
      value: {
        title: String(input.title || "未命名规则集").trim(),
        description: String(input.description || "").trim(),
        homepage: String(input.homepage || "").trim(),
        rules
      }
    };
  }

  globalThis.RuleEngine = Object.freeze({
    RULE_SET_FORMAT,
    RULE_SET_VERSION,
    createRuleSet,
    matchesPage,
    normalizeRule,
    parsePattern,
    parseRuleSet,
    permissionPattern,
    ruleIdentity,
    validateRule
  });
})();
