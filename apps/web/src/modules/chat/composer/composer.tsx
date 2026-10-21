'use client'

import { useRef, useState } from 'react'
import type { ChatStatus } from 'ai'
import { PaperclipIcon, XIcon } from 'lucide-react'
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { Badge } from '@/components/ui/badge'
import { DEFAULT_ROUNDS, RunOptions, type RunOptionsValue } from './run-options'
import { useUploads } from './use-uploads'

const ACCEPT = '.pdf,.md,.txt,application/pdf,text/markdown,text/plain'

export function Composer({
  chatId,
  initialText,
  onSend,
  disabled = false,
  status,
  onStop,
}: {
  chatId: string
  initialText?: string
  onSend: (text: string, uploadIds: string[], runOptions: RunOptionsValue) => void | Promise<void>
  disabled?: boolean
  status?: ChatStatus
  onStop?: () => void
}) {
  const { files, add, remove, uploadAll, reset } = useUploads(chatId)
  const [runOptions, setRunOptions] = useState<RunOptionsValue>({ maxRounds: DEFAULT_ROUNDS })
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const generating = status === 'submitted' || status === 'streaming'
  const uploading = files.some((f) => f.status === 'uploading')

  return (
    <PromptInputProvider initialInput={initialText}>
      <PromptInput
        className="mt-4"
        onSubmit={async ({ text }) => {
          if (!text.trim()) throw new Error('empty')
          if (files.some((f) => f.status === 'error')) {
            setNotice('Remove failed files to continue')
            throw new Error('failed_files')
          }
          setNotice(null)
          const uploadIds = await uploadAll()
          await onSend(text, uploadIds, runOptions)
          reset()
        }}
      >
        {files.length > 0 && (
          <PromptInputHeader>
            <ul className="flex w-full flex-wrap gap-2">
              {files.map((item) => (
                <li key={item.localId} data-testid="pending-file">
                  <Badge variant={item.status === 'error' ? 'destructive' : 'secondary'} className="gap-1">
                    <span className="max-w-40 truncate">{item.file.name}</span>
                    <span>{item.status === 'error' ? item.error : item.status}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${item.file.name}`}
                      disabled={item.status === 'uploading'}
                      onClick={() => {
                        remove(item.localId)
                        setNotice(null)
                      }}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          </PromptInputHeader>
        )}
        {notice && (
          <p role="status" className="px-3 pt-2 text-sm text-destructive">
            {notice}
          </p>
        )}
        <PromptInputBody>
          <PromptInputTextarea placeholder="Send a message" disabled={disabled} />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              accept={ACCEPT}
              data-testid="file-input"
              onChange={(event) => {
                add(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            <PromptInputButton disabled={disabled} onClick={() => inputRef.current?.click()}>
              <PaperclipIcon className="size-4" />
              <span>Attach</span>
            </PromptInputButton>
            <RunOptions value={runOptions} onChange={setRunOptions} disabled={disabled} />
          </PromptInputTools>
          <PromptInputSubmit status={status} onStop={onStop} disabled={(disabled && !generating) || uploading} />
        </PromptInputFooter>
      </PromptInput>
    </PromptInputProvider>
  )
}
