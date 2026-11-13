import { mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { activityDefinitions } from "../activities/registry.ts"
import { z } from "../validation.ts"
import { type Database, openDatabase } from "./db.ts"
import { Store } from "./store.ts"

const manifestSchema = z.object({
  presentation: z.object({ slug: z.string().min(1), title: z.string().min(1).max(200) }),
  activities: z
    .array(
      z.object({
        slug: z.string().min(1),
        title: z.string().min(1).max(200),
        type: z.string(),
        config: z.unknown(),
      }),
    )
    .min(1),
})

/** Validates the entire batch before writing. Never deletes activities, answers or saved draws. */
export function syncActivities(db: Database, input: unknown, apply = false) {
  const manifest = manifestSchema.parse(input)
  const store = new Store(db)
  if (new Set(manifest.activities.map((item) => item.slug)).size !== manifest.activities.length)
    throw new Error("Il file contiene slug duplicati")
  db.exec("BEGIN IMMEDIATE")
  try {
    const presentation = store.getPresentation(manifest.presentation.slug)
    const plan = manifest.activities.map((item) => {
      const definition = activityDefinitions[item.type]
      if (!definition) throw new Error(`Tipo sconosciuto: ${item.type}`)
      const config = definition.configSchema.parse(item.config)
      const existing = store.getActivity(item.slug)
      if (existing && existing.type !== item.type)
        throw new Error(`${item.slug}: il tipo esistente è diverso`)
      if (existing?.presentationId && existing.presentationId !== presentation?.id)
        throw new Error(`${item.slug}: appartiene a un'altra presentazione`)
      const configChanged = existing && JSON.stringify(existing.config) !== JSON.stringify(config)
      if (
        existing &&
        configChanged &&
        (store.listResponses(existing.id).length || store.getResults(existing.id).results.draw)
      )
        throw new Error(`${item.slug}: ci sono risposte o un esito salvato; sincronizzazione interrotta`)
      return { ...item, config, existing }
    })
    if (apply) {
      const target = presentation ?? store.createPresentation(manifest.presentation)
      for (const item of plan) {
        const activity = item.existing ?? store.createActivity({ ...item, presentationId: target.id })
        store.updateActivity(activity.id, {
          title: item.title,
          config: item.config,
          presentationId: target.id,
          countsToLeaderboard: true,
        })
      }
      db.exec("COMMIT")
    } else db.exec("ROLLBACK")
    return plan.map(({ slug, existing }) => ({ slug, action: existing ? "aggiorna" : "crea" }))
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [manifestPath, databasePath, flag] = process.argv.slice(2)
  if (!manifestPath || !databasePath || (flag !== undefined && flag !== "--apply"))
    throw new Error("Uso: node src/server/sync-activities.ts <file.json> <database.db> [--apply]")
  const db = openDatabase(databasePath)
  try {
    if (flag === "--apply") {
      const backup = resolve(dirname(databasePath), "backups", `before-sync-${Date.now()}.db`)
      mkdirSync(dirname(backup), { recursive: true })
      db.prepare("VACUUM INTO ?").run(backup)
      console.log(`Backup: ${backup}`)
    }
    console.table(syncActivities(db, JSON.parse(readFileSync(manifestPath, "utf8")), flag === "--apply"))
    console.log(flag === "--apply" ? "Sincronizzazione completata." : "Anteprima: database invariato.")
  } finally {
    db.close()
  }
}
