(() => {
  "use strict";

  const siteName = document.querySelector("#site-name");
  const actions = document.querySelector("#available-actions");
  const ruleStatus = document.querySelector("#rule-status");
  const message = document.querySelector("#message");
  const pickButton = document.querySelector("#pick-links");
  const allButton = document.querySelector("#all-links");
  let currentTab;
  let pagePattern;
  let permissionPattern;
  let permissionPreviouslyGranted = false;

  function setMessage(text) {
    message.textContent = text;
  }

  function disableActions() {
    pickButton.disabled = true;
    allButton.disabled = true;
  }

  function siteAction(type) {
    return {
      type,
      tabId: currentTab.id,
      hostname: new URL(currentTab.url).hostname,
      pagePattern,
      revokePermissionOnCancel: type === "pick-links" && !permissionPreviouslyGranted,
      createdAt: Date.now()
    };
  }

  function runSiteAction(type) {
    setMessage("");
    disableActions();
    const action = siteAction(type);

    if (permissionPreviouslyGranted) {
      chrome.runtime.sendMessage({ type: "perform-site-action", action }).then((response) => {
        if (response?.performed) window.close();
        else {
          pickButton.disabled = false;
          allButton.disabled = false;
          setMessage("操作没有完成，请重试。");
        }
      });
      return;
    }

    chrome.runtime.sendMessage({ type: "queue-site-action", action });
    chrome.permissions.request({ origins: [permissionPattern] }).then((granted) => {
      if (granted) {
        chrome.runtime.sendMessage({ type: "resume-site-action" });
        window.close();
        return;
      }

      chrome.runtime.sendMessage({ type: "clear-site-action" });
      pickButton.disabled = false;
      allButton.disabled = false;
      setMessage("需要允许访问这个网站，规则才能生效。");
    });
  }

  allButton.addEventListener("click", () => runSiteAction("all-links"));
  pickButton.addEventListener("click", () => runSiteAction("pick-links"));

  document.querySelector("#open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    currentTab = tab;

    let url;
    try {
      url = new URL(tab.url);
    } catch {
      siteName.textContent = "当前页面不支持设置规则";
      return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      siteName.textContent = "当前页面不支持设置规则";
      return;
    }

    pagePattern = `${url.protocol}//${url.hostname}/*`;
    permissionPattern = pagePattern;
    siteName.textContent = url.hostname;
    permissionPreviouslyGranted = await chrome.permissions.contains({
      origins: [permissionPattern]
    });
    actions.hidden = false;

    const config = await RuleStore.load();
    const count = config.rules.filter((rule) => {
      return rule.enabled && RuleEngine.matchesPage(rule.pagePattern, tab.url);
    }).length;
    ruleStatus.textContent = count ? `当前网站已启用 ${count} 条规则` : "当前网站还没有规则";
  }).catch(() => {
    siteName.textContent = "无法读取当前页面";
  });
})();
