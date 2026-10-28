'use client'

import { FileTextIcon, UserIcon, XIcon } from 'lucide-react'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import type { PendingFile } from './use-uploads'

const FILE_STATE = { pending: 'idle', uploading: 'uploading', done: 'done', error: 'error' } as const

export function FileChips({ files, onRemove }: { files: PendingFile[]; onRemove: (localId: string) => void }) {
  if (files.length === 0) return null
  return (
    <AttachmentGroup role="group" aria-label="Attached files" className="gap-2 px-2">
      {files.map((item) => (
        <Attachment
          key={item.localId}
          data-testid="pending-file"
          size="xs"
          state={FILE_STATE[item.status]}
          className="max-w-56"
        >
          <AttachmentMedia variant="icon" className="text-muted-foreground">
            <FileTextIcon aria-hidden="true" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{item.file.name}</AttachmentTitle>
            {item.status === 'error' && <AttachmentDescription>{item.error}</AttachmentDescription>}
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              type="button"
              aria-label={`Remove ${item.file.name}`}
              disabled={item.status === 'uploading'}
              onClick={() => onRemove(item.localId)}
            >
              <XIcon aria-hidden="true" />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ))}
    </AttachmentGroup>
  )
}

export function PersonaChips({
  personas,
  onRemove,
}: {
  personas: { id: string; name: string }[]
  onRemove: (id: string) => void
}) {
  if (personas.length === 0) return null
  return (
    <AttachmentGroup role="group" aria-label="Selected personas" className="gap-2 px-2">
      {personas.map((persona) => (
        <Attachment key={persona.id} size="xs" className="max-w-56">
          <AttachmentMedia variant="icon" className="text-muted-foreground">
            <UserIcon aria-hidden="true" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{persona.name}</AttachmentTitle>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction type="button" aria-label={`Remove ${persona.name}`} onClick={() => onRemove(persona.id)}>
              <XIcon aria-hidden="true" />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ))}
    </AttachmentGroup>
  )
}
