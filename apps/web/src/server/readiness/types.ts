export type ReadinessDraft = { background: string; actors: string; change: string }

export type Readiness = { ready: true } | { ready: false; draft: ReadinessDraft }
