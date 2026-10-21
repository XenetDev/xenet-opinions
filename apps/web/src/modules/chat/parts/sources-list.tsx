import { FileTextIcon } from 'lucide-react'
import type { SourcesData } from '@xo/engine/parts'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SourcesList({ data }: { data: SourcesData }) {
  return (
    <Sources className="mb-0">
      <SourcesTrigger count={data.files.length} />
      <SourcesContent>
        {data.files.map((file) => (
          <Source key={file.id}>
            <FileTextIcon aria-hidden className="size-4" />
            <span className="font-medium">{file.filename}</span>
            <span className="text-muted-foreground">{formatSize(file.sizeBytes)}</span>
          </Source>
        ))}
      </SourcesContent>
    </Sources>
  )
}
