import { z } from "../../validation.ts"
import { defineActivity } from "../types.ts"

const configSchema = z.object({
  prompt: z.string().trim().min(1).max(300),
})
export type NumberLotteryConfig = z.infer<typeof configSchema>
export type NumberLotteryResponse = { number: number }
/** A guess with the name of whoever made it, as they signed in. */
export type NumberLotteryEntry = { name: string; number: number }
export type NumberLotteryDraw = {
  number: number
  distance: number
  closest: NumberLotteryEntry[]
  winners: NumberLotteryEntry[]
  drawnAt: number
}
export type NumberLotteryResults = {
  prompt: string
  totalParticipants: number
  entries: NumberLotteryEntry[]
  draw: NumberLotteryDraw | null
}

export function closestEntries<Entry extends NumberLotteryEntry>(entries: Entry[], target: number) {
  const distance = entries.reduce((best, entry) => Math.min(best, Math.abs(entry.number - target)), Infinity)
  return { distance, closest: entries.filter((entry) => Math.abs(entry.number - target) === distance) }
}

export const numberLottery = defineActivity<NumberLotteryConfig, NumberLotteryResponse, NumberLotteryResults>(
  {
    type: "number-lottery",
    label: "Lotteria dei numeri",
    description: "Scegli un numero da 0 a 100. Vince chi si avvicina di più al numero estratto.",
    configSchema,
    defaultConfig: () => ({ prompt: "Scegli un numero da 0 a 100 per vincere un gadget" }),
    drawLabel: "Estrai il numero",
    responseSchema: () =>
      z.object({
        number: z.number().int().min(0).max(100),
      }),
    aggregate: (config, responses) => ({
      prompt: config.prompt,
      totalParticipants: responses.length,
      // Names are the sign-in ones: winners are announced on the presentation.
      entries: responses.map(({ userName, response }) => ({ name: userName, number: response.number })),
      draw: null,
    }),
  },
)
