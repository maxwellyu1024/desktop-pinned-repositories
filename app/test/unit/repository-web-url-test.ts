import assert from 'node:assert'
import { before, describe, it, mock } from 'node:test'

import { SSHHostAliasResolver } from '../../src/lib/ssh/ssh-host-alias'
import { Repository } from '../../src/models/repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

/** Stand-in for `ssh -G`, mapping aliases as `~/.ssh/config` would */
const sshConfig = new Map([['work', 'github.com']])
const sshHostAliasResolver = new SSHHostAliasResolver(
  async (host: string) => sshConfig.get(host) ?? host
)

let getRemoteWebURL: typeof import('../../src/lib/repository-web-url').getRemoteWebURL
let getRepositoryWebURL: typeof import('../../src/lib/repository-web-url').getRepositoryWebURL

before(async () => {
  mock.module('../../src/lib/ssh/ssh-host-alias.ts', {
    namedExports: { SSHHostAliasResolver, sshHostAliasResolver },
  })
  ;({ getRemoteWebURL, getRepositoryWebURL } = await import(
    '../../src/lib/repository-web-url'
  ))
  await sshHostAliasResolver.resolve(['work'])
})

const helloWorld = 'https://github.com/octocat/Hello-World'

describe('getRemoteWebURL', () => {
  it('returns the github.com page of HTTPS and SSH remotes', () => {
    assert.equal(getRemoteWebURL(`${helloWorld}.git`), helloWorld)
    assert.equal(
      getRemoteWebURL('git@github.com:octocat/Hello-World.git'),
      helloWorld
    )
    assert.equal(
      getRemoteWebURL('ssh://git@github.com/octocat/Hello-World.git'),
      helloWorld
    )
  })

  it('resolves SSH host aliases to github.com', () => {
    assert.equal(
      getRemoteWebURL('git@work:octocat/Hello-World.git'),
      helloWorld
    )
  })

  it('returns null for remotes not hosted on github.com', () => {
    assert.equal(
      getRemoteWebURL('git@gitlab.com:octocat/Hello-World.git'),
      null
    )
    assert.equal(getRemoteWebURL('git@other:octocat/Hello-World.git'), null)
    assert.equal(getRemoteWebURL('/path/to/repository'), null)
  })
})

describe('getRepositoryWebURL', () => {
  const remote = { name: 'origin', url: 'git@work:octocat/Hello-World.git' }

  it('uses the remote when there is no associated GitHub repository', () => {
    const repository = new Repository('/repo', 1, null, false)

    assert.equal(getRepositoryWebURL(repository, remote), helloWorld)
    assert.equal(getRepositoryWebURL(repository, null), null)
  })

  it('prefers the associated GitHub repository', () => {
    const repository = new Repository(
      '/repo',
      1,
      gitHubRepoFixture({ owner: 'desktop', name: 'desktop' }),
      false
    )

    assert.equal(
      getRepositoryWebURL(repository, remote),
      'https://github.com/desktop/desktop'
    )
  })
})
