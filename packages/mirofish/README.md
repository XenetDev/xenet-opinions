# @xo/mirofish

Typed client for the MiroFish Flask API: `createMiroFishClient({ baseUrl, token? })` exposes `graph`, `simulation` and `report`.
Every call returns the unwrapped `data` of the `{success, data, error}` envelope or throws `MiroFishError`.
Fixtures in `src/fixtures` are full envelopes used by the schema tests.
Refresh them from a finished run: `MIROFISH_URL=... PROJECT_ID=... SIMULATION_ID=... REPORT_ID=... [TASK_ID=...] pnpm capture-fixtures`.
The capture script is manual only and never runs in tests or CI.

## Mock server

`pnpm --filter @xo/mirofish mock` starts a fixture-replaying MiroFish on `http://localhost:5001`, so the whole pipeline runs without Zep or an LLM.
Env: `PORT` (default 5001), `MOCK_SPEED` (default 1; `10` makes every delay 10x shorter), `MOCK_FAIL_STAGE` (`graph_build | sim_prepare | sim_run | report` reports that stage as failed), `MOCK_TOKEN` (require a matching `X-MiroFish-Token` header).
A failed task, simulation or report stays failed once observed, even after the failure is switched off. `POST /__mock/fail-stage` with a JSON body `{ "stage": "sim_prepare" }` (or `null` to clear) changes the injected failure at runtime without a restart, so a retry can be exercised against new tasks; the endpoint needs no token.
