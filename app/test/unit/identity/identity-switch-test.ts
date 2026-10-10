import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  describeIdentitySwitch,
  getIdentitySwitchWrite,
} from '../../../src/lib/identity/identity-switch'
import { IRepositoryIdentityState } from '../../../src/lib/identity/repository-identity'
import { IIdentity } from '../../../src/models/identity'

const work: IIdentity = {
  id: 'work-id',
  label: 'work',
  authorName: 'Work Name',
  authorEmail: 'me@work.com',
  rules: [],
}

const state: IRepositoryIdentityState = {
  remote: { host: 'github.com', fullPath: 'acme/app', sshHost: null },
  plan: {
    identity: work,
    changes: [
      {
        key: 'user.email',
        current: 'me@home.com',
        next: 'me@work.com',
        optional: false,
      },
      { key: 'user.name', current: null, next: 'Work Name', optional: false },
      {
        key: 'remote.origin.url',
        current: 'https://github.com/acme/app.git',
        next: 'git@github.com:acme/app.git',
        optional: true,
      },
    ],
    applied: false,
    warnings: [],
  },
  localEmail: 'me@home.com',
  localName: null,
  marker: 'home-id',
}

describe('identity switch', () => {
  it('writes the required changes and the marker, remembering the values before', () => {
    const write = getIdentitySwitchWrite(state)
    assert.equal(write.identity, work)
    assert.deepStrictEqual(write.values, [
      { key: 'user.email', value: 'me@work.com' },
      { key: 'user.name', value: 'Work Name' },
      { key: 'ghdock.identity', value: 'work-id' },
    ])
    assert.deepStrictEqual(write.restore, [
      { key: 'user.email', value: 'me@home.com' },
      { key: 'user.name', value: null },
      { key: 'ghdock.identity', value: 'home-id' },
    ])
  })

  it('only removes the marker without an identity', () => {
    const write = getIdentitySwitchWrite({ ...state, plan: null })
    assert.equal(write.identity, null)
    assert.deepStrictEqual(write.values, [
      { key: 'ghdock.identity', value: null },
    ])
    assert.deepStrictEqual(write.restore, [
      { key: 'ghdock.identity', value: 'home-id' },
    ])
    assert.deepStrictEqual(
      getIdentitySwitchWrite({ ...state, plan: null, marker: null }).values,
      []
    )
  })

  it('describes what happened', () => {
    const binding = { kind: 'identity' as const, id: 'work-id' }
    assert.equal(
      describeIdentitySwitch('app', false, binding, [work], 0),
      'app now uses work.'
    )
    assert.equal(
      describeIdentitySwitch('2 repositories', true, null, [work, null], 0),
      '2 repositories now use their identities.'
    )
    assert.equal(
      describeIdentitySwitch('app', false, { kind: 'none' }, [null], 0),
      'app no longer uses an identity.'
    )
    assert.equal(
      describeIdentitySwitch('app', false, { kind: 'automatic' }, [null], 0),
      'app matches no identity.'
    )
    assert.equal(
      describeIdentitySwitch('app', false, binding, [work], 1),
      'app now uses work. 1 remote was left unchanged, see the repository settings.'
    )
  })
})
