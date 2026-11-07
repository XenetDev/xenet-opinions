export type ReadinessDraft = { background: string; actors: string; change: string }

export type Readiness = { ready: true; seed?: ReadinessDraft } | { ready: false; draft: ReadinessDraft }

export type ReadinessResponse = Readiness & { researchId?: string }
