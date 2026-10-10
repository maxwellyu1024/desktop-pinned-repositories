import { IIdentityRule } from '../../models/identity'

/** Format rules one per line as `host` or `host/namespace`. */
export function formatRules(rules: ReadonlyArray<IIdentityRule>) {
  return rules
    .map(r => (r.namespace === undefined ? r.host : `${r.host}/${r.namespace}`))
    .join('\n')
}

/** Parse rules written one per line as `host` or `host/namespace`. */
export function parseRules(text: string): ReadonlyArray<IIdentityRule> {
  return text
    .split('\n')
    .map(line =>
      line
        .trim()
        .replace(/^[a-z]+:\/\//i, '')
        .replace(/\/+$/, '')
    )
    .filter(line => line.length > 0)
    .map(line => {
      const [host, ...namespace] = line.split('/').filter(s => s.length > 0)
      return namespace.length === 0
        ? { host }
        : { host, namespace: namespace.join('/') }
    })
}
