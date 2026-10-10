import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { IIdentity } from '../../models/identity'
import { PopupType } from '../../models/popup'
import { IRepositoryIdentityState } from '../../lib/identity/repository-identity'
import { hasIdentityMismatch } from '../../lib/identity/repository-identity-tracker'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { formatRules } from '../../lib/identity/identity-rules'

interface IIdentitiesProps {
  readonly dispatcher: Dispatcher
  readonly identities: ReadonlyArray<IIdentity>
  readonly repositoryIdentityStates: ReadonlyMap<
    number,
    IRepositoryIdentityState
  >
}

interface IIdentitiesState {
  /** The identity whose removal awaits confirmation. */
  readonly confirmingRemoval: string | null
}

interface IIdentityRowProps {
  readonly identity: IIdentity
  readonly index: number
  readonly count: number
  readonly repositoryCount: number
  readonly mismatchCount: number
  readonly confirmingRemoval: boolean
  readonly onEdit: (identity: IIdentity) => void
  readonly onRemove: (identity: IIdentity) => void
  readonly onConfirmRemoval: (identity: IIdentity | null) => void
  readonly onMove: (index: number, offset: number) => void
}

class IdentityRow extends React.Component<IIdentityRowProps> {
  private onEdit = () => this.props.onEdit(this.props.identity)
  private onRemove = () => this.props.onConfirmRemoval(this.props.identity)
  private onConfirmRemove = () => this.props.onRemove(this.props.identity)
  private onCancelRemove = () => this.props.onConfirmRemoval(null)
  private onMoveUp = () => this.props.onMove(this.props.index, -1)
  private onMoveDown = () => this.props.onMove(this.props.index, 1)

  private renderActions() {
    if (this.props.confirmingRemoval) {
      return (
        <div className="identity-actions">
          <span className="identity-remove-prompt">Remove this identity?</span>
          <Button size="small" onClick={this.onConfirmRemove}>
            Remove
          </Button>
          <Button size="small" onClick={this.onCancelRemove}>
            Cancel
          </Button>
        </div>
      )
    }

    const { index, count } = this.props
    return (
      <div className="identity-actions">
        <Button
          size="small"
          onClick={this.onMoveUp}
          disabled={index === 0}
          ariaLabel="Move up"
          tooltip="Move up"
        >
          <Octicon symbol={octicons.arrowUp} />
        </Button>
        <Button
          size="small"
          onClick={this.onMoveDown}
          disabled={index === count - 1}
          ariaLabel="Move down"
          tooltip="Move down"
        >
          <Octicon symbol={octicons.arrowDown} />
        </Button>
        <Button size="small" onClick={this.onEdit}>
          Edit…
        </Button>
        <Button size="small" onClick={this.onRemove}>
          Remove
        </Button>
      </div>
    )
  }

  public render() {
    const { identity, repositoryCount, mismatchCount } = this.props
    const matches = [
      ...(identity.sshHostAlias !== undefined
        ? [`remotes using ${identity.sshHostAlias}`]
        : []),
      ...identity.rules.map(rule => formatRules([rule])),
    ].join(', ')

    return (
      <li className="identity-row">
        <div className="identity-details">
          <div className="identity-title">{identity.label}</div>
          <div className="identity-detail">
            {identity.authorName} &lt;{identity.authorEmail}&gt;
            {identity.signing !== undefined && ' · signs commits'}
            {identity.sshHostAlias !== undefined &&
              ` · SSH host ${identity.sshHostAlias}`}
          </div>
          <div className="identity-detail">
            {matches.length > 0
              ? `Used for ${matches}`
              : 'Only repositories it is chosen for'}
          </div>
          <div className="identity-detail">
            Used by {repositoryCount}{' '}
            {repositoryCount === 1 ? 'repository' : 'repositories'}
            {mismatchCount > 0 && (
              <span className="identity-mismatch">
                {' '}
                · {mismatchCount} not set up
              </span>
            )}
          </div>
        </div>
        {this.renderActions()}
      </li>
    )
  }
}

/**
 * Lists the identities. Unlike the other settings, changes are saved right
 * away since they may lead to reviewing changes to repositories.
 */
export class Identities extends React.Component<
  IIdentitiesProps,
  IIdentitiesState
> {
  public constructor(props: IIdentitiesProps) {
    super(props)
    this.state = { confirmingRemoval: null }
  }

  private onAdd = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.EditIdentity,
      identity: null,
    })
  }

  private onSuggest = () => {
    this.props.dispatcher.showPopup({ type: PopupType.SuggestIdentities })
  }

  private onEdit = (identity: IIdentity) => {
    this.props.dispatcher.showPopup({ type: PopupType.EditIdentity, identity })
  }

  private onConfirmRemoval = (identity: IIdentity | null) => {
    this.setState({ confirmingRemoval: identity?.id ?? null })
  }

  private onRemove = (identity: IIdentity) => {
    this.setState({ confirmingRemoval: null })
    this.props.dispatcher.saveIdentities(
      this.props.identities.filter(i => i.id !== identity.id)
    )
  }

  private onMove = (index: number, offset: number) => {
    const identities = [...this.props.identities]
    const [moved] = identities.splice(index, 1)
    identities.splice(index + offset, 0, moved)
    // The order breaks ties between rules, so it may change which identity
    // repositories use.
    this.props.dispatcher.saveIdentities(identities)
  }

  private getCounts() {
    const counts = new Map<string, { used: number; mismatched: number }>()
    for (const state of this.props.repositoryIdentityStates.values()) {
      if (state.plan === null) {
        continue
      }
      const id = state.plan.identity.id
      const count = counts.get(id) ?? { used: 0, mismatched: 0 }
      counts.set(id, {
        used: count.used + 1,
        mismatched: count.mismatched + (hasIdentityMismatch(state) ? 1 : 0),
      })
    }
    return counts
  }

  public render() {
    const { identities } = this.props
    const counts = this.getCounts()

    return (
      <DialogContent>
        <div className="advanced-section identities-preferences">
          <h2>Identities</h2>
          <p className="settings-description">
            An identity is the author, commit signing and SSH host to use in
            repositories on a host, user, organization or group. Applying one
            only changes a repository's local Git config. Changes here are saved
            right away.
          </p>
          {identities.length === 0 ? (
            <p className="settings-description">No identities yet.</p>
          ) : (
            <ul className="identity-list">
              {identities.map((identity, index) => (
                <IdentityRow
                  key={identity.id}
                  identity={identity}
                  index={index}
                  count={identities.length}
                  repositoryCount={counts.get(identity.id)?.used ?? 0}
                  mismatchCount={counts.get(identity.id)?.mismatched ?? 0}
                  confirmingRemoval={
                    this.state.confirmingRemoval === identity.id
                  }
                  onEdit={this.onEdit}
                  onRemove={this.onRemove}
                  onConfirmRemoval={this.onConfirmRemoval}
                  onMove={this.onMove}
                />
              ))}
            </ul>
          )}
          <div className="identity-list-actions">
            <Button onClick={this.onAdd}>
              {__DARWIN__ ? 'Add Identity…' : 'Add identity…'}
            </Button>
            <Button onClick={this.onSuggest}>
              {__DARWIN__
                ? 'Suggest from Repositories…'
                : 'Suggest from repositories…'}
            </Button>
          </div>
        </div>
      </DialogContent>
    )
  }
}
