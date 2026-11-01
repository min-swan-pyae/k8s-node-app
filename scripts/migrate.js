const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 5,
  connectionTimeoutMillis: 5000,
});

async function runMigrations(databasePool) {
  const client = await databasePool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationDirectory = path.join(
      __dirname,
      "..",
      "database",
      "migrations"
    );

    const migrationFiles = fs
      .readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const filename of migrationFiles) {
      const existing = await client.query(
        "SELECT id FROM schema_migrations WHERE filename = $1",
        [filename]
      );

      if (existing.rows.length > 0) {
        console.log(`Already applied: ${filename}`);
        continue;
      }

      const migrationPath = path.join(migrationDirectory, filename);
      const sql = fs.readFileSync(migrationPath, "utf8");

      console.log(`Applying migration: ${filename}`);

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename]
        );

        await client.query("COMMIT");

        console.log(`Successfully applied: ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("Database migrations completed");
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await runMigrations(pool);
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { runMigrations };
