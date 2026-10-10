import assert from 'node:assert'
import { describe, it } from 'node:test'
import { findJsonSyntaxError } from '../../../src/lib/configuration/json-error-location'

describe('findJsonSyntaxError', () => {
  it('accepts valid JSON', () => {
    const valid = [
      '{}',
      '[]',
      ' { "a": [1, -2.5e3, true, false, null, "x\\n\\u00e9\\"" ], "b": {} } ',
      '"text"',
      '0',
    ]
    for (const text of valid) {
      JSON.parse(text)
      assert.equal(findJsonSyntaxError(text), null, text)
    }
  })

  it('finds the offset of the first error', () => {
    const cases: ReadonlyArray<[string, number]> = [
      ['{ "a": 1, }', 10],
      ['[1 2]', 3],
      ['{ a: 1 }', 2],
      ['{ "a" 1 }', 6],
      ['[01]', 2],
      ['"\\x"', 2],
      ['tru', 3],
      ['{} []', 3],
      ['', 0],
      ['{ "a": "line\nbreak" }', 12],
    ]
    for (const [text, offset] of cases) {
      assert.throws(() => JSON.parse(text))
      assert.equal(findJsonSyntaxError(text), offset, text)
    }
  })
})
