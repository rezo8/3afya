import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as authSchema from "./schema/auth";
import * as trackerSchema from "./schema/tracker";

/** Shared connection pool. node-postgres plays nicely with managed poolers. */
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, {
  schema: { ...authSchema, ...trackerSchema },
});

export type Db = typeof db;
