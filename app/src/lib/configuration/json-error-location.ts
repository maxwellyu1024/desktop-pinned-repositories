class JsonSyntaxError {
  public constructor(public readonly offset: number) {}
}

/**
 * Find the offset of the first JSON syntax error in `text`, or null when it's
 * valid JSON. `JSON.parse` error messages don't reliably include a position,
 * so the text is scanned with a minimal recursive descent validator.
 */
export function findJsonSyntaxError(text: string): number | null {
  let i = 0

  const fail = (): never => {
    throw new JsonSyntaxError(i)
  }

  const skipWhitespace = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) {
      i++
    }
  }

  const expect = (literal: string) => {
    for (const char of literal) {
      if (text[i] !== char) {
        fail()
      }
      i++
    }
  }

  const stringValue = () => {
    expect('"')
    while (i < text.length && text[i] !== '"') {
      const char = text[i]
      if (char < ' ') {
        fail()
      }
      if (char === '\\') {
        i++
        if (text[i] === 'u') {
          i++
          for (let n = 0; n < 4; n++) {
            if (!/[0-9a-fA-F]/.test(text[i] ?? '')) {
              fail()
            }
            i++
          }
          continue
        }
        if (!'"\\/bfnrt'.includes(text[i] ?? 'x')) {
          fail()
        }
      }
      i++
    }
    expect('"')
  }

  const numberValue = () => {
    const match = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i))
    if (match === null) {
      fail()
    } else {
      i += match[0].length
    }
  }

  const list = (close: string, item: () => void) => {
    i++
    skipWhitespace()
    if (text[i] === close) {
      i++
      return
    }
    while (true) {
      item()
      skipWhitespace()
      if (text[i] === ',') {
        i++
        skipWhitespace()
      } else if (text[i] === close) {
        i++
        return
      } else {
        fail()
      }
    }
  }

  const value = (): void => {
    skipWhitespace()
    switch (text[i]) {
      case '{':
        return list('}', () => {
          stringValue()
          skipWhitespace()
          expect(':')
          value()
        })
      case '[':
        return list(']', value)
      case '"':
        return stringValue()
      case 't':
        return expect('true')
      case 'f':
        return expect('false')
      case 'n':
        return expect('null')
      default:
        return numberValue()
    }
  }

  try {
    value()
    skipWhitespace()
    if (i < text.length) {
      fail()
    }
    return null
  } catch (e) {
    if (e instanceof JsonSyntaxError) {
      return e.offset
    }
    throw e
  }
}
