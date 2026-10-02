import assert from 'node:assert'
import { describe, it, mock } from 'node:test'

import { generateRepositoryListContextMenu } from '../../src/ui/repositories-list/repository-list-item-context-menu'
import { Repository } from '../../src/models/repository'
import { Shell } from '../../src/lib/shells'
import { IMenuItem } from '../../src/lib/menu-item'

const editorSubmenuLabel = __DARWIN__ ? 'Open With Editor' : 'Open with editor'
const shellSubmenuLabel = __DARWIN__
  ? 'Open With Terminal'
  : 'Open with terminal'
const moveSubmenuLabel = __DARWIN__
  ? 'Move Pinned Repository'
  : 'Move pinned repository'

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

function createMenu(
  overrides: Partial<Parameters<typeof generateRepositoryListContextMenu>[0]>
) {
  const noop = () => {}
  return generateRepositoryListContextMenu({
    repository: new Repository('/repo', 1, null, false),
    shellLabel: 'Ghostty',
    externalEditorLabel: 'Zed',
    selectedExternalEditor: 'Zed',
    availableExternalEditors: ['Visual Studio Code', 'Zed', 'IntelliJ IDEA'],
    selectedShell: 'Ghostty' as Shell,
    availableShells: ['Terminal', 'iTerm2', 'Ghostty'] as Array<Shell>,
    askForConfirmationOnRemoveRepository: true,
    onViewOnGitHub: noop,
    onOpenInShell: noop,
    onShowRepository: noop,
    onOpenInExternalEditor: noop,
    onOpenInSelectedShell: noop,
    onOpenInSelectedExternalEditor: noop,
    onRemoveRepository: noop,
    onChangeRepositoryAlias: noop,
    onRemoveRepositoryAlias: noop,
    onTogglePinRepository: noop,
    pinnedRepositories: [],
    onReorderPinnedRepositories: noop,
    ...overrides,
  })
}

function findItem(items: ReadonlyArray<IMenuItem>, label: string) {
  return items.find(i => i.label === label)
}

describe('generateRepositoryListContextMenu', () => {
  it('lists every installed editor and marks the configured one', () => {
    const submenu = findItem(createMenu({}), editorSubmenuLabel)?.submenu

    assert(submenu !== undefined)
    assert.deepEqual(
      submenu.map(i => [i.label, i.checked]),
      [
        ['Visual Studio Code', false],
        ['Zed', true],
        ['IntelliJ IDEA', false],
      ]
    )
  })

  it('lists every installed shell and marks the configured one', () => {
    const submenu = findItem(createMenu({}), shellSubmenuLabel)?.submenu

    assert(submenu !== undefined)
    assert.deepEqual(
      submenu.map(i => [i.label, i.checked]),
      [
        ['Terminal', false],
        ['iTerm2', false],
        ['Ghostty', true],
      ]
    )
  })

  it('opens the repository with the chosen editor and shell', () => {
    const onOpenInSelectedExternalEditor = mock.fn(
      (_repository: Repository, _editor: string) => {}
    )
    const onOpenInSelectedShell = mock.fn(
      (_repository: Repository, _shell: Shell) => {}
    )
    const items = createMenu({
      onOpenInSelectedExternalEditor,
      onOpenInSelectedShell,
    })

    findItem(items, editorSubmenuLabel)?.submenu?.[0].action?.()
    findItem(items, shellSubmenuLabel)?.submenu?.[1].action?.()

    assert.equal(
      onOpenInSelectedExternalEditor.mock.calls[0].arguments[1],
      'Visual Studio Code'
    )
    assert.equal(onOpenInSelectedShell.mock.calls[0].arguments[1], 'iTerm2')
  })

  it('omits the submenus when there is nothing else to choose', () => {
    const items = createMenu({
      availableExternalEditors: ['Zed'],
      availableShells: ['Ghostty'] as Array<Shell>,
    })

    assert.equal(findItem(items, editorSubmenuLabel), undefined)
    assert.equal(findItem(items, shellSubmenuLabel), undefined)
  })

  it('disables the submenus for missing repositories', () => {
    const items = createMenu({
      repository: new Repository('/repo', 1, null, true),
    })

    assert.equal(findItem(items, editorSubmenuLabel)?.enabled, false)
    assert.equal(findItem(items, shellSubmenuLabel)?.enabled, false)
  })

  describe('moving pinned repositories', () => {
    const a = pinnedRepository('/a', 11, 0)
    const b = pinnedRepository('/b', 12, 1)
    const c = pinnedRepository('/c', 13, 2)

    it('enables the moves available at each position', () => {
      const enabled = (repository: Repository) =>
        findItem(
          createMenu({ repository, pinnedRepositories: [a, b, c] }),
          moveSubmenuLabel
        )?.submenu?.map(i => i.enabled)

      assert.deepEqual(enabled(a), [false, false, true, true])
      assert.deepEqual(enabled(b), [true, true, true, true])
      assert.deepEqual(enabled(c), [true, true, false, false])
    })

    it('reorders the pinned repositories', () => {
      const onReorderPinnedRepositories = mock.fn(
        (_repositories: ReadonlyArray<Repository>) => {}
      )
      const submenu = findItem(
        createMenu({
          repository: b,
          pinnedRepositories: [a, b, c],
          onReorderPinnedRepositories,
        }),
        moveSubmenuLabel
      )?.submenu

      assert(submenu !== undefined)
      submenu.forEach(item => item.action?.())

      assert.deepEqual(
        onReorderPinnedRepositories.mock.calls.map(call =>
          call.arguments[0].map(r => r.path)
        ),
        [
          ['/b', '/a', '/c'],
          ['/b', '/a', '/c'],
          ['/a', '/c', '/b'],
          ['/a', '/c', '/b'],
        ]
      )
    })

    it('is omitted for unpinned repositories and single pins', () => {
      assert.equal(
        findItem(createMenu({ pinnedRepositories: [a, b] }), moveSubmenuLabel),
        undefined
      )
      assert.equal(
        findItem(
          createMenu({ repository: a, pinnedRepositories: [a] }),
          moveSubmenuLabel
        ),
        undefined
      )
    })
  })
})
