'use client'

import { useEffect, useRef } from 'react'

type Shortcuts = { onSearch: () => void; onNewChat: () => void }

export function useShortcuts(handlers: Shortcuts) {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.isComposing || !(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault()
        ref.current.onSearch()
      } else if (key === 'o' && event.shiftKey) {
        event.preventDefault()
        ref.current.onNewChat()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
