import { MockLanguageModelV4 } from 'ai/test'

type Message = { role: string; content: unknown }

const textOf = (message: Message | undefined) => {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  return (message.content as Array<{ type: string; text?: string }>)
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .join('')
}

export const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

export const mockModel = (respond: (call: { system: string; prompt: string }) => unknown) =>
  new MockLanguageModelV4({
    doGenerate: async (options) => {
      const messages = options.prompt as Message[]
      const system = textOf(messages.find((m) => m.role === 'system'))
      const prompt = textOf(messages.find((m) => m.role === 'user'))
      const output = respond({ system, prompt })
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: USAGE,
        warnings: [],
      }
    },
  })

export const agentIdsIn = (prompt: string) => [...prompt.matchAll(/<participant agentId="([^"]+)">/g)].map((m) => m[1]!)
