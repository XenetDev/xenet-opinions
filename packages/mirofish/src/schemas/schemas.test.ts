import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { Envelope, PlatformSchema } from './common'
import { BuildStarted, OntologyResult, Task } from './graph'
import { AgentLogPage, ChatResponse, Report, ReportStarted } from './report'
import { InterviewBatchResult, PrepareStarted, RunStatus, SimulationState, StartResult } from './simulation'

const readFixture = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${file}`, import.meta.url), 'utf8'))

const FIXTURE_TO_SCHEMA: Array<[string, z.ZodType]> = [
  ['graph.ontology.generate.json', OntologyResult],
  ['graph.build.started.json', BuildStarted],
  ['graph.build.reused.json', BuildStarted],
  ['graph.task.processing.json', Task],
  ['graph.task.completed.json', Task],
  ['simulation.create.json', SimulationState],
  ['simulation.prepare.started.json', PrepareStarted],
  ['simulation.start.json', StartResult],
  ['simulation.run-status.running.json', RunStatus],
  ['simulation.run-status.completed.json', RunStatus],
  ['report.generate.json', ReportStarted],
  ['report.get.completed.json', Report],
  ['report.agent-log.json', AgentLogPage],
  ['report.chat.json', ChatResponse],
  ['simulation.interview-batch.mock-derived.json', InterviewBatchResult],
]

describe('fixtures', () => {
  for (const [file, schema] of FIXTURE_TO_SCHEMA) {
    it(`parses ${file}`, () => {
      const env = Envelope.parse(readFixture(file))
      expect(env.success).toBe(true)
      expect(schema.parse(env.data)).toBeTruthy()
    })
  }

  it('parses the success:false error fixture as an envelope', () => {
    const env = Envelope.parse(readFixture('error.success-false.json'))
    expect(env.success).toBe(false)
    expect(env.error).toBeTruthy()
  })

  it('keeps untyped extra fields (loose)', () => {
    const env = Envelope.parse(readFixture('graph.task.completed.json'))
    expect(Task.parse(env.data)).toHaveProperty('created_at')
  })

  it('covers every agent-log action in the fixture', () => {
    const env = Envelope.parse(readFixture('report.agent-log.json'))
    const actions = AgentLogPage.parse(env.data).logs.map((l) => l.action)
    for (const a of ['report_start', 'planning_complete', 'section_start', 'tool_call', 'tool_result', 'llm_response', 'section_complete', 'report_complete']) {
      expect(actions).toContain(a)
    }
  })

  it('accepts unknown agent-log actions', () => {
    expect(AgentLogPage.parse({ logs: [{ action: 'brand_new' }], total_lines: 1, from_line: 0, has_more: false })).toBeTruthy()
  })
})

describe('PlatformSchema', () => {
  it('rejects an unknown platform', () => expect(() => PlatformSchema.parse('../etc')).toThrow())
  it('accepts twitter and reddit', () => {
    expect(PlatformSchema.parse('twitter')).toBe('twitter')
    expect(PlatformSchema.parse('reddit')).toBe('reddit')
  })
})
