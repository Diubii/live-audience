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
import { cx, Field, Textarea } from "../../client/ui.tsx"
import { defineActivityUI } from "../ui-types.ts"
import {
  type NumberLotteryConfig,
  type NumberLotteryDraw,
  type NumberLotteryResponse,
  type NumberLotteryResults,
  numberLottery,
} from "./definition.ts"

function Editor({
  config,
  onChange,
}: {
  config: NumberLotteryConfig
  onChange: (config: NumberLotteryConfig) => void
}) {
  return (
    <div className="space-y-6">
      <Field label="Testo della domanda">
        <Textarea value={config.prompt} onChange={(event) => onChange({ prompt: event.target.value })} />
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
  config: NumberLotteryConfig
  me: { name: string }
  outcome: { draw: NumberLotteryDraw; youWon: boolean; points: number | null } | null
  response: NumberLotteryResponse | null
  open: boolean
  submit: (response: NumberLotteryResponse) => Promise<void>
}) {
  const [number, setNumber] = useState(response ? String(response.number) : "")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setNumber(response ? String(response.number) : "")
  }, [response])
  const parsed = numberLottery
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
        <span className="block text-sm text-slate-500">Il tuo numero, da 0 a 100</span>
        <input
          type="number"
          min={0}
          max={100}
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
        <LotteryVerdict {...outcome} mine={response?.number} />
      ) : !open ? (
        response ? (
          <Verdict tone="info" icon="hourglass" title="Numeri bloccati">
            Il tuo numero è <b>{response.number}</b>. Rullo di tamburi per l'estrazione…
          </Verdict>
        ) : (
          <Verdict tone="info" icon="lock" title="Invio dei numeri chiuso">
            Questa volta non hai scelto un numero.
          </Verdict>
        )
      ) : response && !dirty ? (
        <Saved id={response}>Numero salvato. Puoi cambiarlo fino all'estrazione.</Saved>
      ) : (
        <Hint className="text-center">Un numero a persona.</Hint>
      )}
    </div>
  )
}

function LotteryVerdict({
  draw,
  youWon,
  points,
  mine,
}: {
  draw: NumberLotteryDraw
  youWon: boolean
  points: number | null
  mine: number | undefined
}) {
  const cheer = useOneOf(["Hai vinto!", "Vittoria!", "Jackpot!"])
  const winner = draw.winners[0]
  if (youWon) {
    return (
      <Verdict solution points={points} tone="win" icon="trophy" title={cheer}>
        Il numero era <b>{draw.number}</b>
        {draw.distance === 0 ? ": lo hai indovinato esattamente!" : `, e il tuo ${mine} era il più vicino.`}
      </Verdict>
    )
  }
  if (mine === undefined) {
    return (
      <Verdict solution points={points} tone="info" icon="target" title={`Il numero era ${draw.number}`}>
        {winner?.name} vince con {winner?.number}. Partecipa alla prossima!
      </Verdict>
    )
  }
  const distance = Math.abs(mine - draw.number)
  if (distance === draw.distance) {
    return (
      <Verdict solution points={points} tone="lose" icon="shuffle" title="Per un soffio!">
        Eri tra i più vicini, ma il sorteggio ha scelto {winner?.name}.
      </Verdict>
    )
  }
  return (
    <Verdict
      solution
      tone="lose"
      icon={distance <= 5 ? "target" : "circle-x"}
      title={distance <= 5 ? "Ah, per un soffio!" : "Non questa volta"}
    >
      Il numero era <b>{draw.number}</b> e il tuo distava {distance}. {winner?.name} ha vinto con{" "}
      {winner?.number}.
    </Verdict>
  )
}

function Results({ results }: { config: NumberLotteryConfig; results: NumberLotteryResults }) {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p className="text-slate-500">{results.totalParticipants} partecipanti</p>
      {results.draw && (
        <div className="space-y-3">
          <p className="font-display text-5xl font-medium tracking-tight text-pn tabular-nums">
            {results.draw.number}
          </p>
          {results.draw.closest.length > 1 && (
            <p>
              {results.draw.closest.length} numeri alla stessa distanza: vincitore estratto a sorte tra loro.
            </p>
          )}
          <p className="font-medium">
            Vincitore: {results.draw.winners[0]?.name} ({results.draw.winners[0]?.number}), distanza{" "}
            {results.draw.distance}
          </p>
        </div>
      )}
      <ol className="max-h-80 list-decimal space-y-1.5 overflow-auto pl-6 marker:font-display marker:text-slate-400">
        {results.entries.map((entry, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: equal names are separate participants
          <li key={index} className="break-words">
            {entry.name}: {entry.number}
          </li>
        ))}
      </ol>
    </div>
  )
}

export const numberLotteryUI = defineActivityUI({ definition: numberLottery, Editor, Audience, Results })
