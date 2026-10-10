import * as React from 'react'
import { Repository } from '../../models/repository'
import { IIdentity, RepositoryIdentityBinding } from '../../models/identity'
import { IRepositoryIdentityState } from '../../lib/identity/repository-identity'
import { hasIdentityMismatch } from '../../lib/identity/repository-identity-tracker'
import { showContextualMenu } from '../../lib/menu-item'
import { buildIdentityMenuItems } from '../identities/identity-menu'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

/** The identity of the repository being committed to, and how to change it. */
export interface ICommitIdentity {
  readonly identities: ReadonlyArray<IIdentity>
  /** Null while it's being read. */
  readonly state: IRepositoryIdentityState | null
  readonly onSwitch: (binding: RepositoryIdentityBinding) => void
  readonly onApply: () => void
}

interface ICommitIdentityButtonProps extends ICommitIdentity {
  readonly repository: Repository
  readonly disabled: boolean
}

/**
 * Shows which identity commits are made with, warning when the repository's
 * config differs from it, and offers the identity menu to change it.
 */
export class CommitIdentityButton extends React.Component<ICommitIdentityButtonProps> {
  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const { repository, identities, state, onSwitch, onApply } = this.props
    showContextualMenu(
      buildIdentityMenuItems({
        repositories: [repository],
        identities,
        states: state === null ? new Map() : new Map([[repository.id, state]]),
        onSwitch,
        onApply,
      })
    )
  }

  public render() {
    const { identities, state, disabled } = this.props
    if (identities.length === 0 || state === null) {
      return null
    }

    const label = state.plan?.identity.label ?? null
    const mismatch = hasIdentityMismatch(state)
    const tooltip =
      label === null
        ? 'Not using an identity'
        : mismatch
        ? `Identity ${label}, not set up in this repository`
        : `Identity ${label}`

    return (
      <Button
        className="commit-identity-button"
        onClick={this.onClick}
        ariaLabel={tooltip}
        tooltip={tooltip}
        disabled={disabled}
      >
        {mismatch ? (
          <Octicon
            className="commit-identity-warning"
            symbol={octicons.alert}
          />
        ) : (
          <Octicon symbol={octicons.person} />
        )}
        <span className="commit-identity-label">
          {label ?? (__DARWIN__ ? 'No Identity' : 'No identity')}
        </span>
      </Button>
    )
  }
}
