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
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IIdentity } from '../../models/identity'
import { PopupType } from '../../models/popup'
import { IRepositoryIdentityState } from '../../lib/identity/repository-identity'
import { hasIdentityMismatch } from '../../lib/identity/repository-identity-tracker'
import { showContextualMenu } from '../../lib/menu-item'
import { buildIdentityMenuItems } from '../identities/identity-menu'

interface IManageRepositoriesDialogProps {
  readonly dispatcher: Dispatcher
  readonly repositories: ReadonlyArray<Repository>
  readonly identities: ReadonlyArray<IIdentity>
  readonly repositoryIdentityStates: ReadonlyMap<
    number,
    IRepositoryIdentityState
  >

  /** The group to show first, the list of all repositories if not given. */
  readonly initialGroupKey?: string

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
  readonly pinning: boolean
}

const keyOf = (repository: Repository) => repository.id.toString()

const AllGroup = 'all'

/** The group of repositories whose config differs from the identity. */
export const getIdentityMismatchGroupKey = (identityId: string) =>
  `identity-mismatch:${identityId}`

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
      groupKey: props.initialGroupKey ?? AllGroup,
      filterText: '',
      selectedKeys: new Set(),
      remotes: null,
      moveToTrash: false,
      removing: false,
      pinning: false,
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

  /** The identity the repository uses, and whether its config differs. */
  private getIdentityNote(repository: Repository) {
    const state = this.props.repositoryIdentityStates.get(repository.id)
    if (state?.plan == null) {
      return undefined
    }
    return hasIdentityMismatch(state)
      ? `${state.plan.identity.label}, not set up`
      : state.plan.identity.label
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
      note: this.getIdentityNote(r),
    }))
  }

  /**
   * Groups by identity: one per identity, followed by its repositories whose
   * config differs from it, the repositories that use none, and all the ones
   * whose config differs from their identity.
   */
  private getIdentityGroups(
    repositories: ReadonlyArray<Repository>
  ): ReadonlyArray<IRepositoryGroup> {
    const states = this.props.repositoryIdentityStates
    if (this.props.identities.length === 0) {
      return []
    }

    const keysOf = (filter: (state: IRepositoryIdentityState) => boolean) =>
      repositories
        .filter(r => {
          const state = states.get(r.id)
          return state !== undefined && filter(state)
        })
        .map(keyOf)

    const groups: ReadonlyArray<IRepositoryGroup> = [
      ...this.props.identities.flatMap(identity => [
        {
          key: `identity:${identity.id}`,
          label: identity.label,
          keys: keysOf(s => s.plan?.identity.id === identity.id),
        },
        {
          key: getIdentityMismatchGroupKey(identity.id),
          label: `${identity.label}, not set up`,
          keys: keysOf(
            s => s.plan?.identity.id === identity.id && hasIdentityMismatch(s)
          ),
        },
      ]),
      {
        key: 'identity-none',
        label: __DARWIN__ ? 'No Identity' : 'No identity',
        keys: keysOf(s => s.plan === null),
      },
      {
        key: 'identity-mismatch',
        label: __DARWIN__ ? 'Not Set Up' : 'Not set up',
        keys: keysOf(hasIdentityMismatch),
      },
    ]

    return groups
      .filter(g => g.keys.length > 0)
      .map((g, i) => (i === 0 ? { ...g, heading: 'Identities' } : g))
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
      ...this.getIdentityGroups(repositories),
      ...getRemoteGroups(
        repositories.map(r => ({ key: keyOf(r), remote: this.getRemote(r) }))
      ),
    ]
  }

  /** The selected repositories in the current list. */
  private getSelectedRepositories() {
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
      this.getSelectedRepositories(),
      this.state.moveToTrash
    )
    this.setState({ removing: false, selectedKeys: new Set() })
  }

  private async setPinned(isPinned: boolean) {
    this.setState({ pinning: true })
    await this.props.dispatcher.changeRepositoriesPinned(
      this.getSelectedRepositories(),
      isPinned
    )
    this.setState({ pinning: false })
  }

  private onPin = () => this.setPinned(true)
  private onUnpin = () => this.setPinned(false)

  private onShowAliasMenu = () => {
    const repositories = this.getSelectedRepositories()
    const { dispatcher } = this.props
    showContextualMenu([
      {
        label: __DARWIN__ ? 'Set Alias…' : 'Set alias…',
        action: () =>
          dispatcher.showPopup({
            type: PopupType.ChangeRepositoryAlias,
            repositories,
          }),
      },
      {
        label: __DARWIN__ ? 'Remove Alias' : 'Remove alias',
        enabled: repositories.some(r => r.alias !== null),
        action: () => dispatcher.changeRepositoriesAlias(repositories, null),
      },
    ])
  }

  private onShowIdentityMenu = () => {
    const repositories = this.getSelectedRepositories().filter(r => !r.missing)
    const { dispatcher } = this.props
    showContextualMenu(
      buildIdentityMenuItems({
        repositories,
        identities: this.props.identities,
        states: this.props.repositoryIdentityStates,
        onSwitch: binding =>
          dispatcher.switchRepositoriesIdentity(repositories, binding),
        onApply: () => dispatcher.applyRepositoriesIdentity(repositories),
      })
    )
  }

  private renderBulkActions(selected: ReadonlyArray<Repository>) {
    const busy = this.state.pinning || this.state.removing
    return (
      <div className="bulk-actions">
        <Button
          size="small"
          onClick={this.onPin}
          disabled={busy || !selected.some(r => !r.isPinned)}
        >
          Pin
        </Button>
        <Button
          size="small"
          onClick={this.onUnpin}
          disabled={busy || !selected.some(r => r.isPinned)}
        >
          Unpin
        </Button>
        <Button
          size="small"
          onClick={this.onShowAliasMenu}
          disabled={busy || selected.length === 0}
        >
          Alias <Octicon symbol={octicons.triangleDown} />
        </Button>
        {this.props.identities.length > 0 && (
          <Button
            size="small"
            onClick={this.onShowIdentityMenu}
            disabled={busy || selected.every(r => r.missing)}
          >
            Identity <Octicon symbol={octicons.triangleDown} />
          </Button>
        )}
      </div>
    )
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
    const selected = this.getSelectedRepositories()
    const count = selected.length

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
            {this.renderBulkActions(selected)}
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
