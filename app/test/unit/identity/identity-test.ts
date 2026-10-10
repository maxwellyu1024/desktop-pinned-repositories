import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isInNamespace,
  parseRemoteLocation,
} from '../../../src/lib/identity/remote-location'
import {
  matchIdentity,
  resolveIdentity,
} from '../../../src/lib/identity/match-identity'
import {
  computeIdentityChanges,
  getConfiguredRemote,
  isSelectedByDefault,
} from '../../../src/lib/identity/identity-changes'
import {
  formatRules,
  parseRules,
} from '../../../src/lib/identity/identity-rules'
import { inferIdentities } from '../../../src/lib/identity/infer-identities'
import { IRepositoryIdentityState } from '../../../src/lib/identity/repository-identity'
import { IIdentity } from '../../../src/models/identity'

const identity = (
  id: string,
  rules: IIdentity['rules'],
  extra: Partial<IIdentity> = {}
): IIdentity => ({
  id,
  label: id,
  authorName: `${id} name`,
  authorEmail: `${id}@example.com`,
  rules,
  ...extra,
})

describe('identity', () => {
  describe('parseRemoteLocation', () => {
    it('parses the common URL forms', () => {
      const cases: ReadonlyArray<[string, string, string, string]> = [
        [
          'git@github.com:octocat/hello.git',
          'ssh',
          'github.com',
          'octocat/hello',
        ],
        ['work:octocat/hello', 'ssh', 'work', 'octocat/hello'],
        ['ssh://git@gitlab.com:2222/a/b/c.git', 'ssh', 'gitlab.com', 'a/b/c'],
        [
          'https://user@gitlab.com/group/sub/project.git/',
          'http',
          'gitlab.com',
          'group/sub/project',
        ],
        [
          'http://example.com:8080/team/repo',
          'http',
          'example.com',
          'team/repo',
        ],
        ['git://example.com/team/repo.git', 'git', 'example.com', 'team/repo'],
      ]

      for (const [url, protocol, host, fullPath] of cases) {
        assert.deepStrictEqual(parseRemoteLocation(url), {
          protocol,
          host,
          fullPath,
        })
      }
    })

    it('rejects local paths', () => {
      assert.equal(parseRemoteLocation('/Users/me/repo'), null)
      assert.equal(parseRemoteLocation('file:///Users/me/repo'), null)
    })
  })

  it('matches whole namespace segments', () => {
    assert.ok(isInNamespace('Group/Sub/project', 'group/sub'))
    assert.ok(isInNamespace('group/sub/project', 'group'))
    assert.ok(isInNamespace('group/project', ''))
    assert.ok(!isInNamespace('groupie/project', 'group'))
    assert.ok(!isInNamespace('group/project', 'group/project'))
  })

  describe('matchIdentity', () => {
    const personal = identity('personal', [{ host: 'github.com' }])
    const work = identity('work', [{ host: 'github.com', namespace: 'acme' }])
    const team = identity('team', [
      { host: 'gitlab.com', namespace: 'acme/platform' },
      { host: 'gitlab.com', namespace: 'acme' },
    ])
    const all = [personal, work, team]

    it('prefers the longest namespace on the same host', () => {
      const match = (host: string, fullPath: string) =>
        matchIdentity(all, { host, fullPath, sshHost: null })?.id ?? null

      assert.equal(match('github.com', 'acme/app'), 'work')
      assert.equal(match('GitHub.com', 'octocat/app'), 'personal')
      assert.equal(match('gitlab.com', 'acme/platform/api'), 'team')
      assert.equal(match('gitlab.com', 'other/api'), null)
    })

    it('matches remotes written with an identity alias before rules', () => {
      const aliased = identity('aliased', [], { sshHostAlias: 'Work-SSH' })
      const later = identity('later', [], { sshHostAlias: 'work-ssh' })
      const match = (sshHost: string | null) =>
        matchIdentity([personal, work, aliased, later], {
          host: 'github.com',
          fullPath: 'acme/app',
          sshHost,
        })?.id ?? null

      assert.equal(match('work-ssh'), 'aliased')
      assert.equal(match('github.com'), 'work')
      assert.equal(match(null), 'work')
      assert.equal(match('other-alias'), 'work')
    })

    it('uses the chosen identity whatever the remote', () => {
      const remote = { host: 'github.com', fullPath: 'acme/app', sshHost: null }
      assert.equal(
        resolveIdentity({ kind: 'identity', id: 'team' }, all, remote)?.id,
        'team'
      )
      assert.equal(resolveIdentity({ kind: 'none' }, all, remote), null)
      assert.equal(
        resolveIdentity({ kind: 'identity', id: 'gone' }, all, remote),
        null
      )
      assert.equal(resolveIdentity({ kind: 'automatic' }, all, null), null)
    })
  })

  describe('computeIdentityChanges', () => {
    const resolveHost = (host: string) =>
      host === 'work' || host === 'personal' ? 'github.com' : host
    const config = (entries: Record<string, string>) =>
      new Map(Object.entries(entries))

    it('lists only what differs, and asks before overwriting', () => {
      const plan = computeIdentityChanges(
        identity('work', [], {
          authorName: 'Work Name',
          authorEmail: 'me@work.com',
          signing: { format: 'ssh', key: '~/.ssh/work.pub' },
          sshHostAlias: 'work',
        }),
        config({
          'user.name': 'Work Name',
          'user.email': 'me@home.com',
          'commit.gpgsign': 'yes',
          'remote.origin.url': 'git@github.com:acme/app.git',
        }),
        resolveHost
      )

      assert.deepStrictEqual(
        plan.changes.map(c => [
          c.key,
          c.current,
          c.next,
          isSelectedByDefault(c, plan, false),
          isSelectedByDefault(c, plan, true),
        ]),
        [
          ['user.email', 'me@home.com', 'me@work.com', false, true],
          ['user.signingkey', null, '~/.ssh/work.pub', true, true],
          ['gpg.format', null, 'ssh', true, true],
          [
            'remote.origin.url',
            'git@github.com:acme/app.git',
            'git@work:acme/app.git',
            false,
            true,
          ],
        ]
      )
      assert.deepStrictEqual(plan.warnings, [])
    })

    it('replaces values the identity wrote without asking', () => {
      const plan = computeIdentityChanges(
        identity('work', [], { authorEmail: 'new@work.com' }),
        config({
          'user.name': 'work name',
          'user.email': 'old@work.com',
          'ghdock.identity': 'work',
        }),
        resolveHost
      )
      assert.equal(plan.applied, true)
      assert.deepStrictEqual(
        plan.changes.map(c => [c.key, isSelectedByDefault(c, plan, false)]),
        [['user.email', true]]
      )

      const other = computeIdentityChanges(
        identity('home', [], { authorEmail: 'new@work.com' }),
        config({
          'user.name': 'home name',
          'user.email': 'old@work.com',
          'ghdock.identity': 'work',
        }),
        resolveHost
      )
      assert.equal(other.applied, false)
      assert.deepStrictEqual(
        other.changes.map(c => [c.key, isSelectedByDefault(c, other, false)]),
        [['user.email', false]]
      )
    })

    it('only switches HTTPS remotes to SSH on request', () => {
      const plan = computeIdentityChanges(
        identity('work', [], { sshHostAlias: 'work' }),
        config({ 'remote.origin.url': 'https://github.com/acme/app.git' }),
        resolveHost
      )
      const remote = plan.changes.find(c => c.key === 'remote.origin.url')
      assert.equal(remote?.next, 'git@work:acme/app.git')
      assert.equal(remote?.optional, true)
      assert.equal(
        remote !== undefined && isSelectedByDefault(remote, plan, true),
        false
      )
    })

    it('leaves remotes alone when the alias goes elsewhere', () => {
      const plan = computeIdentityChanges(
        identity('work', [], { sshHostAlias: 'work' }),
        config({ 'remote.origin.url': 'git@gitlab.com:acme/app.git' }),
        resolveHost
      )
      assert.ok(plan.changes.every(c => !c.key.startsWith('remote.')))
      assert.equal(plan.warnings.length, 1)
    })

    it('keeps remotes that already use the alias', () => {
      const plan = computeIdentityChanges(
        identity('work', [], { sshHostAlias: 'work' }),
        config({ 'remote.origin.url': 'git@work:acme/app.git' }),
        resolveHost
      )
      assert.ok(plan.changes.every(c => !c.key.startsWith('remote.')))
    })

    it('removes signing it wrote once the identity stops signing', () => {
      const plan = computeIdentityChanges(
        identity('work', []),
        config({
          'user.name': 'work name',
          'user.email': 'work@example.com',
          'user.signingkey': 'ABC',
          'commit.gpgsign': 'true',
          'ghdock.identity': 'work',
        }),
        resolveHost
      )
      assert.deepStrictEqual(
        plan.changes.map(c => [
          c.key,
          c.next,
          isSelectedByDefault(c, plan, false),
        ]),
        [
          ['user.signingkey', null, true],
          ['commit.gpgsign', null, true],
        ]
      )
    })

    it('prefers origin as the default remote', () => {
      assert.equal(
        getConfiguredRemote(
          config({
            'remote.backup.url': 'a',
            'remote.origin.url': 'b',
          })
        )?.name,
        'origin'
      )
      assert.equal(
        getConfiguredRemote(
          config({ 'remote.zeta.url': 'a', 'remote.alpha.url': 'b' })
        )?.name,
        'alpha'
      )
    })
  })

  describe('inferIdentities', () => {
    const state = (
      fullPath: string,
      email: string | null,
      sshHost: string | null = null,
      host = 'github.com'
    ): IRepositoryIdentityState => ({
      remote: { host, fullPath, sshHost },
      plan: null,
      localEmail: email,
      localName: email === null ? null : 'Local Name',
      marker: null,
    })

    const summarize = (suggestions: ReturnType<typeof inferIdentities>) =>
      suggestions.map(s => [
        s.identity.label,
        s.identity.authorName,
        s.identity.authorEmail,
        s.identity.sshHostAlias,
        s.identity.rules.map(r => `${r.host}/${r.namespace}`),
        s.repositoryCount,
      ])

    const global = { name: 'Global', email: 'global@example.com' }

    it('groups aliased remotes by alias and takes the most common local author', () => {
      const suggestions = inferIdentities(
        [
          state('maxwell/a', 'max@example.com', 'maxwell'),
          state('maxwell/b', 'MAX@example.com', 'maxwell'),
          state('acme/c', null, 'maxwell'),
          state('maxwell/d', 'other@example.com', 'maxwell'),
          state('solo/e', null, 'solo'),
        ],
        global,
        [identity('maxwell', [])]
      )

      assert.deepStrictEqual(summarize(suggestions), [
        [
          'maxwell 2',
          'Local Name',
          'max@example.com',
          'maxwell',
          ['github.com/acme', 'github.com/maxwell'],
          4,
        ],
        [
          'solo',
          'Global',
          'global@example.com',
          'solo',
          ['github.com/solo'],
          1,
        ],
      ])
    })

    it('groups other remotes by local email, skipping the global author', () => {
      const suggestions = inferIdentities(
        [
          state('octocat/a', null),
          state('octocat/b', 'Global@example.com'),
          state('team/c', 'me@work.com', null, 'gitlab.com'),
          state('infra/d', 'me@work.com', null, 'gitlab.com'),
          state('team/e', 'me@work.com'),
          state('team/f', 'me@work.com', 'github.com'),
        ],
        global,
        []
      )

      assert.deepStrictEqual(summarize(suggestions), [
        [
          'me@work.com',
          'Local Name',
          'me@work.com',
          undefined,
          ['gitlab.com/infra', 'gitlab.com/team'],
          2,
        ],
        [
          'team',
          'Local Name',
          'me@work.com',
          undefined,
          ['github.com/team'],
          2,
        ],
      ])
    })
  })

  it('parses rules written one per line', () => {
    const rules = parseRules(
      ' github.com/acme/ \n\nhttps://gitlab.com/group/sub\ngitea.example.com\n'
    )
    assert.deepStrictEqual(rules, [
      { host: 'github.com', namespace: 'acme' },
      { host: 'gitlab.com', namespace: 'group/sub' },
      { host: 'gitea.example.com' },
    ])
    assert.equal(
      formatRules(rules),
      'github.com/acme\ngitlab.com/group/sub\ngitea.example.com'
    )
  })
})
