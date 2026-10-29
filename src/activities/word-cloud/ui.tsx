import { useEffect, useState } from "react"
import { audienceField, Hint, Question, Saved, SubmitButton, Verdict } from "../../client/audience-ui.tsx"
import { cx, Field, Input, Textarea } from "../../client/ui.tsx"
import { defineActivityUI } from "../ui-types.ts"
import {
  normalizeWord,
  type WordCloudConfig,
  type WordCloudResponse,
  type WordCloudResults,
  wordCloud,
} from "./definition.ts"

function Editor({
  config,
  onChange,
}: {
  config: WordCloudConfig
  onChange: (config: WordCloudConfig) => void
}) {
  return (
    <div className="space-y-6">
      <Field label="Testo della domanda">
        <Textarea
          value={config.prompt}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder="Quali gadget dovremmo realizzare?"
        />
      </Field>
      <Field
        label="Parole o frasi per persona"
        hint="Una voce per riga, fino a 60 caratteri. Le ripetizioni contano una sola volta per persona."
      >
        <Input
          type="number"
          min={1}
          max={10}
          value={config.maxWords}
          onChange={(e) => onChange({ ...config, maxWords: Number(e.target.value) || 1 })}
          className="w-24"
        />
      </Field>
    </div>
  )
}

function Audience({
  config,
  response,
  open,
  submit,
}: {
  config: WordCloudConfig
  response: WordCloudResponse | null
  open: boolean
  submit: (response: WordCloudResponse) => Promise<void>
}) {
  const [text, setText] = useState(response?.words.join("\n") ?? "")
  const [saving, setSaving] = useState(false)
  useEffect(() => setText(response?.words.join("\n") ?? ""), [response])
  const entries = text.split(/\r?\n/u).filter((line) => line.trim())
  const parsed = wordCloud.responseSchema(config).safeParse({ words: entries })
  const dirty =
    JSON.stringify(parsed.success ? parsed.data.words : entries.map(normalizeWord)) !==
    JSON.stringify(response?.words ?? [])

  const send = async () => {
    if (!open || saving || !parsed.success) return
    setSaving(true)
    try {
      await submit(parsed.data)
    } catch {
      // The audience page displays the error; keep the draft so it can be retried.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 tall:space-y-4">
      <Question>{config.prompt}</Question>
      <label className="block space-y-2.5">
        <Hint>Fino a {config.maxWords} parole o brevi frasi, una per riga (60 caratteri ciascuna).</Hint>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!open || saving}
          rows={Math.min(config.maxWords + 1, 6)}
          maxLength={2010}
          className={audienceField}
        />
      </label>
      {open && (
        <SubmitButton disabled={!parsed.success || !dirty || saving} onClick={() => void send()}>
          {saving ? "Invio…" : response ? "Aggiorna risposta" : "Invia"}
        </SubmitButton>
      )}
      {open && entries.length > 0 && !parsed.success && (
        <p className="text-sm text-amber-700">
          Usa fino a {config.maxWords} righe, con al massimo 60 caratteri per voce.
        </p>
      )}
      {!open ? (
        response ? (
          <Verdict tone="info" icon="cloud" title="Le tue parole sono nella nuvola">
            Riesci a trovarle sullo schermo?
          </Verdict>
        ) : (
          <Verdict tone="info" icon="lock" title="Le risposte sono chiuse">
            Questa volta non hai inviato parole.
          </Verdict>
        )
      ) : response && !dirty ? (
        <Saved id={response}>Risposta salvata. Puoi cambiarla finché le risposte sono aperte.</Saved>
      ) : (
        <Hint className="text-center">Più persone ripetono una parola, più grande appare.</Hint>
      )}
    </div>
  )
}

function Results({ results }: { config: WordCloudConfig; results: WordCloudResults }) {
  const max = results.words.reduce((value, word) => Math.max(value, word.count), 1)
  return (
    <div className="space-y-4">
      <section
        className="flex min-h-32 flex-wrap items-center justify-center gap-x-3 gap-y-2"
        aria-label="Nuvola di parole"
      >
        {results.words.length === 0 ? (
          <p className="text-sm text-slate-500">In attesa delle risposte…</p>
        ) : (
          results.words.map(({ text, count }) => (
            <span
              key={text}
              title={`${count} risposte`}
              className={cx(
                "max-w-full font-display font-medium tracking-tight break-words transition-all",
                count / max > 0.66 ? "text-pn" : count / max > 0.33 ? "text-sky-700" : "text-blue-400",
              )}
              style={{ fontSize: `${14 + 34 * (count / max)}px`, lineHeight: 1.2 }}
            >
              {text}
              <span className="sr-only">: {count} risposte</span>
            </span>
          ))
        )}
      </section>
      <p className="text-xs text-slate-500">{results.totalRespondents} risposte</p>
    </div>
  )
}

export const wordCloudUI = defineActivityUI({ definition: wordCloud, Editor, Audience, Results })
