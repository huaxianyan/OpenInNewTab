(() => {
  "use strict";

  const list = document.querySelector("#rule-list");
  const emptyState = document.querySelector("#empty-state");
  const status = document.querySelector("#status");
  const dialog = document.querySelector("#rule-dialog");
  const form = document.querySelector("#rule-form");
  const formError = document.querySelector("#form-error");
  const importFile = document.querySelector("#import-file");
  const importDialog = document.querySelector("#import-dialog");
  const importForm = document.querySelector("#import-form");
  const importSummary = document.querySelector("#import-summary");
  const importRuleList = document.querySelector("#import-rule-list");
  const importError = document.querySelector("#import-error");
  const ruleSourceForm = document.querySelector("#rule-source-form");
  const ruleSourceUrl = document.querySelector("#rule-source-url");
  const ruleSourceError = document.querySelector("#rule-source-error");
  const cloudRuleList = document.querySelector("#cloud-rule-list");
  let rules = [];
  let pendingImport;

  function setStatus(message) {
    status.textContent = message;
    if (message) setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 3000);
  }

  function validateSelector(selector) {
    document.querySelector(selector);
  }

  function ruleFromForm() {
    return RuleEngine.normalizeRule({
      id: document.querySelector("#rule-id").value || crypto.randomUUID(),
      name: document.querySelector("#rule-name").value,
      enabled: true,
      pagePattern: document.querySelector("#page-pattern").value,
      linkSelector: document.querySelector("#link-selector").value,
      excludeSelector: document.querySelector("#exclude-selector").value,
      mode: form.elements.mode.value
    });
  }

  function openDialog(rule) {
    form.reset();
    formError.textContent = "";
    document.querySelector("#dialog-title").textContent = rule ? "编辑规则" : "添加规则";
    document.querySelector("#rule-id").value = rule?.id || "";
    document.querySelector("#rule-name").value = rule?.name || "";
    document.querySelector("#page-pattern").value = rule?.pagePattern || "";
    document.querySelector("#link-selector").value = rule?.linkSelector || "";
    document.querySelector("#exclude-selector").value = rule?.excludeSelector || "";
    form.elements.mode.value = rule?.mode || "compatible";
    dialog.showModal();
  }

  function render() {
    list.replaceChildren();
    emptyState.hidden = rules.length !== 0;

    for (const rule of rules) {
      const card = document.createElement("article");
      card.className = "rule-card";

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.className = "switch";
      toggle.checked = rule.enabled;
      toggle.setAttribute("aria-label", `${rule.enabled ? "停用" : "启用"}${rule.name}`);
      toggle.addEventListener("change", async () => {
        const response = await chrome.runtime.sendMessage({
          type: "update-rule",
          ruleId: rule.id,
          changes: { enabled: toggle.checked }
        });
        if (!response?.updated) {
          toggle.checked = rule.enabled;
          setStatus("规则状态没有保存成功。");
          return;
        }
        rule.enabled = toggle.checked;
        setStatus(rule.enabled ? "规则已启用。" : "规则已停用。");
      });

      const detail = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = rule.name;
      const scope = document.createElement("p");
      scope.textContent = rule.pagePattern;
      const selector = document.createElement("p");
      selector.textContent = `链接：${rule.linkSelector}`;
      const mode = document.createElement("p");
      mode.textContent = rule.mode === "force" ? "保护模式" : "兼容模式";
      detail.append(title, scope, selector, mode);

      const actions = document.createElement("div");
      actions.className = "rule-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "详细编辑";
      edit.addEventListener("click", () => openDialog(rule));
      const visualEdit = document.createElement("button");
      visualEdit.type = "button";
      visualEdit.textContent = "可视化编辑";
      visualEdit.addEventListener("click", () => openVisualEditor(rule));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "删除";
      remove.addEventListener("click", () => deleteRule(rule));
      actions.append(edit, visualEdit, remove);

      card.append(toggle, detail, actions);
      list.append(card);
    }
  }

  async function openVisualEditor(rule) {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find((tab) => {
      return tab.url && RuleEngine.matchesPage(rule.pagePattern, tab.url);
    });
    if (!target) {
      setStatus("请先打开这条规则适用的网站，再使用可视化编辑。");
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "perform-site-action",
      action: {
        type: "edit-rule",
        tabId: target.id,
        ruleId: rule.id,
        pagePattern: rule.pagePattern,
        createdAt: Date.now()
      }
    });
    if (!response?.performed) {
      setStatus("无法在目标页面打开可视化编辑，请刷新页面后重试。");
      return;
    }

    await chrome.tabs.update(target.id, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });
  }

  async function deleteRule(rule) {
    if (!confirm(`删除规则「${rule.name}」？`)) return;
    const response = await chrome.runtime.sendMessage({
      type: "delete-rule",
      ruleId: rule.id
    });
    if (!response?.deleted) {
      setStatus("规则没有删除成功。");
      return;
    }

    rules = rules.filter((item) => item.id !== rule.id);
    render();
    setStatus("规则已删除。");
  }

  function safeHomepage(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok) throw new Error(`请求返回了 ${response.status}。`);
    return response.json();
  }

  function cloudFileName(url) {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.slice(path.lastIndexOf("/") + 1)) || "云端规则.json";
  }

  function renderCloudRules(index, ruleSets) {
    cloudRuleList.replaceChildren();

    const summary = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = index.title;
    const detail = document.createElement("p");
    detail.textContent = index.description || `找到 ${ruleSets.length} 个规则集。`;
    summary.append(title, detail);
    cloudRuleList.append(summary);

    for (const item of ruleSets) {
      const card = document.createElement("article");
      card.className = "cloud-rule-card";
      const content = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = item.ruleSet.title;
      const description = document.createElement("p");
      description.textContent = item.ruleSet.description || "这个规则集没有补充说明。";
      const count = document.createElement("p");
      count.textContent = `${item.ruleSet.rules.length} 条规则 · ${cloudFileName(item.url)}`;
      content.append(name, description, count);

      const view = document.createElement("button");
      view.type = "button";
      view.textContent = "查看并选择";
      view.addEventListener("click", () => {
        renderImportPreview(item.ruleSet, cloudFileName(item.url));
      });
      card.append(content, view);
      cloudRuleList.append(card);
    }
  }

  async function loadCloudRules() {
    ruleSourceError.textContent = "";
    cloudRuleList.replaceChildren();

    let sourceUrl;
    try {
      sourceUrl = new URL(ruleSourceUrl.value.trim()).href;
    } catch {
      ruleSourceError.textContent = "请填写有效的规则上游地址。";
      return;
    }
    const permission = RuleEngine.ruleSourcePermissionPattern(sourceUrl);
    if (!permission) {
      ruleSourceError.textContent = "规则上游地址必须使用 HTTP 或 HTTPS。";
      return;
    }

    const granted = await chrome.permissions.request({ origins: [permission] });
    if (!granted) {
      ruleSourceError.textContent = "需要获得规则上游站点的访问权限才能读取规则。";
      return;
    }

    try {
      const content = await fetchJson(sourceUrl);
      const parsedIndex = RuleEngine.parseRuleIndex(content, sourceUrl);
      if (!parsedIndex.valid) throw new Error(parsedIndex.error);

      const ruleSets = await Promise.all(parsedIndex.value.files.map(async (url) => {
        const parsed = RuleEngine.parseRuleSet(await fetchJson(url), validateSelector);
        if (!parsed.valid) throw new Error(`${cloudFileName(url)}：${parsed.error}`);
        return { url, ruleSet: parsed.value };
      }));

      const previousSource = await RuleStore.loadRuleSource();
      await RuleStore.saveRuleSource(sourceUrl);
      ruleSourceUrl.value = sourceUrl;
      if (previousSource !== sourceUrl) {
        await chrome.runtime.sendMessage({
          type: "release-rule-source-permission",
          ruleSource: previousSource
        });
      }
      renderCloudRules(parsedIndex.value, ruleSets);
      setStatus(`已读取 ${ruleSets.length} 个云端规则集。`);
    } catch (error) {
      await chrome.runtime.sendMessage({
        type: "release-rule-source-permission",
        ruleSource: sourceUrl
      });
      ruleSourceError.textContent = error instanceof SyntaxError
        ? "规则上游返回的内容不是有效的 JSON。"
        : `无法读取云端规则：${error.message || "请检查地址后重试。"}`;
    }
  }

  function renderImportPreview(ruleSet, fileName) {
    pendingImport = ruleSet;
    importSummary.replaceChildren();
    importRuleList.replaceChildren();
    importError.textContent = "";

    const title = document.createElement("h3");
    title.textContent = ruleSet.title;
    const source = document.createElement("p");
    source.textContent = `文件：${fileName} · 共 ${ruleSet.rules.length} 条规则`;
    importSummary.append(title, source);

    if (ruleSet.description) {
      const description = document.createElement("p");
      description.textContent = ruleSet.description;
      importSummary.append(description);
    }
    const homepage = safeHomepage(ruleSet.homepage);
    if (homepage) {
      const link = document.createElement("a");
      link.href = homepage;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "查看规则来源";
      importSummary.append(link);
    }

    const existingIdentities = new Set(rules.map(RuleEngine.ruleIdentity));
    ruleSet.rules.forEach((rule, index) => {
      const row = document.createElement("label");
      row.className = "import-rule";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.dataset.index = String(index);

      const detail = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = rule.name;
      const scope = document.createElement("small");
      scope.textContent = rule.pagePattern;
      const behavior = document.createElement("small");
      behavior.textContent = rule.mode === "force" ? "阻止网站接管" : "保留网站交互";
      detail.append(name, scope, behavior);

      if (existingIdentities.has(RuleEngine.ruleIdentity(rule))) {
        const duplicate = document.createElement("small");
        duplicate.className = "duplicate";
        duplicate.textContent = "已存在，导入后将更新";
        detail.append(duplicate);
      }

      row.append(checkbox, detail);
      importRuleList.append(row);
    });

    importDialog.showModal();
  }

  function exportRules() {
    if (!rules.length) {
      setStatus("当前没有可导出的规则。");
      return;
    }

    const ruleSet = RuleEngine.createRuleSet(rules, {
      title: "我的 OpenInNewTab 规则",
      description: "从 OpenInNewTab 设置页导出的规则。",
      homepage: "https://github.com/huaxianyan/OpenInNewTab"
    });
    const blob = new Blob([`${JSON.stringify(ruleSet, null, 2)}\n`], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "open-in-new-tab-rules.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`已导出 ${rules.length} 条规则。`);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";

    const rule = ruleFromForm();
    const validation = RuleEngine.validateRule(rule, validateSelector);
    if (!validation.valid) {
      formError.textContent = validation.error;
      return;
    }

    const origin = RuleEngine.permissionPattern(rule.pagePattern);
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      formError.textContent = "需要获得这个网站的访问权限才能启用规则。";
      return;
    }

    const index = rules.findIndex((item) => item.id === rule.id);
    const previousPagePattern = index === -1 ? null : rules[index].pagePattern;

    if (index === -1) rules.push(rule);
    else rules[index] = { ...rule, enabled: rules[index].enabled };

    await RuleStore.save(rules);

    if (previousPagePattern && RuleEngine.permissionPattern(previousPagePattern) !== origin) {
      await chrome.runtime.sendMessage({
        type: "release-site-permission",
        pagePattern: previousPagePattern
      });
    }

    dialog.close();
    render();
    setStatus("规则已保存，刷新目标页面后生效。");
  });

  importFile.addEventListener("change", async () => {
    const [file] = importFile.files;
    importFile.value = "";
    if (!file) return;

    try {
      const content = JSON.parse(await file.text());
      const parsed = RuleEngine.parseRuleSet(content, validateSelector);
      if (!parsed.valid) {
        setStatus(parsed.error);
        return;
      }
      renderImportPreview(parsed.value, file.name);
    } catch {
      setStatus("无法读取这个规则文件，请确认它是有效的 JSON 文件。");
    }
  });

  importForm.addEventListener("submit", (event) => {
    event.preventDefault();
    importError.textContent = "";
    const selected = [...importRuleList.querySelectorAll("input:checked")].map((checkbox) => {
      return pendingImport.rules[Number(checkbox.dataset.index)];
    });
    if (!selected.length) {
      importError.textContent = "请至少选择一条规则。";
      return;
    }

    const origins = [...new Set(selected.map((rule) => {
      return RuleEngine.permissionPattern(rule.pagePattern);
    }))];
    chrome.permissions.request({ origins }).then(async (granted) => {
      if (!granted) {
        importError.textContent = "需要获得所选网站的访问权限才能导入规则。";
        return;
      }

      const byIdentity = new Map(rules.map((rule) => [RuleEngine.ruleIdentity(rule), rule]));
      for (const imported of selected) {
        const existing = byIdentity.get(RuleEngine.ruleIdentity(imported));
        const rule = RuleEngine.normalizeRule({
          ...imported,
          id: existing?.id || crypto.randomUUID()
        });
        if (existing) Object.assign(existing, rule, { id: existing.id });
        else {
          rules.push(rule);
          byIdentity.set(RuleEngine.ruleIdentity(rule), rule);
        }
      }

      await RuleStore.save(rules);
      importDialog.close();
      render();
      setStatus(`已导入 ${selected.length} 条规则，刷新目标页面后生效。`);
    });
  });

  ruleSourceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadCloudRules();
  });
  document.querySelector("#reset-rule-source").addEventListener("click", () => {
    ruleSourceUrl.value = RuleEngine.DEFAULT_RULE_INDEX_URL;
    loadCloudRules();
  });

  document.querySelector("#add-rule").addEventListener("click", () => openDialog());
  document.querySelector("#import-rules").addEventListener("click", () => importFile.click());
  document.querySelector("#export-rules").addEventListener("click", exportRules);
  document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
  document.querySelector("#cancel-rule").addEventListener("click", () => dialog.close());
  document.querySelector("#close-import").addEventListener("click", () => importDialog.close());
  document.querySelector("#cancel-import").addEventListener("click", () => importDialog.close());

  Promise.all([RuleStore.load(), RuleStore.loadRuleSource()]).then(([config, source]) => {
    rules = config.rules;
    ruleSourceUrl.value = source;
    render();
  });
})();
