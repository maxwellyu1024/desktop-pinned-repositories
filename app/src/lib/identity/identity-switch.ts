import { IIdentity, RepositoryIdentityBinding } from '../../models/identity'
import { getRequiredChanges, IdentityMarkerKey } from './identity-changes'
import { IConfigValue, IRepositoryIdentityState } from './repository-identity'

/** What switching a repository to its identity writes, and how to undo it. */
export interface IIdentitySwitchWrite {
  /** The identity the repository uses afterwards, null for none. */
  readonly identity: IIdentity | null
  readonly values: ReadonlyArray<IConfigValue>
  /** The values before, to write back on undo. */
  readonly restore: ReadonlyArray<IConfigValue>
  /** Why something the identity asks for can't be applied. */
  readonly warnings: ReadonlyArray<string>
}

/** How to put a repository back the way it was before a switch. */
export interface IIdentitySwitchUndo {
  readonly repositoryId: number
  readonly binding: RepositoryIdentityBinding
  readonly restore: ReadonlyArray<IConfigValue>
}

/**
 * Work out what makes a repository use the identity its state resolved to:
 * every required change, replacing values that are set since the user chose
 * it, but not switching HTTPS remotes to SSH. Without an identity only the
 * marker of an earlier one is removed.
 */
export function getIdentitySwitchWrite(
  state: IRepositoryIdentityState
): IIdentitySwitchWrite {
  const values = new Array<IConfigValue>()
  const restore = new Array<IConfigValue>()
  const set = (key: string, current: string | null, next: string | null) => {
    if (current !== next) {
      values.push({ key, value: next })
      restore.push({ key, value: current })
    }
  }

  const { plan, marker } = state
  if (plan === null) {
    set(IdentityMarkerKey, marker, null)
    return { identity: null, values, restore, warnings: [] }
  }

  for (const change of getRequiredChanges(plan)) {
    set(change.key, change.current, change.next)
  }
  set(IdentityMarkerKey, marker, plan.identity.id)

  return { identity: plan.identity, values, restore, warnings: plan.warnings }
}

/**
 * The banner message after switching repositories' identity.
 *
 * @param subject     The repository's name, or how many there are.
 * @param plural      Whether `subject` is several repositories.
 * @param binding     The binding chosen, null when applying the current ones.
 * @param identities  The identity each repository uses now.
 * @param warnings    How many remotes were left unchanged.
 */
export function describeIdentitySwitch(
  subject: string,
  plural: boolean,
  binding: RepositoryIdentityBinding | null,
  identities: ReadonlyArray<IIdentity | null>,
  warnings: number
) {
  const labels = new Set(identities.map(i => i?.label ?? null))
  const [label] = labels

  let message
  if (binding?.kind === 'none') {
    message = `${subject} no longer ${plural ? 'use' : 'uses'} an identity.`
  } else if (labels.size > 1) {
    message = `${subject} now use their identities.`
  } else if (label == null) {
    message = `${subject} ${plural ? 'match' : 'matches'} no identity.`
  } else {
    message = `${subject} now ${plural ? 'use' : 'uses'} ${label}.`
  }

  if (warnings > 0) {
    message += ` ${warnings} ${
      warnings === 1 ? 'remote was' : 'remotes were'
    } left unchanged, see the repository settings.`
  }
  return message
}
