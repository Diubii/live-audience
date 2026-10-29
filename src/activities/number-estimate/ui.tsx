import { useEffect, useState } from "react"
import {
  audienceField,
  Hint,
  Question,
  Saved,
  ShownAs,
  SubmitButton,
  useOneOf,
  Verdict,
} from "../../client/audience-ui.tsx"
import { cx, Field, Input, Textarea } from "../../client/ui.tsx"
import { defineActivityUI } from "../ui-types.ts"
import {
  type NumberEstimateConfig,
  type NumberEstimateDraw,
  type NumberEstimateResponse,
  type NumberEstimateResults,
  numberEstimate,
} from "./definition.ts"

function Editor({
  config,
  onChange,
}: {
  config: NumberEstimateConfig
  onChange: (config: NumberEstimateConfig) => void
}) {
  return (
    <div className="space-y-6">
      <Field label="Testo della domanda">
        <Textarea
          value={config.prompt}
          onChange={(event) => onChange({ ...config, prompt: event.target.value })}
        />
      </Field>
      <Field label="Numero corretto (nascosto ai partecipanti)">
        <Input
          type="number"
          min={0}
          max={1_000_000}
          step={1}
          value={config.target}
          onChange={(event) => onChange({ ...config, target: Number(event.target.value) })}
          className="w-40"
        />
      </Field>
      <p className="text-sm text-slate-500">
        Vince chi si avvicina di più. In caso di parità, il vincitore viene estratto a sorte tra i più vicini.
      </p>
    </div>
  )
}

function Audience({
  config,
  me,
  outcome,
  response,
  open,
  submit,
}: {
  config: NumberEstimateConfig
  me: { name: string }
  outcome: { draw: NumberEstimateDraw; youWon: boolean; points: number | null } | null
  response: NumberEstimateResponse | null
  open: boolean
  submit: (response: NumberEstimateResponse) => Promise<void>
}) {
  const [number, setNumber] = useState(response ? String(response.number) : "")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setNumber(response ? String(response.number) : "")
  }, [response])
  const parsed = numberEstimate
    .responseSchema(config)
    .safeParse({ number: number.trim() ? Number(number) : NaN })
  const dirty = parsed.success && parsed.data.number !== response?.number
  const send = async () => {
    if (!open || saving || !parsed.success) return
    setSaving(true)
    try {
      await submit(parsed.data)
    } catch {
      /* Submission errors are shown by the audience page. Keep the draft. */
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-3 tall:space-y-4">
      <Question>{config.prompt}</Question>
      {open && <ShownAs name={me.name} />}
      <label className={cx("block space-y-2.5", !open && "hidden")}>
        <span className="block text-sm text-slate-500">La tua stima, da 0 a 1.000.000</span>
        <input
          type="number"
          min={0}
          max={1_000_000}
          step={1}
          inputMode="numeric"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
          disabled={!open || saving}
          className={audienceField}
        />
      </label>
      {open && (
        <SubmitButton disabled={!dirty || saving} onClick={() => void send()}>
          {saving ? "Invio…" : response ? "Aggiorna numero" : "Invia numero"}
        </SubmitButton>
      )}
      {open && (
        <Hint>
          Vince chi si avvicina di più. In caso di parità, il vincitore viene estratto a sorte tra i più
          vicini.
        </Hint>
      )}
      {outcome ? (
        <EstimateVerdict {...outcome} mine={response?.number} />
      ) : !open ? (
        response ? (
          <Verdict tone="info" icon="hourglass" title="Numeri bloccati">
            Hai scelto <b>{format(response.number)}</b>. In attesa della rivelazione…
          </Verdict>
        ) : (
          <Verdict tone="info" icon="lock" title="Invio dei numeri chiuso">
            Questa volta non hai inviato un numero.
          </Verdict>
        )
      ) : response && !dirty ? (
        <Saved id={response}>Numero salvato. Puoi cambiarlo fino alla rivelazione.</Saved>
      ) : (
        <Hint className="text-center">Un numero a persona.</Hint>
      )}
    </div>
  )
}

const format = (number: number) => number.toLocaleString("it-IT")

function EstimateVerdict({
  draw,
  youWon,
  points,
  mine,
}: {
  draw: NumberEstimateDraw
  youWon: boolean
  points: number | null
  mine: number | undefined
}) {
  const cheer = useOneOf(["Hai vinto!", "La migliore stima della sala!", "Calcolatrice umana!"])
  const real = <b>{format(draw.number)}</b>
  const winner = draw.winner
  if (youWon) {
    return draw.distance === 0 ? (
      <Verdict solution points={points} tone="win" icon="target" title="Esatto!">
        Il numero vero era proprio {real}. Hai vinto!
      </Verdict>
    ) : (
      <Verdict solution points={points} tone="win" icon="trophy" title={cheer}>
        Il numero vero era {real}: il tuo {format(mine ?? 0)} era il più vicino.
      </Verdict>
    )
  }
  const winnerLine = winner
    ? `${winner.name} vince con ${format(winner.number)}.`
    : "Questa volta nessuno ha risposto."
  if (mine === undefined) {
    return (
      <Verdict
        solution
        points={points}
        tone="info"
        icon="target"
        title={`Il numero vero era ${format(draw.number)}`}
      >
        {winnerLine}
      </Verdict>
    )
  }
  const off = Math.abs(mine - draw.number)
  if (off === draw.distance) {
    return (
      <Verdict solution points={points} tone="lose" icon="shuffle" title="Per un soffio!">
        Eri tra i più vicini insieme a{" "}
        {draw.tied - 1 === 1 ? "un'altra persona" : `altre ${draw.tied - 1} persone`}, ma il sorteggio ha
        scelto {winner?.name}.
      </Verdict>
    )
  }
  const ratio = off / Math.max(draw.number, 1)
  const [icon, title] =
    ratio <= 0.1
      ? (["target", "Ah, per un soffio!"] as const)
      : ratio <= 0.5
        ? (["target", "Niente male!"] as const)
        : (["circle-x", "Acqua, acqua!"] as const)
  return (
    <Verdict solution points={points} tone="lose" icon={icon} title={title}>
      Il numero vero era {real}, tu hai scelto {format(mine)}. {winnerLine}
    </Verdict>
  )
}

function Results({ results }: { config: NumberEstimateConfig; results: NumberEstimateResults }) {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p className="text-slate-500">{results.totalParticipants} partecipanti</p>
      {results.draw && (
        <>
          <p className="font-display text-5xl font-medium tracking-tight text-pn tabular-nums">
            {results.draw.number}
          </p>
          <p>
            {results.draw.winner
              ? `Vincitore: ${results.draw.winner.name} (${results.draw.winner.number}), distanza ${results.draw.distance}`
              : "Nessun partecipante: nessun vincitore."}
          </p>
          {results.draw.tied > 1 && (
            <p>Vincitore estratto a sorte tra {results.draw.tied} numeri alla stessa distanza.</p>
          )}
        </>
      )}
    </div>
  )
}

export const numberEstimateUI = defineActivityUI({ definition: numberEstimate, Editor, Audience, Results })
