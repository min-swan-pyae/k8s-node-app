
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");

test("server returns the expected greeting", async (t) => {
  const port = 3100 + Math.floor(Math.random() * 1000);

  const serverProcess = spawn(process.execPath, ["app.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });

  t.after(() => {
    serverProcess.kill();
  });

  let response;

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      response = await fetch(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  assert.ok(response, "Server should start and accept connections");
  assert.equal(response.status, 200);

  const body = await response.text();
  assert.equal(
    body,
    "This message is intentionally incorrect!\n"
  );
});
