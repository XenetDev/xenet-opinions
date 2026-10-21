'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export function RenameDialog({
  open,
  onOpenChange,
  initialTitle,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTitle: string
  onSubmit: (title: string) => Promise<boolean>
}) {
  const [title, setTitle] = useState(initialTitle)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = title.trim()
  const valid = trimmed.length > 0 && trimmed.length <= 120

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!valid) return
            setPending(true)
            setError(null)
            const ok = await onSubmit(trimmed)
            setPending(false)
            if (ok) onOpenChange(false)
            else setError('Could not rename the conversation')
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
          </DialogHeader>
          <Input aria-label="Title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} autoFocus />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
