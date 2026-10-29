import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import type { Context, MiddlewareHandler } from "hono"
import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { z } from "../validation.ts"
import type { Database } from "./db.ts"
import type { Env } from "./env.ts"

/**
 * Sign-in with a name: no accounts, no passwords for the audience. Each sign-in is a new person
 * with a random id, and a name is taken while someone signed in with it, so two people cannot
 * end up on the leaderboard under the same name. The admin signs in with ADMIN_PASSWORD too.
 */

export interface SessionUser {
  id: string
  name: string
  /** May use the admin page (signed in with the admin password). */
  isAdmin: boolean
}

export type AuthVariables = { user: SessionUser | null }

const SESSION_COOKIE = "la_session"

const loginBody = z.object({
  name: z
    .string()
    .transform((name) => name.normalize("NFKC").replace(/\s+/gu, " ").trim())
    .pipe(z.string().min(1, "Scrivi il tuo nome").max(40, "Il nome non può superare i 40 caratteri")),
  password: z.string().optional(),
})

/** Two names are the same one regardless of case, accents spelled the same way and spaces. */
export function nameKey(name: string) {
  return name.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("it")
}

export function createAuth(env: Env, db: Database) {
  const secure = new URL(env.PUBLIC_URL).protocol === "https:"
  const sessionMaxAge = Math.round(env.SESSION_DAYS * 24 * 60 * 60)

  function createSession(c: Context, user: SessionUser) {
    const id = randomBytes(32).toString("base64url")
    db.prepare(
      "INSERT INTO sessions (id, user, id_token, expires_at, name_key) VALUES (?, ?, NULL, ?, ?)",
    ).run(id, JSON.stringify(user), Date.now() + sessionMaxAge * 1000, nameKey(user.name))
    setCookie(c, SESSION_COOKIE, id, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: sessionMaxAge,
    })
  }

  function readSession(c: Context): SessionUser | null {
    const id = getCookie(c, SESSION_COOKIE)
    if (!id) return null
    const row = db.prepare("SELECT user, expires_at FROM sessions WHERE id = ?").get(id) as
      | { user: string; expires_at: number }
      | undefined
    if (!row || row.expires_at < Date.now()) return null
    return JSON.parse(row.user)
  }

  function destroySession(c: Context) {
    const id = getCookie(c, SESSION_COOKIE)
    if (id) db.prepare("DELETE FROM sessions WHERE id = ? OR expires_at < ?").run(id, Date.now())
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
  }

  /** Whether someone else is signed in with `name`; the current session does not count. */
  function nameTaken(c: Context, name: string) {
    return Boolean(
      db
        .prepare("SELECT 1 FROM sessions WHERE name_key = ? AND expires_at >= ? AND id != ?")
        .get(nameKey(name), Date.now(), getCookie(c, SESSION_COOKIE) ?? ""),
    )
  }

  /** Puts the signed-in user (or null) on `c.var.user` for every request. */
  const session: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
    c.set("user", readSession(c))
    await next()
  }

  // ---- routes ------------------------------------------------------------------------------

  const routes = new Hono()

  /** `{ name }` joins the audience; `{ name, password }` signs in as admin. */
  routes.post("/login", async (c) => {
    const parsed = loginBody.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Nome non valido" }, 400)
    const { name, password } = parsed.data
    const isAdmin = password !== undefined
    if (isAdmin && !samePassword(password, env.ADMIN_PASSWORD))
      return c.json({ error: "Password amministratore errata" }, 401)
    if (nameTaken(c, name))
      return c.json({ error: "Qualcuno usa già questo nome: aggiungi un'iniziale" }, 409)
    // Signing in again (e.g. as admin) replaces the session but keeps the person and their points.
    const id = readSession(c)?.id ?? randomUUID()
    destroySession(c)
    createSession(c, { id, name, isAdmin })
    return c.json({ ok: true })
  })

  routes.post("/logout", (c) => {
    destroySession(c)
    return c.json({ redirect: "/" })
  })

  return { session, routes }
}

/** Compares digests so neither the length nor the content leaks through timing. */
function samePassword(given: string, expected: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(given), digest(expected))
}
