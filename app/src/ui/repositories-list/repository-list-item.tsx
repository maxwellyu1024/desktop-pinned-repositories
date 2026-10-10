import * as React from 'react'

import { Repository } from '../../models/repository'
import { Octicon, iconForRepository } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Repositoryish } from './group-repositories'
import { HighlightText } from '../lib/highlight-text'
import { IMatches } from '../../lib/fuzzy-find'
import { IAheadBehind } from '../../models/branch'
import classNames from 'classnames'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip } from '../lib/tooltip'
import { enableAccessibleListToolTips } from '../../lib/feature-flag'
import { TooltippedContent } from '../lib/tooltipped-content'
import { Draggable } from '../lib/draggable'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { DragType, DropTargetSelector } from '../../models/drag-drop'

interface IRepositoryListItemProps {
  readonly repository: Repositoryish

  /** Does the repository need to be disambiguated in the list? */
  readonly needsDisambiguation: boolean

  /** The characters in the repository name to highlight */
  readonly matches: IMatches

  /** Number of commits this local repo branch is behind or ahead of its remote branch */
  readonly aheadBehind: IAheadBehind | null

  /** Number of uncommitted changes */
  readonly changedFilesCount: number

  /** The currently checked out branch, null when detached or unknown */
  readonly currentBranch: string | null

  /**
   * The identity whose settings the repository's config differs from, null
   * when it matches or uses none.
   */
  readonly identityMismatch: string | null

  /** Called when the user clicks the pin button. Not rendered when absent. */
  readonly onTogglePin?: (repository: Repository) => void

  /** Whether the item can be dragged to reorder the pinned group */
  readonly isDraggable?: boolean

  /** Called to render the element following the mouse while dragging */
  readonly onRenderDragElement?: (repository: Repository) => void

  /** Called to remove the element following the mouse when dragging ends */
  readonly onRemoveDragElement?: () => void
}

/** A repository item. */
export class RepositoryListItem extends React.Component<
  IRepositoryListItemProps,
  {}
> {
  private readonly listItemRef = createObservableRef<HTMLDivElement>()

  public render() {
    const repository = this.props.repository
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const hasChanges = this.props.changedFilesCount > 0

    const alias: string | null =
      repository instanceof Repository ? repository.alias : null

    let prefix: string | null = null
    if (this.props.needsDisambiguation && gitHubRepo) {
      prefix = `${gitHubRepo.owner.login}/`
    }

    const classNameList = classNames('name', {
      alias: alias !== null,
    })

    return (
      <Draggable
        isEnabled={
          repository instanceof Repository && this.props.isDraggable === true
        }
        onDragStart={this.onDragStart}
        onRenderDragElement={this.onRenderDragElement}
        onRemoveDragElement={this.onRemoveDragElement}
        dropTargetSelectors={[DropTargetSelector.ListInsertionPoint]}
      >
        <div className="repository-list-item" ref={this.listItemRef}>
          <Tooltip
            target={this.listItemRef}
            disabled={enableAccessibleListToolTips()}
          >
            {this.renderTooltip()}
          </Tooltip>

          <Octicon
            className="icon-for-repository"
            symbol={iconForRepository(repository)}
          />

          <div className={classNames(classNameList)}>
            {prefix ? <span className="prefix">{prefix}</span> : null}
            <HighlightText
              text={alias ?? repository.name}
              highlight={this.props.matches.title}
            />
          </div>

          {this.props.currentBranch !== null && (
            <span className="branch-name">{this.props.currentBranch}</span>
          )}

          {repository instanceof Repository &&
            renderRepoIndicators({
              aheadBehind: this.props.aheadBehind,
              hasChanges: hasChanges,
              identityMismatch: this.props.identityMismatch,
            })}

          {repository instanceof Repository &&
            this.props.onTogglePin !== undefined &&
            this.renderPinButton(repository)}
        </div>
      </Draggable>
    )
  }

  private onDragStart = () => {
    const { repository } = this.props
    if (repository instanceof Repository) {
      dragAndDropManager.setDragData({ type: DragType.Repository, repository })
    }
  }

  private onRenderDragElement = () => {
    const { repository } = this.props
    if (repository instanceof Repository) {
      this.props.onRenderDragElement?.(repository)
    }
  }

  private onRemoveDragElement = () => {
    this.props.onRemoveDragElement?.()
  }

  private renderPinButton(repository: Repository) {
    const label = repository.isPinned ? 'Unpin repository' : 'Pin repository'
    return (
      <button
        type="button"
        // 行内容包裹层为 aria-hidden（list-row.tsx 对有 ariaLabel 的行），
        // 可聚焦元素在其中会触发 axe aria-hidden-focus 违规，故移出 Tab 序；
        // 键盘/屏幕阅读器的固定操作路径是右键菜单
        tabIndex={-1}
        className={classNames('pin-button', {
          pinned: repository.isPinned,
        })}
        onClick={this.onPinButtonClick}
        onMouseDown={this.onPinButtonMouseDown}
        onKeyDown={this.onPinButtonKeyDown}
        aria-label={label}
        aria-pressed={repository.isPinned}
      >
        <Octicon symbol={octicons.pin} />
      </button>
    )
  }

  private onPinButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    // 行级 keydown（section-list.tsx）会对 Enter/Space preventDefault 并
    // 切换行选中，吞掉按钮的原生激活。在此阻止冒泡，恢复按钮原生行为；
    // 后续 click 事件由 onPinButtonClick 的 stopPropagation 兜住
    if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation()
    }
  }

  private onPinButtonMouseDown = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    // List 的行选中在 mousedown 阶段触发（list.tsx 的 onRowMouseDown），
    // 必须在此阶段阻止冒泡，否则固定操作会同时切换选中仓库
    event.stopPropagation()
  }

  private onPinButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // 阻止点击冒泡到列表行，避免固定操作同时切换选中仓库
    event.stopPropagation()
    const { repository, onTogglePin } = this.props
    if (repository instanceof Repository && onTogglePin !== undefined) {
      onTogglePin(repository)
    }
  }

  private renderTooltip() {
    const repo = this.props.repository
    const gitHubRepo = repo instanceof Repository ? repo.gitHubRepository : null
    const alias = repo instanceof Repository ? repo.alias : null
    const realName = gitHubRepo ? gitHubRepo.fullName : repo.name

    return (
      <>
        <div>
          <strong>{realName}</strong>
          {alias && <> ({alias})</>}
        </div>
        <div>{repo.path}</div>
        {this.props.currentBranch !== null && (
          <div>Branch: {this.props.currentBranch}</div>
        )}
        {this.props.identityMismatch !== null && (
          <div>Not set up for identity {this.props.identityMismatch}</div>
        )}
      </>
    )
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps): boolean {
    if (
      nextProps.repository instanceof Repository &&
      this.props.repository instanceof Repository
    ) {
      return (
        nextProps.repository.hash !== this.props.repository.hash ||
        nextProps.matches !== this.props.matches ||
        nextProps.isDraggable !== this.props.isDraggable ||
        nextProps.currentBranch !== this.props.currentBranch ||
        nextProps.identityMismatch !== this.props.identityMismatch
      )
    } else {
      return true
    }
  }
}

const renderRepoIndicators: React.FunctionComponent<{
  aheadBehind: IAheadBehind | null
  hasChanges: boolean
  identityMismatch: string | null
}> = props => {
  return (
    <div className="repo-indicators">
      {props.identityMismatch !== null &&
        renderIdentityMismatchIndicator(props.identityMismatch)}
      {props.aheadBehind && renderAheadBehindIndicator(props.aheadBehind)}
      {props.hasChanges && renderChangesIndicator()}
    </div>
  )
}

const renderIdentityMismatchIndicator = (identity: string) => {
  return (
    <TooltippedContent
      className="identity-mismatch-indicator"
      tagName="div"
      tooltip={`The Git config of this repository differs from identity ${identity}. Right-click to apply it.`}
      disabled={enableAccessibleListToolTips()}
    >
      <Octicon symbol={octicons.alert} />
    </TooltippedContent>
  )
}

const renderAheadBehindIndicator = (aheadBehind: IAheadBehind) => {
  const { ahead, behind } = aheadBehind
  if (ahead === 0 && behind === 0) {
    return null
  }

  const aheadBehindTooltip =
    'The currently checked out branch is' +
    (behind ? ` ${commitGrammar(behind)} behind ` : '') +
    (behind && ahead ? 'and' : '') +
    (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
    'its tracked branch.'

  return (
    <TooltippedContent
      className="ahead-behind"
      tagName="div"
      tooltip={aheadBehindTooltip}
      disabled={enableAccessibleListToolTips()}
    >
      {ahead > 0 && <Octicon symbol={octicons.arrowUp} />}
      {behind > 0 && <Octicon symbol={octicons.arrowDown} />}
    </TooltippedContent>
  )
}

const renderChangesIndicator = () => {
  return (
    <TooltippedContent
      className="change-indicator-wrapper"
      tooltip="There are uncommitted changes in this repository"
      disabled={enableAccessibleListToolTips()}
    >
      <Octicon symbol={octicons.dotFill} />
    </TooltippedContent>
  )
}

export const commitGrammar = (commitNum: number) =>
  `${commitNum} commit${commitNum > 1 ? 's' : ''}` // english is hard
