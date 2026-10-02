import assert from 'node:assert'
import { before, beforeEach, describe, it, mock } from 'node:test'
import * as React from 'react'

import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

const writeClipboardText = mock.fn(async (_text: string) => true)

let CommitShaCopy: typeof import('../../../src/ui/history/commit-sha-copy').CommitShaCopy

before(async () => {
  mock.module('../../../src/ui/main-process-proxy.ts', {
    namedExports: { writeClipboardText },
  })
  ;({ CommitShaCopy } = await import('../../../src/ui/history/commit-sha-copy'))
})

beforeEach(() => {
  writeClipboardText.mock.resetCalls()
})

describe('CommitShaCopy', () => {
  it('renders the short SHA', () => {
    render(<CommitShaCopy shortSha="f2304d5" />)

    assert.ok(screen.getByText('f2304d5'))
  })

  it('copies the short SHA and shows the copied state', async () => {
    render(<CommitShaCopy shortSha="f2304d5" />)
    const button = screen.getByRole('button', {
      name: 'Copy commit SHA f2304d5',
    })

    fireEvent.click(button)

    assert.equal(writeClipboardText.mock.callCount(), 1)
    assert.deepEqual(writeClipboardText.mock.calls[0].arguments, ['f2304d5'])
    await waitFor(() => assert.ok(button.classList.contains('copied')))
  })

  it('does not propagate mousedown or click to the list row', () => {
    const onRowMouseDown = mock.fn()
    const onRowClick = mock.fn()

    render(
      // 模拟列表行容器，仅用于断言事件不会冒泡
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onMouseDown={onRowMouseDown} onClick={onRowClick}>
        <CommitShaCopy shortSha="f2304d5" />
      </div>
    )
    const button = screen.getByRole('button', {
      name: 'Copy commit SHA f2304d5',
    })

    fireEvent.mouseDown(button)
    fireEvent.click(button)

    assert.equal(onRowMouseDown.mock.callCount(), 0)
    assert.equal(onRowClick.mock.callCount(), 0)
  })
})
