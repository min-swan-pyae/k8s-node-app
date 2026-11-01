const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

test("Notes API works with PostgreSQL", async (t) => {
  const port = 3100 + Math.floor(Math.random() * 1000);

  const serverProcess = spawn(process.execPath, ["app.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      DB_HOST: "127.0.0.1",
      DB_PORT: "5432",
      POSTGRES_DB: "devops_db",
      POSTGRES_USER: "devops_user",
      POSTGRES_PASSWORD: "devops_training_password_2026",
    },
    stdio: "ignore",
  });

  t.after(() => {
    serverProcess.kill();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;

  for (let attempt = 0; attempt < 50; attempt++) {
    if (serverProcess.exitCode !== null) {
      break;
    }

    try {
      const response = await fetch(`${baseUrl}/health`);

      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  assert.ok(ready, "Application should start and accept connections");

  // Test the homepage
  const homeResponse = await fetch(baseUrl);
  assert.equal(homeResponse.status, 200);

  const homeBody = await homeResponse.text();
  assert.equal(
    homeBody,
    "Version 2.1 - Tested through a Pull Request!\n"
  );

  // Test health endpoint
  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);

  const healthData = await healthResponse.json();
  assert.deepEqual(healthData, { status: "healthy" });

  // Test database connection
  const dbResponse = await fetch(`${baseUrl}/db-check`);
  assert.equal(dbResponse.status, 200);

  const dbData = await dbResponse.json();
  assert.equal(dbData.status, "connected");

  // Create a note
  const createResponse = await fetch(`${baseUrl}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Automated test note",
      content: "Testing PostgreSQL integration",
    }),
  });

  assert.equal(createResponse.status, 201);

  const createdNote = await createResponse.json();
  assert.ok(createdNote.id);
  assert.equal(createdNote.title, "Automated test note");
  assert.equal(createdNote.content, "Testing PostgreSQL integration");

  // Retrieve the note
  const getResponse = await fetch(
    `${baseUrl}/notes/${createdNote.id}`
  );

  assert.equal(getResponse.status, 200);

  const retrievedNote = await getResponse.json();
  assert.equal(retrievedNote.title, "Automated test note");

  // Retrieve all notes
  const listResponse = await fetch(`${baseUrl}/notes`);
  assert.equal(listResponse.status, 200);

  const notes = await listResponse.json();
  assert.ok(notes.some((note) => note.id === createdNote.id));

  // Delete the note
  const deleteResponse = await fetch(
    `${baseUrl}/notes/${createdNote.id}`,
    { method: "DELETE" }
  );

  assert.equal(deleteResponse.status, 200);

  // Verify it no longer exists
  const missingResponse = await fetch(
    `${baseUrl}/notes/${createdNote.id}`
  );

  assert.equal(missingResponse.status, 404);
});


test("database migrations are applied only once", async () => {
  const { Pool } = require("pg");
  const { runMigrations } = require("./scripts/migrate");

  const testPool = new Pool({
    host: "127.0.0.1",
    port: 5432,
    database: "devops_db",
    user: "devops_user",
    password: "devops_training_password_2026",
  });

  try {
    await runMigrations(testPool);

    const firstResult = await testPool.query(
      "SELECT filename FROM schema_migrations ORDER BY filename"
    );

    assert.deepEqual(
      firstResult.rows.map((row) => row.filename),
      ["001_create_notes.sql", "002_add_updated_at.sql"]
    );

    await runMigrations(testPool);

    const secondResult = await testPool.query(
      "SELECT filename FROM schema_migrations ORDER BY filename"
    );

    assert.deepEqual(secondResult.rows, firstResult.rows);

    const columnResult = await testPool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'notes'
        AND column_name = 'updated_at'
    `);

    assert.equal(columnResult.rows.length, 1);
  } finally {
    await testPool.end();
  }
});
