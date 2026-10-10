import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { IIdentity } from '../../models/identity'
import {
  IIdentitySuggestion,
  inferIdentities,
} from '../../lib/identity/infer-identities'
import { getGlobalConfigValue } from '../../lib/git/config'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { formatRules } from '../../lib/identity/identity-rules'

interface ISuggestIdentitiesDialogProps {
  readonly dispatcher: Dispatcher
  readonly repositories: ReadonlyArray<Repository>
  readonly identities: ReadonlyArray<IIdentity>
  readonly onDismissed: () => void
}

interface ISuggestIdentitiesDialogState {
  /** Null while the repositories are being read. */
  readonly suggestions: ReadonlyArray<IIdentitySuggestion> | null
  readonly selected: ReadonlySet<number>
  readonly saving: boolean
}

interface ISuggestionRowProps {
  readonly suggestion: IIdentitySuggestion
  readonly index: number
  readonly checked: boolean
  readonly onToggle: (index: number, checked: boolean) => void
}

class SuggestionRow extends React.Component<ISuggestionRowProps> {
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onToggle(this.props.index, event.currentTarget.checked)
  }

  public render() {
    const { identity, repositoryCount } = this.props.suggestion
    const label = (
      <span className="identity-suggestion">
        <span className="identity-suggestion-title">
          {identity.label}
          <span className="identity-suggestion-count">
            {repositoryCount}{' '}
            {repositoryCount === 1 ? 'repository' : 'repositories'}
          </span>
        </span>
        <span className="identity-suggestion-detail">
          {identity.authorName} &lt;{identity.authorEmail}&gt;
          {identity.sshHostAlias !== undefined &&
            ` · SSH host ${identity.sshHostAlias}`}
        </span>
        <span className="identity-suggestion-detail">
          {formatRules(identity.rules).split('\n').join(', ')}
        </span>
      </span>
    )

    return (
      <li>
        <Checkbox
          value={this.props.checked ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onChange}
          label={label}
        />
      </li>
    )
  }
}

/**
 * Suggests identities from how the repositories that don't use one yet are
 * set up, and adds the selected ones.
 */
export class SuggestIdentitiesDialog extends React.Component<
  ISuggestIdentitiesDialogProps,
  ISuggestIdentitiesDialogState
> {
  public constructor(props: ISuggestIdentitiesDialogProps) {
    super(props)
    this.state = { suggestions: null, selected: new Set(), saving: false }
  }

  public async componentDidMount() {
    const { dispatcher, identities } = this.props
    // 明确设为不用身份的仓库不参与推荐
    const repositories = this.props.repositories.filter(
      r => r.identity.kind !== 'none'
    )
    const [states, name, email] = await Promise.all([
      dispatcher.loadRepositoryIdentityStates(repositories, identities),
      getGlobalConfigValue('user.name'),
      getGlobalConfigValue('user.email'),
    ])

    const suggestions = inferIdentities(
      [...states.values()],
      { name, email },
      identities
    )
    this.setState({
      suggestions,
      selected: new Set(suggestions.map((_, i) => i)),
    })
  }

  private onToggle = (index: number, checked: boolean) => {
    const selected = new Set(this.state.selected)
    if (checked) {
      selected.add(index)
    } else {
      selected.delete(index)
    }
    this.setState({ selected })
  }

  private onSubmit = async () => {
    const added = (this.state.suggestions ?? [])
      .filter((_, i) => this.state.selected.has(i))
      .map(s => ({ ...s.identity, id: crypto.randomUUID() }))

    this.setState({ saving: true })
    await this.props.dispatcher.saveIdentities([
      ...this.props.identities,
      ...added,
    ])
    this.props.onDismissed()
  }

  private renderContent() {
    const { suggestions } = this.state
    if (suggestions === null) {
      return (
        <p className="identities-description">Reading your repositories…</p>
      )
    }

    if (suggestions.length === 0) {
      return (
        <p className="identities-description">
          Every repository with a remote already uses an identity, or there is
          no author configured to suggest one from.
        </p>
      )
    }

    return (
      <>
        <p className="identities-description">
          These identities are based on the remotes, authors and SSH hosts your
          repositories use now. You can edit them after adding them.
        </p>
        <ul className="identity-suggestions">
          {suggestions.map((suggestion, i) => (
            <SuggestionRow
              key={i}
              suggestion={suggestion}
              index={i}
              checked={this.state.selected.has(i)}
              onToggle={this.onToggle}
            />
          ))}
        </ul>
      </>
    )
  }

  public render() {
    const count = this.state.selected.size

    return (
      <Dialog
        id="suggest-identities"
        className="identities-dialog"
        title={
          __DARWIN__
            ? 'Suggest Identities from Repositories'
            : 'Suggest identities from repositories'
        }
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.suggestions === null || this.state.saving}
        disabled={this.state.saving}
      >
        <DialogContent>{this.renderContent()}</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              count === 0
                ? __DARWIN__
                  ? 'Add Identities'
                  : 'Add identities'
                : `Add ${count} ${__DARWIN__ ? 'Identit' : 'identit'}${
                    count === 1 ? 'y' : 'ies'
                  }`
            }
            okButtonDisabled={count === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
