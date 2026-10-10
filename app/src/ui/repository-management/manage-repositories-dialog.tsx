import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import {
  formatRepositoryCount,
  IRepositoryChecklistItem,
  RepositoryChecklist,
} from './repository-checklist'

interface IManageRepositoriesDialogProps {
  readonly dispatcher: Dispatcher
  readonly repositories: ReadonlyArray<Repository>
  readonly onDismissed: () => void
}

interface IManageRepositoriesDialogState {
  readonly filter: string
  readonly selectedKeys: ReadonlySet<string>
  readonly removing: boolean
}

const keyOf = (repository: Repository) => repository.id.toString()

/**
 * Lists every repository for removing several at once. Removing only takes
 * repositories off the list, the files stay on disk.
 */
export class ManageRepositoriesDialog extends React.Component<
  IManageRepositoriesDialogProps,
  IManageRepositoriesDialogState
> {
  public constructor(props: IManageRepositoriesDialogProps) {
    super(props)
    this.state = { filter: '', selectedKeys: new Set(), removing: false }
  }

  private get filteredRepositories() {
    const filter = this.state.filter.trim().toLocaleLowerCase()
    const repositories = [...this.props.repositories].sort((a, b) =>
      (a.alias ?? a.name).localeCompare(b.alias ?? b.name, undefined, {
        sensitivity: 'base',
      })
    )

    if (filter.length === 0) {
      return repositories
    }

    return repositories.filter(r =>
      [r.alias ?? '', nameOf(r), r.path].some(text =>
        text.toLocaleLowerCase().includes(filter)
      )
    )
  }

  /** The selected repositories that still exist. */
  private get selectedRepositories() {
    return this.props.repositories.filter(r =>
      this.state.selectedKeys.has(keyOf(r))
    )
  }

  private onFilterChanged = (filter: string) => {
    this.setState({ filter })
  }

  private onSelectionChanged = (selectedKeys: ReadonlySet<string>) => {
    this.setState({ selectedKeys })
  }

  private onSubmit = async () => {
    this.setState({ removing: true })
    await this.props.dispatcher.removeRepositories(this.selectedRepositories)
    this.setState({ removing: false, selectedKeys: new Set() })
  }

  public render() {
    const filtered = this.filteredRepositories
    const count = this.selectedRepositories.length

    const items: ReadonlyArray<IRepositoryChecklistItem> = filtered.map(r => ({
      key: keyOf(r),
      title: r.alias ?? nameOf(r),
      path: r.path,
      note: r.missing ? 'missing' : undefined,
    }))

    const missingKeys = filtered.filter(r => r.missing).map(keyOf)

    return (
      <Dialog
        id="manage-repositories"
        className="repository-management-dialog"
        title={__DARWIN__ ? 'Manage Repositories' : 'Manage repositories'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.removing}
        disabled={this.state.removing}
      >
        <DialogContent>
          <p className="repository-management-description">
            Removing repositories only takes them off the list, their files stay
            on disk.
          </p>
          <TextBox
            type="search"
            placeholder="Filter by name, alias or path"
            ariaLabel="Filter repositories"
            autoFocus={true}
            value={this.state.filter}
            onValueChanged={this.onFilterChanged}
          />
          <RepositoryChecklist
            items={items}
            selectedKeys={this.state.selectedKeys}
            onSelectionChanged={this.onSelectionChanged}
            extraActions={[
              {
                label: `Select missing (${missingKeys.length})`,
                keys: missingKeys,
              },
            ]}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={`Remove ${formatRepositoryCount(count)}`}
            okButtonDisabled={count === 0}
            cancelButtonText="Close"
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
