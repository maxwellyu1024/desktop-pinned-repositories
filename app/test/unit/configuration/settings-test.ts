import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  isExportableSetting,
  readSettings,
  validateSetting,
  writeSettings,
} from '../../../src/lib/configuration/settings'

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>()

  public get length() {
    return this.items.size
  }

  public clear() {
    this.items.clear()
  }

  public getItem(key: string) {
    return this.items.get(key) ?? null
  }

  public key(index: number) {
    return [...this.items.keys()][index] ?? null
  }

  public removeItem(key: string) {
    this.items.delete(key)
  }

  public setItem(key: string, value: string) {
    this.items.set(key, value)
  }
}

describe('settings', () => {
  it('reads whitelisted settings as native values', () => {
    const storage = new MemoryStorage()
    storage.setItem('theme', 'dark')
    storage.setItem('tab-size', '4')
    storage.setItem('confirmForcePush', '0')
    storage.setItem('showCommitLengthWarning', 'true')
    storage.setItem('custom-editor', '{"path":"/bin/vi","arguments":[]}')
    storage.setItem('stats-opt-out', '1')
    storage.setItem('last-selected-repository-id', '3')

    assert.deepEqual(readSettings(storage), {
      theme: 'dark',
      'tab-size': 4,
      confirmForcePush: false,
      showCommitLengthWarning: true,
      'custom-editor': { path: '/bin/vi', arguments: [] },
    })
  })

  it('skips values it cannot decode', () => {
    const storage = new MemoryStorage()
    storage.setItem('tab-size', 'wide')
    storage.setItem('confirmForcePush', 'maybe')
    storage.setItem('custom-editor', '{')

    assert.deepEqual(readSettings(storage), {})
  })

  it('writes settings in the format they are read in', () => {
    const storage = new MemoryStorage()
    const settings = {
      theme: 'light',
      'tab-size': 2,
      confirmForcePush: true,
      'custom-shell': { path: '/bin/zsh', arguments: ['-l'] },
    }

    writeSettings(settings, storage)

    assert.equal(storage.getItem('confirmForcePush'), '1')
    assert.equal(storage.getItem('tab-size'), '2')
    assert.deepEqual(readSettings(storage), settings)
  })

  it('validates values by kind', () => {
    assert.equal(isExportableSetting('theme'), true)
    assert.equal(isExportableSetting('toString'), false)
    assert.equal(validateSetting('tab-size', 2.5), 'must be an integer')
    assert.equal(
      validateSetting('confirmForcePush', 1),
      'must be true or false'
    )
    assert.equal(validateSetting('custom-editor', null), 'must be an object')
    assert.equal(validateSetting('theme', 'dark'), null)
  })
})
