const [port, expectedVersion] = process.argv.slice(2);

if (!port || !expectedVersion) {
  throw new Error("Usage: node discover-extension.mjs <port> <version>");
}

function evaluate(webSocketUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("CDP evaluation timed out"));
    }, 5_000);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true }
      }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error || message.result.exceptionDetails) reject(new Error("Evaluation failed"));
      else resolve(message.result.result.value);
    });
    socket.addEventListener("error", () => reject(new Error("CDP connection failed")));
  });
}

let match;
for (let attempt = 0; attempt < 50 && !match; attempt += 1) {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const workers = targets.filter((target) => {
    return target.type === "service_worker" && target.url.endsWith("/service-worker.js");
  });
  for (const worker of workers) {
    try {
      const manifest = await evaluate(
        worker.webSocketDebuggerUrl,
        "(() => { const m = chrome.runtime.getManifest(); return { version: m.version, manifestVersion: m.manifest_version, worker: m.background?.service_worker || '' }; })()"
      );
      if (manifest.version === expectedVersion &&
          manifest.manifestVersion === 3 &&
          manifest.worker === "service-worker.js") {
        match = { ...worker, manifest };
        break;
      }
    } catch {
      // Ignore service workers that do not belong to this extension.
    }
  }
  if (!match) await new Promise((resolve) => setTimeout(resolve, 100));
}

if (!match) throw new Error("Extension service worker not found");
process.stdout.write(JSON.stringify(match));
