import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { IRepositorySource } from '../../lib/repository-sources'
import { AddRepositoriesDialog } from './add-repositories-dialog'

interface IAddRepositoriesFromAppsDialogProps {
  readonly dispatcher: Dispatcher
  readonly repositories: ReadonlyArray<Repository>
  readonly onDismissed: () => void
}

interface IAddRepositoriesFromAppsDialogState {
  readonly sources: ReadonlyArray<IRepositorySource> | null
}

/** Offers the repositories known to GitHub Desktop and installed editors. */
export class AddRepositoriesFromAppsDialog extends React.Component<
  IAddRepositoriesFromAppsDialogProps,
  IAddRepositoriesFromAppsDialogState
> {
  private unmounted = false

  public constructor(props: IAddRepositoriesFromAppsDialogProps) {
    super(props)
    this.state = { sources: null }
  }

  public async componentDidMount() {
    const sources = await this.props.dispatcher
      .findRepositorySources()
      .catch(e => {
        log.error('Could not find repositories in other apps', e)
        return []
      })

    if (!this.unmounted) {
      this.setState({ sources })
    }
  }

  public componentWillUnmount() {
    this.unmounted = true
  }

  public render() {
    return (
      <AddRepositoriesDialog
        dispatcher={this.props.dispatcher}
        id="add-repositories-from-apps"
        title={
          __DARWIN__
            ? 'Add Repositories from Other Apps'
            : 'Add repositories from other apps'
        }
        description={
          <p>
            Git repositories from GitHub Desktop and the recent projects of code
            editors on this computer: Visual Studio Code, Cursor, Windsurf,
            VSCodium, JetBrains IDEs, Zed and Sublime Text.
          </p>
        }
        emptyMessage="No Git repositories were found in GitHub Desktop or the code editors on this computer."
        sources={this.state.sources}
        repositories={this.props.repositories}
        onDismissed={this.props.onDismissed}
      />
    )
  }
}
