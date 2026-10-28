// MiroFish's clock starts at midnight with one hour per round, and no persona is active before 8am.
export const NIGHT_ROUNDS = 8

export const requestedRounds = (maxRounds: number) => maxRounds + NIGHT_ROUNDS

export const visibleRound = (current: number | undefined, maxRounds: number) =>
  current === undefined ? undefined : Math.min(maxRounds, Math.max(0, current - NIGHT_ROUNDS))
