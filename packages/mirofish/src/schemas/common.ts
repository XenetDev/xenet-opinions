import { z } from 'zod'

export const Envelope = z
  .object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
    traceback: z.string().optional(),
  })
  .loose()

export const PlatformSchema = z.enum(['twitter', 'reddit'])
export type Platform = z.infer<typeof PlatformSchema>
