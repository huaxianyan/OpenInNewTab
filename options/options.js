(() => {
  "use strict";

  const list = document.querySelector("#rule-list");
  const emptyState = document.querySelector("#empty-state");
  const status = document.querySelector("#status");
  const dialog = document.querySelector("#rule-dialog");
  const form = document.querySelector("#rule-form");
  const formError = document.querySelector("#form-error");
  let rules = [];

  function setStatus(message) {
    status.textContent = message;
    if (message) setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 3000);
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
        rule.enabled = toggle.checked;
        await RuleStore.save(rules);
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
      edit.textContent = "编辑";
      edit.addEventListener("click", () => openDialog(rule));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "删除";
      remove.addEventListener("click", () => deleteRule(rule));
      actions.append(edit, remove);

      card.append(toggle, detail, actions);
      list.append(card);
    }
  }

  async function deleteRule(rule) {
    rules = rules.filter((item) => item.id !== rule.id);
    await RuleStore.save(rules);

    const origin = RuleEngine.permissionPattern(rule.pagePattern);
    const stillUsed = rules.some((item) => RuleEngine.permissionPattern(item.pagePattern) === origin);
    if (origin && !stillUsed) await chrome.permissions.remove({ origins: [origin] });

    render();
    setStatus("规则已删除。");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";

    const rule = ruleFromForm();
    const validation = RuleEngine.validateRule(rule, (selector) => document.querySelector(selector));
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
    const previousOrigin = index === -1
      ? null
      : RuleEngine.permissionPattern(rules[index].pagePattern);

    if (index === -1) rules.push(rule);
    else rules[index] = { ...rule, enabled: rules[index].enabled };

    await RuleStore.save(rules);

    const oldOriginStillUsed = rules.some((item) => {
      return RuleEngine.permissionPattern(item.pagePattern) === previousOrigin;
    });
    if (previousOrigin && previousOrigin !== origin && !oldOriginStillUsed) {
      await chrome.permissions.remove({ origins: [previousOrigin] });
    }

    dialog.close();
    render();
    setStatus("规则已保存，刷新目标页面后生效。");
  });

  document.querySelector("#add-rule").addEventListener("click", () => openDialog());
  document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
  document.querySelector("#cancel-rule").addEventListener("click", () => dialog.close());

  RuleStore.load().then((config) => {
    rules = config.rules;
    render();
  });
})();
