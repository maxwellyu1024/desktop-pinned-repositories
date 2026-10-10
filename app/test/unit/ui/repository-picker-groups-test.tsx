import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import { fireEvent, render, screen } from '../../helpers/ui/render'
import {
  getRemoteGroups,
  IRepositoryPickerItem,
  RepositoryPicker,
} from '../../../src/ui/repository-management/repository-picker'

const repositories = [
  { key: 'a', remote: { host: 'github.com', owner: 'solo', name: 'a' } },
  { key: 'b', remote: { host: 'github.com', owner: 'team', name: 'b' } },
  { key: 'c', remote: { host: 'github.com', owner: 'team', name: 'c' } },
]

/** Holds the state a dialog would, and lets the test remove repositories. */
class Harness extends React.Component<
  { readonly removed: ReadonlySet<string> },
  { readonly groupKey: string; readonly filterText: string }
> {
  public state = { groupKey: 'all', filterText: '' }

  private onGroupChanged = (groupKey: string) => this.setState({ groupKey })
  private onFilterTextChanged = (filterText: string) =>
    this.setState({ filterText })
  private onSelectionChanged = () => {}

  public render() {
    const remaining = repositories.filter(r => !this.props.removed.has(r.key))
    const items: ReadonlyArray<IRepositoryPickerItem> = remaining.map(r => ({
      key: r.key,
      title: r.key,
      path: `/dev/${r.key}`,
    }))
    const groups = [
      { key: 'all', label: 'All', keys: remaining.map(r => r.key) },
      ...getRemoteGroups(remaining),
    ]

    return (
      <div>
        <span data-testid="group">{this.state.groupKey}</span>
        <RepositoryPicker
          items={items}
          groups={groups}
          selectedGroupKey={this.state.groupKey}
          onSelectedGroupChanged={this.onGroupChanged}
          filterText={this.state.filterText}
          onFilterTextChanged={this.onFilterTextChanged}
          selectedKeys={new Set()}
          onSelectionChanged={this.onSelectionChanged}
        />
      </div>
    )
  }
}

const groupLabels = () =>
  [...document.querySelectorAll('.repository-picker-group .label')].map(
    e => e.textContent
  )

describe('RepositoryPicker groups', () => {
  it('keeps hosts expanded and selects the parent when a group goes away', () => {
    const { rerender } = render(<Harness removed={new Set()} />)
    assert.deepStrictEqual(groupLabels(), ['All', 'github.com'])

    fireEvent.click(screen.getByRole('button', { name: 'Expand github.com' }))
    assert.deepStrictEqual(groupLabels(), ['All', 'github.com', 'solo', 'team'])

    fireEvent.click(screen.getByText('solo'))
    assert.equal(
      screen.getByTestId('group').textContent,
      'owner:github.com/solo'
    )

    rerender(<Harness removed={new Set(['a'])} />)
    assert.equal(screen.getByTestId('group').textContent, 'host:github.com')
    assert.deepStrictEqual(groupLabels(), ['All', 'github.com', 'team'])
  })

  it('collapses only when asked to', () => {
    render(<Harness removed={new Set()} />)

    fireEvent.click(screen.getByText('github.com'))
    assert.deepStrictEqual(groupLabels(), ['All', 'github.com', 'solo', 'team'])

    fireEvent.click(screen.getByText('All'))
    assert.deepStrictEqual(groupLabels(), ['All', 'github.com', 'solo', 'team'])

    fireEvent.click(screen.getByRole('button', { name: 'Collapse github.com' }))
    assert.deepStrictEqual(groupLabels(), ['All', 'github.com'])
  })
})
