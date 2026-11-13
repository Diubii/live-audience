import { useEffect, useState } from "react"
import {
  audienceField,
  ChoiceButton,
  Hint,
  Question,
  Saved,
  ShowHide,
  ShownAs,
  SortableList,
  SubmitButton,
  useOneOf,
  Verdict,
} from "../../client/audience-ui.tsx"
import { Field, Select, Textarea } from "../../client/ui.tsx"
import { defineActivityUI } from "../ui-types.ts"
import {
  type MemoryQuizConfig,
  type MemoryQuizDraw,
  type MemoryQuizResponse,
  type MemoryQuizResults,
  memoryQuiz,
  normalizeAnswer,
  quizScoring,
} from "./definition.ts"

function Editor({
  config,
  onChange,
}: {
  config: MemoryQuizConfig
  onChange: (config: MemoryQuizConfig) => void
}) {
  return (
    <div className="space-y-6">
      <Field label="Domanda">
        <Textarea
          value={config.question}
          onChange={(event) => onChange({ ...config, question: event.target.value })}
        />
      </Field>
      <Field label="Punteggio">
        <Select
          className="w-auto"
          value={quizScoring(config)}
          onChange={(scoring) => onChange({ ...config, scoring: scoring as "points" | "first" })}
          options={[
            { value: "points", label: "Punti: ogni risposta corretta vale punti, di più se è veloce" },
            { value: "first", label: "La prima risposta corretta vince e chiude il quiz" },
          ]}
        />
      </Field>
      <Field label="Valore dei punti">
        <Select
          className="w-auto"
          value={String(config.pointsMultiplier ?? 1)}
          onChange={(value) => onChange({ ...config, pointsMultiplier: Number(value) as 1 | 2 })}
          options={[
            { value: "1", label: "Punti normali (fino a 1000)" },
            { value: "2", label: "Punti doppi (fino a 2000)" },
          ]}
        />
      </Field>
      <Field label="Formato della risposta">
        <Select
          className="w-auto"
          value={config.answerMode ?? "text"}
          onChange={(mode) =>
            onChange({
              ...config,
              answerMode: mode === "text" ? undefined : (mode as "choice" | "order"),
              choices: mode === "text" ? undefined : (config.choices ?? []),
            })
          }
          options={[
            { value: "text", label: "Testo libero" },
            { value: "choice", label: "Scegli un'opzione" },
            { value: "order", label: "Metti gli elementi in ordine" },
          ]}
        />
      </Field>
      {config.answerMode && (
        <Field
          label="Opzioni / elementi (uno per riga; 2–4 opzioni, 2–6 elementi da ordinare)"
          hint="Le righe vuote vengono ignorate."
        >
          <Textarea
            value={(config.choices ?? []).join("\n")}
            onChange={(event) => onChange({ ...config, choices: event.target.value.split("\n") })}
          />
        </Field>
      )}
      <Field
        label="Risposte accettate (nascoste ai partecipanti)"
        hint="Una risposta esatta per riga; le righe vuote vengono ignorate. Per gli ordinamenti, separa gli elementi con →. Maiuscole, spazi e . ! ? finali vengono ignorati."
      >
        <Textarea
          value={config.acceptedAnswers.join("\n")}
          onChange={(event) => onChange({ ...config, acceptedAnswers: event.target.value.split("\n") })}
        />
      </Field>
      <p className="text-sm text-slate-500">
        {quizScoring(config) === "points"
          ? `Le risposte restano nascoste finché non le riveli. Ogni risposta corretta vale fino a ${1000 * (config.pointsMultiplier ?? 1)} punti, che scendono a ${500 * (config.pointsMultiplier ?? 1)} nei primi 30 secondi; vince la più veloce.`
          : "La prima risposta corretta ricevuta dal server vince e chiude subito il quiz."}
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
  config: MemoryQuizConfig
  me: { name: string }
  outcome: { draw: MemoryQuizDraw; youWon: boolean; points: number | null } | null
  response: MemoryQuizResponse | null
  open: boolean
  submit: (response: MemoryQuizResponse) => Promise<void>
}) {
  const [answer, setAnswer] = useState(
    response?.answer ?? (config.answerMode === "order" ? (config.choices?.join(" → ") ?? "") : ""),
  )
  const [saving, setSaving] = useState(false)
  /** The last answer this person tried to send, even if it arrived too late. */
  const [tried, setTried] = useState<string | null>(null)
  const nope = useOneOf(["No, non è questa. Riprova!", "Non proprio! Riprova.", "Sbagliato… ma non mollare."])
  const withPoints = quizScoring(config) === "points"
  useEffect(() => {
    setAnswer(response?.answer ?? (config.answerMode === "order" ? (config.choices?.join(" → ") ?? "") : ""))
  }, [response, config.answerMode, config.choices])
  const parsed = memoryQuiz.responseSchema(config).safeParse({ answer })
  const dirty = parsed.success && parsed.data.answer !== response?.answer
  const send = async () => {
    if (!open || saving || !parsed.success) return
    setTried(parsed.data.answer)
    setSaving(true)
    try {
      await submit(parsed.data)
    } catch {
      /* The audience page displays submission errors. */
    } finally {
      setSaving(false)
    }
  }
  const answerArea =
    config.answerMode === "choice" ? (
      <fieldset className="space-y-2.5" disabled={!open || saving}>
        {config.choices?.map((choice) => (
          <ChoiceButton key={choice} selected={answer === choice} onClick={() => setAnswer(choice)}>
            {choice}
          </ChoiceButton>
        ))}
      </fieldset>
    ) : config.answerMode === "order" ? (
      <SortableList
        items={answer.split(" → ")}
        onChange={(items) => setAnswer(items.join(" → "))}
        disabled={!open || saving}
      />
    ) : (
      <label className="block space-y-2.5">
        <span className="block text-sm text-slate-500">La tua risposta</span>
        <input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          maxLength={120}
          autoComplete="off"
          disabled={!open || saving}
          className={audienceField}
        />
      </label>
    )
  // Once answers close, the verdict comes first and the answer given waits behind a button.
  if (!open) {
    return (
      <div className="space-y-3 tall:space-y-4">
        <Question>{config.question}</Question>
        {outcome ? (
          withPoints ? (
            <PointsVerdict {...outcome} />
          ) : (
            <QuizVerdict {...outcome} tried={tried ?? response?.answer} />
          )
        ) : (
          <Verdict tone="info" icon="hourglass" title="Risposte bloccate">
            {withPoints ? "Rullo di tamburi… sta arrivando la risposta." : "Guarda la presentazione…"}
          </Verdict>
        )}
        {response && <ShowHide label="la tua risposta">{answerArea}</ShowHide>}
      </div>
    )
  }
  return (
    <div className="space-y-3 tall:space-y-4">
      <Question>{config.question}</Question>
      <ShownAs name={me.name} />
      {answerArea}
      <SubmitButton disabled={!dirty || saving} onClick={() => void send()}>
        {saving ? "Invio…" : response ? "Aggiorna risposta" : "Invia risposta"}
      </SubmitButton>
      <Hint>
        {config.pointsMultiplier === 2 && "Questa domanda vale punti doppi. "}
        {withPoints
          ? "Ogni risposta corretta vale punti, di più se è veloce. La risposta viene rivelata alla fine."
          : "La prima risposta corretta vince e chiude il quiz."}
      </Hint>
      {response && !dirty && withPoints ? (
        <Saved id={response}>Risposta salvata! Puoi cambiarla fino alla rivelazione.</Saved>
      ) : response && !dirty ? (
        // A right answer closes the quiz on the spot: still open means this one was wrong.
        <p key={JSON.stringify(response)} className="animate-wobble text-center font-medium text-rose-600">
          {nope}
        </p>
      ) : (
        <Hint className="text-center">
          {config.answerMode === "choice"
            ? "Scegli un'opzione."
            : config.answerMode === "order"
              ? "Trascina gli elementi dal primo all'ultimo, poi invia."
              : "Scrivi liberamente la tua risposta."}
        </Hint>
      )}
    </div>
  )
}

/** Points quizzes: everyone right celebrates, the fastest most. */
function PointsVerdict({
  draw,
  youWon,
  points,
}: {
  draw: MemoryQuizDraw
  youWon: boolean
  points: number | null
}) {
  const cheer = useOneOf(["Corretto!", "Centro!", "Esatto!"])
  const correct = draw.correct ?? 0
  const others = correct - 1
  if (youWon) {
    return (
      <Verdict solution tone="win" icon="zap" title="La risposta corretta più veloce!" points={points}>
        “{draw.answer}” era la risposta giusta, e nessuno ti ha battuto sul tempo.
      </Verdict>
    )
  }
  if (points) {
    return (
      <Verdict solution tone="win" icon="circle-check" title={cheer} points={points}>
        “{draw.answer}” era la risposta giusta
        {others > 0 ? `, come ${others === 1 ? "un'altra persona" : `altre ${others} persone`}.` : "."}{" "}
        {draw.winner && `${draw.winner.name} ha risposto più velocemente.`}
      </Verdict>
    )
  }
  const rightLine =
    correct === 0
      ? "Nessuno ha indovinato!"
      : `${correct} ${correct === 1 ? "persona ha indovinato" : "persone hanno indovinato"}.`
  return points === 0 ? (
    <Verdict solution tone="lose" icon="circle-x" title="Non proprio" points={points}>
      La risposta era “{draw.answer}”. {rightLine}
    </Verdict>
  ) : (
    <Verdict solution tone="info" icon="lightbulb" title="Risposta rivelata">
      La risposta era “{draw.answer}”. {rightLine} Partecipa alla prossima!
    </Verdict>
  )
}

function QuizVerdict({
  draw,
  youWon,
  points,
  tried,
}: {
  draw: MemoryQuizDraw
  youWon: boolean
  points: number | null
  tried: string | undefined
}) {
  const cheer = useOneOf(["Hai risposto per primo!", "Che intuito!", "Dita velocissime!"])
  if (youWon) {
    return (
      <Verdict solution points={points} tone="win" icon="trophy" title={cheer}>
        “{draw.answer}” era la risposta giusta, e sei stato il più veloce. Hai vinto!
      </Verdict>
    )
  }
  if (!draw.winner) {
    return (
      <Verdict solution points={points} tone="info" icon="lightbulb" title="Nessuno ha indovinato!">
        La risposta era “{draw.answer}”.
      </Verdict>
    )
  }
  const hadIt = tried !== undefined && normalizeAnswer(tried) === normalizeAnswer(draw.answer)
  return (
    <Verdict solution points={points} tone="lose" icon="hourglass" title="Troppo tardi!">
      {hadIt
        ? `La risposta era giusta, ma ${draw.winner.name} ha fatto prima.`
        : `${draw.winner.name} ha fatto prima: la risposta era “${draw.answer}”.`}
    </Verdict>
  )
}

function Results({ results }: { config: MemoryQuizConfig; results: MemoryQuizResults }) {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p className="text-slate-500">{results.totalParticipants} partecipanti</p>
      {results.draw && (
        <>
          <p className="label-caps">Risposta</p>
          <p className="font-display text-2xl font-medium tracking-tight text-pn">{results.draw.answer}</p>
          <p className="font-medium">
            {results.draw.winner
              ? `${results.draw.correct === undefined ? "Prima" : "Più veloce"} risposta corretta: ${results.draw.winner.name}`
              : "Nessuna risposta corretta."}
          </p>
          {results.draw.correct !== undefined && (
            <p className="text-slate-500">{results.draw.correct} risposte corrette</p>
          )}
        </>
      )}
    </div>
  )
}

export const memoryQuizUI = defineActivityUI({ definition: memoryQuiz, Editor, Audience, Results })
