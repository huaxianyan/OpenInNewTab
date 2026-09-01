(() => {
  "use strict";

  if (globalThis.__openLinksRuntimeInstalled) return;
  globalThis.__openLinksRuntimeInstalled = true;

  let rules = [];

  async function loadRules() {
    const config = await RuleStore.load();
    rules = config.rules.filter((rule) => {
      return rule.enabled && RuleEngine.validateRule(rule).valid;
    });
  }

  function matchingRule(anchor) {
    const pageUrl = window.location.href;

    return rules.find((rule) => {
      if (!RuleEngine.matchesPage(rule.pagePattern, pageUrl)) return false;

      try {
        if (!anchor.matches(rule.linkSelector)) return false;
        return !rule.excludeSelector || !anchor.matches(rule.excludeSelector);
      } catch {
        return false;
      }
    });
  }

  function isPlainPrimaryClick(event) {
    return event.button === 0 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey;
  }

  function handleClick(event) {
    if (!isPlainPrimaryClick(event)) return;

    const origin = event.target;
    if (!(origin instanceof Element)) return;

    const anchor = origin.closest("a[href]");
    if (!anchor || anchor.hasAttribute("download")) return;

    const rule = matchingRule(anchor);
    if (!rule) return;

    let destination;
    try {
      destination = new URL(anchor.href);
    } catch {
      return;
    }

    if (destination.protocol !== "http:" && destination.protocol !== "https:") return;

    anchor.target = "_blank";
    const relations = new Set(anchor.rel.split(/\s+/).filter(Boolean));
    relations.add("noopener");
    anchor.rel = [...relations].join(" ");

    if (rule.mode === "force") {
      event.stopImmediatePropagation();
    }
  }

  window.addEventListener("click", handleClick, true);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes[RuleStore.STORAGE_KEY]) loadRules();
  });

  loadRules();
})();
