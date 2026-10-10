/* eslint-disable no-sync */

import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as Fs from 'fs'
import * as Os from 'os'
import * as Path from 'path'
import { createTempDirectory } from '../helpers/temp'
import {
  copyLegacyUserData,
  findLegacyUserDataPath,
  isUserDataInUse,
  legacyProductNames,
} from '../../src/lib/legacy-user-data'

const legacyName = legacyProductNames[0]

function writeFile(path: string, contents: string) {
  Fs.mkdirSync(Path.dirname(path), { recursive: true })
  Fs.writeFileSync(path, contents)
}

describe('legacy user data', () => {
  describe('findLegacyUserDataPath', () => {
    it('finds the legacy directory when the new one does not exist', async t => {
      const appData = await createTempDirectory(t)
      const legacy = Path.join(appData, legacyName)
      Fs.mkdirSync(legacy)

      assert.equal(
        findLegacyUserDataPath(appData, Path.join(appData, 'GHDock'), ''),
        legacy
      )
    })

    it('matches the development suffix', async t => {
      const appData = await createTempDirectory(t)
      Fs.mkdirSync(Path.join(appData, legacyName))
      const legacyDev = Path.join(appData, `${legacyName}-dev`)
      Fs.mkdirSync(legacyDev)

      assert.equal(
        findLegacyUserDataPath(
          appData,
          Path.join(appData, 'GHDock-dev'),
          '-dev'
        ),
        legacyDev
      )
    })

    it('does not migrate once the new directory exists', async t => {
      const appData = await createTempDirectory(t)
      Fs.mkdirSync(Path.join(appData, legacyName))
      const userData = Path.join(appData, 'GHDock')
      Fs.mkdirSync(userData)

      assert.equal(findLegacyUserDataPath(appData, userData, ''), null)
    })

    it('returns null without legacy data', async t => {
      const appData = await createTempDirectory(t)
      assert.equal(
        findLegacyUserDataPath(appData, Path.join(appData, 'GHDock'), ''),
        null
      )
    })
  })

  describe('copyLegacyUserData', () => {
    it('copies everything except instance locks and keeps the source', async t => {
      const appData = await createTempDirectory(t)
      const source = Path.join(appData, legacyName)
      const destination = Path.join(appData, 'GHDock')
      writeFile(
        Path.join(source, 'Local Storage', 'leveldb', '000003.log'),
        'ls'
      )
      writeFile(Path.join(source, 'IndexedDB', 'db', 'CURRENT'), 'idb')
      writeFile(Path.join(source, 'window-state.json'), '{}')
      writeFile(Path.join(source, 'DevToolsActivePort'), '1234')
      Fs.symlinkSync(`${Os.hostname()}-1`, Path.join(source, 'SingletonLock'))

      copyLegacyUserData(source, destination)

      assert.equal(
        Fs.readFileSync(
          Path.join(destination, 'Local Storage', 'leveldb', '000003.log'),
          'utf8'
        ),
        'ls'
      )
      assert.equal(
        Fs.readFileSync(
          Path.join(destination, 'IndexedDB', 'db', 'CURRENT'),
          'utf8'
        ),
        'idb'
      )
      assert.ok(Fs.existsSync(Path.join(destination, 'window-state.json')))
      assert.ok(!Fs.existsSync(Path.join(destination, 'DevToolsActivePort')))
      assert.throws(() => Fs.lstatSync(Path.join(destination, 'SingletonLock')))
      assert.ok(!Fs.existsSync(`${destination}.migrating`))
      assert.ok(Fs.existsSync(Path.join(source, 'window-state.json')))
      assert.ok(
        Fs.lstatSync(Path.join(source, 'SingletonLock')).isSymbolicLink()
      )
    })

    it('leaves no destination when copying fails', async t => {
      const appData = await createTempDirectory(t)
      const destination = Path.join(appData, 'GHDock')

      assert.throws(() =>
        copyLegacyUserData(Path.join(appData, 'missing'), destination)
      )
      assert.ok(!Fs.existsSync(destination))
      assert.ok(!Fs.existsSync(`${destination}.migrating`))
    })
  })

  describe('isUserDataInUse', { skip: process.platform === 'win32' }, () => {
    it('detects a running instance from the singleton lock', async t => {
      const userData = await createTempDirectory(t)
      const lock = Path.join(userData, 'SingletonLock')
      assert.equal(isUserDataInUse(userData), false)

      Fs.symlinkSync(`${Os.hostname()}-${process.pid}`, lock)
      assert.equal(isUserDataInUse(userData), true)

      Fs.unlinkSync(lock)
      Fs.symlinkSync(`other-host-${process.pid}`, lock)
      assert.equal(isUserDataInUse(userData), false)
    })
  })
})
