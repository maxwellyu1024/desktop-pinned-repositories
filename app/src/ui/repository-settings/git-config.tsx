import * as React from 'react'
import { DialogContent } from '../dialog'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { IIdentity, RepositoryIdentityBinding } from '../../models/identity'
import { IIdentityPlan } from '../../lib/identity/identity-changes'
import { GitConfigUserForm } from '../lib/git-config-user-form'
import { Row } from '../lib/row'
import { RadioGroup } from '../lib/radio-group'
import { assertNever } from '../../lib/fatal-error'
import memoizeOne from 'memoize-one'
import { IdentityBindingSelect } from '../identities/identity-binding-select'
import { IdentityChangeList } from '../identities/identity-change-list'

interface IGitConfigProps {
  readonly account: Account | null
  readonly repository: Repository

  readonly gitConfigLocation: GitConfigLocation
  readonly name: string
  readonly email: string
  readonly globalName: string
  readonly globalEmail: string
  readonly isLoadingGitConfig: boolean

  readonly identities: ReadonlyArray<IIdentity>
  readonly identityBinding: RepositoryIdentityBinding

  /** What using the identity changes, undefined while loading. */
  readonly identityPlan: IIdentityPlan | null | undefined
  readonly selectedIdentityChanges: ReadonlySet<string>

  readonly onGitConfigLocationChanged: (value: GitConfigLocation) => void
  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
  readonly onIdentityBindingChanged: (
    binding: RepositoryIdentityBinding
  ) => void
  readonly onSelectedIdentityChangesChanged: (
    selected: ReadonlySet<string>
  ) => void
}

export enum GitConfigLocation {
  Global = 'Global',
  Identity = 'Identity',
  Local = 'Local',
}

/** A view for creating or modifying the repository's gitignore file */
export class GitConfig extends React.Component<IGitConfigProps> {
  // To avoid recreating the accounts array on every render
  private getAccounts = memoizeOne((account: Account | null) =>
    account ? [account] : []
  )

  private onGitConfigLocationChanged = (value: GitConfigLocation) => {
    this.props.onGitConfigLocationChanged(value)
  }
  private renderConfigOptionLabel = (key: GitConfigLocation) => {
    switch (key) {
      case GitConfigLocation.Global:
        return 'Use my global Git config'
      case GitConfigLocation.Identity:
        return 'Use an identity'
      case GitConfigLocation.Local:
        return 'Use a local Git config'
      default:
        return assertNever(key, `Unknown git config location: ${key}`)
    }
  }

  private renderIdentity() {
    const { identityPlan } = this.props

    let preview: JSX.Element
    if (identityPlan === undefined) {
      preview = <p className="identities-description">Checking…</p>
    } else if (identityPlan === null) {
      preview = (
        <p className="identities-description">
          No identity matches the remote of this repository. Choose one.
        </p>
      )
    } else if (
      identityPlan.changes.length === 0 &&
      identityPlan.warnings.length === 0
    ) {
      preview = (
        <p className="identities-description">
          This repository already uses {identityPlan.identity.label} (
          {identityPlan.identity.authorName} &lt;
          {identityPlan.identity.authorEmail}&gt;).
        </p>
      )
    } else {
      preview = (
        <>
          <p className="identities-description">
            Using {identityPlan.identity.label} changes the local Git config of
            this repository:
          </p>
          {identityPlan.warnings.map((warning, i) => (
            <p key={i} className="identity-warning">
              {warning}
            </p>
          ))}
          <IdentityChangeList
            repository={this.props.repository}
            changes={identityPlan.changes}
            selected={this.props.selectedIdentityChanges}
            onSelectionChanged={this.props.onSelectedIdentityChangesChanged}
          />
        </>
      )
    }

    return (
      <div className="repository-identity">
        <Row>
          <IdentityBindingSelect
            label="Identity"
            identities={this.props.identities}
            binding={this.props.identityBinding}
            onChange={this.props.onIdentityBindingChanged}
            allowNone={false}
          />
        </Row>
        {preview}
      </div>
    )
  }

  public render() {
    const configOptions =
      this.props.identities.length > 0
        ? [
            GitConfigLocation.Global,
            GitConfigLocation.Identity,
            GitConfigLocation.Local,
          ]
        : [GitConfigLocation.Global, GitConfigLocation.Local]
    const selectionOption =
      configOptions.find(o => o === this.props.gitConfigLocation) ??
      GitConfigLocation.Global

    return (
      <DialogContent>
        <div className="advanced-section">
          <h2 id="git-config-heading">For this repository I wish to</h2>
          <Row>
            <RadioGroup<GitConfigLocation>
              ariaLabelledBy="git-config-heading"
              selectedKey={selectionOption}
              radioButtonKeys={configOptions}
              onSelectionChanged={this.onGitConfigLocationChanged}
              renderRadioButtonLabelContents={this.renderConfigOptionLabel}
            />
          </Row>
          {selectionOption === GitConfigLocation.Identity ? (
            this.renderIdentity()
          ) : (
            <GitConfigUserForm
              email={
                selectionOption === GitConfigLocation.Global
                  ? this.props.globalEmail
                  : this.props.email
              }
              name={
                selectionOption === GitConfigLocation.Global
                  ? this.props.globalName
                  : this.props.name
              }
              accounts={this.getAccounts(this.props.account)}
              disabled={selectionOption === GitConfigLocation.Global}
              onEmailChanged={this.props.onEmailChanged}
              onNameChanged={this.props.onNameChanged}
              isLoadingGitConfig={this.props.isLoadingGitConfig}
            />
          )}
        </div>
      </DialogContent>
    )
  }
}
