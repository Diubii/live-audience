import { Hono } from "hono"
import { beforeEach, describe, expect, it } from "vitest"
import { createAuth } from "../src/server/auth.ts"
import { openDatabase } from "../src/server/db.ts"
import { loadEnv } from "../src/server/env.ts"

let server: Hono

beforeEach(() => {
  const env = loadEnv({ ADMIN_PASSWORD: "party-password" })
  const auth = createAuth(env, openDatabase(":memory:"))
  server = new Hono()
  server.route("/auth", auth.routes)
  server.use("/me", auth.session)
  server.get("/me", (c) => c.json({ user: c.get("user" as never) }))
})

/** Signs in and gives back the session cookie, or the failed response. */
async function login(body: unknown, cookie?: string) {
  const res = await server.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
  // Signing in clears any previous session first: the new cookie is the last one.
  return { res, cookie: res.headers.getSetCookie().at(-1)?.split(";")[0] }
}

async function me(cookie: string | undefined) {
  return (await (await server.request("/me", { headers: cookie ? { cookie } : {} })).json()).user
}

describe("sign-in with a name", () => {
  it("joins the audience with just a name, trimmed", async () => {
    const { res, cookie } = await login({ name: "  Marta   Rossi " })
    expect(res.status).toBe(200)
    expect(await me(cookie)).toMatchObject({ name: "Marta Rossi", isAdmin: false })
  })

  it("refuses empty names and names taken by someone signed in", async () => {
    expect((await login({ name: "   " })).res.status).toBe(400)
    const first = await login({ name: "Luca" })
    expect((await login({ name: "luca" })).res.status).toBe(409)
    // The same person signing in again keeps the name.
    const again = await login({ name: "Luca" }, first.cookie)
    expect(again.res.status).toBe(200)
    // Signing out frees it.
    await server.request("/auth/logout", { method: "POST", headers: { cookie: again.cookie ?? "" } })
    expect((await login({ name: "LUCA" })).res.status).toBe(200)
  })

  it("gives admin access only with the admin password", async () => {
    expect((await login({ name: "Chiara", password: "nope" })).res.status).toBe(401)
    const { res, cookie } = await login({ name: "Chiara", password: "party-password" })
    expect(res.status).toBe(200)
    expect(await me(cookie)).toMatchObject({ name: "Chiara", isAdmin: true })
  })

  it("gives every person their own id, kept when they sign in again as admin", async () => {
    const anna = await login({ name: "Anna" })
    const a = await me(anna.cookie)
    const b = await me((await login({ name: "Bea" })).cookie)
    expect(a.id).not.toBe(b.id)
    const admin = await me((await login({ name: "Anna", password: "party-password" }, anna.cookie)).cookie)
    expect(admin).toMatchObject({ id: a.id, isAdmin: true })
  })
})
