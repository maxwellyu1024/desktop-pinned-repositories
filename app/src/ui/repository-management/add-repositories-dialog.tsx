import * as React from 'react'
import * as Path from 'path'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { matchExistingRepository } from '../../lib/repository-matching'
import { IRepositorySource } from '../../lib/repository-sources'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Loading } from '../lib/loading'
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

interface IAddRepositoriesDialogProps {
  readonly dispatcher: Dispatcher
  readonly id: string
  readonly title: string

  /** Shown above the list. */
  readonly description: React.ReactNode

  /** Shown when no source has any repository. */
  readonly emptyMessage: string

  /** Where repositories were found, or null while still searching. */
  readonly sources: ReadonlyArray<IRepositorySource> | null

  /** Repositories already in the list, which can't be selected. */
  readonly repositories: ReadonlyArray<Repository>
  readonly onDismissed: () => void
}

interface IAddRepositoriesDialogState {
  readonly groupKey: string
  readonly filterText: string
  readonly selectedPaths: ReadonlySet<string>

  /** The default remote of each repository by path, null while reading. */
  readonly remotes: ReadonlyMap<string, IRepositoryRemote | null> | null
  readonly adding: boolean
}

const AllGroup = 'all'

/**
 * Lists repositories found somewhere and adds the selected ones.
 *
 * The groups on the left narrow the list down to one source, when there are
 * several, or to where the default remotes are hosted. Only the selected
 * repositories in the current list are added, so the add button always counts
 * what is shown. Repositories that aren't in the list yet start out selected,
 * and checkboxes keep their state between groups.
 */
export class AddRepositoriesDialog extends React.Component<
  IAddRepositoriesDialogProps,
  IAddRepositoriesDialogState
> {
  private unmounted = false

  public constructor(props: IAddRepositoriesDialogProps) {
    super(props)
    this.state = {
      groupKey: AllGroup,
      filterText: '',
      selectedPaths: this.getNewPaths(props.sources),
      remotes: null,
      adding: false,
    }
  }

  public componentDidMount() {
    if (this.props.sources !== null) {
      this.loadRemotes(this.props.sources)
    }
  }

  public componentDidUpdate(prevProps: IAddRepositoriesDialogProps) {
    if (prevProps.sources === null && this.props.sources !== null) {
      this.setState({ selectedPaths: this.getNewPaths(this.props.sources) })
      this.loadRemotes(this.props.sources)
    }
  }

  public componentWillUnmount() {
    this.unmounted = true
  }

  private async loadRemotes(sources: ReadonlyArray<IRepositorySource>) {
    const remotes = await loadRepositoryRemotes([
      ...this.getFoundIn(sources).keys(),
    ])

    if (!this.unmounted) {
      this.setState({ remotes })
    }
  }

  private isAdded(path: string) {
    return matchExistingRepository(this.props.repositories, path) !== undefined
  }

  private getNewPaths(sources: ReadonlyArray<IRepositorySource> | null) {
    const paths = (sources ?? []).flatMap(s => s.paths)
    return new Set(paths.filter(p => !this.isAdded(p)))
  }

  /** Each repository once, with the names of the sources it was found in. */
  private getFoundIn(sources: ReadonlyArray<IRepositorySource>) {
    const found = new Map<string, Array<string>>()
    for (const { name, paths } of sources) {
      for (const path of paths) {
        found.set(path, [...(found.get(path) ?? []), name])
      }
    }
    return found
  }

  private getItems(
    sources: ReadonlyArray<IRepositorySource>
  ): ReadonlyArray<IRepositoryPickerItem> {
    const found = this.getFoundIn(sources)

    return [...found].map(([path, names]) => {
      const added = this.isAdded(path)
      return {
        key: path,
        title: Path.basename(path),
        remote: formatRemote(this.state.remotes?.get(path)),
        path,
        note: added
          ? 'already added'
          : sources.length > 1
          ? names.join(', ')
          : undefined,
        disabled: added,
      }
    })
  }

  private getGroups(
    sources: ReadonlyArray<IRepositorySource>
  ): ReadonlyArray<IRepositoryGroup> {
    const paths = [...this.getFoundIn(sources).keys()]
    const all: IRepositoryGroup = {
      key: AllGroup,
      label:
        sources.length > 1 ? (__DARWIN__ ? 'All Apps' : 'All apps') : 'All',
      keys: paths,
    }

    const sourceGroups =
      sources.length > 1
        ? sources.map(
            (s, index): IRepositoryGroup => ({
              key: `source:${index}`,
              label: s.name,
              keys: s.paths,
              heading: index === 0 ? 'Found In' : undefined,
            })
          )
        : []

    return [
      all,
      ...sourceGroups,
      ...getRemoteGroups(
        paths.map(path => ({
          key: path,
          remote: this.state.remotes?.get(path),
        }))
      ),
    ]
  }

  /** The selected repositories in the current list. */
  private getPathsToAdd() {
    const sources = this.props.sources ?? []
    const { groupKey, filterText, selectedPaths } = this.state
    return getListedItems(
      this.getItems(sources),
      this.getGroups(sources),
      groupKey,
      filterText
    )
      .filter(i => selectedPaths.has(i.key))
      .map(i => i.path)
  }

  private onGroupChanged = (groupKey: string) => {
    this.setState({ groupKey })
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSelectionChanged = (selectedPaths: ReadonlySet<string>) => {
    this.setState({ selectedPaths })
  }

  private onSubmit = async () => {
    this.setState({ adding: true })
    await this.props.dispatcher.addRepositories(this.getPathsToAdd())
    this.props.onDismissed()
  }

  private renderContent() {
    const { sources, emptyMessage } = this.props

    if (sources === null) {
      return (
        <p>
          <Loading /> Searching for repositories…
        </p>
      )
    }

    if (sources.length === 0) {
      return <p>{emptyMessage}</p>
    }

    return (
      <RepositoryPicker
        items={this.getItems(sources)}
        groups={this.getGroups(sources)}
        selectedGroupKey={this.state.groupKey}
        onSelectedGroupChanged={this.onGroupChanged}
        loadingGroups={this.state.remotes === null}
        filterText={this.state.filterText}
        onFilterTextChanged={this.onFilterTextChanged}
        selectedKeys={this.state.selectedPaths}
        onSelectionChanged={this.onSelectionChanged}
      />
    )
  }

  public render() {
    const count = this.getPathsToAdd().length

    return (
      <Dialog
        id={this.props.id}
        className="repository-management-dialog repository-picker-dialog"
        title={this.props.title}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.adding}
        disabled={this.state.adding}
      >
        <DialogContent>
          <div className="repository-management-description">
            {this.props.description}
          </div>
          {this.renderContent()}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              count === 0
                ? __DARWIN__
                  ? 'Add Repositories'
                  : 'Add repositories'
                : `Add ${formatRepositoryCount(count)}`
            }
            okButtonDisabled={count === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
