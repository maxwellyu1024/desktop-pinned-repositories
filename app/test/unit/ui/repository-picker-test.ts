import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getListedItems,
  getRemoteGroups,
  IRepositoryGroup,
} from '../../../src/ui/repository-management/repository-picker'

const remote = (host: string, owner: string, name: string) => ({
  host,
  owner,
  name,
})

describe('repository picker', () => {
  describe('getRemoteGroups', () => {
    it('groups by host and then owner, with repositories without a remote last', () => {
      const groups = getRemoteGroups([
        { key: 'a', remote: remote('github.com', 'octocat', 'a') },
        { key: 'b', remote: remote('GitHub.com', 'desktop', 'b') },
        { key: 'c', remote: remote('gitlab.com', 'group', 'c') },
        { key: 'd', remote: null },
        { key: 'e', remote: undefined },
        { key: 'f', remote: remote('github.com', 'octocat', 'f') },
      ])

      assert.deepStrictEqual(
        groups.map(g => [g.key, g.keys, g.parent, g.heading]),
        [
          ['host:github.com', ['a', 'f', 'b'], undefined, 'Remotes'],
          ['owner:github.com/desktop', ['b'], 'host:github.com', undefined],
          [
            'owner:github.com/octocat',
            ['a', 'f'],
            'host:github.com',
            undefined,
          ],
          ['host:gitlab.com', ['c'], undefined, undefined],
          ['owner:gitlab.com/group', ['c'], 'host:gitlab.com', undefined],
          ['no-remote', ['d'], undefined, undefined],
        ]
      )
    })

    it('leaves out repositories whose remote is not known yet', () => {
      assert.deepStrictEqual(
        getRemoteGroups([{ key: 'a', remote: undefined }]),
        []
      )
    })
  })

  describe('getListedItems', () => {
    const items = [
      { key: '1', title: 'desktop', path: '/dev/desktop', remote: 'gh/desk' },
      { key: '2', title: 'dotfiles', path: '/dev/dotfiles' },
      { key: '3', title: 'notes', path: '/docs/notes', detail: 'alias' },
    ]
    const groups: ReadonlyArray<IRepositoryGroup> = [
      { key: 'all', label: 'All', keys: ['1', '2', '3'] },
      { key: 'dev', label: 'Dev', keys: ['1', '2'] },
    ]
    const keys = (group: string, filter: string) =>
      getListedItems(items, groups, group, filter).map(i => i.key)

    it('lists the selected group', () => {
      assert.deepStrictEqual(keys('dev', ''), ['1', '2'])
    })

    it('falls back to the first group', () => {
      assert.deepStrictEqual(keys('gone', ''), ['1', '2', '3'])
    })

    it('filters by title, detail, remote and path', () => {
      assert.deepStrictEqual(keys('all', 'DESK'), ['1'])
      assert.deepStrictEqual(keys('all', 'alias'), ['3'])
      assert.deepStrictEqual(keys('all', '/docs'), ['3'])
      assert.deepStrictEqual(keys('dev', 'notes'), [])
    })
  })
})
