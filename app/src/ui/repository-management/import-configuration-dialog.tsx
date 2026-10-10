import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { nameOf, Repository } from '../../models/repository'
import { IConfiguration } from '../../lib/configuration/configuration-file'
import {
  buildImportPlan,
  IImportPlan,
  ImportMode,
  IResolvedRepositoryEntry,
} from '../../lib/configuration/import-plan'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { RadioGroup } from '../lib/radio-group'
import { PathText } from '../lib/path-text'
import { formatRepositoryCount } from './repository-checklist'

interface IImportConfigurationDialogProps {
  readonly dispatcher: Dispatcher

  /** The configuration file being imported. */
  readonly path: string
  readonly configuration: IConfiguration
  readonly resolved: ReadonlyArray<IResolvedRepositoryEntry>
  readonly repositories: ReadonlyArray<Repository>
  readonly onDismissed: () => void
}

interface IImportConfigurationDialogState {
  readonly mode: ImportMode
  readonly importing: boolean
}

const Modes: ReadonlyArray<ImportMode> = ['merge', 'replace']

/** Previews what importing a configuration file changes and applies it. */
export class ImportConfigurationDialog extends React.Component<
  IImportConfigurationDialogProps,
  IImportConfigurationDialogState
> {
  public constructor(props: IImportConfigurationDialogProps) {
    super(props)
    this.state = { mode: 'merge', importing: false }
  }

  private get plan(): IImportPlan {
    const { configuration, resolved, repositories } = this.props
    return buildImportPlan(
      configuration,
      resolved,
      repositories,
      this.state.mode
    )
  }

  private onModeChanged = (mode: ImportMode) => {
    this.setState({ mode })
  }

  private renderModeLabel = (mode: ImportMode) =>
    mode === 'merge' ? (
      <>
        <strong>Merge</strong> — add and update the repositories in the file,
        keep the others
      </>
    ) : (
      <>
        <strong>Match the file</strong> — also remove repositories that aren't
        in the file
      </>
    )

  private onSubmit = async () => {
    this.setState({ importing: true })
    await this.props.dispatcher.importConfiguration(this.plan)
    this.props.onDismissed()
  }

  private renderSection(
    title: string,
    paths: ReadonlyArray<{ readonly key: string; readonly label: string }>
  ) {
    if (paths.length === 0) {
      return null
    }

    return (
      <details className="import-section">
        <summary>
          {title}: {formatRepositoryCount(paths.length)}
        </summary>
        <ul>
          {paths.map(p => (
            <li key={p.key}>
              <PathText path={p.label} />
            </li>
          ))}
        </ul>
      </details>
    )
  }

  public render() {
    const plan = this.plan
    const settingsCount = Object.keys(plan.settings).length
    const hasChanges =
      plan.toAdd.length +
        plan.toUpdate.length +
        plan.toRemove.length +
        settingsCount >
      0
    const byPath = (paths: ReadonlyArray<string>) =>
      paths.map(path => ({ key: path, label: path }))
    const byRepository = (repositories: ReadonlyArray<Repository>) =>
      repositories.map(r => ({
        key: r.id.toString(),
        label: `${r.path} (${r.alias ?? nameOf(r)})`,
      }))

    return (
      <Dialog
        id="import-configuration"
        className="repository-management-dialog"
        title={__DARWIN__ ? 'Import Configuration' : 'Import configuration'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.importing}
        disabled={this.state.importing}
      >
        <DialogContent>
          <div className="repository-management-description">
            <PathText path={this.props.path} />
          </div>

          {this.props.configuration.repositories !== undefined && (
            <RadioGroup<ImportMode>
              selectedKey={this.state.mode}
              radioButtonKeys={Modes}
              onSelectionChanged={this.onModeChanged}
              renderRadioButtonLabelContents={this.renderModeLabel}
            />
          )}

          <div className="import-summary">
            {this.renderSection('Add', byPath(plan.toAdd))}
            {this.renderSection(
              'Update alias or pinned position',
              byRepository(plan.toUpdate)
            )}
            {this.renderSection(
              'Remove from the list (files stay on disk)',
              byRepository(plan.toRemove)
            )}
            {this.renderSection(
              'Skip, not found or not a Git repository',
              byPath(plan.skipped)
            )}
            {settingsCount > 0 && (
              <p>
                {settingsCount} setting{settingsCount === 1 ? '' : 's'} will be
                applied, then the window reloads.
              </p>
            )}
            {!hasChanges && <p>Nothing to change.</p>}
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Import"
            okButtonDisabled={!hasChanges}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
