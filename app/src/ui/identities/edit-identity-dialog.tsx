import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { IIdentity, SigningFormat, SigningFormats } from '../../models/identity'
import { IRepositoryIdentityState } from '../../lib/identity/repository-identity'
import { matchIdentity } from '../../lib/identity/match-identity'
import { formatRules, parseRules } from '../../lib/identity/identity-rules'
import { readSSHConfigHosts } from '../../lib/ssh/ssh-config-hosts'
import {
  Dialog,
  DialogContent,
  DialogError,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { TextBox } from '../lib/text-box'
import { TextArea } from '../lib/text-area'
import { Select } from '../lib/select'
import { Row } from '../lib/row'

interface IEditIdentityDialogProps {
  readonly dispatcher: Dispatcher

  /** The identity to edit, null to create one. */
  readonly identity: IIdentity | null
  readonly identities: ReadonlyArray<IIdentity>

  /** Used to show how many repositories the rules match. */
  readonly repositoryIdentityStates: ReadonlyMap<
    number,
    IRepositoryIdentityState
  >

  readonly onDismissed: () => void
}

interface IEditIdentityDialogState {
  readonly label: string
  readonly authorName: string
  readonly authorEmail: string
  readonly signingFormat: SigningFormat | ''
  readonly signingKey: string
  readonly sshHostAlias: string
  readonly rules: string
  readonly sshHosts: ReadonlyArray<string>
  readonly saving: boolean
}

const SigningFormatLabels: Record<SigningFormat, string> = {
  openpgp: 'OpenPGP (GPG)',
  ssh: 'SSH',
  x509: 'X.509 (S/MIME)',
}

/** Creates or edits an identity. */
export class EditIdentityDialog extends React.Component<
  IEditIdentityDialogProps,
  IEditIdentityDialogState
> {
  public constructor(props: IEditIdentityDialogProps) {
    super(props)

    const identity = props.identity
    this.state = {
      label: identity?.label ?? '',
      authorName: identity?.authorName ?? '',
      authorEmail: identity?.authorEmail ?? '',
      signingFormat: identity?.signing?.format ?? '',
      signingKey: identity?.signing?.key ?? '',
      sshHostAlias: identity?.sshHostAlias ?? '',
      rules: formatRules(identity?.rules ?? []),
      sshHosts: [],
      saving: false,
    }
  }

  public async componentDidMount() {
    const sshHosts = await readSSHConfigHosts()
    this.setState({ sshHosts })
  }

  private onLabelChanged = (label: string) => this.setState({ label })
  private onAuthorNameChanged = (authorName: string) =>
    this.setState({ authorName })
  private onAuthorEmailChanged = (authorEmail: string) =>
    this.setState({ authorEmail })
  private onSigningKeyChanged = (signingKey: string) =>
    this.setState({ signingKey })
  private onRulesChanged = (rules: string) => this.setState({ rules })

  private onSigningFormatChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    this.setState({
      signingFormat: SigningFormats.find(f => f === value) ?? '',
    })
  }

  private onSSHHostAliasChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    this.setState({ sshHostAlias: event.currentTarget.value })
  }

  private buildIdentity(): IIdentity {
    const { state } = this
    const signingKey = state.signingKey.trim()
    const sshHostAlias = state.sshHostAlias.trim()

    return {
      id: this.props.identity?.id ?? crypto.randomUUID(),
      label: state.label.trim(),
      authorName: state.authorName.trim(),
      authorEmail: state.authorEmail.trim(),
      signing:
        state.signingFormat !== '' && signingKey.length > 0
          ? { format: state.signingFormat, key: signingKey }
          : undefined,
      sshHostAlias: sshHostAlias.length > 0 ? sshHostAlias : undefined,
      rules: parseRules(state.rules),
    }
  }

  private getError(identity: IIdentity): string | null {
    if (identity.label.length === 0) {
      return null
    }

    const duplicate = this.props.identities.some(
      i =>
        i.id !== identity.id &&
        i.label.toLowerCase() === identity.label.toLowerCase()
    )
    if (duplicate) {
      return `An identity named ${identity.label} already exists.`
    }

    if (this.state.signingFormat !== '' && identity.signing === undefined) {
      return 'Enter the signing key, or choose not to sign commits.'
    }

    return null
  }

  private getMatchCount(identity: IIdentity) {
    let count = 0
    for (const state of this.props.repositoryIdentityStates.values()) {
      if (
        state.remote !== null &&
        matchIdentity([identity], state.remote) !== null
      ) {
        count++
      }
    }
    return count
  }

  private onSubmit = async () => {
    const identity = this.buildIdentity()
    const identities = this.props.identities.some(i => i.id === identity.id)
      ? this.props.identities.map(i => (i.id === identity.id ? identity : i))
      : [...this.props.identities, identity]

    this.setState({ saving: true })
    await this.props.dispatcher.saveIdentities(identities, [identity.id])
    this.props.onDismissed()
  }

  private renderSSHHostAlias() {
    const { sshHosts, sshHostAlias } = this.state
    const hosts =
      sshHostAlias.length > 0 && !sshHosts.includes(sshHostAlias)
        ? [sshHostAlias, ...sshHosts]
        : sshHosts

    return (
      <Select
        label="SSH host from ~/.ssh/config"
        value={sshHostAlias}
        onChange={this.onSSHHostAliasChanged}
      >
        <option value="">None, keep remotes as they are</option>
        {hosts.map(host => (
          <option key={host} value={host}>
            {host}
          </option>
        ))}
      </Select>
    )
  }

  public render() {
    const identity = this.buildIdentity()
    const error = this.getError(identity)
    const valid =
      error === null &&
      identity.label.length > 0 &&
      identity.authorName.length > 0 &&
      identity.authorEmail.length > 0
    const title =
      this.props.identity === null
        ? __DARWIN__
          ? 'Add Identity'
          : 'Add identity'
        : __DARWIN__
        ? 'Edit Identity'
        : 'Edit identity'

    return (
      <Dialog
        id="edit-identity"
        className="identities-dialog"
        title={title}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        loading={this.state.saving}
        disabled={this.state.saving}
      >
        {error !== null && <DialogError>{error}</DialogError>}
        <DialogContent>
          <Row>
            <TextBox
              label="Name of this identity"
              placeholder="e.g. Work"
              value={this.state.label}
              onValueChanged={this.onLabelChanged}
              autoFocus={true}
            />
          </Row>
          <Row>
            <TextBox
              label="Author name (user.name)"
              value={this.state.authorName}
              onValueChanged={this.onAuthorNameChanged}
            />
            <TextBox
              label="Author email (user.email)"
              type="email"
              value={this.state.authorEmail}
              onValueChanged={this.onAuthorEmailChanged}
            />
          </Row>
          <Row>
            <Select
              label="Sign commits"
              value={this.state.signingFormat}
              onChange={this.onSigningFormatChanged}
            >
              <option value="">Don't change signing</option>
              {SigningFormats.map(format => (
                <option key={format} value={format}>
                  {SigningFormatLabels[format]}
                </option>
              ))}
            </Select>
            <TextBox
              label="Signing key (user.signingkey)"
              placeholder={
                this.state.signingFormat === 'ssh'
                  ? '~/.ssh/id_ed25519.pub'
                  : 'Key ID'
              }
              value={this.state.signingKey}
              onValueChanged={this.onSigningKeyChanged}
              disabled={this.state.signingFormat === ''}
            />
          </Row>
          <Row>{this.renderSSHHostAlias()}</Row>
          <p className="identities-description">
            SSH remotes on the same host are switched to this SSH host so they
            use its key. ~/.ssh/config itself is never changed.
          </p>
          <Row>
            <TextArea
              label="Use for repositories on"
              placeholder={
                'github.com/my-organization\ngitlab.com/group/subgroup'
              }
              rows={4}
              value={this.state.rules}
              onValueChanged={this.onRulesChanged}
            />
          </Row>
          <p className="identities-description">
            One per line, a host or a host followed by a user, organization or
            group. Remotes are matched by the longest one.{' '}
            {identity.rules.length > 0 &&
              `Matches ${this.getMatchCount(identity)} of your repositories.`}
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Save" okButtonDisabled={!valid} />
        </DialogFooter>
      </Dialog>
    )
  }
}
