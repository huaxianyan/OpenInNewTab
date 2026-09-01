importScripts("rules.js", "storage.js");

const CONTENT_SCRIPT_ID = "open-links-by-rule";
const CONTENT_SCRIPT_FILES = ["rules.js", "storage.js", "main.js"];
const PENDING_ACTION_KEY = "pendingSiteAction";
let reconciliation = Promise.resolve();
let pendingActionWork = Promise.resolve();

async function authorizedPagePatterns() {
  const config = await RuleStore.load();
  const patterns = [];

  for (const rule of config.rules) {
    if (!rule.enabled || !RuleEngine.validateRule(rule).valid) continue;

    const origin = RuleEngine.permissionPattern(rule.pagePattern);
    if (origin && await chrome.permissions.contains({ origins: [origin] })) {
      patterns.push(rule.pagePattern);
    }
  }

  return [...new Set(patterns)];
}

async function reconcileContentScript() {
  const matches = await authorizedPagePatterns();
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [CONTENT_SCRIPT_ID]
  });

  if (matches.length === 0) {
    if (registered.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    }
    return;
  }

  const definition = {
    id: CONTENT_SCRIPT_ID,
    js: CONTENT_SCRIPT_FILES,
    matches,
    runAt: "document_start",
    persistAcrossSessions: true
  };

  if (registered.length) {
    await chrome.scripting.updateContentScripts([definition]);
  } else {
    await chrome.scripting.registerContentScripts([definition]);
  }
}

function scheduleReconciliation() {
  reconciliation = reconciliation.then(reconcileContentScript, reconcileContentScript);
  return reconciliation;
}

chrome.runtime.onInstalled.addListener(scheduleReconciliation);
chrome.runtime.onStartup.addListener(scheduleReconciliation);
chrome.permissions.onAdded.addListener(() => {
  scheduleReconciliation();
  resumePendingSiteAction();
});
chrome.permissions.onRemoved.addListener(scheduleReconciliation);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes[RuleStore.STORAGE_KEY]) scheduleReconciliation();
});

async function activateRules(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });
}

async function startLinkPicker(action) {
  let editingRule = null;
  if (action.ruleId) {
    const config = await RuleStore.load();
    editingRule = config.rules.find((rule) => rule.id === action.ruleId) || null;
    if (!editingRule) throw new Error("Rule not found");
  }

  await chrome.scripting.executeScript({
    target: { tabId: action.tabId },
    files: ["rules.js", "picker.js"]
  });
  await chrome.scripting.insertCSS({
    target: { tabId: action.tabId },
    files: ["picker.css"]
  });
  await chrome.tabs.sendMessage(action.tabId, {
    type: "start-link-picker",
    pagePattern: action.pagePattern,
    revokePermissionOnCancel: action.revokePermissionOnCancel,
    editingRule
  });
}

async function saveAllLinksRule(action) {
  const config = await RuleStore.load();
  const existing = config.rules.find((rule) => {
    return rule.pagePattern === action.pagePattern && rule.linkSelector === "a[href]";
  });

  if (existing) {
    existing.enabled = true;
  } else {
    config.rules.push(RuleEngine.normalizeRule({
      id: crypto.randomUUID(),
      name: `${action.hostname} 的所有链接`,
      enabled: true,
      pagePattern: action.pagePattern,
      linkSelector: "a[href]",
      excludeSelector: "",
      mode: "compatible"
    }));
  }

  await RuleStore.save(config.rules);
  await activateRules(action.tabId);
}

async function performSiteAction(action) {
  if (!action || !Number.isInteger(action.tabId)) return false;
  if (Date.now() - action.createdAt > 120000) return false;

  const tab = await chrome.tabs.get(action.tabId);
  if (!tab.url || !RuleEngine.matchesPage(action.pagePattern, tab.url)) return false;

  const permission = RuleEngine.permissionPattern(action.pagePattern);
  if (!permission || !await chrome.permissions.contains({ origins: [permission] })) {
    return false;
  }

  if (action.type === "pick-links" || action.type === "edit-rule") {
    await startLinkPicker(action);
  } else if (action.type === "all-links") await saveAllLinksRule(action);
  else return false;
  return true;
}

function resumePendingSiteAction() {
  const resume = async () => {
    const stored = await chrome.storage.session.get(PENDING_ACTION_KEY);
    const action = stored[PENDING_ACTION_KEY];
    if (!action) return false;

    const performed = await performSiteAction(action);
    if (performed || Date.now() - action.createdAt > 120000) {
      await chrome.storage.session.remove(PENDING_ACTION_KEY);
    }
    return performed;
  };

  pendingActionWork = pendingActionWork.then(resume, resume);
  return pendingActionWork;
}

async function releaseSitePermission(pagePattern) {
  const permission = RuleEngine.permissionPattern(pagePattern);
  if (!permission) return false;

  const config = await RuleStore.load();
  const stillUsed = config.rules.some((rule) => {
    return RuleEngine.permissionPattern(rule.pagePattern) === permission;
  });
  if (stillUsed) return false;

  return chrome.permissions.remove({ origins: [permission] });
}

async function updateRule(ruleId, changes) {
  const config = await RuleStore.load();
  const rule = config.rules.find((item) => item.id === ruleId);
  if (!rule) return { updated: false };

  if (typeof changes.enabled === "boolean") rule.enabled = changes.enabled;
  if (changes.mode === "compatible" || changes.mode === "force") {
    rule.mode = changes.mode;
  }

  await RuleStore.save(config.rules);
  return { updated: true, rule };
}

async function deleteRule(ruleId) {
  const config = await RuleStore.load();
  const rule = config.rules.find((item) => item.id === ruleId);
  if (!rule) return { deleted: false };

  const rules = config.rules.filter((item) => item.id !== ruleId);
  await RuleStore.save(rules);

  const permission = RuleEngine.permissionPattern(rule.pagePattern);
  const stillUsed = rules.some((item) => {
    return RuleEngine.permissionPattern(item.pagePattern) === permission;
  });
  if (permission && !stillUsed) {
    await chrome.permissions.remove({ origins: [permission] });
  }

  return { deleted: true };
}

async function savePickedRule(message, sender) {
  if (!sender.tab?.url || !RuleEngine.matchesPage(message.pagePattern, sender.tab.url)) {
    return { saved: false };
  }

  const config = await RuleStore.load();
  const editingRule = message.ruleId
    ? config.rules.find((rule) => rule.id === message.ruleId)
    : null;
  if (message.ruleId && !editingRule) return { saved: false };

  const candidate = RuleEngine.normalizeRule({
    id: editingRule?.id || crypto.randomUUID(),
    name: editingRule?.name || `${new URL(sender.tab.url).hostname} 的选定链接`,
    enabled: true,
    pagePattern: message.pagePattern,
    linkSelector: message.linkSelector,
    excludeSelector: message.excludeSelector || "",
    mode: message.mode
  });
  if (!RuleEngine.validateRule(candidate).valid) return { saved: false };

  const permission = RuleEngine.permissionPattern(candidate.pagePattern);
  if (!permission || !await chrome.permissions.contains({ origins: [permission] })) {
    return { saved: false };
  }

  const existing = editingRule || config.rules.find((rule) => {
    return rule.pagePattern === candidate.pagePattern &&
      rule.linkSelector === candidate.linkSelector;
  });

  if (existing) {
    existing.enabled = true;
    existing.pagePattern = candidate.pagePattern;
    existing.linkSelector = candidate.linkSelector;
    existing.excludeSelector = candidate.excludeSelector;
    existing.mode = candidate.mode;
  } else {
    config.rules.push(candidate);
  }

  await RuleStore.save(config.rules);
  await activateRules(sender.tab.id);
  return { saved: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "update-rule") {
    updateRule(message.ruleId, message.changes || {}).then(
      sendResponse,
      () => sendResponse({ updated: false })
    );
    return true;
  }

  if (message?.type === "delete-rule") {
    deleteRule(message.ruleId).then(
      sendResponse,
      () => sendResponse({ deleted: false })
    );
    return true;
  }

  if (message?.type === "clear-site-action") {
    chrome.storage.session.remove(PENDING_ACTION_KEY).then(
      () => sendResponse({ cleared: true }),
      () => sendResponse({ cleared: false })
    );
    return true;
  }

  if (message?.type === "queue-site-action") {
    chrome.storage.session.set({ [PENDING_ACTION_KEY]: message.action }).then(
      () => sendResponse({ queued: true }),
      () => sendResponse({ queued: false })
    );
    return true;
  }

  if (message?.type === "resume-site-action") {
    resumePendingSiteAction().then(
      (performed) => sendResponse({ performed }),
      () => sendResponse({ performed: false })
    );
    return true;
  }

  if (message?.type === "perform-site-action") {
    performSiteAction(message.action).then(
      (performed) => sendResponse({ performed }),
      () => sendResponse({ performed: false })
    );
    return true;
  }

  if (message?.type === "release-site-permission") {
    releaseSitePermission(message.pagePattern).then(
      (removed) => sendResponse({ removed }),
      () => sendResponse({ removed: false })
    );
    return true;
  }

  if (message?.type === "activate-rules" && Number.isInteger(message.tabId)) {
    activateRules(message.tabId).then(
      () => sendResponse({ activated: true }),
      () => sendResponse({ activated: false })
    );
    return true;
  }

  if (message?.type === "save-picked-rule") {
    savePickedRule(message, sender).then(sendResponse, () => sendResponse({ saved: false }));
    return true;
  }

  return false;
});
