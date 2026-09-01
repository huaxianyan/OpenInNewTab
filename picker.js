(() => {
  "use strict";

  if (globalThis.__openLinksPickerInstalled) return;
  globalThis.__openLinksPickerInstalled = true;

  const HOVER_ATTRIBUTE = "data-open-links-picker-hover";
  const MATCH_ATTRIBUTE = "data-open-links-picker-match";
  const EXCLUDED_ATTRIBUTE = "data-open-links-picker-excluded";
  let session;

  function stableClasses(element) {
    return [...element.classList].filter((name) => {
      return name.length <= 40 &&
        !/\d{4,}/.test(name) &&
        !/^(css|jsx|sc|emotion)-/i.test(name) &&
        !/^[a-f\d]{8,}$/i.test(name);
    });
  }

  function escapeAttribute(value) {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  function candidateSelectors(anchor) {
    const candidates = [];
    const add = (selector) => {
      try {
        if (anchor.matches(selector) && !candidates.includes(selector)) candidates.push(selector);
      } catch {
        // Ignore selectors that the page cannot evaluate.
      }
    };

    if (anchor.id) add(`#${CSS.escape(anchor.id)}`);

    const anchorClasses = stableClasses(anchor);
    for (const className of anchorClasses.slice(0, 3)) {
      add(`a.${CSS.escape(className)}`);
    }
    if (anchorClasses.length > 1) {
      add(`a.${anchorClasses.slice(0, 3).map(CSS.escape).join(".")}`);
    }

    const rawHref = anchor.getAttribute("href") || "";
    let destination;
    try {
      destination = new URL(anchor.href);
    } catch {
      destination = null;
    }
    if (destination) {
      const firstSegment = destination.pathname.split("/").filter(Boolean)[0];
      if (firstSegment) {
        const prefix = `/${firstSegment}/`;
        if (rawHref.startsWith("/")) add(`a[href^="${escapeAttribute(prefix)}"]`);
        else add(`a[href^="${escapeAttribute(destination.origin + prefix)}"]`);
      }
    }

    let ancestor = anchor.parentElement;
    for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = ancestor.parentElement) {
      const className = stableClasses(ancestor)[0];
      if (className) add(`.${CSS.escape(className)} a[href]`);
    }

    add("a[href]");

    return candidates.map((selector) => ({
      selector,
      elements: [...document.querySelectorAll(selector)].filter((element) => {
        return element instanceof HTMLAnchorElement && element.href;
      })
    })).filter((candidate) => candidate.elements.length > 0)
      .sort((left, right) => left.elements.length - right.elements.length);
  }

  function clearHighlights() {
    document.querySelectorAll(
      `[${HOVER_ATTRIBUTE}], [${MATCH_ATTRIBUTE}], [${EXCLUDED_ATTRIBUTE}]`
    ).forEach((element) => {
      element.removeAttribute(HOVER_ATTRIBUTE);
      element.removeAttribute(MATCH_ATTRIBUTE);
      element.removeAttribute(EXCLUDED_ATTRIBUTE);
    });
  }

  function baseElements() {
    return session.candidates[session.index].elements;
  }

  function excludedElements() {
    if (!session.exclusions.length) return new Set();
    const excluded = new Set();
    for (const selector of session.exclusions) {
      baseElements().forEach((element) => {
        if (element.matches(selector)) excluded.add(element);
      });
    }
    return excluded;
  }

  function renderSelection() {
    clearHighlights();
    const excluded = excludedElements();
    baseElements().forEach((element) => {
      element.setAttribute(excluded.has(element) ? EXCLUDED_ATTRIBUTE : MATCH_ATTRIBUTE, "");
    });
    const includedCount = baseElements().length - excluded.size;
    session.count.textContent = excluded.size
      ? `将打开 ${includedCount} 个链接，已排除 ${excluded.size} 个`
      : `已选中 ${includedCount} 个类似链接`;
    session.undo.textContent = "撤销排除";
    session.undo.hidden = session.exclusions.length === 0;
  }

  function showCandidate(index) {
    session.index = Math.max(0, Math.min(index, session.candidates.length - 1));
    renderSelection();
    session.narrow.disabled = session.index === 0;
    session.expand.disabled = session.index === session.candidates.length - 1;
  }

  function showExclusionCandidate(index) {
    session.exclusionIndex = Math.max(
      0,
      Math.min(index, session.exclusionCandidates.length - 1)
    );
    renderSelection();
    const excluded = excludedElements();
    const candidate = session.exclusionCandidates[session.exclusionIndex];
    candidate.elements.forEach((element) => {
      if (!excluded.has(element)) {
        element.removeAttribute(MATCH_ATTRIBUTE);
        element.setAttribute(EXCLUDED_ATTRIBUTE, "");
      }
    });
    const newCount = candidate.elements.filter((element) => !excluded.has(element)).length;
    session.count.textContent = `将额外排除 ${newCount} 个链接`;
    session.narrow.disabled = session.exclusionIndex === 0;
    session.expand.disabled = session.exclusionIndex === session.exclusionCandidates.length - 1;
  }

  function stopPicker(message) {
    if (!session) return;
    clearHighlights();
    document.removeEventListener("keydown", handleKeyDown, true);
    session.overlay.remove();
    session.host.remove();
    session = null;
    if (message) console.info(message);
  }

  function cancelPicker() {
    if (session?.revokePermissionOnCancel) {
      chrome.runtime.sendMessage({
        type: "release-site-permission",
        pagePattern: session.pagePattern
      });
    }
    stopPicker();
  }

  function saveSelection() {
    const candidate = session.candidates[session.index];
    const excludedCount = excludedElements().size;
    const includedCount = candidate.elements.length - excludedCount;
    session.count.textContent = "正在保存规则…";
    chrome.runtime.sendMessage({
      type: "save-picked-rule",
      pagePattern: session.pagePattern,
      linkSelector: candidate.selector,
      excludeSelector: session.exclusions.join(", "),
      mode: session.modeSelect.value
    }, (response) => {
      if (chrome.runtime.lastError || !response?.saved) {
        session.count.textContent = "规则没有保存成功，请重试。";
        return;
      }
      session.count.textContent = `已保存，${includedCount} 个链接将在新标签中打开`;
      setTimeout(() => stopPicker(), 1400);
    });
  }

  function createToolbar() {
    const host = document.createElement("div");
    host.id = "open-links-picker-toolbar";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar { position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; min-width: 560px; padding: 14px 16px; border-radius: 12px; color: #202124; background: #fff; box-shadow: 0 4px 24px rgb(0 0 0 / 28%); font: 14px/1.4 system-ui, sans-serif; pointer-events: auto; }
        .count { flex: 1; font-weight: 600; }
        button, select { padding: 7px 12px; border: 1px solid #dadce0; border-radius: 7px; color: #202124; background: #fff; font: inherit; }
        button { cursor: pointer; }
        button:hover { background: #f1f3f4; }
        .mode { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }
        button:disabled { opacity: .45; cursor: default; }
        .save { border-color: #0b57d0; color: #fff; background: #0b57d0; }
        .save:hover { background: #0842a0; }
      </style>
      <div class="bar">
        <span class="count">点击一个需要新标签打开的链接</span>
        <label class="mode" hidden>打开方式
          <select>
            <option value="compatible">保留网站交互</option>
            <option value="force">阻止网站接管</option>
          </select>
        </label>
        <button class="narrow" type="button" hidden>缩小范围</button>
        <button class="expand" type="button" hidden>扩大范围</button>
        <button class="exclude" type="button" hidden>排除链接</button>
        <button class="undo" type="button" hidden>撤销排除</button>
        <button class="save" type="button" hidden>保存</button>
        <button class="cancel" type="button">取消</button>
      </div>
    `;
    document.documentElement.append(host);

    return {
      host,
      count: shadow.querySelector(".count"),
      modeControl: shadow.querySelector(".mode"),
      modeSelect: shadow.querySelector(".mode select"),
      narrow: shadow.querySelector(".narrow"),
      expand: shadow.querySelector(".expand"),
      exclude: shadow.querySelector(".exclude"),
      undo: shadow.querySelector(".undo"),
      save: shadow.querySelector(".save"),
      cancel: shadow.querySelector(".cancel")
    };
  }

  function anchorUnderPointer(x, y) {
    session.overlay.style.pointerEvents = "none";
    const element = document.elementFromPoint(x, y);
    session.overlay.style.pointerEvents = "auto";
    return element instanceof Element ? element.closest("a[href]") : null;
  }

  function availableForExclusion(anchor) {
    return baseElements().includes(anchor) && !excludedElements().has(anchor);
  }

  function handlePointerMove(event) {
    if (session.mode !== "picking-base" && session.mode !== "picking-exclusion") return;
    let anchor = anchorUnderPointer(event.clientX, event.clientY);
    if (session.mode === "picking-exclusion" && anchor && !availableForExclusion(anchor)) {
      anchor = null;
    }
    if (anchor === session.hoveredAnchor) return;

    session.hoveredAnchor?.removeAttribute(HOVER_ATTRIBUTE);
    session.hoveredAnchor = anchor;
    anchor?.setAttribute(HOVER_ATTRIBUTE, "");
  }

  function returnToSelection() {
    session.mode = "selection";
    session.exclusionCandidates = null;
    session.exclude.textContent = "排除链接";
    session.narrow.hidden = false;
    session.expand.hidden = false;
    session.exclude.hidden = false;
    session.save.hidden = false;
    renderSelection();
  }

  function handleExcludeButton() {
    if (session.mode === "selection") {
      session.mode = "picking-exclusion";
      session.count.textContent = "点击一个不需要新标签打开的链接";
      session.narrow.hidden = true;
      session.expand.hidden = true;
      session.undo.hidden = true;
      session.save.hidden = true;
      session.exclude.textContent = "返回";
      return;
    }

    if (session.mode === "previewing-exclusion") {
      const candidate = session.exclusionCandidates[session.exclusionIndex];
      if (!session.exclusions.includes(candidate.selector)) {
        session.exclusions.push(candidate.selector);
      }
    }
    returnToSelection();
  }

  function undoExclusion() {
    if (session.mode === "previewing-exclusion") {
      session.mode = "picking-exclusion";
      session.exclusionCandidates = null;
      session.count.textContent = "点击一个不需要新标签打开的链接";
      session.narrow.hidden = true;
      session.expand.hidden = true;
      session.undo.hidden = true;
      session.exclude.textContent = "返回";
      renderSelection();
      session.count.textContent = "点击一个不需要新标签打开的链接";
      session.undo.hidden = true;
      return;
    }

    session.exclusions.pop();
    renderSelection();
  }

  function handleOverlayClick(event) {
    const anchor = anchorUnderPointer(event.clientX, event.clientY);
    if (!anchor) return;

    if (session.mode === "picking-base") {
      session.hoveredAnchor?.removeAttribute(HOVER_ATTRIBUTE);
      session.hoveredAnchor = null;
      session.candidates = candidateSelectors(anchor);
      session.mode = "selection";
      session.modeControl.hidden = false;
      session.narrow.hidden = false;
      session.expand.hidden = false;
      session.exclude.hidden = false;
      session.save.hidden = false;
      const preferred = session.candidates.findIndex((candidate) => candidate.elements.length >= 2);
      showCandidate(preferred === -1 ? 0 : preferred);
      return;
    }

    if (session.mode !== "picking-exclusion" || !availableForExclusion(anchor)) return;

    session.hoveredAnchor?.removeAttribute(HOVER_ATTRIBUTE);
    session.hoveredAnchor = null;
    const baseSet = new Set(baseElements());
    const alreadyExcluded = excludedElements();
    session.exclusionCandidates = candidateSelectors(anchor).map((candidate) => ({
      selector: candidate.selector,
      elements: candidate.elements.filter((element) => {
        return baseSet.has(element) && !alreadyExcluded.has(element);
      })
    })).filter((candidate) => candidate.elements.length > 0)
      .sort((left, right) => left.elements.length - right.elements.length);
    session.mode = "previewing-exclusion";
    session.exclude.textContent = "确认排除";
    session.narrow.hidden = false;
    session.expand.hidden = false;
    showExclusionCandidate(0);
    session.undo.textContent = "重新选择";
    session.undo.hidden = false;
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") cancelPicker();
  }

  function startPicker(pagePattern, revokePermissionOnCancel) {
    if (session) stopPicker();
    const overlay = document.createElement("div");
    overlay.id = "open-links-picker-overlay";
    document.documentElement.append(overlay);

    const toolbar = createToolbar();
    session = {
      ...toolbar,
      overlay,
      pagePattern,
      revokePermissionOnCancel,
      candidates: null,
      exclusions: [],
      exclusionCandidates: null,
      hoveredAnchor: null,
      mode: "picking-base",
      index: 0,
      exclusionIndex: 0
    };
    session.narrow.addEventListener("click", () => {
      if (session.mode === "previewing-exclusion") {
        showExclusionCandidate(session.exclusionIndex - 1);
      } else {
        showCandidate(session.index - 1);
      }
    });
    session.expand.addEventListener("click", () => {
      if (session.mode === "previewing-exclusion") {
        showExclusionCandidate(session.exclusionIndex + 1);
      } else {
        showCandidate(session.index + 1);
      }
    });
    session.exclude.addEventListener("click", handleExcludeButton);
    session.undo.addEventListener("click", undoExclusion);
    session.save.addEventListener("click", saveSelection);
    session.cancel.addEventListener("click", cancelPicker);
    overlay.addEventListener("pointermove", handlePointerMove);
    overlay.addEventListener("click", handleOverlayClick);
    document.addEventListener("keydown", handleKeyDown, true);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "start-link-picker") {
      startPicker(message.pagePattern, message.revokePermissionOnCancel);
    }
  });
})();
