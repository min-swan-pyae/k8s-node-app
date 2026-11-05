const express = require("express");
const { runMigrations } = require("./scripts/migrate");
const { Pool } = require("pg");
const os = require("os");
const PORT = process.env.PORT || 3000;

const app = express();

// Trust exactly one reverse-proxy hop when explicitly enabled.
// Enable this for the local Nginx -> Express Compose setup.
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

// Parse incoming JSON and limit request bodies to 10 KB.
app.use(express.json({ limit: "10kb" }));

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

// Homepage
app.get("/", (req, res) => {
  res.type("text/plain").send(
    "Version 2.1 - Tested through a Pull Request!\n"
  );
});

// Application health
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Database connection check
app.get("/db-check", async (req, res, next) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({ status: "connected" });
  } catch (error) {
    next(error);
  }
});

// Reverse proxy information
app.get("/proxy-info", (req, res) => {
  res.json({
    message: "Request received through Nginx",
    hostname: req.hostname,
    protocol: req.protocol,
    ip: req.ip,
    forwardedFor: req.headers["x-forwarded-for"] || null,
    forwardedProto: req.headers["x-forwarded-proto"] || null,
  });
});

app.get("/instance", (req, res) => {
  res.json({
    instance: process.env.INSTANCE_NAME || "unknown",
    hostname: os.hostname(),
  });
});

app.get("/slow", async (req, res) => {
  const defaultDelay =
    process.env.INSTANCE_NAME === "app-2" ? 15000 : 5000;

  const delay =
  req.query.delay === undefined
    ? defaultDelay
    : Number(req.query.delay);

  if (!Number.isInteger(delay) || delay < 0 || delay > 30000) {
    return res.status(400).json({
      error: "Delay must be between 0 and 30000 milliseconds",
    });
  }

  await new Promise((resolve) => setTimeout(resolve, delay));

  res.json({
    instance: process.env.INSTANCE_NAME || "unknown",
    hostname: os.hostname(),
    delay,
    message: "Slow request completed",
  });
});

// Create a note
app.post("/notes", async (req, res, next) => {
  try {
    const { title, content } = req.body || {};

    if (
      typeof title !== "string" ||
      typeof content !== "string" ||
      !title.trim() ||
      !content.trim() ||
      title.length > 150
    ) {
      return res.status(400).json({
        error: "A title (up to 150 characters) and content are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO notes (title, content)
       VALUES ($1, $2)
       RETURNING id, title, content, created_at`,
      [title.trim(), content.trim()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Retrieve all notes
app.get("/notes", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, content, created_at
       FROM notes
       ORDER BY id DESC`
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Retrieve one note
app.get("/notes/:id", async (req, res, next) => {
const id = Number(req.params.id);
try {
    const result = await pool.query(
      `SELECT id, title, content, created_at
       FROM notes
       WHERE id = $1`,
     [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete a note
app.delete("/notes/:id", async (req, res, next) => {
  const id = Number(req.params.id);
    try {
    const result = await pool.query(
      "DELETE FROM notes WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json({ message: "Note deleted" });
  } catch (error) {
    next(error);
  }
});

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Central error-handling middleware
app.use((error, req, res, next) => {
  console.error("Request error:", error.message);

  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request body too large",
    });
  }

  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  try {
    await initializeDatabase();

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("SIGTERM received. Shutting down...");

      server.close(async () => {
        await pool.end();
        console.log("Server and database pool closed");
        process.exit(0);
      });
    });

    process.on("SIGINT", () => {
      console.log("SIGINT received. Shutting down...");

      server.close(async () => {
        await pool.end();
        console.log("Server and database pool closed");
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Unable to initialize database:", error.message);
    await pool.end();
    process.exit(1);
  }
}

startServer();
