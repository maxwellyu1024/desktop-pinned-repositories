import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupEmptyRepository } from '../../helpers/repositories'
import { exec } from 'dugite'
import {
  applyIdentityChanges,
  clearIdentityMarker,
  loadRepositoryIdentityState,
  readLocalGitConfig,
} from '../../../src/lib/identity/repository-identity'
import { IIdentity } from '../../../src/models/identity'

const work: IIdentity = {
  id: 'work-id',
  label: 'work',
  authorName: 'Work Name',
  authorEmail: 'me@work.com',
  rules: [{ host: 'example.com', namespace: 'acme' }],
}

describe('repository identity', () => {
  it('writes the identity to the local config only', async t => {
    const repository = await setupEmptyRepository(t)
    await exec(
      ['remote', 'add', 'origin', 'https://example.com/acme/app.git'],
      repository.path
    )

    const state = await loadRepositoryIdentityState(
      repository.path,
      { kind: 'automatic' },
      [work]
    )
    assert.deepStrictEqual(state.remote, {
      host: 'example.com',
      fullPath: 'acme/app',
    })
    assert.equal(state.plan?.identity.id, 'work-id')

    await applyIdentityChanges(repository.path, work, state.plan!.changes)

    const config = await readLocalGitConfig(repository.path)
    assert.equal(config.get('user.name'), 'Work Name')
    assert.equal(config.get('user.email'), 'me@work.com')
    assert.equal(config.get('ghdock.identity'), 'work-id')

    const after = await loadRepositoryIdentityState(
      repository.path,
      { kind: 'automatic' },
      [work]
    )
    assert.deepStrictEqual(after.plan?.changes, [])

    await clearIdentityMarker(repository.path)
    await clearIdentityMarker(repository.path)
    const cleared = await readLocalGitConfig(repository.path)
    assert.equal(cleared.has('ghdock.identity'), false)
    assert.equal(cleared.get('user.name'), 'Work Name')
  })

  it("doesn't use an identity when told not to", async t => {
    const repository = await setupEmptyRepository(t)
    const state = await loadRepositoryIdentityState(
      repository.path,
      { kind: 'none' },
      [work]
    )
    assert.equal(state.plan, null)
    assert.equal(state.remote, null)
  })
})
