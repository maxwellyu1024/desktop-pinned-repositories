import { IMenuItem } from '../../lib/menu-item'
import { Repository } from '../../models/repository'
import {
  AutomaticIdentityBinding,
  bindingsEqual,
  IIdentity,
  RepositoryIdentityBinding,
} from '../../models/identity'
import { IRepositoryIdentityState } from '../../lib/identity/repository-identity'
import { matchIdentity } from '../../lib/identity/match-identity'
import { hasIdentityMismatch } from '../../lib/identity/repository-identity-tracker'

interface IIdentityMenuOptions {
  readonly repositories: ReadonlyArray<Repository>
  readonly identities: ReadonlyArray<IIdentity>
  readonly states: ReadonlyMap<number, IRepositoryIdentityState>

  /** Choose how the repositories pick their identity and apply it. */
  readonly onSwitch: (binding: RepositoryIdentityBinding) => void

  /** Apply the identities the repositories use now. */
  readonly onApply: () => void
}

/** The binding all the repositories share, if they do. */
function getSharedBinding(repositories: ReadonlyArray<Repository>) {
  const [first, ...rest] = repositories
  return first !== undefined &&
    rest.every(r => bindingsEqual(r.identity, first.identity))
    ? first.identity
    : null
}

/** The one label for the identities the given ones resolve to, if shared. */
function getSharedLabel(identities: ReadonlyArray<IIdentity | null>) {
  const labels = new Set(identities.map(i => i?.label ?? null))
  if (labels.size !== 1) {
    return undefined
  }
  const [label] = labels
  return label
}

/**
 * The items for choosing the identity of one or more repositories. Choosing
 * applies it right away, see `Dispatcher.switchRepositoriesIdentity`.
 */
export function buildIdentityMenuItems(
  options: IIdentityMenuOptions
): ReadonlyArray<IMenuItem> {
  const { repositories, identities, states, onSwitch, onApply } = options
  const shared = getSharedBinding(repositories)
  const isShared = (binding: RepositoryIdentityBinding) =>
    shared !== null && bindingsEqual(shared, binding)

  const automatic = getSharedLabel(
    repositories.map(r => {
      const remote = states.get(r.id)?.remote ?? null
      return remote === null ? null : matchIdentity(identities, remote)
    })
  )
  const automaticLabel =
    automatic === undefined
      ? 'Automatic'
      : `Automatic (${automatic ?? (__DARWIN__ ? 'None' : 'none')})`

  const items: Array<IMenuItem> = [
    {
      label: automaticLabel,
      type: 'checkbox',
      checked: isShared(AutomaticIdentityBinding),
      action: () => onSwitch(AutomaticIdentityBinding),
    },
    { type: 'separator' },
    ...identities.map(
      (identity): IMenuItem => ({
        label: identity.label,
        type: 'checkbox',
        checked: isShared({ kind: 'identity', id: identity.id }),
        action: () => onSwitch({ kind: 'identity', id: identity.id }),
      })
    ),
    { type: 'separator' },
    {
      label: __DARWIN__ ? 'No Identity' : 'No identity',
      type: 'checkbox',
      checked: isShared({ kind: 'none' }),
      action: () => onSwitch({ kind: 'none' }),
    },
  ]

  const mismatched = repositories.filter(r =>
    hasIdentityMismatch(states.get(r.id))
  )
  if (mismatched.length > 0) {
    const label = getSharedLabel(
      mismatched.map(r => states.get(r.id)?.plan?.identity ?? null)
    )
    items.push(
      { type: 'separator' },
      {
        label:
          label != null
            ? `Apply ${label}`
            : __DARWIN__
            ? 'Apply Identities'
            : 'Apply identities',
        action: onApply,
      }
    )
  }

  return items
}
