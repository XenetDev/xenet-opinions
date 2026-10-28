import { Skeleton } from '@/components/ui/skeleton'

export default function ChatLoading() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col" aria-busy="true">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-7 px-4 pt-6 pb-10 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <Skeleton className="h-4 w-20" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
