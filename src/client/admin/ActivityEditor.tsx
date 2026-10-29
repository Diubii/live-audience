import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { activityUIs } from "../../activities/ui-registry.ts"
import { ApiError, api, useApi, useEventStream } from "../api.ts"
import { Icon } from "../icons.tsx"
import { Button, Card, Field, Input, Select, Tag, Toggle } from "../ui.tsx"
import { PresentationSelect, type PresentationSummary } from "./ActivityList.tsx"
import { controlStage, PageHeader, resetActivity, useStage } from "./AdminLayout.tsx"

interface Activity {
  id: string
  slug: string
  type: string
  title: string
  config: unknown
  presentationId: string | null
  countsToLeaderboard: boolean
  updatedAt: number
}

export function ActivityEditor({ id }: { id: string }) {
  const loaded = useApi<Activity>(`/api/admin/activities/${id}`)
  const presentations = useApi<PresentationSummary[]>("/api/admin/presentations")
  const [draft, setDraft] = useState<Activity | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [, navigate] = useLocation()

  useEffect(() => {
    if (loaded.data) setDraft(loaded.data)
  }, [loaded.data])

  if (loaded.error) return <p className="text-rose-600">{loaded.error.message}</p>
  if (!draft || !loaded.data) return null

  const ui = activityUIs[draft.type]
  const saved = loaded.data
  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded.data)

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api<Activity>(`/api/admin/activities/${id}`, {
        method: "PATCH",
        body: {
          type: draft.type,
          title: draft.title,
          slug: draft.slug,
          config: draft.config,
          presentationId: draft.presentationId,
          countsToLeaderboard: draft.countsToLeaderboard,
        },
      })
      loaded.setData(updated)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Eliminare "${draft.title}" e tutte le sue risposte?`)) return
    await api(`/api/admin/activities/${id}`, { method: "DELETE" })
    navigate("/")
  }

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Attività"
        back="/"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {saved.title}
            <Tag className="font-sans tracking-normal">
              {activityUIs[saved.type]?.definition.label ?? saved.type}
            </Tag>
          </span>
        }
      >
        <StageButtons activityId={id} />
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <Card className="space-y-6">
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,12rem)_1fr_1fr]">
            <Field label="Tipo">
              <Select
                value={draft.type}
                onChange={(type) => {
                  // Back to the saved type: get the saved settings back too.
                  const config = type === saved.type ? saved.config : configForType(type, draft.config)
                  setDraft({ ...draft, type, config })
                }}
                options={[
                  ...(activityUIs[saved.type] ? [] : [{ value: saved.type, label: saved.type }]),
                  ...Object.values(activityUIs).map(({ definition }) => ({
                    value: definition.type,
                    label: definition.label,
                    description: definition.description,
                  })),
                ]}
              />
            </Field>
            <Field label="Titolo (solo admin)">
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field
              label="Slug"
              hint="Le presentazioni trovano l'attività con questo nome: se lo cambi smettono di trovarla."
            >
              <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
            </Field>
          </div>
          <Field label="Presentazione" hint="I punti fatti qui contano per la sua classifica.">
            <PresentationSelect
              presentations={presentations.data ?? []}
              value={draft.presentationId ?? ""}
              onChange={(presentationId) => setDraft({ ...draft, presentationId: presentationId || null })}
            />
          </Field>
          <Toggle
            label="Conta per la classifica"
            hint="Spento: il gioco assegna comunque i punti e li mostra sui telefoni, ma restano fuori dalla classifica."
            checked={draft.countsToLeaderboard}
            onChange={(countsToLeaderboard) => setDraft({ ...draft, countsToLeaderboard })}
          />
          {draft.type !== saved.type && (
            <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-amber-800">
              Cambiando tipo si riparte da impostazioni nuove. L'attività deve essere fuori dal palco e senza
              risposte.
            </p>
          )}
          <hr className="border-t-[1.5px] border-white" />
          {ui ? (
            <ui.Editor config={draft.config} onChange={(config) => setDraft({ ...draft, config })} />
          ) : (
            <p className="text-sm text-rose-600">Tipo di attività sconosciuto "{draft.type}".</p>
          )}
          {error && <ErrorBox error={error} />}
          <div className="flex items-center gap-2.5 border-t-[1.5px] border-white pt-5">
            <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Salvataggio…" : "Salva"}
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(loaded.data ?? null)}>
                Annulla le modifiche
              </Button>
            )}
            <Button variant="danger" className="ml-auto" onClick={() => void remove()}>
              <Icon name="trash" /> Elimina
            </Button>
          </div>
        </Card>
        {/* Results of the old type do not fit the new one's preview. */}
        <ResultsPanel key={saved.type} activity={saved} />
      </div>
    </div>
  )
}

/** Fresh settings for `type`, keeping the question or prompt already written. */
function configForType(type: string, previous: unknown): unknown {
  const config = activityUIs[type]?.definition.defaultConfig()
  const old = (previous ?? {}) as { question?: unknown; prompt?: unknown }
  const text = typeof old.question === "string" && old.question ? old.question : old.prompt
  if (typeof text !== "string" || !text || typeof config !== "object" || config === null) return config
  if ("question" in config) return { ...config, question: text }
  if ("prompt" in config) return { ...config, prompt: text }
  return config
}

function StageButtons({ activityId }: { activityId: string }) {
  const stage = useStage()
  const onStage = stage?.activity?.id === activityId
  if (onStage) {
    return (
      <>
        <Tag tone={stage?.status === "open" ? "live" : "warn"}>
          sul palco · {stage?.status === "open" ? "aperta" : "chiusa"}
        </Tag>
        {stage?.status === "open" ? (
          <Button onClick={() => void controlStage("close")}>
            <Icon name="lock" /> Chiudi le risposte
          </Button>
        ) : (
          <Button variant="success" onClick={() => void controlStage("open")}>
            <Icon name="play" /> Apri le risposte
          </Button>
        )}
        <Button variant="ghost" onClick={() => void controlStage("clear")}>
          Togli dal palco
        </Button>
      </>
    )
  }
  return (
    <>
      <Button onClick={() => void controlStage({ activity: activityId, status: "closed" })}>
        Mostra (chiusa)
      </Button>
      <Button variant="success" onClick={() => void controlStage({ activity: activityId, status: "open" })}>
        <Icon name="play" /> Metti sul palco e apri
      </Button>
    </>
  )
}

function ResultsPanel({ activity }: { activity: Activity }) {
  const [results, setResults] = useState<{ results: unknown } | null>(null)
  useEventStream(`/api/admin/events?activity=${encodeURIComponent(activity.id)}`, {
    results: (data: { results: unknown }) => setResults(data),
  })
  const ui = activityUIs[activity.type]

  const [drawError, setDrawError] = useState<string | null>(null)
  const reset = async () => {
    if (await resetActivity(activity)) setDrawError(null)
  }
  const draw = async () => {
    try {
      await api(`/api/admin/activities/${activity.id}/draw`, { method: "POST" })
      setDrawError(null)
    } catch (e) {
      setDrawError(e instanceof Error ? e.message : String(e))
    }
  }
  const drawLabel = ui?.definition.drawLabel
  const decided = Boolean((results?.results as { draw?: unknown } | undefined)?.draw)

  return (
    <Card className="space-y-5 self-start">
      <div className="flex items-center justify-between">
        <h2 className="kicker">Risultati in diretta</h2>
        <Button variant="ghost" onClick={() => void reset()}>
          <Icon name="rotate-ccw" /> Azzera le risposte
        </Button>
      </div>
      {drawLabel && !decided && (
        <Button variant="primary" className="w-full" onClick={() => void draw()}>
          {drawLabel}
        </Button>
      )}
      {drawError && <p className="text-sm text-rose-600">{drawError}</p>}
      {results &&
        (ui?.Results ? (
          <ui.Results config={activity.config} results={results.results} />
        ) : (
          <pre className="overflow-auto rounded-xl bg-white/70 p-3 text-xs">
            {JSON.stringify(results.results, null, 2)}
          </pre>
        ))}
      <p className="border-t-[1.5px] border-white pt-4 text-xs text-slate-500">
        API: <code className="break-all">GET /api/v1/activities/{activity.slug}/results</code>
      </p>
    </Card>
  )
}

function ErrorBox({ error }: { error: ApiError }) {
  const issues = Array.isArray(error.details) ? (error.details as { path: unknown[]; message: string }[]) : []
  return (
    <div className="rounded-xl border-[1.5px] border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-700">
      <p className="font-medium">{error.message}</p>
      {issues.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {issues.map((issue, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            <li key={i}>
              {issue.path.length > 0 && <code>{issue.path.join(".")}: </code>}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
