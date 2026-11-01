const { runMigrations } = require("./scripts/migrate");
const http = require("http");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initializeDatabase() {
  await runMigrations(pool);
  console.log("Database is ready");
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;

    if (body.length > 10000) {
      throw new Error("Request body too large");
    }
  }

  return JSON.parse(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("Version 2.1 - Tested through a Pull Request!\n");
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { status: "healthy" });
    }

    if (req.method === "GET" && url.pathname === "/db-check") {
      await pool.query("SELECT NOW()");
      return sendJson(res, 200, { status: "connected" });
    }

    if (req.method === "POST" && url.pathname === "/notes") {
      const { title, content } = await readJson(req);

      if (
        typeof title !== "string" ||
        typeof content !== "string" ||
        !title.trim() ||
        !content.trim() ||
        title.length > 150
      ) {
        return sendJson(res, 400, {
          error: "A title (up to 150 characters) and content are required",
        });
      }

      const result = await pool.query(
        `INSERT INTO notes (title, content)
         VALUES ($1, $2)
         RETURNING id, title, content, created_at`,
        [title.trim(), content.trim()]
      );

      return sendJson(res, 201, result.rows[0]);
    }

    if (req.method === "GET" && url.pathname === "/notes") {
      const result = await pool.query(
        `SELECT id, title, content, created_at
         FROM notes
         ORDER BY id DESC`
      );

      return sendJson(res, 200, result.rows);
    }

    const noteMatch = url.pathname.match(/^\/notes\/(\d+)$/);

    if (req.method === "GET" && noteMatch) {
      const result = await pool.query(
        `SELECT id, title, content, created_at
         FROM notes
         WHERE id = $1`,
        [noteMatch[1]]
      );

      if (result.rows.length === 0) {
        return sendJson(res, 404, { error: "Note not found" });
      }

      return sendJson(res, 200, result.rows[0]);
    }

    if (req.method === "DELETE" && noteMatch) {
      const result = await pool.query(
        "DELETE FROM notes WHERE id = $1 RETURNING id",
        [noteMatch[1]]
      );

      if (result.rows.length === 0) {
        return sendJson(res, 404, { error: "Note not found" });
      }

      return sendJson(res, 200, { message: "Note deleted" });
    }

    return sendJson(res, 404, { error: "Route not found" });
  } catch (error) {
    console.error("Request error:", error.message);

    if (error instanceof SyntaxError) {
      return sendJson(res, 400, { error: "Invalid JSON" });
    }

    if (error.message === "Request body too large") {
      return sendJson(res, 413, { error: error.message });
    }

    return sendJson(res, 500, { error: "Internal server error" });
  }
});

async function startServer() {
  try {
    await initializeDatabase();

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Unable to initialize database:", error.message);
    process.exit(1);
  }
}

startServer();

process.on("SIGTERM", async () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});
