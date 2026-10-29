import { useState } from "react"
import { api, useApi } from "../api.ts"
import { Icon } from "../icons.tsx"
import { Button, Card } from "../ui.tsx"
import { PageHeader } from "./AdminLayout.tsx"

export function ApiPage() {
  const key = useApi<{ apiKey: string }>("/api/admin/api-key")
  const [revealed, setRevealed] = useState(false)
  const origin = window.location.origin
  const apiKey = key.data?.apiKey ?? ""

  const regenerate = async () => {
    if (!confirm("Tutte le presentazioni che usano la chiave attuale smetteranno di funzionare. Continuare?"))
      return
    key.setData(await api<{ apiKey: string }>("/api/admin/api-key", { method: "POST" }))
    setRevealed(true)
  }

  const snippet = `<script type="module">
  import { LiveAudience } from "${origin}/live-audience.js"
  const live = new LiveAudience({ url: "${origin}", key: "${revealed ? apiKey : "<chiave API>"}" })

  // Comandi, ad esempio dal cambio di slide
  await live.open("sondaggio-cena")   // sul palco, risposte aperte
  await live.close()                  // risposte chiuse, ancora sul palco
  await live.clear()                  // schermata d'attesa

  // Oppure segna le slide: <section data-live="sondaggio-cena"> / data-live-status="closed" / data-live="clear">
  // e chiama live.applySlide(slideCorrente) a ogni cambio di slide.

  // Risultati in diretta per i tuoi grafici
  live.onResults("sondaggio-cena", ({ results }) => console.log(results))

  // Persone collegate alla pagina del pubblico, e quante hanno risposto a ciò che è sul palco
  live.onAudience(({ connected, answered }) => console.log(connected, answered))
</script>`

  return (
    <div className="space-y-10">
      <PageHeader kicker="Admin" title="API" />
      <Card className="space-y-4">
        <h2 className="kicker">Chiave API</h2>
        <p className="text-sm text-slate-600">
          Un'unica chiave permette alle presentazioni di comandare il palco e leggere i risultati. Chiunque la
          abbia può fare lo stesso: non pubblicarla, e rigenerala se finisce in giro.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <code className="rounded-xl border-[1.5px] border-white bg-white/75 px-3 py-1.5 font-mono text-sm break-all">
            {revealed ? apiKey : apiKey.replace(/./g, "•").slice(0, 32)}
          </code>
          <Button onClick={() => setRevealed((r) => !r)}>{revealed ? "Nascondi" : "Mostra"}</Button>
          <Button onClick={() => void navigator.clipboard.writeText(apiKey)}>Copia</Button>
          <Button variant="danger" onClick={() => void regenerate()}>
            <Icon name="rotate-ccw" /> Rigenera
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="kicker">Per iniziare (client JavaScript)</h2>
        <pre className="overflow-auto rounded-2xl bg-slate-900 p-5 text-xs leading-relaxed text-slate-100 shadow-[0_20px_40px_-24px_rgb(25_100_126/0.6)]">
          {snippet}
        </pre>
      </Card>

      <Card className="space-y-4">
        <h2 className="kicker">Riferimento HTTP</h2>
        <p className="text-sm text-slate-600">
          Invia <code>Authorization: Bearer &lt;chiave&gt;</code> (oppure <code>?key=</code>, necessario per
          EventSource). Le attività si indicano con slug o id. CORS è aperto a ogni origine.
        </p>
        <table className="w-full text-left text-sm">
          <tbody className="divide-y-[1.5px] divide-white text-slate-700 [&_td]:py-2.5 [&_td:first-child]:pr-4 [&_td:first-child]:font-mono [&_td:first-child]:text-xs [&_td:first-child]:whitespace-nowrap [&_td:first-child]:text-pn">
            <tr>
              <td>GET /api/v1/stage</td>
              <td>Cosa c'è sul palco: {"{ status, activity, presentation }"}</td>
            </tr>
            <tr>
              <td>POST /api/v1/stage</td>
              <td>
                Corpo <code>{'{ "activity": "<slug>", "status": "open" | "closed" }'}</code>; status è open se
                manca
              </td>
            </tr>
            <tr>
              <td>POST /api/v1/stage/open</td>
              <td>Apre le risposte di ciò che è sul palco</td>
            </tr>
            <tr>
              <td>POST /api/v1/stage/close</td>
              <td>Chiude le risposte di ciò che è sul palco</td>
            </tr>
            <tr>
              <td>POST /api/v1/stage/clear</td>
              <td>Palco vuoto (schermata d'attesa)</td>
            </tr>
            <tr>
              <td>POST /api/v1/stage/presentation</td>
              <td>
                Corpo <code>{'{ "presentation": "<slug>" | null }'}</code>: avvia o termina una presentazione.
                Anche mettere sul palco una sua attività la avvia
              </td>
            </tr>
            <tr>
              <td>GET /api/v1/activities</td>
              <td>Tutte le attività con la loro configurazione</td>
            </tr>
            <tr>
              <td>GET /api/v1/activities/:slug/results</td>
              <td>Risultati aggregati</td>
            </tr>
            <tr>
              <td>POST /api/v1/activities/:slug/reset</td>
              <td>Cancella tutte le risposte</td>
            </tr>
            <tr>
              <td>POST /api/v1/activities/:slug/draw</td>
              <td>
                Estrae la lotteria, rivela il numero vero o la risposta del quiz e assegna i punti; le
                chiamate successive restituiscono lo stesso esito salvato
              </td>
            </tr>
            <tr>
              <td>GET /api/v1/audience</td>
              <td>
                <code>{"{ connected, answered, activity }"}</code>: persone con la pagina del pubblico aperta,
                e quante hanno risposto all'attività sul palco (il suo slug)
              </td>
            </tr>
            <tr>
              <td>GET /api/v1/presentations</td>
              <td>Tutte le presentazioni</td>
            </tr>
            <tr>
              <td>GET /api/v1/presentations/:slug/leaderboard</td>
              <td>
                <code>{"{ id, slug, title, leaderboard: [{ rank, name, points }] }"}</code>, dal primo in giù
              </td>
            </tr>
            <tr>
              <td>GET /api/v1/events</td>
              <td>
                Server-Sent Events: <code>stage</code> a ogni cambio, <code>results</code> per ciò che è sul
                palco (o solo per <code>?activity=&lt;slug&gt;</code>), <code>leaderboard</code> per la
                presentazione in corso, <code>audience</code> quando qualcuno si collega, esce o risponde
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}
