(() => {
  "use strict";

  const STORAGE_KEY = "ruleConfig";
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

  globalThis.RuleStore = Object.freeze({ STORAGE_KEY, load, save });
})();
