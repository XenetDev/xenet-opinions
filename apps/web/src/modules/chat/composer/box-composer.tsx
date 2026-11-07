'use client'

import type { SourcesData } from '@xo/engine/parts'
import { PANEL_MAX_PARTICIPANTS, type Panel, type PlanId } from '@xo/engine/policy'
import type { ChatStatus } from 'ai'
import { ArrowUpIcon, PaperclipIcon, PlusIcon, SparklesIcon, Undo2Icon } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, type ReactNode, useCallback, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Frame, FrameHeader, FramePanel } from '@/components/reui/frame'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Kbd } from '@/components/ui/kbd'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useInterviewSelection } from '../interview-selection'
import { useAnnounce } from '../notice-region'
import { FileChips, PersonaChips } from './chips'
import { ConfigurePanel, defaultPanel, usePanel } from './configure-panel'
import { defaultRounds, type RunOptionsValue } from './run-options'
import { useUploads } from './use-uploads'

const ACCEPT = '.pdf,.md,.txt,application/pdf,text/markdown,text/plain'
const NO_PERSONAS = 'Select at least one persona to interview'
const FAILED_FILES = 'Remove failed files to continue'
const IMPROVE_FAILED = "Couldn't improve the prompt. Your text is unchanged."

const PLACEHOLDERS = {
  run: 'Ask how people would react to…',
  followUp: 'Ask the report…',
  interview: 'Ask the selected personas…',
} as const

export type ComposerSubmit =
  | { kind: 'run'; uploadIds: string[]; files: SourcesData['files']; runOptions: RunOptionsValue; panel: Panel }
  | { kind: 'followUp'; target: 'report' | 'agents'; agentIds: string[] }

export type ComposerBlock = { message: string; action?: { label: string; onClick: () => void } }

async function requestImprove(text: string): Promise<string | null> {
  const response = await fetch('/api/prompt/improve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => null)
  if (!response?.ok) return null
  const json = (await response.json().catch(() => null)) as { text?: unknown } | null
  return typeof json?.text === 'string' && json.text.trim() ? json.text : null
}

export function BoxComposer({
  chatId,
  mode,
  onSend,
  disabled = false,
  busy = false,
  status,
  onStop,
  maxRounds = 40,
  allowPause = true,
  maxParticipants = PANEL_MAX_PARTICIPANTS,
  webResearchAvailable = false,
  plan,
  onNeedChat,
  value,
  onValueChange,
  lip,
  blocked,
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
  maxParticipants?: number
  webResearchAvailable?: boolean
  plan?: PlanId
  onNeedChat?: () => Promise<string>
  value?: string
  onValueChange?: (value: string) => void
  lip?: ReactNode
  blocked?: ComposerBlock
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
  const textRef = useRef(text)
  textRef.current = text
  const [undoText, setUndoText] = useState<string | null>(null)
  const [improving, setImproving] = useState(false)
  const setText = (next: string) => {
    textRef.current = next
    setOwnText(next)
    setUndoText(null)
    onValueChange?.(next)
  }
  const [runOptions, setRunOptions] = useState<RunOptionsValue>({
    maxRounds: defaultRounds(maxRounds),
    pauseForInterviews: false,
  })
  const [panel, setPanel] = usePanel(maxParticipants, webResearchAvailable)
  const [configOpen, setConfigOpen] = useState(false)
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
  const runBlocked = mode === 'run' ? blocked : undefined

  const deliver = async (value: string) => {
    const clear = () => {
      setConfigOpen(false)
      setText('')
    }
    const restore = () => {
      if (!textRef.current) setText(value)
    }
    if (mode !== 'run') {
      if (mode === 'interview' && personas.length === 0) {
        setNotice(NO_PERSONAS)
        return
      }
      setNotice(null)
      clear()
      try {
        await onSend(value, {
          kind: 'followUp',
          target: mode === 'interview' ? 'agents' : 'report',
          agentIds: personas.map((p) => p.id),
        })
      } catch (error) {
        restore()
        throw error
      }
      if (mode === 'interview') selection?.clear()
      return
    }
    if (files.some((f) => f.status === 'error')) {
      setNotice(FAILED_FILES)
      return
    }
    setNotice(null)
    clear()
    try {
      const uploadIds = await uploadAll()
      await onSend(value, {
        kind: 'run',
        uploadIds,
        files: files.flatMap(({ file }, i) =>
          uploadIds[i] ? [{ id: uploadIds[i], filename: file.name, mediaType: file.type, sizeBytes: file.size }] : [],
        ),
        runOptions: { ...runOptions, pauseForInterviews: allowPause && runOptions.pauseForInterviews },
        panel: { ...panel, webResearch: webResearchAvailable && panel.webResearch },
      })
    } catch (error) {
      restore()
      throw error
    }
    reset()
    setPanel(defaultPanel(maxParticipants, webResearchAvailable))
    setRunOptions({ maxRounds: defaultRounds(maxRounds), pauseForInterviews: false })
  }

  const send = async () => {
    if (disabled || stopping || uploading || improving || sendingRef.current) return
    if (runBlocked) {
      toast(runBlocked.message, runBlocked.action ? { action: runBlocked.action } : {})
      return
    }
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

  const improve = async () => {
    const original = text
    if (!original.trim() || improving) return
    setImproving(true)
    const improved = await requestImprove(original)
    setImproving(false)
    if (textRef.current !== original) return
    if (!improved) {
      toast(IMPROVE_FAILED)
      return
    }
    setText(improved)
    setUndoText(original)
  }

  const undoImprove = () => {
    if (undoText === null) return
    setText(undoText)
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

  const showChips = (mode === 'run' && files.length > 0) || personas.length > 0

  return (
    <div className="flex w-full flex-col gap-2">
      {mode === 'run' && (
        <ConfigurePanel
          value={panel}
          onChange={setPanel}
          maxParticipants={maxParticipants}
          webResearchAvailable={webResearchAvailable}
          runOptions={runOptions}
          onRunOptionsChange={setRunOptions}
          maxRounds={maxRounds}
          allowPause={allowPause}
          plan={plan}
          disabled={disabled}
          open={configOpen}
          onOpenChange={setConfigOpen}
        />
      )}
      {notice && (
        <p role={routed ? undefined : 'status'} className="px-3 text-sm text-destructive">
          {notice}
        </p>
      )}
      <Frame
        dense
        spacing="sm"
        className="w-full transition-[color,box-shadow] has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50"
      >
        {lip && (
          <FrameHeader
            data-testid="composer-lip"
            className="flex-row items-center justify-between gap-3 rounded-t-[calc(var(--frame-radius)-1px)] bg-muted/40 text-muted-foreground text-xs"
          >
            {lip}
          </FrameHeader>
        )}
        <FramePanel className="p-0">
          <form onSubmit={submit}>
            <FieldLabel className="sr-only" htmlFor={fieldId}>
              Message
            </FieldLabel>
            {mode === 'run' && (
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
            )}
            <InputGroup className="border-0 bg-transparent shadow-none has-disabled:bg-transparent has-disabled:opacity-100 dark:bg-transparent dark:has-disabled:bg-transparent">
              {showChips && (
                <InputGroupAddon align="block-start" className="flex-wrap gap-1 px-3">
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
                </InputGroupAddon>
              )}
              <InputGroupTextarea
                id={fieldId}
                ref={field}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={PLACEHOLDERS[mode]}
                disabled={disabled}
                readOnly={sending || improving}
                rows={1}
                className="field-sizing-content max-h-48 min-h-16 px-3 py-3"
              />
              <InputGroupAddon align="block-end" className="flex-wrap gap-1 px-1">
                {mode === 'run' && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <InputGroupButton size="icon-sm" aria-label="Add files" disabled={disabled}>
                          <PlusIcon aria-hidden="true" />
                        </InputGroupButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem className="gap-3 py-2" onSelect={() => fileInput.current?.click()}>
                          <PaperclipIcon aria-hidden="true" />
                          <span className="flex flex-1 flex-col">
                            <span>Upload files</span>
                            <span className="text-xs text-muted-foreground">PDF, Markdown, text</span>
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {undoText === null ? (
                      <InputGroupButton
                        size="sm"
                        variant="ghost"
                        disabled={disabled || sending || improving || !text.trim()}
                        aria-busy={improving || undefined}
                        onClick={() => void improve()}
                      >
                        {improving ? (
                          <Spinner data-icon="inline-start" aria-hidden="true" />
                        ) : (
                          <SparklesIcon data-icon="inline-start" aria-hidden="true" />
                        )}
                        Improve prompt
                      </InputGroupButton>
                    ) : (
                      <InputGroupButton
                        size="sm"
                        variant="ghost"
                        aria-label="Undo improve"
                        disabled={disabled || sending}
                        onClick={undoImprove}
                      >
                        <Undo2Icon data-icon="inline-start" aria-hidden="true" />
                        Undo
                      </InputGroupButton>
                    )}
                  </>
                )}
                <div className="ms-auto flex items-center">
                  {stopping ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InputGroupButton
                          size="icon-sm"
                          variant="default"
                          aria-label="Stop"
                          disabled={!onStop}
                          onClick={onStop}
                        >
                          <span aria-hidden="true" className="size-2.5 rounded-xs bg-primary-foreground" />
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
                          aria-label="Send message"
                          disabled={disabled || uploading || sending || improving}
                          aria-disabled={runBlocked ? true : undefined}
                          className={runBlocked ? 'opacity-50' : undefined}
                          aria-busy={sending || undefined}
                        >
                          {sending ? <Spinner aria-hidden="true" /> : <ArrowUpIcon aria-hidden="true" />}
                        </InputGroupButton>
                      </TooltipTrigger>
                      <TooltipContent>
                        {runBlocked ? (
                          runBlocked.message
                        ) : (
                          <>
                            Send
                            <Kbd>Enter</Kbd>
                          </>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </FramePanel>
      </Frame>
      <p className="text-center text-xs text-muted-foreground">
        Simulated opinions. Check important decisions with real people.
      </p>
    </div>
  )
}
