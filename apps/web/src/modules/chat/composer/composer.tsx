'use client'

import type { ChatStatus } from 'ai'
import { PaperclipIcon, XIcon } from 'lucide-react'
import { useRef, useState } from 'react'
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
import { useInterviewSelection } from '../interview-selection'
import { useAnnounce } from '../notice-region'
import { defaultRounds, RunOptions, type RunOptionsValue } from './run-options'
import { type FollowUpTarget, TargetSelector } from './target-selector'
import { useUploads } from './use-uploads'

const ACCEPT = '.pdf,.md,.txt,application/pdf,text/markdown,text/plain'
const NO_PERSONAS = 'Select at least one persona to interview'

export type ComposerSubmit =
  | { kind: 'run'; uploadIds: string[]; runOptions: RunOptionsValue }
  | { kind: 'followUp'; target: FollowUpTarget; agentIds: string[] }

export function Composer({
  chatId,
  initialText,
  mode,
  onSend,
  disabled = false,
  status,
  onStop,
  maxRounds = 40,
  allowPause = true,
}: {
  chatId: string
  initialText?: string
  mode: 'run' | 'followUp' | 'interview'
  onSend: (text: string, submit: ComposerSubmit) => void | Promise<void>
  disabled?: boolean
  status?: ChatStatus
  onStop?: () => void
  maxRounds?: number
  allowPause?: boolean
}) {
  const { files, add, remove, uploadAll, reset } = useUploads(chatId)
  const [runOptions, setRunOptions] = useState<RunOptionsValue>({
    maxRounds: defaultRounds(maxRounds),
    pauseForInterviews: false,
  })
  const [notice, setNotice] = useState<string | null>(null)
  const selection = useInterviewSelection()
  const followUp = mode !== 'run'
  const target: FollowUpTarget = mode === 'interview' ? 'agents' : 'report'
  const personas = target === 'agents' ? (selection?.selected ?? []) : []
  if (notice === NO_PERSONAS && personas.length > 0) setNotice(null)
  const routed = useAnnounce(notice)
  const inputRef = useRef<HTMLInputElement>(null)
  const generating = status === 'submitted' || status === 'streaming'
  const uploading = files.some((f) => f.status === 'uploading')

  return (
    <PromptInputProvider initialInput={initialText}>
      <PromptInput
        className="mt-4"
        disabled={disabled}
        onSubmit={async ({ text }) => {
          if (!text.trim()) throw new Error('empty')
          if (followUp) {
            if (target === 'agents' && personas.length === 0) {
              setNotice(NO_PERSONAS)
              throw new Error('no_personas')
            }
            setNotice(null)
            await onSend(text, { kind: 'followUp', target, agentIds: personas.map((p) => p.id) })
            selection?.clear()
            return
          }
          if (files.some((f) => f.status === 'error')) {
            setNotice('Remove failed files to continue')
            throw new Error('failed_files')
          }
          setNotice(null)
          const uploadIds = await uploadAll()
          await onSend(text, {
            kind: 'run',
            uploadIds,
            runOptions: { ...runOptions, pauseForInterviews: allowPause && runOptions.pauseForInterviews },
          })
          reset()
        }}
      >
        {personas.length > 0 && (
          <PromptInputHeader>
            <ul className="flex w-full flex-wrap gap-2">
              {personas.map((persona) => (
                <li key={persona.id}>
                  <Badge variant="secondary" className="gap-1">
                    <span className="max-w-40 truncate">{persona.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${persona.name}`}
                      onClick={() => {
                        selection?.remove(persona.id)
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
        {!followUp && files.length > 0 && (
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
          <p role={routed ? undefined : 'status'} className="px-3 pt-2 text-sm text-destructive">
            {notice}
          </p>
        )}
        <PromptInputBody>
          <PromptInputTextarea placeholder="Send a message" disabled={disabled} />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {followUp ? (
              <TargetSelector value={target} />
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  disabled={disabled}
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
                <RunOptions
                  value={runOptions}
                  onChange={setRunOptions}
                  disabled={disabled}
                  maxRounds={maxRounds}
                  allowPause={allowPause}
                />
              </>
            )}
          </PromptInputTools>
          <PromptInputSubmit status={status} onStop={onStop} disabled={(disabled && !generating) || uploading} />
        </PromptInputFooter>
      </PromptInput>
    </PromptInputProvider>
  )
}
