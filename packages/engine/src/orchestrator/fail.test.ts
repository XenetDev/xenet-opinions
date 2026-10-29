import { MiroFishError, NO_ACTORS_MESSAGE } from '@xo/mirofish'
import { describe, expect, it } from 'vitest'
import { fail, NO_ACTORS_CODE } from './fail'
import { setupRun } from './test-helpers'

const NO_ENTITIES = '没有找到符合条件的实体，请检查图谱是否正确构建'

describe('fail', () => {
  it('tags the no-entities failure as no_actors', async () => {
    const { deps, run, store } = await setupRun()
    const err = new MiroFishError({ code: 'api', message: NO_ENTITIES, path: '/prepare' })
    const failed = await fail(run, deps, 'sim_prepare', err)
    expect(NO_ACTORS_CODE).toBe('no_actors')
    expect(failed.error).toEqual({ stage: 'sim_prepare', code: 'no_actors', message: NO_ACTORS_MESSAGE })
    const emitted = (store.events.get(run.id) ?? []).find((e) => e.kind === 'error')
    expect(emitted?.payload).toMatchObject({ code: 'no_actors' })
  })

  it('keeps the original code for any other MiroFish message', async () => {
    const { deps, run } = await setupRun()
    const err = new MiroFishError({ code: 'api', message: 'something else', path: '/prepare' })
    const failed = await fail(run, deps, 'sim_prepare', err)
    expect(failed.error).toMatchObject({ code: 'api' })
  })
})
