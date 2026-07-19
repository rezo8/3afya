import "dotenv/config";
import { z } from "zod";

/**
 * Server environment, validated once at boot. Invalid/missing config crashes
 * the process immediately with a readable list of problems (fail fast).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().min(1),
  AUTH_DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url(),

  // Comma-separated browser origins -> string[] (CORS allowlist + CSRF trusted origins).
  // Trailing slashes are stripped so "https://example.com/" and "https://example.com" both match.
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5174")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("✖ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
