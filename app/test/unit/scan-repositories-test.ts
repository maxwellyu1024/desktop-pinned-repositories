/* eslint-disable no-sync */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as Fs from 'fs'
import * as Path from 'path'
import { createTempDirectory } from '../helpers/temp'
import { scanForRepositories } from '../../src/lib/scan-repositories'

const makeRepository = (path: string, gitFile = false) => {
  Fs.mkdirSync(path, { recursive: true })
  if (gitFile) {
    Fs.writeFileSync(Path.join(path, '.git'), 'gitdir: /elsewhere')
  } else {
    Fs.mkdirSync(Path.join(path, '.git'))
  }
}

describe('scanForRepositories', () => {
  it('finds repositories without descending into them', async t => {
    const root = await createTempDirectory(t)
    makeRepository(Path.join(root, 'b'))
    makeRepository(Path.join(root, 'b', 'nested'))
    makeRepository(Path.join(root, 'group', 'a'))
    makeRepository(Path.join(root, 'worktree'), true)
    Fs.mkdirSync(Path.join(root, 'empty'))

    assert.deepEqual(await scanForRepositories(root), [
      Path.join(root, 'b'),
      Path.join(root, 'group', 'a'),
      Path.join(root, 'worktree'),
    ])
  })

  it('skips hidden folders, node_modules and symbolic links', async t => {
    const root = await createTempDirectory(t)
    makeRepository(Path.join(root, '.cache', 'a'))
    makeRepository(Path.join(root, 'node_modules', 'b'))
    makeRepository(Path.join(root, 'c'))
    Fs.symlinkSync(Path.join(root, 'c'), Path.join(root, 'link'))

    assert.deepEqual(await scanForRepositories(root), [Path.join(root, 'c')])
  })

  it('stops at the maximum depth', async t => {
    const root = await createTempDirectory(t)
    makeRepository(Path.join(root, '1', '2', 'repo'))

    assert.deepEqual(await scanForRepositories(root, 1), [])
    assert.deepEqual(await scanForRepositories(root, 3), [
      Path.join(root, '1', '2', 'repo'),
    ])
  })

  it('returns the folder itself when it is a repository', async t => {
    const root = await createTempDirectory(t)
    makeRepository(root)

    assert.deepEqual(await scanForRepositories(root), [root])
  })
})
