import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { TrashNameLabel } from '../lib/context-menu'
import {
  formatRemote,
  formatRepositoryCount,
  getListedItems,
  getRemoteGroups,
  IRepositoryGroup,
  IRepositoryPickerItem,
  RepositoryPicker,
} from './repository-picker'
import { IRepositoryRemote, loadRepositoryRemotes } from './repository-remotes'

interface IManageRepositoriesDialogProps {
  readonly dispatcher: Dispatcher
  readonly repositories: ReadonlyArray<Repository>
  readonly onDismissed: () => void
}

interface IManageRepositoriesDialogState {
  readonly groupKey: string
  readonly filterText: string
  readonly selectedKeys: ReadonlySet<string>

  /** The default remote of each repository by path, null while reading. */
  readonly remotes: ReadonlyMap<string, IRepositoryRemote | null> | null
  readonly moveToTrash: boolean
  readonly removing: boolean
}

const keyOf = (repository: Repository) => repository.id.toString()

const AllGroup = 'all'

/**
 * Lists every repository, grouped by state and by where the default remote is
 * hosted, for removing several at once. Removing takes repositories off the
 * list, their files stay on disk unless they are moved to the Trash too.
 */
export class ManageRepositoriesDialog extends React.Component<
  IManageRepositoriesDialogProps,
  IManageRepositoriesDialogState
> {
  private unmounted = false

  public constructor(props: IManageRepositoriesDialogProps) {
    super(props)
    this.state = {
      groupKey: AllGroup,
      filterText: '',
      selectedKeys: new Set(),
      remotes: null,
      moveToTrash: false,
      removing: false,
    }
  }

  public async componentDidMount() {
    const paths = this.props.repositories
      .filter(r => !r.missing)
      .map(r => r.path)
    const remotes = await loadRepositoryRemotes(paths)

    if (!this.unmounted) {
      this.setState({ remotes })
    }
  }

  public componentWillUnmount() {
    this.unmounted = true
  }

  private get repositories() {
    return [...this.props.repositories].sort((a, b) =>
      (a.alias ?? a.name).localeCompare(b.alias ?? b.name, undefined, {
        sensitivity: 'base',
      })
    )
  }

  private getRemote(repository: Repository) {
    return repository.missing
      ? undefined
      : this.state.remotes?.get(repository.path)
  }

  private getItems(): ReadonlyArray<IRepositoryPickerItem> {
    return this.repositories.map(r => ({
      key: keyOf(r),
      title: r.alias ?? r.name,
      detail: r.alias !== null ? r.name : undefined,
      remote: formatRemote(this.getRemote(r)),
      path: r.path,
      pinned: r.isPinned,
      missing: r.missing,
    }))
  }

  private getGroups(): ReadonlyArray<IRepositoryGroup> {
    const repositories = this.repositories
    const keysOf = (filter: (r: Repository) => boolean) =>
      repositories.filter(filter).map(keyOf)

    const groups: Array<IRepositoryGroup> = [
      { key: AllGroup, label: 'All', keys: repositories.map(keyOf) },
      { key: 'missing', label: 'Missing', keys: keysOf(r => r.missing) },
      { key: 'pinned', label: 'Pinned', keys: keysOf(r => r.isPinned) },
    ]

    return [
      ...groups.filter(g => g.key === AllGroup || g.keys.length > 0),
      ...getRemoteGroups(
        repositories.map(r => ({ key: keyOf(r), remote: this.getRemote(r) }))
      ),
    ]
  }

  /** The selected repositories in the current list. */
  private getRepositoriesToRemove() {
    const { groupKey, filterText, selectedKeys } = this.state
    const listed = getListedItems(
      this.getItems(),
      this.getGroups(),
      groupKey,
      filterText
    )
    const keys = new Set(
      listed.filter(i => selectedKeys.has(i.key)).map(i => i.key)
    )
    return this.props.repositories.filter(r => keys.has(keyOf(r)))
  }

  private onGroupChanged = (groupKey: string) => {
    this.setState({ groupKey })
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSelectionChanged = (selectedKeys: ReadonlySet<string>) => {
    this.setState({ selectedKeys })
  }

  private onMoveToTrashChanged = (event: React.FormEvent<HTMLInputElement>) => {
    this.setState({ moveToTrash: event.currentTarget.checked })
  }

  private onSubmit = async () => {
    this.setState({ removing: true })
    await this.props.dispatcher.removeRepositories(
      this.getRepositoriesToRemove(),
      this.state.moveToTrash
    )
    this.setState({ removing: false, selectedKeys: new Set() })
  }

  private getRemoveButtonText(count: number) {
    if (count === 0) {
      return __DARWIN__ ? 'Remove Repositories' : 'Remove repositories'
    }

    return this.state.moveToTrash
      ? `Move ${formatRepositoryCount(count)} to ${TrashNameLabel}`
      : `Remove ${formatRepositoryCount(count)}`
  }

  private renderRemovalNote() {
    return this.state.moveToTrash ? (
      <p className="removal-note trash">
        The folders are moved to the {TrashNameLabel}, not deleted, and can be
        restored from there.
      </p>
    ) : (
      <p className="removal-note">
        Removed repositories stay on disk, only the list changes.
      </p>
    )
  }

  public render() {
    const count = this.getRepositoriesToRemove().length

    return (
      <Dialog
        id="manage-repositories"
        className="repository-management-dialog repository-picker-dialog"
        title={__DARWIN__ ? 'Manage Repositories' : 'Manage repositories'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.removing}
        disabled={this.state.removing}
      >
        <DialogContent>
          <RepositoryPicker
            items={this.getItems()}
            groups={this.getGroups()}
            selectedGroupKey={this.state.groupKey}
            onSelectedGroupChanged={this.onGroupChanged}
            loadingGroups={this.state.remotes === null}
            filterText={this.state.filterText}
            onFilterTextChanged={this.onFilterTextChanged}
            selectedKeys={this.state.selectedKeys}
            onSelectionChanged={this.onSelectionChanged}
          />
        </DialogContent>
        <DialogFooter>
          <div className="repository-picker-footer">
            <div className="removal-options">
              <Checkbox
                className={this.state.moveToTrash ? 'trash' : undefined}
                label={`Also move the folders to ${TrashNameLabel}`}
                value={
                  this.state.moveToTrash ? CheckboxValue.On : CheckboxValue.Off
                }
                onChange={this.onMoveToTrashChanged}
              />
              {this.renderRemovalNote()}
            </div>
            <OkCancelButtonGroup
              destructive={true}
              okButtonText={this.getRemoveButtonText(count)}
              okButtonDisabled={count === 0}
              cancelButtonText="Close"
            />
          </div>
        </DialogFooter>
      </Dialog>
    )
  }
}
