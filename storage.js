(() => {
  "use strict";

  const STORAGE_KEY = "ruleConfig";
  const RULE_SOURCE_KEY = "ruleSource";
  const EMPTY_CONFIG = Object.freeze({ schemaVersion: 1, rules: [] });

  async function load() {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    const config = stored[STORAGE_KEY];
    if (!config || config.schemaVersion !== 1 || !Array.isArray(config.rules)) {
      return { ...EMPTY_CONFIG, rules: [] };
    }

    return {
      schemaVersion: 1,
      rules: config.rules.map(RuleEngine.normalizeRule)
    };
  }

  async function save(rules) {
    const config = {
      schemaVersion: 1,
      rules: rules.map(RuleEngine.normalizeRule)
    };
    await chrome.storage.sync.set({ [STORAGE_KEY]: config });
    return config;
  }

  async function loadRuleSource() {
    const stored = await chrome.storage.sync.get(RULE_SOURCE_KEY);
    const value = stored[RULE_SOURCE_KEY];
    return RuleEngine.ruleSourcePermissionPattern(value)
      ? value
      : RuleEngine.DEFAULT_RULE_INDEX_URL;
  }

  async function saveRuleSource(value) {
    if (!RuleEngine.ruleSourcePermissionPattern(value)) {
      throw new Error("Invalid rule source");
    }
    await chrome.storage.sync.set({ [RULE_SOURCE_KEY]: value });
    return value;
  }

  globalThis.RuleStore = Object.freeze({
    RULE_SOURCE_KEY,
    STORAGE_KEY,
    load,
    loadRuleSource,
    save,
    saveRuleSource
  });
})();
