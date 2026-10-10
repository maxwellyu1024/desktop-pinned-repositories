import { IIdentity, IIdentityRule } from '../../models/identity'
import { IRepositoryIdentityState } from './repository-identity'
import { getRemoteAlias, matchIdentity } from './match-identity'

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

/** The most frequent value, ties going to the one seen first. */
function mostFrequent(counts: ReadonlyMap<string, number>) {
  let best: string | null = null
  for (const [value, count] of counts) {
    if (best === null || count > (counts.get(best) ?? 0)) {
      best = value
    }
  }
  return best
}

function increment(counts: Map<string, number>, value: string) {
  counts.set(value, (counts.get(value) ?? 0) + 1)
}

interface IRepositoryGroup {
  readonly host: string
  readonly alias: string | undefined
  /** Local `user.email` values, case preserved as first seen. */
  readonly emails: Map<string, number>
  /** Local `user.name` values by lowercased local email. */
  readonly names: Map<string, Map<string, number>>
  readonly namespaces: Set<string>
  count: number
}

/**
 * Suggest identities for repositories that don't use one yet, from how they
 * are set up deliberately rather than by the global config:
 *
 * - Repositories whose remote uses an SSH host alias are grouped by real host
 *   and alias. The author is the one most often set in their local config,
 *   the global author when none sets one, so repositories that differ from
 *   the rest show up as not set up once the identity is added.
 * - Other repositories are grouped by real host and local `user.email`, and
 *   only when it differs from the global one. Repositories relying on the
 *   global config alone need no identity.
 *
 * Each group becomes an identity with one rule per top-level namespace.
 */
export function inferIdentities(
  states: ReadonlyArray<IRepositoryIdentityState>,
  globalAuthor: IGlobalAuthor,
  existing: ReadonlyArray<IIdentity>
): ReadonlyArray<IIdentitySuggestion> {
  const globalEmail = globalAuthor.email?.toLowerCase() ?? null
  const groups = new Map<string, IRepositoryGroup>()

  for (const state of states) {
    if (state.plan !== null || state.remote === null) {
      continue
    }

    const { host, fullPath } = state.remote
    const segments = fullPath.split('/')
    if (segments.length < 2) {
      continue
    }

    const alias = getRemoteAlias(state.remote) ?? undefined
    const email = state.localEmail

    if (
      alias === undefined &&
      (email === null || email.toLowerCase() === globalEmail)
    ) {
      continue
    }

    const key = [
      host.toLowerCase(),
      alias ?? '',
      alias === undefined ? email?.toLowerCase() ?? '' : '',
    ].join('\n')
    let group = groups.get(key)
    if (group === undefined) {
      group = {
        host,
        alias,
        emails: new Map(),
        names: new Map(),
        namespaces: new Set(),
        count: 0,
      }
      groups.set(key, group)
    }

    group.count++
    group.namespaces.add(segments[0])
    if (email !== null) {
      const known = [...group.emails.keys()].find(
        e => e.toLowerCase() === email.toLowerCase()
      )
      increment(group.emails, known ?? email)

      if (state.localName !== null) {
        const names = group.names.get(email.toLowerCase()) ?? new Map()
        increment(names, state.localName)
        group.names.set(email.toLowerCase(), names)
      }
    }
  }

  const labels = new Set(existing.map(i => i.label.toLowerCase()))
  const suggestions = new Array<IIdentitySuggestion>()

  for (const group of groups.values()) {
    const authorEmail = mostFrequent(group.emails) ?? globalAuthor.email
    if (authorEmail === null) {
      continue
    }

    const localName = mostFrequent(
      group.names.get(authorEmail.toLowerCase()) ?? new Map()
    )
    const authorName =
      localName ??
      (authorEmail.toLowerCase() === globalEmail ? globalAuthor.name : null) ??
      ''

    const namespaces = [...group.namespaces].sort((a, b) => a.localeCompare(b))
    const rules: ReadonlyArray<IIdentityRule> = namespaces.map(namespace => ({
      host: group.host,
      namespace,
    }))

    const base =
      group.alias ?? (namespaces.length === 1 ? namespaces[0] : authorEmail)
    let label = base
    for (let n = 2; labels.has(label.toLowerCase()); n++) {
      label = `${base} ${n}`
    }
    labels.add(label.toLowerCase())

    suggestions.push({
      identity: {
        label,
        authorName,
        authorEmail,
        sshHostAlias: group.alias,
        rules,
      },
      repositoryCount: group.count,
    })
  }

  return suggestions.sort((a, b) => b.repositoryCount - a.repositoryCount)
}

/** A repository that doesn't use an identity yet, by name. */
export interface INamedIdentityState {
  readonly name: string
  readonly state: IRepositoryIdentityState
}

/** What adding a suggested identity does to the repositories it matches. */
export interface ISuggestionEffects {
  /** How many repositories would use it. */
  readonly repositoryCount: number

  /** How many have no local author yet, which is written without asking. */
  readonly fillCount: number

  /**
   * The repositories whose local author differs from it, or whose SSH remote
   * doesn't use its SSH host. They show up as not set up once it's added.
   */
  readonly conflicts: ReadonlyArray<string>
}

const equalsIgnoringCase = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase()

function conflictsWith(
  identity: Omit<IIdentity, 'id'>,
  state: IRepositoryIdentityState
) {
  const { localEmail, localName, remote } = state
  const alias = identity.sshHostAlias
  return (
    (localEmail !== null &&
      !equalsIgnoringCase(localEmail, identity.authorEmail)) ||
    (localName !== null && localName !== identity.authorName) ||
    (alias !== undefined &&
      remote?.sshHost != null &&
      !equalsIgnoringCase(remote.sshHost, alias))
  )
}

/**
 * Work out, for each suggestion, which repositories that don't use an
 * identity yet would use it alongside the existing identities and the other
 * selected suggestions, and how their config compares to it.
 */
export function getSuggestionEffects(
  repositories: ReadonlyArray<INamedIdentityState>,
  existing: ReadonlyArray<IIdentity>,
  suggestions: ReadonlyArray<Omit<IIdentity, 'id'>>,
  selected: ReadonlySet<number>
): ReadonlyArray<ISuggestionEffects> {
  const idOf = (index: number) => `\0suggestion:${index}`

  return suggestions.map((suggestion, index) => {
    const identities = [
      ...existing,
      ...suggestions
        .map((s, i) => ({ ...s, id: idOf(i) }))
        .filter((_, i) => i === index || selected.has(i)),
    ]

    let repositoryCount = 0
    let fillCount = 0
    const conflicts = new Array<string>()

    for (const { name, state } of repositories) {
      if (state.plan !== null || state.remote === null) {
        continue
      }
      if (matchIdentity(identities, state.remote)?.id !== idOf(index)) {
        continue
      }

      repositoryCount++
      if (conflictsWith(suggestion, state)) {
        conflicts.push(name)
      } else if (state.localEmail === null || state.localName === null) {
        fillCount++
      }
    }

    return { repositoryCount, fillCount, conflicts }
  })
}
