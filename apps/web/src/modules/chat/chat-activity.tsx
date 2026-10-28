'use client'

import { createContext, type Dispatch, type ReactNode, type SetStateAction, useContext, useMemo, useState } from 'react'

export type ChatActivity = { chatId: string; running: boolean; step?: string }

type ChatActivityValue = { activity: ChatActivity | null; setActivity: Dispatch<SetStateAction<ChatActivity | null>> }

const ChatActivityContext = createContext<ChatActivityValue>({ activity: null, setActivity: () => {} })

export function ChatActivityProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<ChatActivity | null>(null)
  const value = useMemo(() => ({ activity, setActivity }), [activity])
  return <ChatActivityContext.Provider value={value}>{children}</ChatActivityContext.Provider>
}

export const useChatActivity = () => useContext(ChatActivityContext)
