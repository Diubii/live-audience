import { z } from "../../validation.ts"
import type { NumberLotteryEntry, NumberLotteryResponse } from "../number-lottery/definition.ts"
import { defineActivity } from "../types.ts"

const configSchema = z.object({
  prompt: z.string().trim().min(1).max(300),
  target: z.number().int().min(0).max(1_000_000),
})
export type NumberEstimateConfig = z.infer<typeof configSchema>
export type NumberEstimateResponse = NumberLotteryResponse
export type NumberEstimateDraw = {
  number: number
  distance: number | null
  tied: number
  winner: NumberLotteryEntry | null
  drawnAt: number
}
export type NumberEstimateResults = {
  prompt: string
  totalParticipants: number
  draw: NumberEstimateDraw | null
}
/** 1 for the exact figure, down to 0 for a guess off by 100% of it or more. */
export function estimateAccuracy(guess: number, target: number) {
  return Math.max(0, 1 - Math.abs(guess - target) / Math.max(target, 1))
}

export const numberEstimate = defineActivity<
  NumberEstimateConfig,
  NumberEstimateResponse,
  NumberEstimateResults
>({
  type: "number-estimate",
  label: "Indovina il numero vero",
  description:
    "Indovina una cifra reale. Vince chi si avvicina di più; in caso di parità si estrae un vincitore a sorte.",
  configSchema,
  defaultConfig: () => ({ prompt: "Indovina il numero vero", target: 0 }),
  drawLabel: "Rivela il numero vero",
  responseSchema: () =>
    z.object({
      number: z.number().int().min(0).max(1_000_000),
    }),
  audienceConfig: (config) => ({ prompt: config.prompt }),
  aggregate: (config, responses) => ({
    prompt: config.prompt,
    totalParticipants: responses.length,
    draw: null,
  }),
})
