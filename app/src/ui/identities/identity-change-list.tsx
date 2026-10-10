import * as React from 'react'
import { Repository } from '../../models/repository'
import { IIdentityChange } from '../../lib/identity/identity-changes'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

/** Identifies a change to a repository's config across repositories. */
export const getChangeKey = (repository: Repository, change: IIdentityChange) =>
  `${repository.id}\n${change.key}`

/** A readable name for a config key an identity changes. */
export function describeConfigKey(key: string) {
  switch (key) {
    case 'user.name':
      return 'Author name'
    case 'user.email':
      return 'Author email'
    case 'user.signingkey':
      return 'Signing key'
    case 'gpg.format':
      return 'Signing format'
    case 'commit.gpgsign':
      return 'Sign commits'
  }

  const remote = /^remote\.(.+)\.url$/.exec(key)
  return remote !== null ? `Remote ${remote[1]}` : key
}

interface IIdentityChangeListProps {
  readonly repository: Repository
  readonly changes: ReadonlyArray<IIdentityChange>

  /** Keys of the selected changes of all repositories, see `getChangeKey`. */
  readonly selected: ReadonlySet<string>
  readonly onSelectionChanged: (selected: ReadonlySet<string>) => void
  readonly disabled?: boolean
}

interface IIdentityChangeRowProps {
  readonly change: IIdentityChange
  readonly changeKey: string
  readonly checked: boolean
  readonly disabled?: boolean
  readonly onToggle: (changeKey: string, checked: boolean) => void
}

class IdentityChangeRow extends React.Component<IIdentityChangeRowProps> {
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    this.props.onToggle(this.props.changeKey, event.currentTarget.checked)
  }

  public render() {
    const { change } = this.props
    const label = (
      <span className="identity-change">
        <span className="identity-change-key">
          {describeConfigKey(change.key)}
          {change.optional && (
            <span className="identity-change-note"> (switch to SSH)</span>
          )}
        </span>
        <span className="identity-change-values">
          <span className={change.current === null ? 'unset' : 'current'}>
            {change.current ?? 'not set'}
          </span>
          {' → '}
          <span className={change.next === null ? 'unset' : 'next'}>
            {change.next ?? 'removed'}
          </span>
        </span>
      </span>
    )

    return (
      <li>
        <Checkbox
          value={this.props.checked ? CheckboxValue.On : CheckboxValue.Off}
          onChange={this.onChange}
          label={label}
          disabled={this.props.disabled}
        />
      </li>
    )
  }
}

/** The changes to one repository's config, each one selectable. */
export class IdentityChangeList extends React.Component<IIdentityChangeListProps> {
  private onToggle = (changeKey: string, checked: boolean) => {
    const selected = new Set(this.props.selected)
    if (checked) {
      selected.add(changeKey)
    } else {
      selected.delete(changeKey)
    }
    this.props.onSelectionChanged(selected)
  }

  public render() {
    return (
      <ul className="identity-change-list">
        {this.props.changes.map(change => {
          const changeKey = getChangeKey(this.props.repository, change)
          return (
            <IdentityChangeRow
              key={change.key}
              change={change}
              changeKey={changeKey}
              checked={this.props.selected.has(changeKey)}
              disabled={this.props.disabled}
              onToggle={this.onToggle}
            />
          )
        })}
      </ul>
    )
  }
}
