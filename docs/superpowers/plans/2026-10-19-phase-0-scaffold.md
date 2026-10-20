# Xenet Opinions Phase 0: Scaffold, MiroFish Client, Echo Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running pnpm/Turborepo monorepo where an anonymous user can open the web app, send a message, and see a streamed assistant reply that carries one in-place-updating `data-stage` part, backed by Postgres, plus a tested, typed MiroFish HTTP client ready for Phase 1.

**Architecture:** Clean-room monorepo (no code from turbostarter/ai or MiroFish). `apps/web` is Next 16 App Router with route handlers; `packages/db` is Drizzle + Postgres; `packages/mirofish` wraps MiroFish's `{success,data,error}` envelope with Zod and normalised errors; `packages/engine` holds only the shared UI part types this phase. The echo route uses `createUIMessageStream` exactly the way the Phase 1 projector will, so the client wiring (`useChat` + `DefaultChatTransport` + per-chat URL) is final.

**Tech Stack:** pnpm 10.30, Node 24, Turborepo 2.11, TypeScript 7.0, Next 16.4, React 19.3, Tailwind 4.3, shadcn CLI 4, AI Elements (via shadcn registry), `ai` 7.0.143, `@ai-sdk/react` 4.0.147, Streamdown 2.7, Drizzle ORM 0.45 + drizzle-kit 0.31 + `postgres` 3.4, Better Auth 1.7 + `@better-auth/drizzle-adapter` 1.7 + `@better-auth/cli` 1.4, Zod 4.6, Vitest 5, tsx 4.

**Spec:** `docs/superpowers/specs/2026-10-19-xenet-opinions-design.md`

## Global Constraints

- License: every new file is MIT; `LICENSE` is MIT. Never copy code from `turbostarter/ai`, `XenetDev/xenetgo`, or `666ghj/MiroFish`. Never add MiroFish as a git submodule or dependency.
- Package manager pinned: `"packageManager": "pnpm@10.30.0"`; `.nvmrc` = `24`.
- Workspace package names use the `@xo/` scope: `@xo/config`, `@xo/db`, `@xo/mirofish`, `@xo/engine`, `web`.
- TypeScript `strict: true`, `moduleResolution: "bundler"`, `module: "esnext"`, `target: "es2022"`, `verbatimModuleSyntax: true` in `packages/config/tsconfig.base.json`; every package extends it.
- All route handlers live under `apps/web/src/app/api/`; the chat message route is `POST /api/chats/[id]/messages` (final URL, reused by Phase 1).
- Stage names are exactly: `ontology | graph_build | sim_create | sim_prepare | sim_run | report | finished`.
- Data part id for a stage is `stage:<name>` (e.g. `stage:ontology`).
- MiroFish client never logs or returns `traceback` to callers of endpoint methods except via `MiroFishError.traceback`; it is never written anywhere else.
- `platform` values are only `twitter | reddit` (closed enum).
- Env var names: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `MIROFISH_URL`, `MIROFISH_TOKEN` (optional).
- Comments: none unless they prevent a bug or document a non-obvious invariant; single-line only.

## Review Focus

1. Unauthenticated `POST /api/chats/:id/messages` must return 401 JSON, not a 500 or a stream. (test in Task 7)
2. A user posting to a chat id owned by another user must get 404 (not 403, to avoid id enumeration). (test in Task 7)
3. Empty or whitespace-only message text must return 400 before any DB write. (test in Task 7)
4. MiroFish returning a non-JSON body (e.g. an HTML 502 from a proxy) must produce `MiroFishError{code:'http'}`, not a thrown `SyntaxError`. (test in Task 3)
5. MiroFish `{success:false, error, traceback}` must never leak `traceback` into the message of the error thrown to callers; only `error` goes in `message`. (test in Task 3)

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.npmrc`, `.gitignore`, `LICENSE`, `.env.example`, `README.md`
- Create: `packages/config/package.json`, `packages/config/tsconfig.base.json`, `packages/config/vitest.base.ts`

**Interfaces:**
- Produces: root scripts `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint` (turbo tasks `dev`, `build`, `typecheck`, `test`, `lint`); `@xo/config/tsconfig.base.json`; `@xo/config/vitest.base` exporting a `defineConfig` base with `test.environment = 'node'`, `test.include = ['src/**/*.test.ts']`.

- [ ] **Step 1: Write root files**

`package.json`: `"private": true`, `"packageManager": "pnpm@10.30.0"`, `"engines": {"node": ">=24"}`, scripts above delegating to `turbo run <task>`, devDeps `turbo@2.11.9`, `typescript@7.0.2`, `vitest@5.0.5`.
`pnpm-workspace.yaml`: `packages: ["apps/*", "packages/*"]`.
`turbo.json`: `build` dependsOn `^build`, outputs `.next/**` (exclude `.next/cache/**`) and `dist/**`; `typecheck` dependsOn `^build`; `test` dependsOn `^build`; `dev` `cache: false`, `persistent: true`; `globalEnv` lists the six env names from Global Constraints.
`.npmrc`: `node-linker=hoisted` is NOT used; leave default isolated. Add `auto-install-peers=true`.
`.gitignore`: node_modules, .next, dist, .turbo, .env, .env.local, coverage, `.context/`.
`LICENSE`: MIT, copyright 2026 Xenet.
`.env.example`: the six env names with local defaults (`DATABASE_URL=postgresql://xo:xo@localhost:5432/xo`, `BETTER_AUTH_URL=http://localhost:3000`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `MIROFISH_URL=http://localhost:5001`, `BETTER_AUTH_SECRET=` empty, `MIROFISH_TOKEN=` empty).
`README.md`: title, one paragraph, "see docs/superpowers/specs".

- [ ] **Step 2: Write `packages/config`**

`package.json` name `@xo/config`, `"exports": {"./tsconfig.base.json": "./tsconfig.base.json", "./vitest.base": "./vitest.base.ts"}`.
`tsconfig.base.json` per Global Constraints plus `skipLibCheck`, `esModuleInterop`, `noUncheckedIndexedAccess`, `isolatedModules`, `jsx: "react-jsx"`.

- [ ] **Step 3: Install and verify**

Run: `pnpm install && pnpm turbo run typecheck`
Expected: install succeeds; turbo reports no tasks (no packages define `typecheck` yet) and exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold pnpm/turborepo workspace and shared config"
```

---

### Task 2: `@xo/db` schema, client, migrations, local Postgres

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/index.ts`, `packages/db/src/client.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/schema/auth.ts`, `packages/db/src/schema/chats.ts`
- Create: `packages/db/src/schema/chats.test.ts`
- Create: `infra/docker/docker-compose.dev.yml`

**Interfaces:**
- Produces: `createDb(url: string): Db` and `type Db` from `@xo/db`; `schema` namespace export (`user`, `session`, `account`, `verification`, `chats`, `messages`); `type Chat`, `type Message`, `type NewChat`, `type NewMessage` inferred via `InferSelectModel`/`InferInsertModel`.
- `chats`: `id text pk`, `userId text notNull references user.id onDelete cascade`, `title text notNull default ''`, `createdAt timestamptz notNull default now()`, `updatedAt timestamptz notNull default now()`.
- `messages`: `id text pk`, `chatId text notNull references chats.id onDelete cascade`, `role text notNull` (check in app code: `user|assistant`), `parts jsonb notNull` typed `$type<unknown[]>()`, `createdAt timestamptz notNull default now()`; index on `(chatId, createdAt)`.
- Scripts: `pnpm --filter @xo/db db:generate` (drizzle-kit generate), `db:migrate` (drizzle-kit migrate), `db:studio`.

- [ ] **Step 1: Write package files**

`package.json` deps: `drizzle-orm@0.45.4`, `postgres@3.4.9`; devDeps `drizzle-kit@0.31.11`, `vitest`, `typescript`, `@xo/config: workspace:*`. `"exports": {".": "./src/index.ts"}` (source exports; Next transpiles via `transpilePackages`). Scripts `typecheck: tsc --noEmit`, `test: vitest run`, plus the three db scripts.
`drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './src/schema/index.ts'`, `out: './drizzle'`, `dbCredentials.url = process.env.DATABASE_URL!`.

- [ ] **Step 2: Write `infra/docker/docker-compose.dev.yml`**

Single service `postgres` image `postgres:18`, env `POSTGRES_USER=xo POSTGRES_PASSWORD=xo POSTGRES_DB=xo`, port `5432:5432`, named volume `xo-pg`.

- [ ] **Step 3: Write `schema/auth.ts` by generating it**

Run from `packages/db`: `pnpm dlx @better-auth/cli@1.4.21 generate --config ../../apps/web/src/lib/auth.ts --output src/schema/auth.ts` is not possible yet (web does not exist). Instead write `auth.ts` by hand with the four Better Auth core tables for pg (`user` incl. `isAnonymous boolean`, `session`, `account`, `verification`) using the field list from https://www.better-auth.com/docs/concepts/database#core-schema; Task 5 Step 6 re-runs the CLI generate against the real config and must produce no diff, which is the verification that the hand-written schema is correct.

- [ ] **Step 4: Write `schema/chats.ts`, `schema/index.ts`, `client.ts`, `index.ts`**

`createDb(url)` = `drizzle(postgres(url, { max: 10 }), { schema })`.

- [ ] **Step 5: Write the failing test `schema/chats.test.ts`**

Skips itself when `process.env.DATABASE_URL` is unset (so CI without Postgres stays green). Otherwise:

```ts
it('inserts a chat and a message and cascades delete', async () => {
  const db = createDb(process.env.DATABASE_URL!);
  const userId = `u_${Date.now()}`;
  await db.insert(schema.user).values({ id: userId, name: 'anon', email: `${userId}@anon.local`, emailVerified: false, isAnonymous: true, createdAt: new Date(), updatedAt: new Date() });
  await db.insert(schema.chats).values({ id: 'c1' + userId, userId });
  await db.insert(schema.messages).values({ id: 'm1' + userId, chatId: 'c1' + userId, role: 'user', parts: [{ type: 'text', text: 'hi' }] });
  await db.delete(schema.chats).where(eq(schema.chats.id, 'c1' + userId));
  const left = await db.select().from(schema.messages).where(eq(schema.messages.chatId, 'c1' + userId));
  expect(left).toHaveLength(0);
});
```

- [ ] **Step 6: Run migration tooling and the test**

Run: `docker compose -f infra/docker/docker-compose.dev.yml up -d && cp .env.example .env && pnpm --filter @xo/db db:generate && pnpm --filter @xo/db db:migrate && DATABASE_URL=postgresql://xo:xo@localhost:5432/xo pnpm --filter @xo/db test`
Expected: one migration file in `packages/db/drizzle/`, migrate applies, test PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(db): drizzle schema for auth, chats, messages with local postgres"
```

---

### Task 3: `@xo/mirofish` core client and error model

**Files:**
- Create: `packages/mirofish/package.json`, `packages/mirofish/tsconfig.json`, `packages/mirofish/vitest.config.ts`
- Create: `packages/mirofish/src/index.ts`, `packages/mirofish/src/client.ts`, `packages/mirofish/src/errors.ts`, `packages/mirofish/src/schemas/common.ts`
- Test: `packages/mirofish/src/client.test.ts`

**Interfaces:**
- Produces:
  - `class MiroFishError extends Error { code: 'api'|'http'|'timeout'|'network'|'schema'; status?: number; traceback?: string; path: string }`
  - `type MiroFishClientOptions = { baseUrl: string; token?: string; fetch?: typeof fetch; defaultTimeoutMs?: number }` (default timeout 30_000)
  - `createHttp(opts): Http` where `Http = { getJson<T>(path, schema: ZodType<T>, init?: {timeoutMs?, signal?, query?: Record<string,string|number|undefined>}): Promise<T>; postJson<T>(path, body: unknown, schema, init?): Promise<T>; postForm<T>(path, form: FormData, schema, init?): Promise<T> }`
  - `Envelope` Zod schema in `schemas/common.ts`: `{ success: boolean, data?: unknown, error?: string, traceback?: string }` with `.loose()`.
- Behaviour: every call sets header `X-MiroFish-Token` when `token` is set, `Accept: application/json`; parses body as JSON; on non-JSON body → `http` error with status; on `success:false` → `api` error with `message = error ?? 'MiroFish request failed'`; on `AbortSignal.timeout` abort → `timeout`; on fetch rejection → `network`; on Zod failure of `data` → `schema` error whose message includes the first issue path. Returns parsed `data`.

- [ ] **Step 1: Write package files**

Deps: `zod@4.6.7`. DevDeps: `vitest`, `typescript`, `@xo/config`. `vitest.config.ts` extends `@xo/config/vitest.base`.

- [ ] **Step 2: Write the failing tests `client.test.ts`**

Use an injected `fetch` stub (no msw). Tests:

```ts
it('unwraps data on success', ...)            // {success:true,data:{a:1}} → {a:1}
it('maps success:false to api error without traceback in message', ...)
  // body {success:false,error:'bad',traceback:'Traceback...'} → throws MiroFishError code 'api', message 'bad', traceback set, message not containing 'Traceback'
it('maps non-JSON body to http error with status', ...)  // text/html 502 → code 'http', status 502
it('maps schema mismatch to schema error', ...)          // data {a:'x'} vs z.object({a:z.number()}) → code 'schema', message matches /a/
it('maps timeout to timeout error', ...)                 // fetch stub awaits signal abort; timeoutMs 10 → code 'timeout'
it('maps fetch rejection to network error', ...)
it('sends X-MiroFish-Token when configured and omits it otherwise', ...)
it('serialises query params and drops undefined', ...)  // getJson('/x', s, {query:{a:1,b:undefined}}) → URL ends with '/x?a=1'
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @xo/mirofish test`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `errors.ts`, `schemas/common.ts`, `client.ts`, `index.ts`**

Timeout: combine `AbortSignal.timeout(ms)` with caller `signal` via `AbortSignal.any`. Distinguish timeout from caller abort by checking `signal.reason?.name === 'TimeoutError'`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @xo/mirofish test`
Expected: 8 PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(mirofish): http client with envelope unwrapping and normalised errors"
```

---

### Task 4: `@xo/mirofish` endpoints, schemas, fixtures

**Files:**
- Create: `packages/mirofish/src/schemas/graph.ts`, `schemas/simulation.ts`, `schemas/report.ts`
- Create: `packages/mirofish/src/endpoints/graph.ts`, `endpoints/simulation.ts`, `endpoints/report.ts`
- Create: `packages/mirofish/src/fixtures/*.json` (hand-written from the verified shapes in the spec; see list below)
- Create: `packages/mirofish/scripts/capture-fixtures.ts`
- Modify: `packages/mirofish/src/index.ts`
- Test: `packages/mirofish/src/schemas/schemas.test.ts`, `packages/mirofish/src/endpoints/endpoints.test.ts`

**Interfaces:**
- Produces `createMiroFishClient(opts: MiroFishClientOptions): MiroFishClient` where
  ```ts
  type MiroFishClient = {
    graph: {
      generateOntology(input: { files: Array<{ name: string; bytes: Uint8Array; type: string }>; requirement: string; projectName?: string; additionalContext?: string }, init?): Promise<OntologyResult>; // postForm, timeoutMs 600_000, fields 'files', 'simulation_requirement', 'project_name', 'additional_context'
      build(input: { projectId: string; force?: boolean }): Promise<BuildStarted>;        // POST /api/graph/build {project_id, force}
      getTask(taskId: string): Promise<Task>;                                               // GET /api/graph/task/:id
      getData(graphId: string): Promise<GraphData>;                                         // GET /api/graph/data/:id
      getProject(projectId: string): Promise<Project>;                                      // GET /api/graph/project/:id
    };
    simulation: {
      create(input: { projectId: string; graphId?: string }): Promise<SimulationState>;    // POST /api/simulation/create {project_id, graph_id, enable_twitter:true, enable_reddit:true}
      prepare(input: { simulationId: string }): Promise<PrepareStarted>;                   // POST /api/simulation/prepare {simulation_id, use_llm_for_profiles:true, parallel_profile_count:5}
      prepareStatus(input: { simulationId?: string; taskId?: string }): Promise<Task & { already_prepared?: boolean }>; // POST /api/simulation/prepare/status
      profilesRealtime(simulationId: string, platform?: Platform): Promise<ProfilesRealtime>;
      start(input: { simulationId: string; maxRounds?: number }): Promise<RunState>;      // POST /api/simulation/start {simulation_id, platform:'parallel', max_rounds, force:true, enable_graph_memory_update:true}
      runStatus(simulationId: string): Promise<RunStatus>;
      posts(simulationId: string, q: { platform: Platform; limit?: number; offset?: number }): Promise<Posts>;
      stop(simulationId: string): Promise<unknown>;
      closeEnv(simulationId: string): Promise<unknown>;
      interviewBatch(input: { simulationId: string; interviews: Array<{ agentId: number|string; prompt: string }> }, init?): Promise<InterviewBatchResult>; // timeoutMs 200_000
    };
    report: {
      generate(input: { simulationId: string; forceRegenerate?: boolean }): Promise<ReportStarted>;
      get(reportId: string): Promise<Report>;
      agentLog(reportId: string, fromLine: number): Promise<AgentLogPage>;                // GET /api/report/:id/agent-log?from_line=
      chat(input: { simulationId: string; message: string; history: Array<{ role: 'user'|'assistant'; content: string }> }, init?): Promise<ChatResponse>; // timeoutMs 180_000
    };
  };
  type Platform = 'twitter' | 'reddit';
  ```
- Schemas are `z.object({...}).loose()`; typed fields (only what we read):
  - `Task`: `task_id, task_type?, status: 'pending'|'processing'|'completed'|'failed', progress: number, message?: string|null, progress_detail?: unknown, result?: unknown, error?: string|null`.
  - `OntologyResult`: `project_id, project_name?, ontology: unknown, analysis_summary?: string, files?: unknown[], total_text_length?: number`.
  - `BuildStarted`: `project_id, task_id?: string, graph_id?: string, reused?: boolean, resumed?: boolean, message?: string`.
  - `GraphData`: `nodes: unknown[], edges: unknown[]` (loose).
  - `SimulationState`: `simulation_id, project_id, graph_id?, status: string`.
  - `PrepareStarted`: `simulation_id, task_id?: string, status?: string, expected_entities_count?: number, already_prepared?: boolean`.
  - `ProfilesRealtime`: `profiles: unknown[], is_generating?: boolean, total_expected?: number`.
  - `RunStatus`: `runner_status: 'idle'|'starting'|'running'|'paused'|'stopping'|'stopped'|'completed'|'failed', current_round?: number, total_rounds?: number, progress_percent?: number, total_actions_count?: number, error?: string|null`.
  - `ReportStarted`: `simulation_id, report_id, task_id?: string, status: string, already_generated?: boolean`.
  - `Report`: `report_id, simulation_id, status: 'pending'|'planning'|'generating'|'completed'|'failed', outline?: unknown, markdown_content?: string|null, error?: string|null`.
  - `AgentLogPage`: `logs: AgentLogLine[], total_lines: number, from_line: number, has_more: boolean`; `AgentLogLine`: `timestamp?, elapsed_seconds?: number, action: string, stage?: string, section_title?: string, section_index?: number, details?: unknown` (loose, `action` is a string not an enum so unknown actions don't fail parsing).
  - `ChatResponse`: `response: string, tool_calls?: unknown[], sources?: unknown[]`.
  - `InterviewBatchResult`: loose object.
- Fixtures (one JSON per file, each a full envelope): `graph.ontology.generate.json`, `graph.build.started.json`, `graph.build.reused.json`, `graph.task.processing.json`, `graph.task.completed.json`, `simulation.create.json`, `simulation.prepare.started.json`, `simulation.run-status.running.json`, `simulation.run-status.completed.json`, `report.generate.json`, `report.get.completed.json`, `report.agent-log.json` (≥1 line of each: `report_start`, `planning_complete` with `details.outline`, `section_start`, `tool_call`, `tool_result`, `llm_response`, `section_complete`, `report_complete`), `report.chat.json`, `error.success-false.json`.

- [ ] **Step 1: Write the failing schema test**

```ts
for (const [file, schema] of FIXTURE_TO_SCHEMA) it(`parses ${file}`, () => { const env = Envelope.parse(readFixture(file)); expect(schema.parse(env.data)).toBeTruthy(); });
it('rejects an unknown platform', () => expect(() => PlatformSchema.parse('../etc')).toThrow());
```

- [ ] **Step 2: Write the failing endpoint test**

Stub `fetch`, assert for each method: HTTP method, path, query/body/form field names from the Interfaces block, and that the timeout passed matches (600_000 for ontology, 200_000 for interview, 180_000 for report chat; assert via a spy on the `Http` layer rather than real timers).

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @xo/mirofish test`
Expected: FAIL on missing modules/fixtures.

- [ ] **Step 4: Write fixtures, schemas, endpoints; export `createMiroFishClient` from `index.ts`**

- [ ] **Step 5: Write `scripts/capture-fixtures.ts`**

`tsx` script: given `MIROFISH_URL`, `PROJECT_ID`, `SIMULATION_ID`, `REPORT_ID` env vars for an existing completed run, calls `getProject`, `getTask` (if `TASK_ID` set), `runStatus`, `report.get`, `agentLog(0)` and overwrites the matching fixture files with the real responses. Documented in `packages/mirofish/README.md` (5 lines). Not run in CI.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @xo/mirofish test && pnpm --filter @xo/mirofish typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(mirofish): typed endpoints, zod schemas and fixtures for graph/simulation/report"
```

---

### Task 5: `@xo/engine` UI part types

**Files:**
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/index.ts`, `packages/engine/src/parts.ts`
- Test: `packages/engine/src/parts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const STAGES = ['ontology','graph_build','sim_create','sim_prepare','sim_run','report','finished'] as const;
  export type Stage = typeof STAGES[number];
  export type StageStatus = 'pending' | 'running' | 'done' | 'failed';
  export type StageData = { stage: Stage; status: StageStatus; progress?: number; message?: string };
  export type OpinionsDataParts = { stage: StageData };          // extended in Phase 1
  export type OpinionsUIMessage = UIMessage<never, OpinionsDataParts>;
  export const stagePartId = (stage: Stage) => `stage:${stage}` as const;
  ```
- Deps: `ai@7.0.143` (types only), `zod` not needed.

- [ ] **Step 1: Write failing test** — `stagePartId('ontology') === 'stage:ontology'`; `STAGES` has length 7 and starts with `ontology`.
- [ ] **Step 2: Run** `pnpm --filter @xo/engine test` → FAIL.
- [ ] **Step 3: Implement `parts.ts`.**
- [ ] **Step 4: Run** → PASS; `typecheck` clean.
- [ ] **Step 5: Commit** `git commit -m "feat(engine): shared UI message part types"`

---

### Task 6: `apps/web` scaffold with Better Auth anonymous, shadcn, AI Elements

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/components.json`, `apps/web/src/app/globals.css`
- Create: `apps/web/src/env.ts`, `apps/web/src/lib/db.ts`, `apps/web/src/lib/auth.ts`, `apps/web/src/lib/auth-client.ts`, `apps/web/src/lib/session.ts`
- Create: `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/api/auth/[...all]/route.ts`
- Create: `apps/web/src/components/providers/anonymous-session.tsx`
- Generated: `apps/web/src/components/ui/*`, `apps/web/src/components/ai-elements/{conversation,message,prompt-input,task,shimmer}.tsx`
- Test: `apps/web/src/env.test.ts`

**Interfaces:**
- Produces: `env` object (Zod-parsed `process.env` for the six vars; `BETTER_AUTH_SECRET` min 32 chars; `MIROFISH_TOKEN` optional); `db` singleton from `createDb(env.DATABASE_URL)`; `auth = betterAuth({ database: drizzleAdapter(db, { provider: 'pg', schema }), plugins: [anonymous()], secret, baseURL })`; `authClient = createAuthClient({ plugins: [anonymousClient()] })`; `getSessionUser(headers: Headers): Promise<{ id: string } | null>` in `session.ts` wrapping `auth.api.getSession`.
- `<AnonymousSession>` client component: on mount, if `authClient.useSession()` has no session, calls `authClient.signIn.anonymous()` once; renders children.

- [ ] **Step 1: Create the Next app**

Run from `apps/`: `pnpm dlx create-next-app@16.4.2 web --ts --tailwind --app --src-dir --turbopack --import-alias "@/*" --use-pnpm --no-eslint`. Then set `name` to `web`, add deps: `ai@7.0.143 @ai-sdk/react@4.0.147 better-auth@1.7.11 @better-auth/drizzle-adapter@1.7.11 zod@4.6.7 @xo/db@workspace:* @xo/engine@workspace:* @xo/mirofish@workspace:*`; devDeps `vitest`, `@xo/config`. `next.config.ts`: `transpilePackages: ['@xo/db','@xo/engine','@xo/mirofish']`. `tsconfig.json` extends `@xo/config/tsconfig.base.json` and keeps Next's `plugins`/`paths`.

- [ ] **Step 2: shadcn + AI Elements**

Run from `apps/web`: `pnpm dlx shadcn@4.22.1 init -d` then `pnpm dlx shadcn@4.22.1 add button textarea scroll-area sidebar separator tooltip collapsible badge` and `pnpm dlx shadcn@4.22.1 add https://elements.ai-sdk.dev/api/registry/conversation.json https://elements.ai-sdk.dev/api/registry/message.json https://elements.ai-sdk.dev/api/registry/prompt-input.json https://elements.ai-sdk.dev/api/registry/task.json https://elements.ai-sdk.dev/api/registry/shimmer.json`.
Expected: files under `src/components/ai-elements/`; `streamdown` and `use-stick-to-bottom` added to deps.

- [ ] **Step 3: Write the failing `env.test.ts`**

```ts
it('rejects a short BETTER_AUTH_SECRET', () => expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow());
it('accepts missing MIROFISH_TOKEN', () => expect(parseEnv({ ...valid, MIROFISH_TOKEN: undefined }).MIROFISH_TOKEN).toBeUndefined());
```
`env.ts` exports `parseEnv(source: NodeJS.ProcessEnv)` and `env = parseEnv(process.env)` (the latter guarded so tests importing `parseEnv` don't throw: evaluate lazily via a getter or split into `env.ts` + `env.schema.ts`; choose the split).

- [ ] **Step 4: Run** `pnpm --filter web test` → FAIL; implement `env.schema.ts`/`env.ts`; run → PASS.

- [ ] **Step 5: Write `lib/db.ts`, `lib/auth.ts`, `lib/auth-client.ts`, `lib/session.ts`, auth route, `<AnonymousSession>`, `layout.tsx` (wraps children in `<AnonymousSession>`), `page.tsx` (placeholder "Xenet Opinions").**

- [ ] **Step 6: Verify the hand-written auth schema matches Better Auth**

Run from `apps/web`: `pnpm dlx @better-auth/cli@1.4.21 generate --config src/lib/auth.ts --output ../../packages/db/src/schema/auth.ts -y && git diff --stat packages/db/src/schema/auth.ts`
Expected: either no diff, or only formatting; if columns differ, keep the generated file, re-run `pnpm --filter @xo/db db:generate && db:migrate`.

- [ ] **Step 7: Run the app and verify anonymous sign-in**

Run: `pnpm --filter web dev` (background), then
`curl -s -c /tmp/xo.jar -X POST http://localhost:3000/api/auth/sign-in/anonymous -H 'content-type: application/json' -d '{}' | head -c 300; echo; grep -c better-auth /tmp/xo.jar`
Expected: JSON with `user.isAnonymous: true`; cookie jar contains a `better-auth.session_token` line (count ≥ 1). Then open `http://localhost:3000` in a browser: page renders and a second load does not create another user (check `select count(*) from "user"` stays constant across reloads).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(web): next 16 app with anonymous better-auth, shadcn and ai-elements"
```

---

### Task 7: Echo chat route with one in-place `data-stage` part

**Files:**
- Create: `apps/web/src/server/chats.ts` (DB helpers)
- Create: `apps/web/src/server/echo-stream.ts`
- Create: `apps/web/src/app/api/chats/route.ts` (POST create chat)
- Create: `apps/web/src/app/api/chats/[id]/messages/route.ts`
- Test: `apps/web/src/server/echo-stream.test.ts`, `apps/web/src/app/api/chats/[id]/messages/route.test.ts`

**Interfaces:**
- `server/chats.ts`: `createChat(userId): Promise<Chat>`; `getOwnedChat(chatId, userId): Promise<Chat | null>`; `appendMessage(input: { chatId: string; id?: string; role: 'user'|'assistant'; parts: unknown[] }): Promise<Message>`; `listMessages(chatId): Promise<Message[]>`.
- `server/echo-stream.ts`: `createEchoStream(input: { assistantMessageId: string; text: string; delayMs?: number }): ReadableStream<UIMessageChunk>` built with `createUIMessageStream<OpinionsUIMessage>`; `onFinish` not used.
  Chunk sequence (exact): `start{messageId}` → `data-stage{id:'stage:ontology', data:{stage:'ontology',status:'running',progress:0,message:'Echoing'}}` → `text-start{id:'t1'}` → one `text-delta` per word of `You said: <text>` (each followed by `delayMs`, default 40) → `text-end{id:'t1'}` → `data-stage{id:'stage:ontology', data:{stage:'ontology',status:'done',progress:100}}` → `finish`.
- `POST /api/chats`: requires session → `createChat` → `201 { id }`.
- `POST /api/chats/[id]/messages`: body `{ id: string; message: UIMessage }` (as sent by `DefaultChatTransport.prepareSendMessagesRequest` in Task 8). Order: session (401 `{error:'unauthenticated'}`) → `getOwnedChat` (404 `{error:'not_found'}`) → text = concatenated `text` parts trimmed; empty → 400 `{error:'empty_message'}` → `appendMessage(user)` → `appendMessage(assistant, parts: [])` with a generated id → `createUIMessageStreamResponse({ stream: createEchoStream(...) })`. Assistant message persistence of final parts: in this phase, after the stream completes, update the assistant row's `parts` using `readUIMessageStream` over a tee of the stream (so Phase 1's "worker materialises" has a reference implementation). Export `runtime = 'nodejs'`.

- [ ] **Step 1: Write failing `echo-stream.test.ts`**

```ts
it('emits start, running stage, text, done stage, finish in order', async () => {
  const chunks = await collect(createEchoStream({ assistantMessageId: 'a1', text: 'hi there', delayMs: 0 }));
  expect(chunks.map(c => c.type)).toEqual(['start','data-stage','text-start','text-delta','text-delta','text-delta','text-end','data-stage','finish']);
  expect(chunks[1]).toMatchObject({ id: 'stage:ontology', data: { status: 'running' } });
  expect(chunks.at(-2)).toMatchObject({ id: 'stage:ontology', data: { status: 'done', progress: 100 } });
});
it('reduces to a single message with one stage part and full text', async () => {
  const msgs = []; for await (const m of readUIMessageStream({ stream: createEchoStream({ assistantMessageId: 'a1', text: 'hi', delayMs: 0 }) })) msgs.push(m);
  const last = msgs.at(-1)!;
  expect(last.parts.filter(p => p.type === 'data-stage')).toHaveLength(1);
  expect(last.parts.find(p => p.type === 'text')).toMatchObject({ text: 'You said: hi' });
});
```

- [ ] **Step 2: Write failing `route.test.ts`** (call the exported `POST` with a `Request` and `{ params: Promise.resolve({ id }) }`; mock `@/lib/session` `getSessionUser` and `@/server/chats` with `vi.mock`):

```ts
it('returns 401 json when unauthenticated', ...)          // getSessionUser → null
it('returns 404 when chat is not owned', ...)               // getOwnedChat → null
it('returns 400 on whitespace-only text and writes nothing', ...)  // appendMessage not called
it('streams text/event-stream for a valid message', ...)    // status 200, content-type starts with 'text/event-stream', appendMessage called twice (user, assistant)
```

- [ ] **Step 3: Run** `pnpm --filter web test` → FAIL on missing modules.

- [ ] **Step 4: Implement `server/chats.ts`, `server/echo-stream.ts`, both routes.**

- [ ] **Step 5: Run** `pnpm --filter web test && pnpm --filter web typecheck` → PASS.

- [ ] **Step 6: Verify over HTTP**

Run (dev server up, cookie jar from Task 6):
```bash
CHAT=$(curl -s -b /tmp/xo.jar -X POST http://localhost:3000/api/chats | python3 -I -c 'import json,sys;print(json.load(sys.stdin)["id"])')
curl -N -s -b /tmp/xo.jar -X POST http://localhost:3000/api/chats/$CHAT/messages -H 'content-type: application/json' \
  -d "{\"id\":\"$CHAT\",\"message\":{\"id\":\"u1\",\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"hello\"}]}}" | head -20
```
Expected: SSE lines beginning `data: {"type":"start"...`, a `data-stage` with `running`, text deltas, a `data-stage` with `done`, then `finish`. Without the cookie: `401 {"error":"unauthenticated"}`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): chat creation and echo message stream with in-place stage part"
```

---

### Task 8: Chat page wired with `useChat`, stage part rendering

**Files:**
- Create: `apps/web/src/app/c/[id]/page.tsx` (server: loads owned chat + messages via `listMessages`, 404 otherwise, renders `<Chat>`)
- Create: `apps/web/src/modules/chat/chat.tsx` (client)
- Create: `apps/web/src/modules/chat/message-parts.tsx`
- Create: `apps/web/src/modules/chat/parts/pipeline-timeline.tsx`
- Modify: `apps/web/src/app/page.tsx` (client button "New conversation" → `POST /api/chats` → `router.push('/c/'+id)`; later Phase 1 replaces with composer-on-home)
- Test: `apps/web/src/modules/chat/parts/pipeline-timeline.test.tsx` (add `@testing-library/react`, `jsdom` devDeps; vitest `environment: 'jsdom'` for `*.test.tsx` via `environmentMatchGlobs`)

**Interfaces:**
- `<Chat chatId initialMessages: OpinionsUIMessage[]>`: `useChat<OpinionsUIMessage>({ id: chatId, messages: initialMessages, transport: new DefaultChatTransport({ api: `/api/chats/${chatId}/messages`, prepareSendMessagesRequest: ({ id, messages }) => ({ body: { id, message: messages.at(-1) } }) }) })`. Layout: AI Elements `Conversation`/`ConversationContent`/`ConversationScrollButton`, each message via `Message`/`MessageContent`, assistant parts through `<MessageParts parts>`; composer via `PromptInput`/`PromptInputTextarea`/`PromptInputSubmit status={status}` calling `sendMessage({ text })`.
- `<MessageParts parts: OpinionsUIMessage['parts']>`: groups all `data-stage` parts into one `<PipelineTimeline stages>`; renders `text` via `MessageResponse`; ignores unknown types.
- `<PipelineTimeline stages: StageData[]>`: AI Elements `Task`/`TaskTrigger`/`TaskContent` per stage in `STAGES` order; title map `{ ontology: 'Reading your documents', graph_build: 'Building the knowledge graph', sim_create: 'Creating the simulation', sim_prepare: 'Generating personas', sim_run: 'Running the simulation', report: 'Writing the report', finished: 'Done' }`; status icon: running → `Shimmer` label, done → check, failed → red, pending → muted; stages not present in `stages` render as pending.

- [ ] **Step 1: Write failing `pipeline-timeline.test.tsx`** — renders 7 rows; passing `[{stage:'ontology',status:'done',progress:100}]` marks row 1 done and row 2 pending; `status:'failed'` shows the `message`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement the four components and the home button.**
- [ ] **Step 4: Run** `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web build` → PASS, build succeeds.
- [ ] **Step 5: Browser verification** — open `http://localhost:3000`, click "New conversation", send "hello": the timeline shows "Reading your documents" shimmering, text streams word by word, the same row flips to done (no second row appears). Reload: the user and assistant messages (with the stage part) are back from the DB. Save a screenshot to `.context/phase0-echo.png`.
- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): chat page with useChat and pipeline timeline rendering stage parts"
```

---

### Task 9: CI and developer docs

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: `ci.yml`** — on push/PR: checkout, `pnpm/action-setup` (reads `packageManager`), Node 24 with pnpm cache, Postgres 18 service (`xo/xo/xo`), `pnpm install --frozen-lockfile`, `pnpm --filter @xo/db db:migrate`, `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` with `DATABASE_URL`, `BETTER_AUTH_SECRET` (32+ chars dummy), `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `MIROFISH_URL` env set.
- [ ] **Step 2: README** — quickstart: `docker compose -f infra/docker/docker-compose.dev.yml up -d`, `cp .env.example .env` + set secret (`openssl rand -base64 32`), `pnpm install`, `pnpm --filter @xo/db db:migrate`, `pnpm dev`; one paragraph on the MIT/AGPL boundary; link to spec and this plan.
- [ ] **Step 3: Verify** — `act` is not required; push the branch and confirm the workflow is green on GitHub, or run the same commands locally in order and confirm each exits 0.
- [ ] **Step 4: Commit** `git commit -m "chore: ci workflow and quickstart readme"`

---

## Self-review notes

- Spec Phase 0 coverage: workspace ✔ (T1), `packages/{config,db,mirofish}` ✔ (T1–T4), `apps/web` with Better Auth anonymous + shadcn + AI Elements ✔ (T6), echo route with one `data-stage` part via `createUIMessageStream` ✔ (T7), compose with Postgres only ✔ (T2), fixture tests ✔ (T4), capture script ✔ (T4). Added `packages/engine` early (T5) because the echo route and UI must share the part type; the spec places `parts.ts` there.
- Deviations from spec, intentional: AI Elements installed through the shadcn CLI registry URLs (the `ai-elements` CLI is being deprecated end of Nov 2026; registry stays). AI SDK pinned to 7.0.143 (spec said decide 6 vs 7 at scaffold; 7 is current and TurboStarter's own experience shows the `createUIMessageStream` API is stable across 6→7).
- Names used consistently across tasks: `createDb`, `schema.chats`, `schema.messages`, `MiroFishError`, `createHttp`, `createMiroFishClient`, `OpinionsUIMessage`, `StageData`, `stagePartId`, `createEchoStream`, `getSessionUser`, `getOwnedChat`, `appendMessage`, `listMessages`, `PipelineTimeline`, `MessageParts`.
- Unverified items carried from the spec, to confirm in T4/T6: exact MiroFish multipart field names (set per the spec's verified `files`, `simulation_requirement`, `project_name`, `additional_context`), Better Auth CLI `--config/--output` flags for 1.4.21 (if the flags differ, run `pnpm dlx @better-auth/cli@1.4.21 generate --help` and adapt; the acceptance criterion is "generated schema equals committed schema").
