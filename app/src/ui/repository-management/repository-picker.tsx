import * as React from 'react'
import * as Path from 'path'
import { homedir } from 'os'
import classNames from 'classnames'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { TextBox } from '../lib/text-box'
import { Loading } from '../lib/loading'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { IRepositoryRemote } from './repository-remotes'

/** E.g. "1 repository", "3 repositories", title cased on macOS. */
export function formatRepositoryCount(count: number) {
  const noun = count === 1 ? 'repository' : 'repositories'
  return `${count} ${__DARWIN__ ? 'R' + noun.substring(1) : noun}`
}

export interface IRepositoryPickerItem {
  readonly key: string
  readonly title: string

  /** Shown after the title, e.g. the folder name of an aliased repository. */
  readonly detail?: string

  /** The default remote as `owner/name`, once known. */
  readonly remote?: string
  readonly path: string
  readonly pinned?: boolean
  readonly missing?: boolean

  /** A short note shown after the title, e.g. "already added". */
  readonly note?: string
  readonly disabled?: boolean
}

export interface IRepositoryGroup {
  readonly key: string
  readonly label: string

  /** The keys of the items in this group. */
  readonly keys: ReadonlyArray<string>

  /**
   * The key of the group this one is nested in, e.g. the host of an owner.
   * Nested groups are only shown while their parent or one of its nested
   * groups is selected.
   */
  readonly parent?: string

  /** A heading shown above this group, starting a new section. */
  readonly heading?: string
}

/**
 * Group items by the host of their default remote, and by owner within each
 * host. Items whose remote isn't known yet are left out, items without a
 * remote form a group of their own.
 */
export function getRemoteGroups(
  items: ReadonlyArray<{
    readonly key: string
    readonly remote: IRepositoryRemote | null | undefined
  }>
): ReadonlyArray<IRepositoryGroup> {
  const hosts = new Map<string, Map<string, Array<string>>>()
  const noRemote = new Array<string>()

  for (const { key, remote } of items) {
    if (remote === null) {
      noRemote.push(key)
    } else if (remote !== undefined) {
      const host = remote.host.toLowerCase()
      const owners = hosts.get(host) ?? new Map<string, Array<string>>()
      hosts.set(host, owners)
      const owner = owners.get(remote.owner) ?? []
      owners.set(remote.owner, [...owner, key])
    }
  }

  const compare = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })

  const groups = new Array<IRepositoryGroup>()
  for (const host of [...hosts.keys()].sort(compare)) {
    const owners = hosts.get(host) ?? new Map<string, Array<string>>()
    const hostKey = `host:${host}`
    groups.push({
      key: hostKey,
      label: host,
      keys: [...owners.values()].flat(),
      heading: groups.length === 0 ? 'Remotes' : undefined,
    })
    for (const owner of [...owners.keys()].sort(compare)) {
      groups.push({
        key: `owner:${host}/${owner}`,
        label: owner,
        keys: owners.get(owner) ?? [],
        parent: hostKey,
      })
    }
  }

  if (noRemote.length > 0) {
    groups.push({
      key: 'no-remote',
      label: __DARWIN__ ? 'No Remote' : 'No remote',
      keys: noRemote,
      heading: groups.length === 0 ? 'Remotes' : undefined,
    })
  }

  return groups
}

/** `owner/name` of a remote, for showing and filtering. */
export function formatRemote(remote: IRepositoryRemote | null | undefined) {
  return remote ? `${remote.owner}/${remote.name}` : undefined
}

/**
 * The items in the selected group that match the filter, in their original
 * order. Without a matching group, the first group is listed.
 */
export function getListedItems(
  items: ReadonlyArray<IRepositoryPickerItem>,
  groups: ReadonlyArray<IRepositoryGroup>,
  groupKey: string,
  filterText: string
): ReadonlyArray<IRepositoryPickerItem> {
  const group = groups.find(g => g.key === groupKey) ?? groups.at(0)
  const keys = group === undefined ? null : new Set(group.keys)
  const filter = filterText.trim().toLocaleLowerCase()

  return items.filter(
    item =>
      (keys === null || keys.has(item.key)) &&
      (filter.length === 0 ||
        [item.title, item.detail, item.remote, item.path].some(text =>
          text?.toLocaleLowerCase().includes(filter)
        ))
  )
}

const home = homedir()

/** The path with the home directory shortened to `~`. */
function formatPath(path: string) {
  return path === home || path.startsWith(home + Path.sep)
    ? '~' + path.substring(home.length)
    : path
}

interface IRepositoryPickerProps {
  readonly items: ReadonlyArray<IRepositoryPickerItem>

  /** Groups listed on the left, the first one is expected to hold all items. */
  readonly groups: ReadonlyArray<IRepositoryGroup>
  readonly selectedGroupKey: string
  readonly onSelectedGroupChanged: (groupKey: string) => void

  /** True while more groups are being worked out, e.g. remotes are read. */
  readonly loadingGroups?: boolean

  readonly filterText: string
  readonly onFilterTextChanged: (filterText: string) => void

  readonly selectedKeys: ReadonlySet<string>
  readonly onSelectionChanged: (selectedKeys: ReadonlySet<string>) => void
}

/**
 * Repositories with a checkbox each, split into groups listed on the left.
 *
 * Only the selected group is listed, narrowed down by the filter. Selection
 * shortcuts apply to the listed repositories, and Shift-clicking a checkbox
 * sets every repository from the previously clicked one to the same state.
 * Repositories that aren't listed keep their checkbox state, but callers are
 * expected to act on the listed ones only, see `getListedItems`.
 */
export class RepositoryPicker extends React.Component<IRepositoryPickerProps> {
  /** The key of the last checkbox toggled, where Shift-click ranges start. */
  private anchorKey: string | null = null
  private shiftKey = false

  private get listedItems() {
    const { items, groups, selectedGroupKey, filterText } = this.props
    return getListedItems(items, groups, selectedGroupKey, filterText)
  }

  private get selectedGroupKey() {
    const { groups, selectedGroupKey } = this.props
    return groups.some(g => g.key === selectedGroupKey)
      ? selectedGroupKey
      : groups.at(0)?.key
  }

  private updateSelection(keys: ReadonlyArray<string>, checked: boolean) {
    const selected = new Set(this.props.selectedKeys)
    for (const key of keys) {
      if (checked) {
        selected.add(key)
      } else {
        selected.delete(key)
      }
    }
    this.props.onSelectionChanged(selected)
  }

  private onSelectAll = () => {
    const keys = this.listedItems.filter(i => i.disabled !== true)
    this.updateSelection(
      keys.map(i => i.key),
      true
    )
  }

  private onSelectNone = () => {
    this.updateSelection(
      this.listedItems.map(i => i.key),
      false
    )
  }

  private onToggle(key: string, checked: boolean) {
    const items = this.listedItems
    const from = items.findIndex(i => i.key === this.anchorKey)
    const to = items.findIndex(i => i.key === key)

    const range =
      this.shiftKey && from !== -1 && to !== -1
        ? items
            .slice(Math.min(from, to), Math.max(from, to) + 1)
            .filter(i => i.disabled !== true)
            .map(i => i.key)
        : [key]

    this.anchorKey = key
    this.updateSelection(range, checked)
  }

  private getOnChange =
    (key: string) => (event: React.FormEvent<HTMLInputElement>) =>
      this.onToggle(key, event.currentTarget.checked)

  /** Remember Shift before the checkbox reports the change of the click. */
  private onListClickCapture = (event: React.MouseEvent<HTMLUListElement>) => {
    this.shiftKey = event.shiftKey
  }

  private onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Pressing Enter in the filter would otherwise submit the dialog.
    if (event.key === 'Enter') {
      event.preventDefault()
    }
  }

  private getOnGroupClick = (groupKey: string) => () =>
    this.props.onSelectedGroupChanged(groupKey)

  private renderGroups() {
    const { groups } = this.props
    const selected = groups.find(g => g.key === this.selectedGroupKey)
    const expanded = selected?.parent ?? selected?.key
    const parents = new Set(groups.map(g => g.parent))

    return groups
      .filter(g => g.parent === undefined || g.parent === expanded)
      .map(g =>
        this.renderGroup(g, parents.has(g.key) ? g.key === expanded : undefined)
      )
  }

  /**
   * @param expanded Whether the nested groups are shown, undefined for groups
   *                 without nested groups.
   */
  private renderGroup(group: IRepositoryGroup, expanded: boolean | undefined) {
    const selected = group.key === this.selectedGroupKey
    return (
      <React.Fragment key={group.key}>
        {group.heading !== undefined && (
          <h3 className="repository-picker-heading">{group.heading}</h3>
        )}
        <button
          type="button"
          className={classNames('repository-picker-group', {
            selected,
            nested: group.parent !== undefined,
          })}
          aria-pressed={selected}
          aria-expanded={expanded}
          onClick={this.getOnGroupClick(group.key)}
        >
          <span className="label">{group.label}</span>
          <span className="count">{group.keys.length}</span>
          {expanded !== undefined && (
            <Octicon
              className="chevron"
              symbol={expanded ? octicons.chevronDown : octicons.chevronRight}
            />
          )}
        </button>
      </React.Fragment>
    )
  }

  private renderItem = (item: IRepositoryPickerItem) => {
    const label = (
      <span className="repository-picker-item">
        <span className="first-line">
          <span className="title">{item.title}</span>
          {item.detail !== undefined && (
            <span className="detail">{item.detail}</span>
          )}
          {item.pinned === true && (
            <Octicon className="pinned" symbol={octicons.pin} title="Pinned" />
          )}
          {item.missing === true && (
            <span className="tag missing">Missing</span>
          )}
          {item.note !== undefined && <span className="note">{item.note}</span>}
        </span>
        <span className="second-line">
          {item.remote !== undefined && (
            <span className="remote">{item.remote}</span>
          )}
          <span className="path">{formatPath(item.path)}</span>
        </span>
      </span>
    )

    return (
      <li key={item.key} className={classNames({ disabled: item.disabled })}>
        <Checkbox
          label={label}
          value={
            this.props.selectedKeys.has(item.key)
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          disabled={item.disabled}
          onChange={this.getOnChange(item.key)}
        />
      </li>
    )
  }

  public render() {
    const items = this.listedItems
    const selectedCount = items.filter(i =>
      this.props.selectedKeys.has(i.key)
    ).length

    return (
      <div className="repository-picker">
        <nav className="repository-picker-groups" aria-label="Groups">
          {this.renderGroups()}
          {this.props.loadingGroups === true && (
            <div className="repository-picker-loading">
              <Loading /> Reading remotes…
            </div>
          )}
        </nav>
        <div className="repository-picker-list">
          <TextBox
            type="search"
            placeholder="Filter by name, remote or path"
            ariaLabel="Filter repositories"
            autoFocus={true}
            value={this.props.filterText}
            onValueChanged={this.props.onFilterTextChanged}
            onKeyDown={this.onFilterKeyDown}
          />
          <div className="repository-picker-actions">
            <LinkButton onClick={this.onSelectAll}>Select all</LinkButton>
            <LinkButton onClick={this.onSelectNone}>Select none</LinkButton>
            <span className="selected-count">{selectedCount} selected</span>
          </div>
          {items.length === 0 ? (
            <div className="repository-picker-empty">
              No repositories match.
            </div>
          ) : (
            <ul onClickCapture={this.onListClickCapture}>
              {items.map(this.renderItem)}
            </ul>
          )}
        </div>
      </div>
    )
  }
}
