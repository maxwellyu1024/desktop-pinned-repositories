import * as React from 'react'
import {
  AutomaticIdentityBinding,
  IIdentity,
  RepositoryIdentityBinding,
} from '../../models/identity'
import { Select } from '../lib/select'

const AutomaticValue = 'automatic'
const NoneValue = 'none'
const IdentityPrefix = 'identity:'

const toValue = (binding: RepositoryIdentityBinding) =>
  binding.kind === 'identity' ? `${IdentityPrefix}${binding.id}` : binding.kind

function toBinding(value: string): RepositoryIdentityBinding {
  if (value === NoneValue) {
    return { kind: 'none' }
  }
  if (value.startsWith(IdentityPrefix)) {
    return { kind: 'identity', id: value.substring(IdentityPrefix.length) }
  }
  return AutomaticIdentityBinding
}

interface IIdentityBindingSelectProps {
  readonly label?: string
  readonly identities: ReadonlyArray<IIdentity>
  readonly binding: RepositoryIdentityBinding
  readonly onChange: (binding: RepositoryIdentityBinding) => void

  /** Whether to offer using no identity. */
  readonly allowNone?: boolean
  readonly disabled?: boolean
}

/** Chooses how a repository picks its identity. */
export class IdentityBindingSelect extends React.Component<IIdentityBindingSelectProps> {
  private onChange = (event: React.FormEvent<HTMLSelectElement>) => {
    this.props.onChange(toBinding(event.currentTarget.value))
  }

  public render() {
    return (
      <Select
        label={this.props.label}
        value={toValue(this.props.binding)}
        onChange={this.onChange}
        disabled={this.props.disabled}
      >
        <option value={AutomaticValue}>Automatic, based on the remote</option>
        {this.props.allowNone !== false && (
          <option value={NoneValue}>No identity</option>
        )}
        {this.props.identities.map(identity => (
          <option key={identity.id} value={`${IdentityPrefix}${identity.id}`}>
            {identity.label} ({identity.authorEmail})
          </option>
        ))}
      </Select>
    )
  }
}
