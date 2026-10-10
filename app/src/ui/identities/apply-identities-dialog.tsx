import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import {
  IIdentityChange,
  IIdentityPlan,
  isSelectedByDefault,
} from '../../lib/identity/identity-changes'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { IdentityChangeList, getChangeKey } from './identity-change-list'
import { PathText } from '../lib/path-text'

interface IApplyIdentitiesDialogProps {
  readonly dispatcher: Dispatcher
  readonly entries: ReadonlyArray<{
    readonly repository: Repository
    readonly plan: IIdentityPlan
  }>

  /**
   * Whether the user chose the identities for these repositories. See
   * `isSelectedByDefault` for which changes are selected.
   */
  readonly explicit: boolean

  readonly onDismissed: () => void

  /** Called once the dialog is closed, whether or not changes were applied. */
  readonly onFinished?: () => void
}

interface IApplyIdentitiesDialogState {
  /** Keys of the selected changes, see `getChangeKey`. */
  readonly selected: ReadonlySet<string>
  readonly applying: boolean
}

/**
 * Lists the local Git config changes that make repositories use their
 * identities and writes the selected ones.
 */
export class ApplyIdentitiesDialog extends React.Component<
  IApplyIdentitiesDialogProps,
  IApplyIdentitiesDialogState
> {
  public constructor(props: IApplyIdentitiesDialogProps) {
    super(props)

    const selected = new Set<string>()
    for (const { repository, plan } of props.entries) {
      for (const change of plan.changes) {
        if (isSelectedByDefault(change, plan, props.explicit)) {
          selected.add(getChangeKey(repository, change))
        }
      }
    }

    this.state = { selected, applying: false }
  }

  private onDismissed = () => {
    this.props.onDismissed()
    this.props.onFinished?.()
  }

  private onSelectionChanged = (selected: ReadonlySet<string>) => {
    this.setState({ selected })
  }

  private onSubmit = async () => {
    const { selected } = this.state
    const entries = this.props.entries.flatMap(({ repository, plan }) => {
      const changes = plan.changes.filter(c =>
        selected.has(getChangeKey(repository, c))
      )
      return changes.length === 0
        ? []
        : [{ repository, identity: plan.identity, changes }]
    })

    this.setState({ applying: true })
    await this.props.dispatcher.applyIdentityChanges(entries)
    this.onDismissed()
  }

  private renderEntry = ({
    repository,
    plan,
  }: {
    readonly repository: Repository
    readonly plan: IIdentityPlan
  }) => {
    const changes: ReadonlyArray<IIdentityChange> = plan.changes
    return (
      <section key={repository.id} className="identity-entry">
        <h3>
          {repository.alias ?? nameOf(repository)}
          <span className="identity-label">{plan.identity.label}</span>
        </h3>
        <div className="identity-entry-path">
          <PathText path={repository.path} />
        </div>
        {plan.warnings.map((warning, i) => (
          <p key={i} className="identity-warning">
            {warning}
          </p>
        ))}
        <IdentityChangeList
          repository={repository}
          changes={changes}
          selected={this.state.selected}
          onSelectionChanged={this.onSelectionChanged}
        />
      </section>
    )
  }

  public render() {
    const count = this.state.selected.size
    const title = __DARWIN__ ? 'Apply Identities' : 'Apply identities'

    return (
      <Dialog
        id="apply-identities"
        className="identities-dialog"
        title={title}
        onDismissed={this.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.applying}
        disabled={this.state.applying}
      >
        <DialogContent>
          <p className="identities-description">
            {this.props.explicit
              ? 'These changes are written to the local Git config (.git/config) of each repository.'
              : 'These repositories match an identity. Select the changes to write to their local Git config (.git/config). Values set other than by the identity are only replaced if you select them.'}
          </p>
          <div className="identity-entries">
            {this.props.entries.map(this.renderEntry)}
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              count === 0
                ? __DARWIN__
                  ? 'Apply Changes'
                  : 'Apply changes'
                : `Apply ${count} ${__DARWIN__ ? 'Change' : 'change'}${
                    count === 1 ? '' : 's'
                  }`
            }
            okButtonDisabled={count === 0}
            cancelButtonText={this.props.explicit ? 'Cancel' : 'Skip'}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
