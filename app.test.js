
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

test("application endpoints", async (t) => {
  const port = 3100 + Math.floor(Math.random() * 1000);

  const serverProcess = spawn(process.execPath, ["app.js"], {
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: "ignore",
  });

  t.after(() => {
    serverProcess.kill();
  });

  // Wait until the server is ready.
  let response;

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  assert.ok(response, "Server should start and accept connections");

  // Test homepage.
  assert.equal(response.status, 200);

  const homepage = await response.text();

  assert.equal(
    homepage,
    "Version 2.1 - Tested through a Pull Request!\n"
  );

  // Test application health.
  const healthResponse = await fetch(
    `http://127.0.0.1:${port}/health`
  );

  assert.equal(healthResponse.status, 200);

  const healthData = await healthResponse.json();

  assert.deepEqual(healthData, {
    status: "healthy",
  });

  // Test database endpoint without a running database.
  const databaseResponse = await fetch(
    `http://127.0.0.1:${port}/db-check`
  );

  assert.equal(databaseResponse.status, 503);

  const databaseData = await databaseResponse.json();

  assert.deepEqual(databaseData, {
    status: "database unavailable",
  });

  // Test unknown routes.
  const notFoundResponse = await fetch(
    `http://127.0.0.1:${port}/unknown`
  );

  assert.equal(notFoundResponse.status, 404);
});
