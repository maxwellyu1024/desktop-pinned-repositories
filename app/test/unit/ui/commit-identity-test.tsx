import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'
import { render, screen } from '../../helpers/ui/render'
import { CommitIdentityButton } from '../../../src/ui/changes/commit-identity'
import { Repository } from '../../../src/models/repository'
import { IRepositoryIdentityState } from '../../../src/lib/identity/repository-identity'

const work = {
  id: 'work',
  label: 'Work',
  authorName: 'Me',
  authorEmail: 'me@work.com',
  rules: [],
}

const state = (changes: number): IRepositoryIdentityState => ({
  remote: { host: 'github.com', fullPath: 'acme/app', sshHost: null },
  plan: {
    identity: work,
    changes: Array.from({ length: changes }, () => ({
      key: 'user.email',
      current: 'me@home.com',
      next: 'me@work.com',
      optional: false,
    })),
    applied: changes === 0,
    warnings: [],
  },
  localEmail: 'me@home.com',
  localName: null,
  marker: null,
})

const button = (
  identityState: IRepositoryIdentityState | null,
  identities = [work]
) => (
  <CommitIdentityButton
    repository={new Repository('/repo', 1, null, false)}
    identities={identities}
    state={identityState}
    onSwitch={() => {}}
    onApply={() => {}}
    disabled={false}
  />
)

describe('CommitIdentityButton', () => {
  it('shows the identity and whether it is set up', () => {
    render(button(state(0)))
    assert.ok(screen.getByRole('button', { name: 'Identity Work' }))
  })

  it('warns when the config differs from the identity', () => {
    render(button(state(1)))
    assert.ok(
      screen.getByRole('button', {
        name: 'Identity Work, not set up in this repository',
      })
    )
  })

  it('is hidden without identities or while reading', () => {
    const { container } = render(button(state(0), []))
    assert.equal(container.innerHTML, '')
    const reading = render(button(null))
    assert.equal(reading.container.innerHTML, '')
  })
})
