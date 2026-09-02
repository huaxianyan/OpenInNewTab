(() => {
  "use strict";

  const MATCH_PATTERN = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/i;
  const MODES = new Set(["compatible", "force"]);
  const RULE_SET_FORMAT = "open-in-new-tab-rules";
  const RULE_SET_VERSION = 1;
  const RULE_INDEX_FORMAT = "open-in-new-tab-rule-index";
  const RULE_INDEX_VERSION = 1;
  const DEFAULT_RULE_INDEX_URL = "https://raw.githubusercontent.com/huaxianyan/OpenInNewTab/main/rule-sets/index.json";

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

  function ruleSourcePermissionPattern(value) {
    try {
      const url = new URL(value);
      if ((url.protocol !== "http:" && url.protocol !== "https:") ||
          url.username || url.password) return null;
      return `${url.origin}/*`;
    } catch {
      return null;
    }
  }

  function parseRuleIndex(input, sourceUrl) {
    let baseUrl;
    try {
      baseUrl = new URL(sourceUrl);
    } catch {
      return { valid: false, error: "规则上游地址无效。" };
    }
    if (!ruleSourcePermissionPattern(baseUrl.href)) {
      return { valid: false, error: "规则上游地址必须使用 HTTP 或 HTTPS。" };
    }
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        input.format !== RULE_INDEX_FORMAT || input.version !== RULE_INDEX_VERSION) {
      return { valid: false, error: "规则上游格式或版本不受支持。" };
    }
    if (!Array.isArray(input.files) || input.files.length === 0) {
      return { valid: false, error: "规则上游中没有可用的规则集。" };
    }

    const files = [];
    for (const value of input.files) {
      if (typeof value !== "string" || !value.trim()) {
        return { valid: false, error: "规则上游包含无效的规则文件地址。" };
      }
      let url;
      try {
        url = new URL(value.trim(), baseUrl);
      } catch {
        return { valid: false, error: "规则上游包含无效的规则文件地址。" };
      }
      if (url.origin !== baseUrl.origin || !ruleSourcePermissionPattern(url.href)) {
        return { valid: false, error: "规则文件必须与规则上游位于同一站点。" };
      }
      files.push(url.href);
    }

    return {
      valid: true,
      value: {
        title: String(input.title || "云端规则").trim(),
        description: String(input.description || "").trim(),
        files: [...new Set(files)]
      }
    };
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

  function splitSelectorList(selectorList) {
    const selectors = [];
    let current = "";
    let quote = "";
    let escaped = false;
    let parentheses = 0;
    let brackets = 0;

    for (const character of String(selectorList || "")) {
      if (escaped) {
        current += character;
        escaped = false;
        continue;
      }
      if (character === "\\") {
        current += character;
        escaped = true;
        continue;
      }
      if (quote) {
        current += character;
        if (character === quote) quote = "";
        continue;
      }
      if (character === "\"" || character === "'") {
        current += character;
        quote = character;
        continue;
      }
      if (character === "(") parentheses += 1;
      else if (character === ")") parentheses = Math.max(0, parentheses - 1);
      else if (character === "[") brackets += 1;
      else if (character === "]") brackets = Math.max(0, brackets - 1);

      if (character === "," && parentheses === 0 && brackets === 0) {
        if (current.trim()) selectors.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }

    if (current.trim()) selectors.push(current.trim());
    return selectors;
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
    DEFAULT_RULE_INDEX_URL,
    RULE_INDEX_FORMAT,
    RULE_INDEX_VERSION,
    RULE_SET_FORMAT,
    RULE_SET_VERSION,
    createRuleSet,
    matchesPage,
    normalizeRule,
    parsePattern,
    parseRuleIndex,
    parseRuleSet,
    permissionPattern,
    ruleIdentity,
    ruleSourcePermissionPattern,
    splitSelectorList,
    validateRule
  });
})();
