
const http = require("http");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 10,
});

const server = http.createServer(async (req, res) => {
  // Original homepage — keep the existing behaviour
  if (req.url === "/" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });

    res.end("Version 2.1 - Tested through a Pull Request!\n");
    return;
  }

  // Application health check
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({ status: "healthy" }));
    return;
  }

  // Check database connectivity
  if (req.url === "/db-check" && req.method === "GET") {
    try {
      const result = await pool.query(
        "SELECT NOW() AS database_time"
      );

      res.writeHead(200, {
        "Content-Type": "application/json",
      });

      res.end(
        JSON.stringify({
          status: "connected",
          databaseTime: result.rows[0].database_time,
        })
      );
    } catch (error) {
      console.error("Database connection failed:", error.message);

      res.writeHead(503, {
        "Content-Type": "application/json",
      });

      res.end(JSON.stringify({
        status: "database unavailable",
      }));
    }

    return;
  }

  res.writeHead(404, {
    "Content-Type": "text/plain",
  });

  res.end("Not Found\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

