import { createMiroFishClient } from '@xo/mirofish'
import { env } from '@/env'

export const mirofish = createMiroFishClient({ baseUrl: env.MIROFISH_URL, token: env.MIROFISH_TOKEN })
