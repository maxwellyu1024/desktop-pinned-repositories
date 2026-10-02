import * as React from 'react'
import { Repository } from '../../models/repository'
import { Octicon, iconForRepository } from '../octicons'

interface IRepositoryDragElementProps {
  readonly repository: Repository
}

/** The element following the mouse while reordering a pinned repository */
export class RepositoryDragElement extends React.Component<IRepositoryDragElementProps> {
  public render() {
    const { repository } = this.props

    return (
      <div id="repository-drag-element">
        <Octicon
          className="icon-for-repository"
          symbol={iconForRepository(repository)}
        />
        <div className="name">{repository.alias ?? repository.name}</div>
      </div>
    )
  }
}
