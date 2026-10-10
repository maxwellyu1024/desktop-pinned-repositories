import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Repository } from '../../../src/models/repository'
import {
  ConfigurationFileError,
  fromPortablePath,
  parseConfiguration,
  serializeConfiguration,
  toPortablePath,
} from '../../../src/lib/configuration/configuration-file'

const home = '/Users/me'

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

const parseError = (text: string) => {
  try {
    parseConfiguration(text, home)
  } catch (e) {
    assert.ok(e instanceof ConfigurationFileError)
    return e.message
  }
  assert.fail('expected the configuration to be rejected')
}

describe('configuration file', { skip: process.platform === 'win32' }, () => {
  describe('portable paths', () => {
    it('shortens paths in the home directory', () => {
      assert.equal(toPortablePath('/Users/me/dev/a', home), '~/dev/a')
      assert.equal(toPortablePath('/Users/me', home), '~')
      assert.equal(toPortablePath('/Users/meow/a', home), '/Users/meow/a')
      assert.equal(toPortablePath('/opt/a', home), '/opt/a')
    })

    it('expands a leading tilde', () => {
      assert.equal(fromPortablePath('~/dev/a', home), '/Users/me/dev/a')
      assert.equal(fromPortablePath('~', home), home)
      assert.equal(fromPortablePath('/opt/~a', home), '/opt/~a')
    })
  })

  describe('serializeConfiguration', () => {
    it('lists pinned repositories first, then the rest by name', () => {
      const text = serializeConfiguration(
        [
          repository(1, '/Users/me/dev/zeta'),
          repository(2, '/Users/me/dev/pinned-second', null, 5),
          repository(3, '/opt/Alpha', 'Alpha'),
          repository(4, '/Users/me/dev/pinned-first', 'First', 2),
        ],
        { theme: 'dark', 'tab-size': 4 },
        home
      )

      assert.equal(
        text,
        [
          '{',
          '  "version": 1,',
          '  "repositories": [',
          '    { "path": "~/dev/pinned-first", "alias": "First", "pinned": true },',
          '    { "path": "~/dev/pinned-second", "pinned": true },',
          '    { "path": "/opt/Alpha", "alias": "Alpha" },',
          '    { "path": "~/dev/zeta" }',
          '  ],',
          '  "settings": {',
          '    "theme": "dark",',
          '    "tab-size": 4',
          '  }',
          '}',
          '',
        ].join('\n')
      )
    })

    it('writes empty sections compactly and round trips', () => {
      const text = serializeConfiguration([], {}, home)
      assert.equal(
        text,
        '{\n  "version": 1,\n  "repositories": [],\n  "settings": {}\n}\n'
      )
      assert.deepEqual(parseConfiguration(text, home), {
        repositories: [],
        settings: {},
      })
    })
  })

  describe('parseConfiguration', () => {
    it('expands paths and fills in defaults', () => {
      const configuration = parseConfiguration(
        JSON.stringify({
          version: 1,
          repositories: [
            { path: '~/dev/a/', alias: '  A  ', pinned: true },
            { path: '/opt/b', alias: '   ' },
            { path: '/opt/c', alias: null, pinned: false },
          ],
        }),
        home
      )

      assert.deepEqual(configuration, {
        repositories: [
          { path: '/Users/me/dev/a/', alias: 'A', pinned: true },
          { path: '/opt/b', alias: null, pinned: false },
          { path: '/opt/c', alias: null, pinned: false },
        ],
        settings: undefined,
      })
    })

    it('allows either section to be left out', () => {
      assert.deepEqual(
        parseConfiguration(
          '{ "version": 1, "settings": { "theme": "light" } }',
          home
        ),
        { repositories: undefined, settings: { theme: 'light' } }
      )
    })

    it('reports where JSON syntax errors are', () => {
      const message = parseError('{\n  "version": 1,\n  "repositories": [,]\n}')
      assert.equal(message, 'The file is not valid JSON (line 3, column 20).')
    })

    it('accepts a byte order mark', () => {
      assert.deepEqual(parseConfiguration('\uFEFF{ "version": 1 }', home), {
        repositories: undefined,
        settings: undefined,
      })
    })

    it('rejects unsupported versions and keys', () => {
      assert.equal(parseError('{ "version": 2 }'), '"version" must be 1.')
      assert.equal(
        parseError('{ "version": 1, "colors": {} }'),
        '"colors" is not supported.'
      )
      assert.equal(parseError('[]'), 'The file must contain a JSON object.')
    })

    it('names the invalid repository field', () => {
      assert.equal(
        parseError(
          '{ "version": 1, "repositories": [{ "path": "/a", "alias": 3 }] }'
        ),
        'repositories[0].alias must be a string or null.'
      )
      assert.equal(
        parseError(
          '{ "version": 1, "repositories": [{ "path": "/a", "pinned": "yes" }] }'
        ),
        'repositories[0].pinned must be true or false.'
      )
      assert.equal(
        parseError(
          '{ "version": 1, "repositories": [{ "path": "/a", "name": "a" }] }'
        ),
        'repositories[0].name is not supported. Use "path", "alias" or "pinned".'
      )
      assert.equal(
        parseError('{ "version": 1, "repositories": [{ "path": "dev/a" }] }'),
        'repositories[0].path must be an absolute path or start with ~.'
      )
      assert.equal(
        parseError('{ "version": 1, "repositories": [{ "path": "" }] }'),
        'repositories[0].path must be a non-empty string.'
      )
    })

    it('rejects duplicate paths after expanding them', () => {
      assert.equal(
        parseError(
          '{ "version": 1, "repositories": [{ "path": "/Users/me/a" }, { "path": "~/a" }] }'
        ),
        'repositories[1].path is the same as repositories[0].path.'
      )
    })

    it('validates settings against the whitelist', () => {
      assert.equal(
        parseError('{ "version": 1, "settings": { "theme": 1 } }'),
        'settings.theme must be a string.'
      )
      assert.equal(
        parseError('{ "version": 1, "settings": { "stats-opt-out": true } }'),
        'settings.stats-opt-out is not a supported setting.'
      )
    })
  })
})
