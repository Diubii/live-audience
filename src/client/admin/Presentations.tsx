import { useEffect, useState } from "react"
import { Link, useLocation } from "wouter"
import { api, useApi, useEventStream } from "../api.ts"
import { Rank } from "../audience-ui.tsx"
import { Icon } from "../icons.tsx"
import { Button, Card, Field, Input, Tag } from "../ui.tsx"
import {
  ActivityRows,
  type ActivityType,
  answerCount,
  NewActivity,
  PresentationResetButton,
  type PresentationSummary,
  slugify,
  useActivities,
} from "./ActivityList.tsx"
import { controlPresentation, PageHeader, resetPresentation, useStage } from "./AdminLayout.tsx"

interface Leaderboard {
  leaderboard: { rank: number; name: string; points: number }[]
}

export function PresentationList() {
  const presentations = useApi<PresentationSummary[]>("/api/admin/presentations")
  const activities = useActivities()
  const stage = useStage()
  const [, navigate] = useLocation()
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const effectiveSlug = slug ?? slugify(title)

  const create = async () => {
    try {
      const created = await api<{ id: string }>("/api/admin/presentations", {
        body: { title, slug: effectiveSlug },
      })
      navigate(`/presentations/${created.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <PageHeader kicker="Admin" title="Presentazioni" />
        <p className="max-w-2xl font-headline text-pretty text-slate-600">
          Raggruppa le attività di una serata: i loro punti formano una classifica, che il pubblico vede tra
          un'attività e l'altra.
        </p>
      </div>
      <Card>
        <form
          className="grid items-end gap-x-4 gap-y-5 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <Field label="Titolo">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Compleanno di Chiara"
            />
          </Field>
          <Field label="Slug (usato dall'API)">
            <Input
              value={effectiveSlug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="compleanno-chiara"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={!title.trim() || !effectiveSlug} className="py-2">
            <Icon name="plus" /> Crea
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </Card>
      <Card className="divide-y-[1.5px] divide-white p-0">
        {presentations.data?.length === 0 && (
          <p className="px-6 py-5 text-sm text-slate-500">Ancora nessuna presentazione.</p>
        )}
        {presentations.data?.map((p) => {
          const answers = (activities.data ?? [])
            .filter((a) => a.presentation === p.slug)
            .reduce((sum, a) => sum + a.answers, 0)
          return (
            // The whole row leads to the presentation (the link stretches over it), but for its buttons.
            <div
              key={p.id}
              className="group relative flex items-center gap-4 px-6 py-4 transition first:rounded-t-[20px] last:rounded-b-[20px] hover:bg-white/60"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <Link
                  href={`/presentations/${p.id}`}
                  className="block truncate font-headline text-slate-800 group-hover:text-pn after:absolute after:inset-0"
                >
                  {p.title}
                </Link>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <code className="font-mono">{p.slug}</code>
                  {answerCount(answers) && <span>· {answerCount(answers)}</span>}
                </div>
              </div>
              {stage?.presentation?.id === p.id && <Tag tone="blue">in corso</Tag>}
              <span className="relative">
                <PresentationResetButton presentation={p} onReset={activities.reload} />
              </span>
              <Icon
                name="arrow-right"
                className="size-4 text-sky-700 transition group-hover:translate-x-0.5"
              />
            </div>
          )
        })}
      </Card>
    </div>
  )
}

export function PresentationPage({ id }: { id: string }) {
  const loaded = useApi<PresentationSummary>(`/api/admin/presentations/${id}`)
  const activities = useActivities()
  const types = useApi<ActivityType[]>("/api/admin/types")
  const presentations = useApi<PresentationSummary[]>("/api/admin/presentations")
  const stage = useStage()
  const [, navigate] = useLocation()
  const [draft, setDraft] = useState({ title: "", slug: "" })
  const [error, setError] = useState<string | null>(null)
  const [resets, setResets] = useState(0)

  useEffect(() => {
    if (loaded.data) setDraft({ title: loaded.data.title, slug: loaded.data.slug })
  }, [loaded.data])

  if (loaded.error) return <p className="text-rose-600">{loaded.error.message}</p>
  const presentation = loaded.data
  if (!presentation) return null
  const running = stage?.presentation?.id === presentation.id
  const dirty = draft.title !== presentation.title || draft.slug !== presentation.slug

  const save = async () => {
    try {
      loaded.setData(
        await api<PresentationSummary>(`/api/admin/presentations/${id}`, { method: "PATCH", body: draft }),
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const remove = async () => {
    if (
      !confirm(
        `Eliminare "${presentation.title}" e la sua classifica? Le sue attività restano, senza gruppo.`,
      )
    )
      return
    await api(`/api/admin/presentations/${id}`, { method: "DELETE" })
    navigate("/presentations")
  }
  const reset = async () => {
    if (!(await resetPresentation(presentation))) return
    setResets((n) => n + 1)
    activities.reload()
  }

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Presentazioni"
        back="/presentations"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {presentation.title}
            {running && (
              <Tag tone="blue" className="font-sans tracking-normal">
                in corso
              </Tag>
            )}
          </span>
        }
      >
        {running ? (
          <Button onClick={() => void controlPresentation(null)}>
            <Icon name="square" /> Termina la presentazione
          </Button>
        ) : (
          <Button variant="success" onClick={() => void controlPresentation(presentation.id)}>
            <Icon name="play" /> Avvia la presentazione
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="px-1 font-headline text-lg text-slate-800">Attività</h2>
            <ActivityRows
              activities={activities.data?.filter((a) => a.presentation === presentation.slug) ?? []}
              types={types.data ?? []}
              onReset={() => {
                setResets((n) => n + 1)
                activities.reload()
              }}
            />
            {types.data && presentations.data && (
              <NewActivity
                types={types.data}
                presentations={presentations.data}
                presentationId={presentation.id}
              />
            )}
          </section>
          <Card className="space-y-6">
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field label="Titolo">
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </Field>
              <Field label="Slug" hint="Le slide leggono la classifica con questo nome.">
                <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
              </Field>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex flex-wrap gap-2.5 border-t-[1.5px] border-white pt-5">
              <Button variant="primary" disabled={!dirty} onClick={() => void save()}>
                Salva
              </Button>
              <Button variant="danger" className="ml-auto" onClick={() => void reset()}>
                <Icon name="rotate-ccw" /> Azzera tutte le risposte
              </Button>
              <Button variant="danger" onClick={() => void remove()}>
                <Icon name="trash" /> Elimina
              </Button>
            </div>
          </Card>
        </div>
        <LeaderboardPanel key={resets} presentation={presentation} />
      </div>
    </div>
  )
}

function LeaderboardPanel({ presentation }: { presentation: PresentationSummary }) {
  const board = useApi<Leaderboard>(`/api/admin/presentations/${presentation.id}/leaderboard`)
  // Live while it is the running presentation; otherwise points only change through this page.
  useEventStream("/api/admin/events", {
    leaderboard: (data: Leaderboard & { id: string }) => {
      if (data.id === presentation.id) board.setData(data)
    },
  })
  const entries = board.data?.leaderboard ?? []
  return (
    <Card className="space-y-5 self-start">
      <div className="flex items-center justify-between">
        <h2 className="kicker">Classifica</h2>
        <Button variant="ghost" onClick={board.reload}>
          <Icon name="rotate-ccw" /> Aggiorna
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">Ancora nessun punto.</p>
      ) : (
        <ol className="max-h-[28rem] divide-y-[1.5px] divide-white overflow-auto text-sm">
          {entries.map((entry, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: names can repeat
            <li key={index} className="flex items-center gap-3.5 py-2.5 first:pt-0 last:pb-0">
              <Rank rank={entry.rank} />
              <span className="flex-1 truncate font-headline text-slate-800">{entry.name}</span>
              <span className="font-display text-base font-medium text-pn tabular-nums">
                {entry.points.toLocaleString("it")}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t-[1.5px] border-white pt-4 text-xs text-slate-500">
        API: <code className="break-all">GET /api/v1/presentations/{presentation.slug}/leaderboard</code>
      </p>
    </Card>
  )
}
