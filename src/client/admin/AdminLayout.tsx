import { createContext, type FormEvent, type ReactNode, useContext, useState } from "react"
import { Link, useRoute } from "wouter"
import { api, login, logout, useEventStream, useMe } from "../api.ts"
import { Wordmark } from "../brand.tsx"
import { Icon, type IconName } from "../icons.tsx"
import { Button, Card, cx, Field, Input, Tag } from "../ui.tsx"

export interface StageInfo {
  status: "open" | "closed"
  changedAt: number
  activity: { id: string; slug: string; type: string; title: string } | null
  /** The running presentation, whose leaderboard the audience sees between activities. */
  presentation: { id: string; slug: string; title: string } | null
}

/** People with the audience page open, and answers to what is on stage. */
interface AudienceCounts {
  connected: number
  answered: number
}

const StageContext = createContext<StageInfo | null>(null)

/** The live stage, shared by every admin page through a single event stream. */
export function useStage() {
  return useContext(StageContext)
}

export async function controlStage(
  action: "open" | "close" | "clear" | { activity: string; status: "open" | "closed" },
) {
  return typeof action === "string"
    ? api<StageInfo>(`/api/admin/stage/${action}`, { method: "POST" })
    : api<StageInfo>("/api/admin/stage", { body: action })
}

/** Starts a presentation, or ends the running one with null. */
export async function controlPresentation(presentation: string | null) {
  return api<StageInfo>("/api/admin/stage/presentation", { body: { presentation } })
}

export const activitiesResetEvent = "activities-reset"

/** Deletes every answer, draw and point of an activity once confirmed; tells whether it did. */
export async function resetActivity(activity: { id: string; title: string }) {
  if (!confirm(`Cancellare tutte le risposte e i punti di "${activity.title}"?`)) return false
  await api(`/api/admin/activities/${activity.id}/reset`, { method: "POST" })
  window.dispatchEvent(new Event(activitiesResetEvent))
  return true
}

/** The same for every activity of a presentation: a fresh start for its leaderboard. */
export async function resetPresentation(presentation: { id: string; title: string }) {
  if (!confirm(`Cancellare tutte le risposte e i punti di tutte le attività di "${presentation.title}"?`))
    return false
  await api(`/api/admin/presentations/${presentation.id}/reset`, { method: "POST" })
  window.dispatchEvent(new Event(activitiesResetEvent))
  return true
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const me = useMe()
  const user = me.data?.user
  const [stage, setStage] = useState<StageInfo | null>(null)
  const [counts, setCounts] = useState<AudienceCounts | null>(null)
  useEventStream(user?.isAdmin ? "/api/admin/events" : null, {
    stage: (s: StageInfo) => setStage(s),
    audience: (c: AudienceCounts) => setCounts(c),
  })

  if (me.loading && !me.data) return null
  if (!user?.isAdmin) return <AdminSignIn name={user?.name} />

  return (
    <StageContext.Provider value={stage}>
      <div className="relative min-h-dvh text-slate-950">
        <header className="sticky top-0 z-20 px-4 pt-4">
          <div className="glass-solid mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 py-2.5 pr-2.5 pl-5 sm:rounded-full!">
            <Link href="/">
              <Wordmark suffix="Admin" />
            </Link>
            <nav className="flex flex-wrap gap-1.5 text-sm">
              <NavLink href="/" icon="list">
                Attività
              </NavLink>
              <NavLink href="/presentations" icon="layers">
                Presentazioni
              </NavLink>
              <NavLink href="/api" icon="key">
                API
              </NavLink>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-slate-600 transition hover:bg-white hover:text-pn"
              >
                Pagina del pubblico <Icon name="external-link" className="size-3.5" />
              </a>
            </nav>
            <div className="ml-auto flex items-center gap-1.5 text-sm text-slate-600">
              <span className="hidden px-2 sm:inline">{user.name}</span>
              <Button variant="ghost" onClick={() => void logout()} title="Esci">
                <Icon name="log-out" /> Esci
              </Button>
            </div>
          </div>
          <StageBar stage={stage} counts={counts} />
        </header>
        <main className="relative mx-auto max-w-6xl px-4 pt-10 pb-20">{children}</main>
      </div>
    </StageContext.Provider>
  )
}

/** Name and the admin password (ADMIN_PASSWORD on the server). */
function AdminSignIn({ name: currentName }: { name?: string }) {
  const [name, setName] = useState(currentName ?? "")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await login(name, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qualcosa è andato storto")
      setBusy(false)
    }
  }
  return (
    <div className="relative flex min-h-dvh items-center justify-center p-6">
      <Card className="relative w-full max-w-sm p-8">
        <form onSubmit={submit} className="space-y-4">
          <Wordmark suffix="Admin" />
          <p className="font-display text-2xl font-medium tracking-tight text-slate-800">Accedi</p>
          <Field label="Nome" hint="Compare in classifica se giochi anche tu.">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required />
          </Field>
          <Field label="Password admin">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && (
            <p className="rounded-2xl border-[1.5px] border-rose-200 bg-rose-50/90 px-4 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy} className="w-full py-2">
            Accedi
          </Button>
        </form>
      </Card>
    </div>
  )
}

/** The title of an admin page, with a kicker above it like on the slides. */
export function PageHeader({
  kicker,
  title,
  back,
  children,
}: {
  kicker: string
  title: ReactNode
  /** Where the kicker leads, e.g. back to the list. */
  back?: string
  /** Buttons and tags on the right. */
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="mr-auto min-w-0">
        {back ? (
          <Link href={back} className="kicker mb-3 inline-flex items-center gap-1.5 hover:text-pn">
            <Icon name="arrow-left" className="size-3.5" /> {kicker}
          </Link>
        ) : (
          <p className="kicker mb-3">{kicker}</p>
        )}
        <h1 className="font-display text-4xl leading-tight font-medium tracking-tight text-balance text-slate-800">
          {title}
        </h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  )
}

function NavLink({ href, icon, children }: { href: string; icon: IconName; children: ReactNode }) {
  const [active] = useRoute(href)
  return (
    <Link
      href={href}
      className={cx(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition [&>svg]:size-4",
        active ? "bg-pn font-medium text-white" : "text-slate-600 hover:bg-white hover:text-pn",
      )}
    >
      <Icon name={icon} />
      {children}
    </Link>
  )
}

function StageBar({ stage, counts }: { stage: StageInfo | null; counts: AudienceCounts | null }) {
  if (!stage) return null
  const open = stage.status === "open"
  return (
    <div className="glass mx-auto mt-3 flex max-w-6xl flex-wrap items-center gap-3 py-2 pr-2 pl-5 sm:rounded-full! text-sm">
      <span
        className={cx(
          "size-2.5 shrink-0 rounded-full",
          stage.activity
            ? open
              ? "bg-emerald-500 shadow-[0_0_0_4px_rgb(16_185_129/0.2)]"
              : "bg-amber-400"
            : "bg-slate-300",
        )}
      />
      <span className="label-caps">Sul palco</span>
      {stage.activity ? (
        <>
          <Link
            href={`/activities/${stage.activity.id}`}
            className="font-headline text-slate-800 underline decoration-slate-300 underline-offset-4 hover:decoration-pn"
          >
            {stage.activity.title}
          </Link>
          <Tag tone={open ? "live" : "warn"}>{open ? "aperta" : "chiusa"}</Tag>
          {counts && (
            <span className="text-slate-600 tabular-nums" title="Risposte a ciò che è sul palco">
              {counts.answered} {counts.answered === 1 ? "risposta" : "risposte"}
            </span>
          )}
        </>
      ) : (
        <span className="text-slate-500">niente, il pubblico vede la schermata d'attesa</span>
      )}
      {counts && (
        <span
          className="flex items-center gap-1.5 text-slate-600 tabular-nums [&>svg]:size-4"
          title="Persone con la pagina del pubblico aperta"
        >
          <Icon name="users" /> {counts.connected} {counts.connected === 1 ? "collegata" : "collegate"}
        </span>
      )}
      {stage.presentation && (
        <Link
          href={`/presentations/${stage.presentation.id}`}
          title="Presentazione in corso: tra un'attività e l'altra il pubblico ne vede la classifica"
        >
          <Tag tone="blue" className="hover:bg-sky-800">
            <Icon name="layers" /> {stage.presentation.title}
          </Tag>
        </Link>
      )}
      {stage.activity && (
        <span className="ml-auto flex gap-2">
          {open ? (
            <Button onClick={() => void controlStage("close")}>
              <Icon name="lock" /> Chiudi le risposte
            </Button>
          ) : (
            <Button variant="success" onClick={() => void controlStage("open")}>
              <Icon name="play" /> Apri le risposte
            </Button>
          )}
          <Button
            variant="ghost"
            title="Cancella le sue risposte e i suoi punti"
            onClick={() => stage.activity && void resetActivity(stage.activity)}
          >
            <Icon name="rotate-ccw" /> Azzera le risposte
          </Button>
          <Button variant="ghost" onClick={() => void controlStage("clear")}>
            Svuota il palco
          </Button>
        </span>
      )}
    </div>
  )
}
