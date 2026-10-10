import { IIdentity, RepositoryIdentityBinding } from '../../models/identity'
import { isInNamespace } from './remote-location'

/** A repository's default remote, with SSH host aliases resolved. */
export interface IResolvedRemote {
  /** The real host. */
  readonly host: string
  readonly fullPath: string
}

/**
 * The identity whose rules match the remote best: rules on the same host win
 * by the number of namespace segments they match, a rule without a namespace
 * matching zero. Ties go to the earlier identity, then the earlier rule.
 */
export function matchIdentity(
  identities: ReadonlyArray<IIdentity>,
  remote: IResolvedRemote
): IIdentity | null {
  let best: IIdentity | null = null
  let bestScore = -1

  for (const identity of identities) {
    for (const rule of identity.rules) {
      if (rule.host.toLowerCase() !== remote.host.toLowerCase()) {
        continue
      }

      const namespace = rule.namespace ?? ''
      const score = namespace.split('/').filter(s => s.length > 0).length
      if (score > bestScore && isInNamespace(remote.fullPath, namespace)) {
        best = identity
        bestScore = score
      }
    }
  }

  return best
}

/** The identity a repository uses, or null when it doesn't use one. */
export function resolveIdentity(
  binding: RepositoryIdentityBinding,
  identities: ReadonlyArray<IIdentity>,
  remote: IResolvedRemote | null
): IIdentity | null {
  switch (binding.kind) {
    case 'none':
      return null
    case 'identity':
      return identities.find(i => i.id === binding.id) ?? null
    case 'automatic':
      return remote === null ? null : matchIdentity(identities, remote)
  }
}
