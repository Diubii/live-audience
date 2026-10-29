import { z } from "../validation.ts"

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(8787),
  /** Origin users open in the browser. In dev that is the Vite server, which proxies to this one. */
  PUBLIC_URL: z.url().default("http://localhost:5173"),
  DATABASE_PATH: z.string().default("data/live-audience.db"),

  /** Signing in with this password, on the admin page, gives access to the admin. */
  ADMIN_PASSWORD: z
    .string({ error: "Imposta ADMIN_PASSWORD" })
    .min(8, "ADMIN_PASSWORD deve contenere almeno 8 caratteri"),
  SESSION_DAYS: z.coerce.number().positive().default(7),
})

export type Env = z.infer<typeof schema>

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`)
    process.exit(1)
  }
  return parsed.data
}
