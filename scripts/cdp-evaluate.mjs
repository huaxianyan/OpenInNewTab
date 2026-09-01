const [webSocketUrl, expression] = process.argv.slice(2);

if (!webSocketUrl || !expression) {
  throw new Error("Usage: node cdp-evaluate.mjs <websocket-url> <expression>");
}

const socket = new WebSocket(webSocketUrl);
let timeout;
const result = await new Promise((resolve, reject) => {
  timeout = setTimeout(() => {
    socket.close();
    reject(new Error("CDP evaluation timed out"));
  }, 10_000);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: {
        expression,
        awaitPromise: true,
        returnByValue: true
      }
    }));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    if (message.error) reject(new Error(message.error.message));
    else if (message.result.exceptionDetails) {
      reject(new Error(message.result.exceptionDetails.text));
    } else {
      resolve(message.result.result.value ?? null);
    }
  });
  socket.addEventListener("error", () => reject(new Error("CDP connection failed")));
});

clearTimeout(timeout);
socket.close();
process.stdout.write(JSON.stringify(result));
