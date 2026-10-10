import { IIdentity, IIdentityRule } from '../../models/identity'
import { IRepositoryIdentityState } from './repository-identity'

/** An identity suggested from how existing repositories are set up. */
export interface IIdentitySuggestion {
  readonly identity: Omit<IIdentity, 'id'>
  /** How many repositories it would apply to. */
  readonly repositoryCount: number
}

/** The author used where a repository has no local `user.*` config. */
export interface IGlobalAuthor {
  readonly name: string | null
  readonly email: string | null
}

/**
 * Suggest identities for repositories that don't use one yet, grouping them
 * by real host, author email and SSH host alias. Each group becomes an
 * identity with one rule per top-level namespace.
 */
export function inferIdentities(
  states: ReadonlyArray<IRepositoryIdentityState>,
  globalAuthor: IGlobalAuthor,
  existing: ReadonlyArray<IIdentity>
): ReadonlyArray<IIdentitySuggestion> {
  const groups = new Map<
    string,
    {
      host: string
      email: string
      alias: string | undefined
      names: Map<string, number>
      namespaces: Set<string>
      count: number
    }
  >()

  for (const state of states) {
    const email = state.localEmail ?? globalAuthor.email
    const name = state.localName ?? globalAuthor.name
    if (state.plan !== null || state.remote === null || email === null) {
      continue
    }

    const { host, fullPath } = state.remote
    const segments = fullPath.split('/')
    if (segments.length < 2) {
      continue
    }

    const alias =
      state.sshHost !== null &&
      state.sshHost.toLowerCase() !== host.toLowerCase()
        ? state.sshHost
        : undefined

    const key = [host.toLowerCase(), email.toLowerCase(), alias ?? ''].join(
      '\n'
    )
    let group = groups.get(key)
    if (group === undefined) {
      group = {
        host,
        email,
        alias,
        names: new Map(),
        namespaces: new Set(),
        count: 0,
      }
      groups.set(key, group)
    }

    group.count++
    group.namespaces.add(segments[0])
    if (name !== null) {
      group.names.set(name, (group.names.get(name) ?? 0) + 1)
    }
  }

  const labels = new Set(existing.map(i => i.label.toLowerCase()))
  const suggestions = new Array<IIdentitySuggestion>()

  for (const group of groups.values()) {
    const namespaces = [...group.namespaces].sort((a, b) => a.localeCompare(b))
    const authorName =
      [...group.names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    const rules: ReadonlyArray<IIdentityRule> = namespaces.map(namespace => ({
      host: group.host,
      namespace,
    }))

    let label = group.alias ?? namespaces[0]
    for (let n = 2; labels.has(label.toLowerCase()); n++) {
      label = `${group.alias ?? namespaces[0]} ${n}`
    }
    labels.add(label.toLowerCase())

    suggestions.push({
      identity: {
        label,
        authorName,
        authorEmail: group.email,
        sshHostAlias: group.alias,
        rules,
      },
      repositoryCount: group.count,
    })
  }

  return suggestions.sort((a, b) => b.repositoryCount - a.repositoryCount)
}
