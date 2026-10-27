import { writeFileSync } from 'node:fs'

const need = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required`)
  return v
}

const baseUrl = need('MIROFISH_URL').replace(/\/+$/, '')
const projectId = need('PROJECT_ID')
const simulationId = need('SIMULATION_ID')
const reportId = need('REPORT_ID')
const taskId = process.env.TASK_ID
const headers: Record<string, string> = process.env.MIROFISH_TOKEN
  ? { 'X-MiroFish-Token': process.env.MIROFISH_TOKEN }
  : {}

const save = async (file: string, path: string) => {
  const res = await fetch(`${baseUrl}${path}`, { headers })
  const envelope: unknown = await res.json()
  writeFileSync(new URL(`../src/fixtures/${file}`, import.meta.url), `${JSON.stringify(envelope, null, 2)}\n`)
  console.log(`${file} <- ${path} (HTTP ${res.status})`)
}

await save('graph.project.json', `/api/graph/project/${encodeURIComponent(projectId)}`)
if (taskId) await save('graph.task.completed.json', `/api/graph/task/${encodeURIComponent(taskId)}`)
await save('simulation.run-status.completed.json', `/api/simulation/${encodeURIComponent(simulationId)}/run-status`)
await save('report.get.completed.json', `/api/report/${encodeURIComponent(reportId)}`)
await save('report.agent-log.json', `/api/report/${encodeURIComponent(reportId)}/agent-log?from_line=0`)
