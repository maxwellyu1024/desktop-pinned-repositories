import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert'
import * as React from 'react'
import { render, screen } from '../../helpers/ui/render'
import { ChangeRepositoryAlias } from '../../../src/ui/change-repository-alias/change-repository-alias-dialog'
import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher'

const repository = (path: string, id: number, alias: string | null) =>
  new Repository(path, id, null, false, alias)

const dialog = (repositories: ReadonlyArray<Repository>) => (
  <ChangeRepositoryAlias
    dispatcher={{} as Dispatcher}
    repositories={repositories}
    onDismissed={() => {}}
  />
)

describe('ChangeRepositoryAlias', () => {
  let restoreIpcSend: (() => void) | null = null

  beforeEach(async () => {
    // 弹窗挂载时会通过 IPC 通知主进程，测试中替换掉
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
  })

  afterEach(() => restoreIpcSend?.())

  it('starts from the name of a single repository without warning', () => {
    render(dialog([repository('/a/app', 1, null)]))
    assert.equal(
      (screen.getByLabelText('Alias') as HTMLInputElement).value,
      'app'
    )
    assert.equal(screen.queryByText(/listed with the same name/), null)
  })

  it('warns that several repositories share the alias and lists replaced ones', () => {
    render(
      dialog([
        repository('/a', 1, 'Same'),
        repository('/b', 2, 'Other'),
        repository('/c', 3, null),
      ])
    )
    assert.equal((screen.getByLabelText('Alias') as HTMLInputElement).value, '')
    assert.ok(
      screen.getByText(
        /All 3 repositories will be listed with the same name.*2 already have aliases that will be replaced: Same, Other\./
      )
    )
  })

  it('starts from the alias the repositories share', () => {
    render(dialog([repository('/a', 1, 'Same'), repository('/b', 2, 'Same')]))
    assert.equal(
      (screen.getByLabelText('Alias') as HTMLInputElement).value,
      'Same'
    )
    assert.ok(screen.getAllByText(/All 2 repositories/).length > 0)
    assert.equal(screen.queryByText(/will be replaced/), null)
  })
})
