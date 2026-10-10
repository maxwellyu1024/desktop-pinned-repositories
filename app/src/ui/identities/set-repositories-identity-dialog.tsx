import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import {
  AutomaticIdentityBinding,
  bindingsEqual,
  IIdentity,
  RepositoryIdentityBinding,
} from '../../models/identity'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Row } from '../lib/row'
import { IdentityBindingSelect } from './identity-binding-select'

interface ISetRepositoriesIdentityDialogProps {
  readonly dispatcher: Dispatcher
  readonly repositories: ReadonlyArray<Repository>
  readonly identities: ReadonlyArray<IIdentity>
  readonly onDismissed: () => void
}

interface ISetRepositoriesIdentityDialogState {
  readonly binding: RepositoryIdentityBinding
  readonly saving: boolean
}

/** Chooses the identity of one or more repositories. */
export class SetRepositoriesIdentityDialog extends React.Component<
  ISetRepositoriesIdentityDialogProps,
  ISetRepositoriesIdentityDialogState
> {
  public constructor(props: ISetRepositoriesIdentityDialogProps) {
    super(props)

    const [first, ...rest] = props.repositories
    const shared =
      first !== undefined &&
      rest.every(r => bindingsEqual(r.identity, first.identity))
        ? first.identity
        : AutomaticIdentityBinding

    this.state = { binding: shared, saving: false }
  }

  private onBindingChanged = (binding: RepositoryIdentityBinding) => {
    this.setState({ binding })
  }

  private onSubmit = async () => {
    this.setState({ saving: true })
    await this.props.dispatcher.setRepositoriesIdentity(
      this.props.repositories,
      this.state.binding
    )
    this.props.onDismissed()
  }

  public render() {
    const { repositories } = this.props
    const subject =
      repositories.length === 1
        ? repositories[0].alias ?? nameOf(repositories[0])
        : `${repositories.length} repositories`

    return (
      <Dialog
        id="set-repositories-identity"
        className="identities-dialog"
        title={__DARWIN__ ? 'Set Identity' : 'Set identity'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.saving}
        disabled={this.state.saving}
      >
        <DialogContent>
          <Row>
            <IdentityBindingSelect
              label={`Identity of ${subject}`}
              identities={this.props.identities}
              binding={this.state.binding}
              onChange={this.onBindingChanged}
            />
          </Row>
          <p className="identities-description">
            {this.state.binding.kind === 'none'
              ? 'The local Git config of these repositories is left as it is.'
              : 'You can review the changes to the local Git config next.'}
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Save" />
        </DialogFooter>
      </Dialog>
    )
  }
}
