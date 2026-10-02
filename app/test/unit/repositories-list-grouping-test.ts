import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getPinnedRepositories,
  groupRepositories,
  movePinnedRepository,
} from '../../src/ui/repositories-list/group-repositories'
import { Repository, ILocalRepositoryState } from '../../src/models/repository'
import { CloningRepository } from '../../src/models/cloning-repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'

describe('repository list grouping', () => {
  const repositories: Array<Repository | CloningRepository> = [
    new Repository('repo1', 1, null, false),
    new Repository(
      'repo2',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'my-repo2' }),
      false
    ),
    new Repository(
      'repo3',
      3,
      gitHubRepoFixture({
        owner: '',
        name: 'my-repo3',
        endpoint: 'https://github.big-corp.com/api/v3',
      }),
      false
    ),
  ]

  const cache = new Map<number, ILocalRepositoryState>()

  it('groups repositories by owners/Enterprise/Other', () => {
    const grouped = groupRepositories(repositories, cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 1)

    let item = grouped[0].items[0]
    assert.equal(item.repository.path, 'repo2')

    assert.equal(grouped[1].identifier.kind, 'enterprise')
    assert.equal(grouped[1].items.length, 1)

    item = grouped[1].items[0]
    assert.equal(item.repository.path, 'repo3')

    assert.equal(grouped[2].identifier.kind, 'other')
    assert.equal(grouped[2].items.length, 1)

    item = grouped[2].items[0]
    assert.equal(item.repository.path, 'repo1')
  })

  it('sorts repositories alphabetically within each group', () => {
    const repoA = new Repository('a', 1, null, false)
    const repoB = new Repository(
      'b',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'b' }),
      false
    )
    const repoC = new Repository('c', 2, null, false)
    const repoD = new Repository(
      'd',
      2,
      gitHubRepoFixture({ owner: 'me', name: 'd' }),
      false
    )
    const repoZ = new Repository('z', 3, null, false)

    const grouped = groupRepositories(
      [repoC, repoB, repoZ, repoD, repoA],
      cache,
      []
    )
    assert.equal(grouped.length, 2)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'me')
    assert.equal(grouped[0].items.length, 2)

    let items = grouped[0].items
    assert.equal(items[0].repository.path, 'b')
    assert.equal(items[1].repository.path, 'd')

    assert.equal(grouped[1].identifier.kind, 'other')
    assert.equal(grouped[1].items.length, 3)

    items = grouped[1].items
    assert.equal(items[0].repository.path, 'a')
    assert.equal(items[1].repository.path, 'c')
    assert.equal(items[2].repository.path, 'z')
  })

  it('only disambiguates Enterprise repositories', () => {
    const repoA = new Repository(
      'repo',
      1,
      gitHubRepoFixture({ owner: 'user1', name: 'repo' }),
      false
    )
    const repoB = new Repository(
      'repo',
      2,
      gitHubRepoFixture({ owner: 'user2', name: 'repo' }),
      false
    )
    const repoC = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'business',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )
    const repoD = new Repository(
      'enterprise-repo',
      3,
      gitHubRepoFixture({
        owner: 'silliness',
        name: 'enterprise-repo',
        endpoint: 'https://ghe.io/api/v3',
      }),
      false
    )

    const grouped = groupRepositories([repoA, repoB, repoC, repoD], cache, [])
    assert.equal(grouped.length, 3)

    assert.equal(grouped[0].identifier.kind, 'dotcom')
    assert.equal((grouped[0].identifier as any).owner.login, 'user1')
    assert.equal(grouped[0].items.length, 1)

    assert.equal(grouped[1].identifier.kind, 'dotcom')
    assert.equal((grouped[1].identifier as any).owner.login, 'user2')
    assert.equal(grouped[1].items.length, 1)

    assert.equal(grouped[2].identifier.kind, 'enterprise')
    assert.equal(grouped[2].items.length, 2)

    assert.equal(grouped[0].items[0].text[0], 'repo')
    assert(!grouped[0].items[0].needsDisambiguation)

    assert.equal(grouped[1].items[0].text[0], 'repo')
    assert(!grouped[1].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[0].text[0], 'enterprise-repo')
    assert(grouped[2].items[0].needsDisambiguation)

    assert.equal(grouped[2].items[1].text[0], 'enterprise-repo')
    assert(grouped[2].items[1].needsDisambiguation)
  })

  it('includes pinOrder in the repository hash', () => {
    const unpinned = new Repository('repo', 1, null, false)
    const pinned = new Repository(
      'repo',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      0
    )
    assert.notEqual(pinned.hash, unpinned.hash)
    assert.notEqual(pinned.hash, pinnedRepository('repo', 1, 1).hash)
  })

  it('places pinned repositories in a pinned group before all others', () => {
    // 总数 <= 7，Recent 组不显示，但 Pinned 组应始终显示
    const pinnedRepo = new Repository(
      'pinned-repo',
      4,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      0
    )
    const grouped = groupRepositories([...repositories, pinnedRepo], cache, [])

    assert.equal(grouped.length, 4)
    assert.equal(grouped[0].identifier.kind, 'pinned')
    assert.equal(grouped[0].items.length, 1)
    assert.equal(grouped[0].items[0].repository.path, 'pinned-repo')
  })

  it('shows pinned repositories in both the pinned group and their original group', () => {
    const pinnedDotComRepo = new Repository(
      'pinned-dotcom',
      4,
      gitHubRepoFixture({ owner: 'me', name: 'pinned-dotcom' }),
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      0
    )
    const grouped = groupRepositories(
      [...repositories, pinnedDotComRepo],
      cache,
      []
    )

    const pinnedGroup = grouped.find(g => g.identifier.kind === 'pinned')
    const dotComGroup = grouped.find(g => g.identifier.kind === 'dotcom')

    assert(pinnedGroup !== undefined)
    assert(dotComGroup !== undefined)
    assert(pinnedGroup.items.some(i => i.repository.path === 'pinned-dotcom'))
    assert(dotComGroup.items.some(i => i.repository.path === 'pinned-dotcom'))
  })

  it('orders the pinned group before the recent group', () => {
    // 9 个仓库超过阈值 7，Recent 组显示
    const many = [
      new Repository('r1', 1, null, false),
      new Repository('r2', 2, null, false),
      new Repository('r3', 3, null, false),
      new Repository('r4', 4, null, false),
      new Repository('r5', 5, null, false),
      new Repository('r6', 6, null, false),
      new Repository('r7', 7, null, false),
      new Repository('r8', 8, null, false),
      new Repository(
        'r9',
        9,
        null,
        false,
        null,
        {},
        false,
        undefined,
        undefined,
        0
      ),
    ]
    const grouped = groupRepositories(many, cache, [1])

    assert.equal(grouped[0].identifier.kind, 'pinned')
    assert.equal(grouped[1].identifier.kind, 'recent')
    assert.equal(grouped[0].items[0].repository.path, 'r9')
    assert.equal(grouped[1].items[0].repository.path, 'r1')
  })

  it('disambiguates pinned repositories with duplicate names', () => {
    const repoA = new Repository(
      'dup',
      1,
      gitHubRepoFixture({ owner: 'user1', name: 'dup' }),
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      0
    )
    const repoB = new Repository(
      'dup',
      2,
      gitHubRepoFixture({ owner: 'user2', name: 'dup' }),
      false
    )
    const grouped = groupRepositories([repoA, repoB], cache, [])

    const pinnedGroup = grouped.find(g => g.identifier.kind === 'pinned')
    assert(pinnedGroup !== undefined)
    assert.equal(pinnedGroup.items.length, 1)
    assert(pinnedGroup.items[0].needsDisambiguation)
  })

  it('orders the pinned group by pin order instead of name', () => {
    const grouped = groupRepositories(
      [
        pinnedRepository('alpha', 1, 2),
        pinnedRepository('bravo', 2, 0),
        pinnedRepository('charlie', 3, 1),
      ],
      cache,
      []
    )

    const pinnedGroup = grouped.find(g => g.identifier.kind === 'pinned')
    const otherGroup = grouped.find(g => g.identifier.kind === 'other')
    assert(pinnedGroup !== undefined)
    assert(otherGroup !== undefined)
    assert.deepEqual(
      pinnedGroup.items.map(i => i.repository.path),
      ['bravo', 'charlie', 'alpha']
    )
    assert.deepEqual(
      otherGroup.items.map(i => i.repository.path),
      ['alpha', 'bravo', 'charlie']
    )
  })
})

describe('getPinnedRepositories', () => {
  it('returns only pinned repositories in pin order', () => {
    const pinned = getPinnedRepositories([
      pinnedRepository('alpha', 1, 1),
      new Repository('bravo', 2, null, false),
      pinnedRepository('charlie', 3, 0),
    ])

    assert.deepEqual(
      pinned.map(r => r.path),
      ['charlie', 'alpha']
    )
  })
})

describe('movePinnedRepository', () => {
  const a = pinnedRepository('a', 1, 0)
  const b = pinnedRepository('b', 2, 1)
  const c = pinnedRepository('c', 3, 2)
  const order = [a, b, c]

  const paths = (repositories: ReadonlyArray<Repository> | null) =>
    repositories?.map(r => r.path) ?? null

  it('moves a repository to the given insertion point', () => {
    assert.deepEqual(paths(movePinnedRepository(order, c, 0)), ['c', 'a', 'b'])
    assert.deepEqual(paths(movePinnedRepository(order, a, 3)), ['b', 'c', 'a'])
    assert.deepEqual(paths(movePinnedRepository(order, a, 2)), ['b', 'a', 'c'])
    assert.deepEqual(paths(movePinnedRepository(order, c, 1)), ['a', 'c', 'b'])
  })

  it('returns null when the repository would stay in place', () => {
    assert.equal(movePinnedRepository(order, b, 1), null)
    assert.equal(movePinnedRepository(order, b, 2), null)
    assert.equal(movePinnedRepository(order, a, -1), null)
    assert.equal(movePinnedRepository(order, c, 4), null)
  })

  it('returns null for repositories that are not pinned', () => {
    const unpinned = new Repository('d', 4, null, false)
    assert.equal(movePinnedRepository(order, unpinned, 0), null)
  })
})

function pinnedRepository(path: string, id: number, pinOrder: number) {
  return new Repository(
    path,
    id,
    null,
    false,
    null,
    {},
    false,
    undefined,
    undefined,
    pinOrder
  )
}
