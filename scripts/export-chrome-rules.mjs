// 从正在运行的 Chromium（已开启远程调试端口）里，把扩展当前的规则导出成规则集 JSON。
//
// 用法：
//   node scripts/export-chrome-rules.mjs --port 9222 --out rules.json
//   node scripts/export-chrome-rules.mjs --profile "<profile目录>" --out rules.json
//   node scripts/export-chrome-rules.mjs --port 9222 --split
//
// --port        远程调试端口；不知道端口时用 --profile 指向浏览器用户目录，
//               脚本会读其中的 DevToolsActivePort 文件。
// --out         输出文件；省略时打印到标准输出。
// --split       按网站拆成 rule-sets/<站点>.json，并自动重写 rule-sets/index.json。
// --title       单文件模式下的规则集标题。
// --homepage    生成规则集的来源页，默认指向仓库 rule-sets 目录。

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  DEFAULT_HOMEPAGE,
  RuleEngine,
  ruleSetsDirectory,
  syncRuleIndex
} = require("./rule-sets-lib.js");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};

const homepage = value("--homepage") || DEFAULT_HOMEPAGE;
const split = flag("--split");
const outPath = value("--out");

function resolvePort() {
  const explicit = value("--port");
  if (explicit) return String(explicit).trim();

  const profile = value("--profile");
  if (!profile) {
    throw new Error("需要 --port 或 --profile 才能连接浏览器。");
  }
  const portFile = path.join(profile, "DevToolsActivePort");
  if (!fs.existsSync(portFile)) {
    throw new Error(`没有找到调试端口文件：${portFile}。请确认浏览器已启动并开启了远程调试。`);
  }
  return fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0].trim();
}

function evaluate(webSocketUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("CDP 求值超时。"));
    }, 10_000);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true }
      }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else if (message.result.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text));
      } else {
        resolve(message.result.result.value ?? null);
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("CDP 连接失败。"));
    });
  });
}

async function findExtensionWorker(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const workers = targets.filter((target) => {
    return target.type === "service_worker" && target.url.endsWith("/service-worker.js");
  });

  for (const worker of workers) {
    try {
      const manifest = await evaluate(
        worker.webSocketDebuggerUrl,
        "(() => { const m = chrome.runtime.getManifest(); return { name: m.name, version: m.version, manifestVersion: m.manifest_version, worker: m.background?.service_worker || '' }; })()"
      );
      if (manifest.manifestVersion === 3 && manifest.worker === "service-worker.js") {
        return { worker, manifest };
      }
    } catch {
      // 忽略不属于本扩展的 service worker。
    }
  }
  return null;
}

async function readRules(worker) {
  const stored = await evaluate(
    worker.webSocketDebuggerUrl,
    "chrome.storage.sync.get('ruleConfig').then((stored) => stored.ruleConfig || null)"
  );
  const rawRules = Array.isArray(stored?.rules) ? stored.rules : [];
  return rawRules.map(RuleEngine.normalizeRule);
}

function validateRules(rules) {
  for (const rule of rules) {
    const validation = RuleEngine.validateRule(rule);
    if (!validation.valid) {
      throw new Error(`规则「${rule.name || "(未命名)"}」无效：${validation.error}`);
    }
  }
}

function writeJson(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

async function main() {
  const port = resolvePort();
  const match = await findExtensionWorker(port);
  if (!match) {
    throw new Error(`在端口 ${port} 上没有找到 OpenInNewTab 的 service worker。`);
  }

  const rules = await readRules(match.worker);
  if (!rules.length) {
    throw new Error("扩展里当前没有可导出的规则。");
  }
  validateRules(rules);

  if (!split) {
    const ruleSet = RuleEngine.createRuleSet(rules, {
      title: value("--title") || "我的 OpenInNewTab 规则",
      description: "从 OpenInNewTab 设置页导出的规则。",
      homepage
    });
    const serialized = `${JSON.stringify(ruleSet, null, 2)}\n`;
    if (outPath) {
      writeJson(path.resolve(outPath), serialized);
      console.log(`已导出 ${rules.length} 条规则到 ${path.resolve(outPath)}`);
    } else {
      process.stdout.write(serialized);
    }
    return;
  }

  const groups = RuleEngine.groupRulesByHost(rules);
  const fileNames = RuleEngine.ruleSetFileNames([...groups.keys()]);

  const written = [];
  for (const [host, hostRules] of groups) {
    const fileName = fileNames.get(host);
    const ruleSet = RuleEngine.createRuleSet(hostRules, {
      title: `${host} 规则`,
      description: `在 ${host} 中使用新标签打开链接。`,
      homepage
    });
    writeJson(path.join(ruleSetsDirectory, fileName), `${JSON.stringify(ruleSet, null, 2)}\n`);
    written.push({ name: fileName, host, count: hostRules.length });
  }

  const result = syncRuleIndex();
  console.log(`已按网站写出 ${written.length} 个规则文件到 rule-sets/：`);
  for (const item of written) {
    console.log(`  ${item.name}  (${item.host}, ${item.count} 条规则)`);
  }
  console.log(result.changed
    ? `已更新 rule-sets/index.json，共 ${result.files.length} 个规则集。`
    : `rule-sets/index.json 已是最新，共 ${result.files.length} 个规则集。`);
  console.log("请用 git diff 检查拆分结果后再提交。");
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
