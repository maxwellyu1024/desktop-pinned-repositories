import * as React from 'react'
import classNames from 'classnames'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { writeClipboardText } from '../main-process-proxy'

/** How long the copied confirmation stays visible, in milliseconds */
const CopiedFeedbackDuration = 2000

interface ICommitShaCopyProps {
  /** The abbreviated SHA to display and copy */
  readonly shortSha: string
}

interface ICommitShaCopyState {
  readonly showCopied: boolean
}

/**
 * Renders a commit's abbreviated SHA inside a commit list item and copies it
 * to the clipboard when clicked.
 */
export class CommitShaCopy extends React.Component<
  ICommitShaCopyProps,
  ICommitShaCopyState
> {
  private feedbackTimeoutId: number | null = null

  public constructor(props: ICommitShaCopyProps) {
    super(props)
    this.state = { showCopied: false }
  }

  public componentWillUnmount() {
    // 列表是虚拟滚动，行会被回收，需清理计时器避免卸载后 setState
    this.clearFeedbackTimeout()
  }

  public render() {
    const { shortSha } = this.props
    const { showCopied } = this.state

    return (
      <button
        type="button"
        // 行内容包裹层为 aria-hidden（list-row.tsx 对有 ariaLabel 的行），
        // 可聚焦元素在其中会触发 axe aria-hidden-focus 违规，故移出 Tab 序；
        // 键盘/屏幕阅读器的复制路径是右键菜单的 Copy SHA
        tabIndex={-1}
        className={classNames('commit-sha', { copied: showCopied })}
        aria-label={`Copy commit SHA ${shortSha}`}
        onMouseDown={this.onMouseDown}
        onClick={this.onClick}
        onKeyDown={this.onKeyDown}
      >
        {showCopied && <Octicon symbol={octicons.check} />}
        <span className="commit-sha-text">{shortSha}</span>
      </button>
    )
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    // 行级 keydown 会对 Enter/Space preventDefault 并切换行选中，
    // 吞掉按钮的原生激活。在此阻止冒泡，恢复按钮原生行为
    if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation()
    }
  }

  private onMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    // List 在 mousedown 阶段选中行，Draggable 在 mousedown 阶段启动拖拽，
    // 必须在此阶段阻止冒泡，否则复制操作会同时选中提交或开始拖拽
    event.stopPropagation()
  }

  private onClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // 阻止点击冒泡到列表行，避免复制操作同时切换选中提交
    event.stopPropagation()

    if (!(await writeClipboardText(this.props.shortSha))) {
      return
    }

    this.clearFeedbackTimeout()
    this.setState({ showCopied: true })
    this.feedbackTimeoutId = window.setTimeout(() => {
      this.feedbackTimeoutId = null
      this.setState({ showCopied: false })
    }, CopiedFeedbackDuration)
  }

  private clearFeedbackTimeout() {
    if (this.feedbackTimeoutId !== null) {
      window.clearTimeout(this.feedbackTimeoutId)
      this.feedbackTimeoutId = null
    }
  }
}
