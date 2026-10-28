'use client'

import type { ChatStatus } from 'ai'
import { ArrowUpIcon, PaperclipIcon, PlusIcon } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useCallback, useId, useRef, useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useInterviewSelection } from '../interview-selection'
import { useAnnounce } from '../notice-region'
import { FileChips, PersonaChips } from './chips'
import { defaultRounds, PauseOption, RoundsPicker, type RunOptionsValue } from './run-options'
import { useUploads } from './use-uploads'

const ACCEPT = '.pdf,.md,.txt,application/pdf,text/markdown,text/plain'
const NO_PERSONAS = 'Select at least one persona to interview'
const FAILED_FILES = 'Remove failed files to continue'

const PLACEHOLDERS = {
  run: 'Ask how people would react to…',
  followUp: 'Ask the report…',
  interview: 'Ask the selected personas…',
} as const

export type ComposerSubmit =
  | { kind: 'run'; uploadIds: string[]; runOptions: RunOptionsValue }
  | { kind: 'followUp'; target: 'report' | 'agents'; agentIds: string[] }

export function PillComposer({
  chatId,
  mode,
  onSend,
  disabled = false,
  busy = false,
  status,
  onStop,
  maxRounds = 40,
  allowPause = true,
  onNeedChat,
  value,
  onValueChange,
}: {
  chatId?: string
  mode: 'run' | 'followUp' | 'interview'
  onSend: (text: string, submit: ComposerSubmit) => void | Promise<void>
  disabled?: boolean
  busy?: boolean
  status?: ChatStatus
  onStop?: () => void
  maxRounds?: number
  allowPause?: boolean
  onNeedChat?: () => Promise<string>
  value?: string
  onValueChange?: (value: string) => void
}) {
  const pendingChat = useRef<Promise<string> | null>(null)
  const resolveChatId = useCallback(() => {
    if (chatId) return Promise.resolve(chatId)
    if (!onNeedChat) return Promise.reject(new Error('no_chat'))
    pendingChat.current ??= onNeedChat().catch((error: unknown) => {
      pendingChat.current = null
      throw error
    })
    return pendingChat.current
  }, [chatId, onNeedChat])
  const { files, add, remove, uploadAll, reset } = useUploads(chatId ?? resolveChatId)
  const [ownText, setOwnText] = useState('')
  const text = value ?? ownText
  const setText = (next: string) => {
    setOwnText(next)
    onValueChange?.(next)
  }
  const [runOptions, setRunOptions] = useState<RunOptionsValue>({
    maxRounds: defaultRounds(maxRounds),
    pauseForInterviews: false,
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const selection = useInterviewSelection()
  const personas = mode === 'interview' ? (selection?.selected ?? []) : []
  if (notice === NO_PERSONAS && personas.length > 0) setNotice(null)
  const routed = useAnnounce(notice)
  const fileInput = useRef<HTMLInputElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const fieldId = useId()
  const stopping = busy || status === 'submitted' || status === 'streaming'
  const uploading = files.some((f) => f.status === 'uploading')

  const deliver = async (value: string) => {
    if (mode !== 'run') {
      if (mode === 'interview' && personas.length === 0) {
        setNotice(NO_PERSONAS)
        return
      }
      setNotice(null)
      await onSend(value, {
        kind: 'followUp',
        target: mode === 'interview' ? 'agents' : 'report',
        agentIds: personas.map((p) => p.id),
      })
      if (mode === 'interview') selection?.clear()
      setText('')
      return
    }
    if (files.some((f) => f.status === 'error')) {
      setNotice(FAILED_FILES)
      return
    }
    setNotice(null)
    const uploadIds = await uploadAll()
    await onSend(value, {
      kind: 'run',
      uploadIds,
      runOptions: { ...runOptions, pauseForInterviews: allowPause && runOptions.pauseForInterviews },
    })
    reset()
    setText('')
  }

  const send = async () => {
    if (disabled || stopping || uploading || sendingRef.current) return
    if (!text.trim()) {
      field.current?.focus()
      return
    }
    sendingRef.current = true
    setSending(true)
    await deliver(text).catch(() => undefined)
    sendingRef.current = false
    setSending(false)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void send()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
      return
    event.preventDefault()
    void send()
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <FieldLabel className="sr-only" htmlFor={fieldId}>
          Message
        </FieldLabel>
        {mode === 'run' && (
          <FileChips
            files={files}
            onRemove={(localId) => {
              remove(localId)
              setNotice(null)
            }}
          />
        )}
        <PersonaChips
          personas={personas}
          onRemove={(id) => {
            selection?.remove(id)
            setNotice(null)
          }}
        />
        {notice && (
          <p role={routed ? undefined : 'status'} className="px-3 text-sm text-destructive">
            {notice}
          </p>
        )}
        <InputGroup className="h-auto rounded-full bg-background px-2 shadow-xs has-disabled:opacity-100">
          <InputGroupTextarea
            id={fieldId}
            ref={field}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDERS[mode]}
            disabled={disabled}
            rows={1}
            className="field-sizing-content max-h-40 min-h-12 px-0 py-3"
          />
          {mode === 'run' && (
            <InputGroupAddon align="inline-start" className="me-1">
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                disabled={disabled}
                accept={ACCEPT}
                data-testid="file-input"
                onChange={(event) => {
                  const accepted = add(Array.from(event.target.files ?? []))
                  event.target.value = ''
                  if (!chatId && accepted > 0) void resolveChatId().catch(() => {})
                }}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <InputGroupButton
                    size="icon-sm"
                    className="rounded-full"
                    aria-label="Add files and options"
                    disabled={disabled}
                  >
                    <PlusIcon aria-hidden="true" />
                  </InputGroupButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                    <PaperclipIcon aria-hidden="true" />
                    Attach files
                  </DropdownMenuItem>
                  {allowPause && (
                    <PauseOption
                      checked={runOptions.pauseForInterviews}
                      onChange={(pauseForInterviews) => setRunOptions((prev) => ({ ...prev, pauseForInterviews }))}
                    />
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </InputGroupAddon>
          )}
          <InputGroupAddon align="inline-end" className="gap-1">
            {mode === 'run' && (
              <RoundsPicker
                value={runOptions.maxRounds}
                onChange={(rounds) => setRunOptions((prev) => ({ ...prev, maxRounds: rounds }))}
                maxRounds={maxRounds}
                disabled={disabled}
              />
            )}
            {stopping ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <InputGroupButton
                    size="icon-sm"
                    variant="default"
                    className="rounded-full"
                    aria-label="Stop"
                    disabled={!onStop}
                    onClick={onStop}
                  >
                    <span aria-hidden="true" className="size-2.5 bg-primary-foreground" />
                  </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent>Stop</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    variant="default"
                    className="rounded-full"
                    aria-label="Send message"
                    disabled={disabled || uploading || sending}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent>
                  Send
                  <Kbd>Enter</Kbd>
                </TooltipContent>
              </Tooltip>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        Simulated opinions. Check important decisions with real people.
      </p>
    </div>
  )
}
