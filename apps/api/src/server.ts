import { serve } from "@hono/node-server";
import { app } from "./index";
import { env } from "./env";
import { runMigrations } from "./db/run-migrations";

async function main() {
  console.log("→ running database migrations…");
  await runMigrations();
  console.log("✓ database migrations up to date");

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`✓ afya api listening on http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  console.error("✖ failed to start:", err);
  process.exit(1);
});
