(() => {
  "use strict";

  const siteName = document.querySelector("#site-name");
  const actions = document.querySelector("#available-actions");
  const ruleStatus = document.querySelector("#rule-status");
  const currentRulesSection = document.querySelector("#current-rules");
  const currentRuleList = document.querySelector("#current-rule-list");
  const message = document.querySelector("#message");
  const pickButton = document.querySelector("#pick-links");
  const allButton = document.querySelector("#all-links");
  let currentTab;
  let currentRules = [];
  let pagePattern;
  let permissionPattern;
  let permissionPreviouslyGranted = false;

  function setMessage(text, isError = true) {
    message.textContent = text;
    message.style.color = isError ? "#b3261e" : "#137333";
  }

  function disableActions() {
    pickButton.disabled = true;
    allButton.disabled = true;
  }

  function renderCurrentRules() {
    currentRuleList.replaceChildren();
    currentRulesSection.hidden = currentRules.length === 0;
    const enabledCount = currentRules.filter((rule) => rule.enabled).length;
    ruleStatus.textContent = currentRules.length
      ? `当前网站有 ${currentRules.length} 条规则，已启用 ${enabledCount} 条`
      : "当前网站还没有规则";

    for (const rule of currentRules) {
      const row = document.createElement("article");
      row.className = "rule-row";

      const heading = document.createElement("div");
      heading.className = "rule-heading";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = rule.enabled;
      toggle.setAttribute("aria-label", `${rule.enabled ? "停用" : "启用"}${rule.name}`);
      const name = document.createElement("strong");
      name.textContent = rule.name;
      heading.append(toggle, name);

      const controls = document.createElement("div");
      controls.className = "rule-controls";
      const mode = document.createElement("select");
      mode.setAttribute("aria-label", `${rule.name}的打开方式`);
      mode.innerHTML = `
        <option value="compatible">保留网站交互</option>
        <option value="force">阻止网站接管</option>
      `;
      mode.value = rule.mode;
      const visualEdit = document.createElement("button");
      visualEdit.type = "button";
      visualEdit.textContent = "可视化编辑";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除";
      controls.append(mode, visualEdit, remove);
      row.append(heading, controls);
      currentRuleList.append(row);

      toggle.addEventListener("change", async () => {
        const response = await chrome.runtime.sendMessage({
          type: "update-rule",
          ruleId: rule.id,
          changes: { enabled: toggle.checked }
        });
        if (!response?.updated) {
          toggle.checked = rule.enabled;
          setMessage("规则状态没有保存成功，请重试。");
          return;
        }
        rule.enabled = toggle.checked;
        renderCurrentRules();
      });

      mode.addEventListener("change", async () => {
        const response = await chrome.runtime.sendMessage({
          type: "update-rule",
          ruleId: rule.id,
          changes: { mode: mode.value }
        });
        if (!response?.updated) {
          mode.value = rule.mode;
          setMessage("打开方式没有保存成功，请重试。");
          return;
        }
        rule.mode = mode.value;
        setMessage("打开方式已更新。", false);
      });

      visualEdit.addEventListener("click", async () => {
        const action = siteAction("edit-rule", rule);
        const response = await chrome.runtime.sendMessage({
          type: "perform-site-action",
          action
        });
        if (response?.performed) window.close();
        else setMessage("当前页面无法编辑这条规则，请刷新页面后重试。");
      });

      remove.addEventListener("click", async () => {
        if (!confirm(`删除规则「${rule.name}」？`)) return;
        const response = await chrome.runtime.sendMessage({
          type: "delete-rule",
          ruleId: rule.id
        });
        if (!response?.deleted) {
          setMessage("规则没有删除成功，请重试。");
          return;
        }
        currentRules = currentRules.filter((item) => item.id !== rule.id);
        permissionPreviouslyGranted = await chrome.permissions.contains({
          origins: [permissionPattern]
        });
        renderCurrentRules();
      });
    }
  }

  function siteAction(type, rule) {
    return {
      type,
      tabId: currentTab.id,
      ruleId: rule?.id || null,
      hostname: new URL(currentTab.url).hostname,
      pagePattern: rule?.pagePattern || pagePattern,
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

    const config = await RuleStore.load();
    currentRules = config.rules.filter((rule) => {
      return RuleEngine.matchesPage(rule.pagePattern, tab.url);
    });
    renderCurrentRules();
    actions.hidden = false;
  }).catch(() => {
    siteName.textContent = "无法读取当前页面";
  });
})();
