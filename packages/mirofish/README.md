# @xo/mirofish

Typed client for the MiroFish Flask API: `createMiroFishClient({ baseUrl, token? })` exposes `graph`, `simulation` and `report`.
Every call returns the unwrapped `data` of the `{success, data, error}` envelope or throws `MiroFishError`.
Fixtures in `src/fixtures` are full envelopes used by the schema tests.
Refresh them from a finished run: `MIROFISH_URL=... PROJECT_ID=... SIMULATION_ID=... REPORT_ID=... [TASK_ID=...] pnpm capture-fixtures`.
The capture script is manual only and never runs in tests or CI.
