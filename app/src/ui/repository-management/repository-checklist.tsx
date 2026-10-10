import * as React from 'react'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { PathText } from '../lib/path-text'

/** E.g. "1 repository", "3 repositories", title cased on macOS. */
export function formatRepositoryCount(count: number) {
  const noun = count === 1 ? 'repository' : 'repositories'
  return `${count} ${__DARWIN__ ? 'R' + noun.substring(1) : noun}`
}

export interface IRepositoryChecklistItem {
  readonly key: string
  readonly title: string
  readonly path: string

  /** A short note shown after the title, e.g. "already added". */
  readonly note?: string
  readonly disabled?: boolean
}

interface IRepositoryChecklistProps {
  readonly items: ReadonlyArray<IRepositoryChecklistItem>
  readonly selectedKeys: ReadonlySet<string>
  readonly onSelectionChanged: (selectedKeys: ReadonlySet<string>) => void

  /** Extra selection shortcuts rendered after "Select all" and "Select none". */
  readonly extraActions?: ReadonlyArray<{
    readonly label: string
    readonly keys: ReadonlyArray<string>
  }>
}

/** A list of repositories with a checkbox each and selection shortcuts. */
export class RepositoryChecklist extends React.Component<IRepositoryChecklistProps> {
  private get enabledKeys() {
    return this.props.items.filter(i => i.disabled !== true).map(i => i.key)
  }

  private onSelectAll = () => {
    const selected = new Set(this.props.selectedKeys)
    this.enabledKeys.forEach(key => selected.add(key))
    this.props.onSelectionChanged(selected)
  }

  private onSelectNone = () => {
    const selected = new Set(this.props.selectedKeys)
    this.props.items.forEach(item => selected.delete(item.key))
    this.props.onSelectionChanged(selected)
  }

  private onToggle = (key: string, checked: boolean) => {
    const selected = new Set(this.props.selectedKeys)
    if (checked) {
      selected.add(key)
    } else {
      selected.delete(key)
    }
    this.props.onSelectionChanged(selected)
  }

  private renderItem = (item: IRepositoryChecklistItem) => {
    const checked = this.props.selectedKeys.has(item.key)
    const label = (
      <span className="repository-checklist-label">
        <span className="title">
          {item.title}
          {item.note !== undefined && (
            <span className="note"> — {item.note}</span>
          )}
        </span>
        <PathText path={item.path} />
      </span>
    )

    return (
      <li key={item.key}>
        <Checkbox
          label={label}
          value={checked ? CheckboxValue.On : CheckboxValue.Off}
          disabled={item.disabled}
          onChange={this.getOnChange(item.key)}
        />
      </li>
    )
  }

  private getOnChange =
    (key: string) => (event: React.FormEvent<HTMLInputElement>) =>
      this.onToggle(key, event.currentTarget.checked)

  public render() {
    const { items, extraActions } = this.props

    return (
      <div className="repository-checklist">
        <div className="repository-checklist-actions">
          <LinkButton onClick={this.onSelectAll}>Select all</LinkButton>
          <LinkButton onClick={this.onSelectNone}>Select none</LinkButton>
          {extraActions?.map(action => (
            <LinkButton
              key={action.label}
              onClick={this.getOnExtraAction(action.keys)}
              disabled={action.keys.length === 0}
            >
              {action.label}
            </LinkButton>
          ))}
        </div>
        <ul>{items.map(this.renderItem)}</ul>
      </div>
    )
  }

  private getOnExtraAction = (keys: ReadonlyArray<string>) => () => {
    const selected = new Set(this.props.selectedKeys)
    keys.forEach(key => selected.add(key))
    this.props.onSelectionChanged(selected)
  }
}
