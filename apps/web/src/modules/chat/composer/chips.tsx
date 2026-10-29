'use client'

import { FileTextIcon, UserIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/reui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { uploadNotice } from '../send-notices'
import type { PendingFile } from './use-uploads'

const FILE_STATUS = { pending: 'Pending', uploading: 'Uploading', done: 'Uploaded', error: 'Failed' } as const

function Chip({
  icon,
  label,
  onRemove,
  removeDisabled,
  className,
  children,
  ...props
}: {
  icon: ReactNode
  label: string
  onRemove: () => void
  removeDisabled?: boolean
  className?: string
  children?: ReactNode
  'data-testid'?: string
}) {
  return (
    <Badge variant="outline" className={cn('max-w-full min-w-0 gap-1 pe-0.5 font-normal', className)} {...props}>
      {icon}
      <span className="max-w-40 min-w-0 truncate">{label}</span>
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${label}`}
        disabled={removeDisabled}
        onClick={onRemove}
        className="size-4 rounded-full [&_svg]:size-3"
      >
        <XIcon aria-hidden="true" />
      </Button>
    </Badge>
  )
}

export function FileChips({ files, onRemove }: { files: PendingFile[]; onRemove: (localId: string) => void }) {
  if (files.length === 0) return null
  return (
    <fieldset aria-label="Attached files" className="flex min-w-0 flex-wrap gap-1">
      {files.map((item) => (
        <Chip
          key={item.localId}
          data-testid="pending-file"
          icon={<FileTextIcon aria-hidden="true" className="text-muted-foreground" />}
          label={item.file.name}
          removeDisabled={item.status === 'uploading'}
          onRemove={() => onRemove(item.localId)}
          className={cn(
            item.status === 'error' && 'border-destructive/40 text-destructive',
            item.status === 'uploading' && 'animate-pulse motion-reduce:animate-none',
          )}
        >
          <span className="sr-only">{FILE_STATUS[item.status]}</span>
          {item.status === 'error' && <span className="truncate">{uploadNotice(item.error)}</span>}
        </Chip>
      ))}
    </fieldset>
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
    <fieldset aria-label="Selected personas" className="flex min-w-0 flex-wrap gap-1">
      {personas.map((persona) => (
        <Chip
          key={persona.id}
          icon={<UserIcon aria-hidden="true" className="text-muted-foreground" />}
          label={persona.name}
          onRemove={() => onRemove(persona.id)}
        />
      ))}
    </fieldset>
  )
}
