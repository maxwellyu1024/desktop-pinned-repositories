import * as React from 'react'

import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { InputWarning } from '../lib/input-description/input-warning'

interface IChangeRepositoryAliasProps {
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void

  /** The repositories to give the same alias, at least one. */
  readonly repositories: ReadonlyArray<Repository>
}

interface IChangeRepositoryAliasState {
  readonly newAlias: string
}

/** How many repositories with another alias to name. */
const ShownReplaced = 3

/** The alias to start with: the shared one, else a single repository's name. */
function getInitialAlias(repositories: ReadonlyArray<Repository>) {
  const aliases = new Set(repositories.map(r => r.alias))
  const [alias] = aliases
  if (aliases.size === 1 && alias !== null && alias !== undefined) {
    return alias
  }
  return repositories.length === 1 ? repositories[0].name : ''
}

export class ChangeRepositoryAlias extends React.Component<
  IChangeRepositoryAliasProps,
  IChangeRepositoryAliasState
> {
  public constructor(props: IChangeRepositoryAliasProps) {
    super(props)

    this.state = { newAlias: getInitialAlias(props.repositories) }
  }

  private renderDescription() {
    const { repositories } = this.props
    return repositories.length === 1 ? (
      <p id="change-repository-alias-description">
        Choose a new alias for the repository "{nameOf(repositories[0])}".
      </p>
    ) : (
      <p id="change-repository-alias-description">
        Choose an alias for the {repositories.length} selected repositories.
      </p>
    )
  }

  private renderWarnings() {
    const { repositories } = this.props
    const alias = this.state.newAlias.trim()
    if (repositories.length < 2) {
      return null
    }

    const replaced = repositories.filter(
      r => r.alias !== null && r.alias !== alias
    )
    const shown = replaced
      .slice(0, ShownReplaced)
      .map(r => r.alias)
      .join(', ')
    const more = replaced.length - ShownReplaced

    return (
      <InputWarning
        id="change-repository-alias-warning"
        trackedUserInput={this.state.newAlias}
        ariaLiveMessage={`All ${repositories.length} repositories will be listed with the same name.`}
      >
        <p>
          All {repositories.length} repositories will be listed with the same
          name, told apart only by their paths.
          {replaced.length > 0 &&
            ` ${replaced.length} already ${
              replaced.length === 1 ? 'has an alias' : 'have aliases'
            } that will be replaced: ${shown}${
              more > 0 ? ` and ${more} more` : ''
            }.`}
        </p>
      </InputWarning>
    )
  }

  public render() {
    const { repositories } = this.props
    const verb =
      repositories.length === 1 && repositories[0].alias === null
        ? 'Create'
        : 'Change'
    const title =
      repositories.length === 1
        ? __DARWIN__
          ? `${verb} Repository Alias`
          : `${verb} repository alias`
        : __DARWIN__
        ? `Set Alias for ${repositories.length} Repositories`
        : `Set alias for ${repositories.length} repositories`

    return (
      <Dialog
        id="change-repository-alias"
        title={title}
        ariaDescribedBy="change-repository-alias-description"
        onDismissed={this.props.onDismissed}
        onSubmit={this.changeAlias}
      >
        <DialogContent>
          {this.renderDescription()}
          <p>
            <TextBox
              ariaLabel="Alias"
              value={this.state.newAlias}
              onValueChanged={this.onNameChanged}
              ariaDescribedBy="change-repository-alias-warning"
            />
          </p>
          {this.renderWarnings()}
          {repositories.some(r => r.gitHubRepository !== null) && (
            <p className="description">
              {repositories.length === 1
                ? 'This will not affect the original repository name on GitHub.'
                : 'This will not affect the original repository names on GitHub.'}
            </p>
          )}
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? `${verb} Alias` : `${verb} alias`}
            okButtonDisabled={this.state.newAlias.trim().length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onNameChanged = (newAlias: string) => {
    this.setState({ newAlias })
  }

  private changeAlias = () => {
    this.props.dispatcher.changeRepositoriesAlias(
      this.props.repositories,
      this.state.newAlias.trim()
    )
    this.props.onDismissed()
  }
}
