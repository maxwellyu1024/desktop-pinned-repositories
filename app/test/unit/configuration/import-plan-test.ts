import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Repository } from '../../../src/models/repository'
import {
  buildImportPlan,
  IResolvedRepositoryEntry,
} from '../../../src/lib/configuration/import-plan'
import { IConfigurationRepository } from '../../../src/lib/configuration/configuration-file'

const repository = (
  id: number,
  path: string,
  alias: string | null = null,
  pinOrder: number | null = null
) =>
  new Repository(
    path,
    id,
    null,
    false,
    alias,
    {},
    false,
    undefined,
    undefined,
    pinOrder
  )

const entry = (
  path: string,
  pinned = false,
  alias: string | null = null
): IConfigurationRepository => ({ path, alias, pinned })

/** Entries that resolve to their own path, or to null when listed in `missing`. */
const resolve = (
  entries: ReadonlyArray<IConfigurationRepository>,
  missing: ReadonlyArray<string> = []
): ReadonlyArray<IResolvedRepositoryEntry> =>
  entries.map(e => ({
    entry: e,
    path: missing.includes(e.path) ? null : e.path,
  }))

describe('buildImportPlan', () => {
  const current = [
    repository(1, '/a', null, 0),
    repository(2, '/b', 'Bee'),
    repository(3, '/c', null, 1),
    repository(4, '/d'),
  ]

  it('merges: adds, updates and keeps the rest', () => {
    const repositories = [
      entry('/b', true, 'Bee'),
      entry('/new', true),
      entry('/gone'),
      entry('/d'),
    ]
    const plan = buildImportPlan(
      { repositories },
      resolve(repositories, ['/gone']),
      current,
      'merge'
    )

    assert.deepEqual(plan.toAdd, ['/new'])
    assert.deepEqual(plan.skipped, ['/gone'])
    assert.deepEqual(plan.toRemove, [])
    assert.deepEqual(
      plan.toUpdate.map(r => r.path),
      ['/b']
    )
    // Pinned from the file first, then the previously pinned ones.
    assert.deepEqual(plan.layout, [
      { path: '/b', alias: 'Bee', pinOrder: 0 },
      { path: '/new', alias: null, pinOrder: 1 },
      { path: '/d', alias: null, pinOrder: null },
      { path: '/a', alias: null, pinOrder: 2 },
      { path: '/c', alias: null, pinOrder: 3 },
    ])
  })

  it('replaces: removes repositories missing from the file', () => {
    const repositories = [entry('/c', true), entry('/a', true)]
    const plan = buildImportPlan(
      { repositories },
      resolve(repositories),
      current,
      'replace'
    )

    assert.deepEqual(
      plan.toRemove.map(r => r.path),
      ['/b', '/d']
    )
    assert.deepEqual(plan.layout, [
      { path: '/c', alias: null, pinOrder: 0 },
      { path: '/a', alias: null, pinOrder: 1 },
    ])
    // Swapping the pinned order changes both.
    assert.deepEqual(
      plan.toUpdate.map(r => r.path),
      ['/a', '/c']
    )
  })

  it('reports nothing to update when the file matches', () => {
    const repositories = [
      entry('/a', true),
      entry('/c', true),
      entry('/b', false, 'Bee'),
      entry('/d'),
    ]
    const plan = buildImportPlan(
      { repositories },
      resolve(repositories),
      current,
      'replace'
    )

    assert.deepEqual(plan.toAdd, [])
    assert.deepEqual(plan.toUpdate, [])
    assert.deepEqual(plan.toRemove, [])
  })

  it('keeps the first of several entries resolving to one repository', () => {
    const repositories = [entry('/b/sub', true, 'Sub'), entry('/b', false)]
    const plan = buildImportPlan(
      { repositories },
      repositories.map(e => ({ entry: e, path: '/b' })),
      current,
      'merge'
    )

    assert.deepEqual(plan.layout[0], { path: '/b', alias: 'Sub', pinOrder: 0 })
    assert.equal(plan.layout.filter(l => l.path === '/b').length, 1)
  })

  it('leaves repositories alone when the file only has settings', () => {
    const plan = buildImportPlan(
      { settings: { theme: 'dark' } },
      [],
      current,
      'replace'
    )

    assert.deepEqual(plan.toRemove, [])
    assert.deepEqual(plan.layout, [])
    assert.deepEqual(plan.settings, { theme: 'dark' })
  })
})
