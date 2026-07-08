import { serve } from "@hono/node-server";
import { app } from "./index";
import { env } from "./env";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`✓ afya api listening on http://localhost:${info.port}`);
});
