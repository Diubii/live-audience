import { type FormEvent, type ReactNode, useState } from "react"
import { activityUIs } from "../../activities/ui-registry.ts"
import { api, login, logout, type Me, useEventStream, useMe } from "../api.ts"
import {
  audienceField,
  CountsToLeaderboard,
  Leaderboard,
  type LeaderboardView,
  MyPlace,
  SubmitButton,
} from "../audience-ui.tsx"
import { Orbit, Wordmark } from "../brand.tsx"
import { Icon } from "../icons.tsx"
import { cx } from "../ui.tsx"

interface AudienceStage {
  status: "open" | "closed"
  changedAt: number
  activity: {
    id: string
    type: string
    config: unknown
    countsToLeaderboard: boolean
  } | null
  myResponse: unknown
  outcome: { draw: object; youWon: boolean; points: number | null } | null
  /** The running presentation's points, if one is running. */
  leaderboard: LeaderboardView | null
}

export function AudiencePage() {
  const me = useMe()
  const user = me.data?.user

  let content: ReactNode
  if (me.loading && !me.data) content = <Spinner />
  else if (!user) content = <SignIn />
  else content = <Live me={user} />

  return (
    <div className="relative flex min-h-dvh flex-col text-slate-950">
      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 tall:pt-[max(1.25rem,env(safe-area-inset-top))] tall:pb-3 sm:px-5">
        {/* On the narrowest phones "Live" makes room for the menu. */}
        <Wordmark suffix="Live" className="shrink-0 max-[22.5rem]:[&>.kicker]:hidden" />
        {user && <UserMenu user={user} />}
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {content}
      </main>
    </div>
  )
}

function Live({ me }: { me: Me }) {
  const [stage, setStage] = useState<AudienceStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const connected = useEventStream("/api/audience/events", {
    stage: (data: AudienceStage) => {
      setStage(data)
      setError(null)
    },
  })

  if (!stage) return <Spinner />

  const ui = stage.activity && activityUIs[stage.activity.type]
  if (!stage.activity || !ui) {
    return (
      <div className="space-y-10">
        <Centered
          emblem
          kicker={stage.leaderboard ? "Tra un gioco e l'altro" : "Ci sei"}
          title={stage.leaderboard ? "Riprendi fiato" : "Per ora niente a cui rispondere"}
          text="Tieni aperta questa pagina: le domande compaiono qui appena vengono fatte."
          footer={<ConnectionDot connected={connected} />}
        />
        {stage.leaderboard && <Leaderboard board={stage.leaderboard} />}
      </div>
    )
  }

  const activity = stage.activity
  const submit = async (response: unknown) => {
    try {
      const saved = await api<{ response: unknown; stage: AudienceStage }>("/api/audience/respond", {
        body: { activityId: activity.id, response },
      })
      setStage(saved.stage)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Qualcosa è andato storto")
      throw e
    }
  }

  return (
    <div key={activity.id} className="animate-pop-in space-y-3 tall:space-y-4">
      <div className="flex items-center justify-between">
        <StatusPill open={stage.status === "open"} />
        <ConnectionDot connected={connected} />
      </div>
      <CountsToLeaderboard.Provider value={activity.countsToLeaderboard}>
        <ui.Audience
          config={activity.config}
          me={me}
          outcome={stage.outcome}
          response={stage.myResponse}
          open={stage.status === "open"}
          submit={submit}
        />
      </CountsToLeaderboard.Provider>
      {/* Once answers are locked the activity itself explains why (too slow, closed…). */}
      {error && stage.status === "open" && (
        <p className="rounded-2xl border-[1.5px] border-rose-200 bg-rose-50/80 px-4 py-3 text-center text-sm text-rose-700">
          {error}
        </p>
      )}
      {stage.status === "closed" && stage.leaderboard && (
        <MyPlace board={stage.leaderboard} className="glass animate-pop-in px-5 py-3" />
      )}
    </div>
  )
}

function SignIn() {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const join = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await login(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qualcosa è andato storto")
      setBusy(false)
    }
  }
  return (
    <Centered
      emblem
      kicker="Domande dal vivo"
      title={
        <>
          Entra nel <span className="text-gradient">gioco</span>
        </>
      }
      text="Scrivi il tuo nome per votare, rispondere e giocare. È il nome che comparirà sullo schermo."
      footer={
        <form onSubmit={join} className="space-y-3">
          <input
            className={audienceField}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Il tuo nome"
            aria-label="Il tuo nome"
            autoComplete="nickname"
            maxLength={40}
            required
          />
          {error && (
            <p className="rounded-2xl border-[1.5px] border-rose-200 bg-rose-50/90 px-4 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}
          <SubmitButton type="submit" disabled={busy || !name.trim()}>
            <span className="inline-flex items-center gap-2">
              Entra <Icon name="arrow-right" className="size-5" />
            </span>
          </SubmitButton>
        </form>
      }
    />
  )
}

/** Fits a phone next to the wordmark: the name gives way first, and admins only see their initial there. */
function UserMenu({ user }: { user: Me }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-sm sm:gap-2.5">
      {user.isAdmin && (
        <a
          href="/admin"
          className="shrink-0 rounded-full px-2 py-1.5 font-medium text-pn hover:bg-white/70 sm:px-3"
        >
          Admin
        </a>
      )}
      <button
        type="button"
        onClick={() => void logout()}
        className={cx(
          "glass flex min-w-9 items-center gap-2 rounded-full! py-1 pl-1 text-slate-700 hover:bg-white/80",
          user.isAdmin ? "pr-1 sm:pr-3" : "pr-3",
        )}
        title={`Hai scelto il nome ${user.name}. Esci`}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pn font-display text-xs font-semibold text-white">
          {user.name.slice(0, 1)}
        </span>
        <span className={cx("max-w-32 min-w-0 truncate font-medium", user.isAdmin && "max-sm:hidden")}>
          {user.name.split(" ")[0]}
        </span>
      </button>
    </div>
  )
}

function Centered({
  emblem,
  kicker,
  title,
  text,
  footer,
}: {
  /** The logo in its glass rings, for the screens people look at the longest. */
  emblem?: boolean
  kicker: string
  title: ReactNode
  text: string
  footer?: ReactNode
}) {
  return (
    <div className="animate-pop-in text-center">
      {emblem && <Orbit className="mx-auto mb-10 w-52" />}
      <p className="kicker mb-3">{kicker}</p>
      <h1 className="font-display text-[2.375rem] leading-[1.08] font-medium tracking-tight text-balance text-slate-800">
        {title}
      </h1>
      <div className="mx-auto mt-6 h-1 w-14 rounded-full bg-gradient-to-r from-sky-300 to-blue-400" />
      <p className="mt-6 font-headline text-pretty text-slate-600">{text}</p>
      {footer && <div className="pt-8">{footer}</div>}
    </div>
  )
}

function StatusPill({ open }: { open: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-semibold tracking-[0.12em] uppercase",
        open
          ? "bg-emerald-600 text-white"
          : "bg-white/70 text-slate-600 ring-[1.5px] ring-slate-300 ring-inset",
      )}
    >
      {open ? (
        <span className="relative flex size-2">
          <span className="absolute inset-0 motion-safe:animate-ping rounded-full bg-white/80" />
          <span className="relative size-2 rounded-full bg-white" />
        </span>
      ) : (
        <Icon name="lock" className="size-3.5" />
      )}
      {open ? "Live" : "Chiuso"}
    </span>
  )
}

function ConnectionDot({ connected }: { connected: boolean }) {
  return connected ? null : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
      <span className="size-1.5 motion-safe:animate-pulse rounded-full bg-amber-400" /> Riconnessione…
    </span>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center">
      <span className="size-8 motion-safe:animate-spin rounded-full border-2 border-white border-t-blue-400" />
    </div>
  )
}
