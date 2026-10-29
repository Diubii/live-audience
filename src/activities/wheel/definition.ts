import { z } from "../../validation.ts"
import { defineActivity } from "../types.ts"

const configSchema = z.object({ prompt: z.string().trim().min(1).max(300) })
export type WheelConfig = z.infer<typeof configSchema>
/** Joining is the whole answer: the name on the wheel is the sign-in one. */
const responseSchema = z.object({})
export type WheelResponse = z.infer<typeof responseSchema>
export type WheelResults = { prompt: string; totalParticipants: number; names: string[] }

export const wheel = defineActivity<WheelConfig, WheelResponse, WheelResults>({
  type: "wheel",
  label: "Ruota della fortuna",
  description: "Si partecipa alla ruota dei premi con il nome del proprio account.",
  configSchema,
  defaultConfig: () => ({ prompt: "Partecipa alla ruota per provare a vincere" }),
  responseSchema: () => responseSchema,
  // The wheel shows the sign-in names; ids stay private.
  // Equal names remain separate entries: each signed-in person gets one chance.
  aggregate: (config, responses) => ({
    prompt: config.prompt,
    totalParticipants: responses.length,
    names: responses.map(({ userName }) => userName),
  }),
})
