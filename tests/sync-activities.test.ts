import { describe, expect, it } from "vitest"
import { openDatabase } from "../src/server/db.ts"
import { Store } from "../src/server/store.ts"
import { syncActivities } from "../src/server/sync-activities.ts"

const config = {
  question: "Di quale attore?",
  scoring: "points",
  answerMode: "choice",
  choices: ["Benedict Cumberbatch", "Chris Hemsworth", "Tom Holland", "Pedro Pascal"],
  acceptedAnswers: ["Benedict Cumberbatch"],
}
const manifest = {
  presentation: { slug: "chiara", title: "Chiara" },
  activities: [{ slug: "attore", title: "Attore", type: "memory-quiz", config }],
}

describe("synchronizing presentation activities", () => {
  it("previews without creating records, then keeps ids, answers, scores and stage on a repeat sync", () => {
    const db = openDatabase(":memory:")
    try {
      const store = new Store(db)
      expect(syncActivities(db, manifest)).toEqual([{ slug: "attore", action: "crea" }])
      expect(store.listActivities()).toEqual([])
      expect(store.listPresentations()).toEqual([])
      syncActivities(db, manifest, true)
      const activity = store.requireActivity("attore")
      store.setStage(activity.id, "open")
      store.respond(activity.id, { id: "one", name: "Anna" }, { answer: "Benedict Cumberbatch" })
      store.drawActivity(activity.id)
      const stage = store.getStage()
      const results = store.getResults(activity.id)
      const board = store.getLeaderboard("chiara")
      syncActivities(db, manifest, true)
      expect(store.requireActivity("attore").id).toBe(activity.id)
      expect(store.listActivities()).toHaveLength(1)
      expect(store.listResponses(activity.id)).toHaveLength(1)
      expect(store.getStage()).toEqual(stage)
      expect(store.getResults(activity.id)).toEqual(results)
      expect(store.getLeaderboard("chiara")).toEqual(board)
    } finally {
      db.close()
    }
  })

  it("rejects an entire batch if a changed quiz already has answers", () => {
    const db = openDatabase(":memory:")
    try {
      const store = new Store(db)
      syncActivities(db, manifest, true)
      store.setStage("attore", "open")
      store.respond(
        store.requireActivity("attore").id,
        { id: "one", name: "Anna" },
        { answer: "Tom Holland" },
      )
      const before = store.requireActivity("attore")
      const input = {
        ...manifest,
        activities: [
          { ...manifest.activities[0], slug: "new" },
          { ...manifest.activities[0], config: { ...config, pointsMultiplier: 2 } },
        ],
      }
      expect(() => syncActivities(db, input, true)).toThrow("ci sono risposte")
      expect(store.getActivity("new")).toBeUndefined()
      expect(store.requireActivity("attore")).toEqual(before)
      expect(store.listResponses(before.id)).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it("rolls back new records on an invalid slug and refuses duplicate slugs", () => {
    const db = openDatabase(":memory:")
    try {
      const input = {
        ...manifest,
        activities: [manifest.activities[0], { ...manifest.activities[0], slug: "INVALID!" }],
      }
      expect(() => syncActivities(db, input, true)).toThrow()
      const store = new Store(db)
      expect(store.listActivities()).toEqual([])
      expect(store.listPresentations()).toEqual([])
      expect(() =>
        syncActivities(
          db,
          { ...manifest, activities: [manifest.activities[0], manifest.activities[0]] },
          true,
        ),
      ).toThrow("duplicati")
    } finally {
      db.close()
    }
  })
})
