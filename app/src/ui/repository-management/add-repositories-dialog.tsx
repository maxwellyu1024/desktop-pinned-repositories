import * as React from 'react'
import * as Path from 'path'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { matchExistingRepository } from '../../lib/repository-matching'
import { IRepositorySource } from '../../lib/repository-sources'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Select } from '../lib/select'
import { Loading } from '../lib/loading'
import {
  IRepositoryChecklistItem,
  RepositoryChecklist,
  formatRepositoryCount,
} from './repository-checklist'

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

/** The `sourceIndex` that lists the repositories from all sources. */
const AllSources = -1

interface IAddRepositoriesDialogState {
  /** The source being listed, or `AllSources`. */
  readonly sourceIndex: number
  readonly selectedPaths: ReadonlySet<string>
  readonly adding: boolean
}

/**
 * Lists repositories found somewhere and adds the selected ones. With several
 * sources the list shows all of them by default, or the repositories of one
 * source. Only the selected repositories in the current list are added, so the
 * add button always counts what is shown. Repositories that aren't in the list
 * yet start out selected, and checkboxes keep their state between sources.
 */
export class AddRepositoriesDialog extends React.Component<
  IAddRepositoriesDialogProps,
  IAddRepositoriesDialogState
> {
  public constructor(props: IAddRepositoriesDialogProps) {
    super(props)
    this.state = {
      sourceIndex: AllSources,
      selectedPaths: this.getNewPaths(props.sources),
      adding: false,
    }
  }

  public componentDidUpdate(prevProps: IAddRepositoriesDialogProps) {
    if (prevProps.sources === null && this.props.sources !== null) {
      this.setState({ selectedPaths: this.getNewPaths(this.props.sources) })
    }
  }

  private isAdded(path: string) {
    return matchExistingRepository(this.props.repositories, path) !== undefined
  }

  private getNewPaths(sources: ReadonlyArray<IRepositorySource> | null) {
    const paths = (sources ?? []).flatMap(s => s.paths)
    return new Set(paths.filter(p => !this.isAdded(p)))
  }

  private onSourceChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    this.setState({ sourceIndex: parseInt(event.currentTarget.value, 10) })
  }

  private onSelectionChanged = (selectedPaths: ReadonlySet<string>) => {
    this.setState({ selectedPaths })
  }

  private onSubmit = async () => {
    this.setState({ adding: true })
    await this.props.dispatcher.addRepositories(this.getPathsToAdd())
    this.props.onDismissed()
  }

  /** The source being listed, undefined when listing all sources. */
  private getListedSource(sources: ReadonlyArray<IRepositorySource>) {
    return this.state.sourceIndex === AllSources
      ? undefined
      : sources[this.state.sourceIndex]
  }

  /** The repositories in the current list. */
  private getListedPaths(): ReadonlyArray<string> {
    const sources = this.props.sources ?? []
    const source = this.getListedSource(sources)
    return source === undefined
      ? [...this.getAllPaths(sources).keys()]
      : source.paths
  }

  /** The selected repositories in the current list. */
  private getPathsToAdd() {
    return this.getListedPaths().filter(p => this.state.selectedPaths.has(p))
  }

  /** Each repository once, with the names of the sources it was found in. */
  private getAllPaths(sources: ReadonlyArray<IRepositorySource>) {
    const found = new Map<string, Array<string>>()
    for (const { name, paths } of sources) {
      for (const path of paths) {
        const names = found.get(path)
        if (names === undefined) {
          found.set(path, [name])
        } else {
          names.push(name)
        }
      }
    }
    return found
  }

  private renderSources(sources: ReadonlyArray<IRepositorySource>) {
    const all = this.getAllPaths(sources)
    const showAll = this.getListedSource(sources) === undefined

    const items = this.getListedPaths().map(
      (path): IRepositoryChecklistItem => {
        const added = this.isAdded(path)
        const foundIn =
          showAll && sources.length > 1 ? all.get(path)?.join(', ') : undefined
        return {
          key: path,
          title: Path.basename(path),
          path,
          note: added ? 'already added' : foundIn,
          disabled: added,
        }
      }
    )

    return (
      <>
        {sources.length > 1 && (
          <Select
            label="Found in"
            value={this.state.sourceIndex.toString()}
            onChange={this.onSourceChanged}
          >
            <option value={AllSources}>
              {__DARWIN__ ? 'All Apps' : 'All apps'} ({all.size})
            </option>
            {sources.map((s, index) => (
              <option key={s.name} value={index}>
                {s.name} ({s.paths.length})
              </option>
            ))}
          </Select>
        )}
        <RepositoryChecklist
          items={items}
          selectedKeys={this.state.selectedPaths}
          onSelectionChanged={this.onSelectionChanged}
        />
      </>
    )
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

    return sources.length === 0 ? (
      <p>{emptyMessage}</p>
    ) : (
      this.renderSources(sources)
    )
  }

  public render() {
    const count = this.getPathsToAdd().length

    return (
      <Dialog
        id={this.props.id}
        className="repository-management-dialog"
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
            okButtonText={`Add ${formatRepositoryCount(count)}`}
            okButtonDisabled={count === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
