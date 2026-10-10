import * as React from 'react'
import { UiView } from '../ui-view'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import {
  WelcomeLeftTopImageUri,
  WelcomeLeftBottomImageUri,
} from '../welcome/welcome'
import { IAccountRepositories } from '../../lib/stores/api-repositories-store'
import { Account, accountEquals } from '../../models/account'
import { CloneableRepositoryFilterList } from '../clone-repository/cloneable-repository-filter-list'
import { IAPIRepository } from '../../lib/api'
import { ClickSource } from '../lib/list'
import { AccountPicker } from '../account-picker'

interface INoRepositoriesProps {
  /** A function to call when the user chooses to create a repository. */
  readonly onCreate: () => void

  /** A function to call when the user chooses to clone a repository. */
  readonly onClone: (cloneURL?: string) => void

  /** A function to call when the user chooses to add a local repository. */
  readonly onAdd: () => void

  /** Called when the user chooses to add repositories known to other apps. */
  readonly onAddFromApps: () => void

  /** Called when the user chooses to add the repositories in a folder. */
  readonly onAddFromFolder: () => void

  /** Called when the user chooses to import a configuration file. */
  readonly onImportConfiguration: () => void

  /** Called when the user chooses to create a tutorial repository */
  readonly onCreateTutorialRepository: () => void

  /** Called when the user chooses to resume a tutorial repository */
  readonly onResumeTutorialRepository: () => void

  /** true if tutorial is in paused state. */
  readonly tutorialPaused: boolean

  readonly accounts: ReadonlyArray<Account>

  /**
   * A map keyed on a user account (GitHub.com or GitHub Enterprise)
   * containing an object with repositories that the authenticated
   * user has explicit permission (:read, :write, or :admin) to access
   * as well as information about whether the list of repositories
   * is currently being loaded or not.
   *
   * If a currently signed in account is missing from the map that
   * means that the list of accessible repositories has not yet been
   * loaded. An entry for an account with an empty list of repositories
   * means that no accessible repositories was found for the account.
   *
   * See the ApiRepositoriesStore for more details on loading repositories
   */
  readonly apiRepositories: ReadonlyMap<Account, IAccountRepositories>

  /**
   * Called when the user requests a refresh of the repositories
   * available for cloning.
   */
  readonly onRefreshRepositories: (account: Account) => void
}
interface INoRepositoriesState {
  readonly selectedAccount: Account | undefined
  /**
   * The currently selected repository (if any)
   */
  readonly selectedRepository: IAPIRepository | null
  /**
   * The current filter text in the GitHub.com clone tab
   */
  readonly filterText: string
}

/**
 * The "No Repositories" view. This is shown when the user hasn't added any
 * repositories to the app.
 */
export class NoRepositoriesView extends React.Component<
  INoRepositoriesProps,
  INoRepositoriesState
> {
  private get selectedAccount() {
    return this.state.selectedAccount ?? this.props.accounts.at(0)
  }

  public constructor(props: INoRepositoriesProps) {
    super(props)

    this.state = {
      selectedRepository: null,
      selectedAccount: props.accounts.at(0),
      filterText: '',
    }
  }

  public render() {
    return (
      <UiView id="no-repositories">
        <section aria-label="Let's get started!">
          <header>
            <h1>Let's get started!</h1>
            <p>Add a repository to {__APP_NAME__} to start collaborating</p>
          </header>

          <div className="content">
            {this.renderRepositoryList()}
            {this.renderGetStartedActions()}
          </div>

          <img
            className="no-repositories-graphic-top"
            src={WelcomeLeftTopImageUri}
            alt=""
          />
          <img
            className="no-repositories-graphic-bottom"
            src={WelcomeLeftBottomImageUri}
            alt=""
          />
        </section>
      </UiView>
    )
  }

  public componentDidMount() {
    if (this.state.selectedAccount) {
      this.ensureRepositoriesForAccount(this.state.selectedAccount)
    }
  }

  public componentDidUpdate(
    prevProps: INoRepositoriesProps,
    prevState: INoRepositoriesState
  ) {
    if (prevProps.accounts !== this.props.accounts) {
      const currentlySelectedAccount = this.state.selectedAccount
      const newSelectedAccount =
        (currentlySelectedAccount
          ? this.props.accounts.find(a =>
              accountEquals(a, currentlySelectedAccount)
            )
          : undefined) ?? this.props.accounts.at(0)

      if (currentlySelectedAccount !== newSelectedAccount) {
        this.setState({ selectedAccount: newSelectedAccount })
        this.ensureRepositoriesForAccount(this.state.selectedAccount)
      }
    }
  }

  private ensureRepositoriesForAccount(account: Account | undefined) {
    if (account) {
      const accountState = this.props.apiRepositories.get(account)

      if (accountState === undefined) {
        this.props.onRefreshRepositories(account)
      }
    }
  }

  private isUserSignedIn() {
    return this.props.accounts.length > 0
  }

  private renderRepositoryList() {
    const account = this.selectedAccount

    if (!account) {
      // not signed in to any accounts
      return null
    }

    const accountState = this.props.apiRepositories.get(account)

    return (
      <div className="content-pane repository-list">
        {this.renderAccountPicker()}
        {this.renderAccountRepositoryList(account, accountState)}
      </div>
    )
  }

  private renderAccountPicker() {
    const { accounts } = this.props
    const selectedAccount = this.selectedAccount
    if (accounts.length < 2 || !selectedAccount) {
      return null
    }

    return (
      <AccountPicker
        accounts={accounts}
        selectedAccount={selectedAccount}
        onSelectedAccountChanged={this.onSelectedAccountChanged}
      />
    )
  }

  private onSelectedAccountChanged = (selectedAccount: Account) => {
    this.setState({ selectedAccount })
    this.ensureRepositoriesForAccount(selectedAccount)
  }

  private renderAccountRepositoryList(
    account: Account,
    accountState: IAccountRepositories | undefined
  ) {
    const loading = accountState === undefined ? true : accountState.loading

    const repositories =
      accountState === undefined ? null : accountState.repositories

    const selectedItem = this.state.selectedRepository

    return (
      <>
        <CloneableRepositoryFilterList
          account={account}
          selectedItem={selectedItem}
          filterText={this.state.filterText}
          onRefreshRepositories={this.props.onRefreshRepositories}
          loading={loading}
          repositories={repositories}
          onSelectionChanged={this.onSelectionChanged}
          onFilterTextChanged={this.onFilterTextChanged}
          onItemClicked={this.onItemClicked}
        />
        {this.renderCloneSelectedRepositoryButton(selectedItem)}
      </>
    )
  }

  private onItemClicked = (repository: IAPIRepository, source: ClickSource) => {
    if (source.kind === 'keyboard' && source.event.key === 'Enter') {
      this.onCloneSelectedRepository()
    }
  }

  private renderCloneSelectedRepositoryButton(
    selectedItem: IAPIRepository | null
  ) {
    if (selectedItem === null) {
      return null
    }

    return (
      <Button
        type="submit"
        className="clone-selected-repository"
        onClick={this.onCloneSelectedRepository}
      >
        Clone{' '}
        <strong>
          {selectedItem.owner.login}/{selectedItem.name}
        </strong>
      </Button>
    )
  }

  private onCloneSelectedRepository = () => {
    const selectedItem = this.state.selectedRepository

    if (selectedItem !== null) {
      this.props.onClone(selectedItem.clone_url)
    }
  }

  private onSelectionChanged = (selectedRepository: IAPIRepository | null) => {
    this.setState({ selectedRepository })
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  // Note: this wrapper is necessary in order to ensure
  // `onClone` does not get passed a click event
  // and accidentally interpret that as a url
  // See https://github.com/desktop/desktop/issues/8394
  private onShowClone = () => this.props.onClone()

  private renderAction(
    symbol: OcticonSymbol,
    title: string,
    description: string,
    onClick: () => void,
    options: { readonly type?: 'submit'; readonly autoFocus?: boolean } = {}
  ) {
    return (
      <Button
        className="get-started-action"
        onClick={onClick}
        type={options.type}
        autoFocus={options.autoFocus}
      >
        <Octicon symbol={symbol} />
        <span className="get-started-action-text">
          <span className="title">{title}</span>
          <span className="description">{description}</span>
        </span>
      </Button>
    )
  }

  private renderActionGroup(
    id: string,
    title: string,
    actions: ReadonlyArray<JSX.Element | null>
  ) {
    return (
      <div
        className="get-started-group"
        role="group"
        aria-labelledby={`get-started-${id}`}
      >
        <h2 id={`get-started-${id}`}>{title}</h2>
        {actions}
      </div>
    )
  }

  private renderTutorialRepositoryAction() {
    // No tutorial if you're not signed in.
    if (!this.isUserSignedIn()) {
      return null
    }

    return this.props.tutorialPaused
      ? this.renderAction(
          octicons.mortarBoard,
          __DARWIN__
            ? 'Return to In Progress Tutorial'
            : 'Return to in progress tutorial',
          'Continue where you left off',
          this.props.onResumeTutorialRepository,
          { type: 'submit' }
        )
      : this.renderAction(
          octicons.mortarBoard,
          __DARWIN__
            ? 'Create a Tutorial Repository…'
            : 'Create a tutorial repository…',
          'Learn the basics step by step',
          this.props.onCreateTutorialRepository,
          { type: 'submit' }
        )
  }

  /** Bring in repositories that are already on this computer. */
  private renderAddActions() {
    return this.renderActionGroup(
      'add',
      __DARWIN__ ? 'Add from This Computer' : 'Add from this computer',
      [
        this.renderAction(
          octicons.apps,
          __DARWIN__ ? 'Add from Other Apps…' : 'Add from other apps…',
          'GitHub Desktop, VS Code, JetBrains, Zed and more',
          this.props.onAddFromApps,
          // Without accounts there is no repository list to focus.
          { autoFocus: !this.isUserSignedIn() }
        ),
        this.renderAction(
          octicons.fileSubmodule,
          __DARWIN__ ? 'Add from Folder…' : 'Add from folder…',
          'Find every repository in a folder',
          this.props.onAddFromFolder
        ),
        this.renderAction(
          octicons.fileDirectory,
          __DARWIN__
            ? 'Add an Existing Repository…'
            : 'Add an existing repository…',
          'Choose a single repository',
          this.props.onAdd
        ),
        this.renderAction(
          octicons.download,
          __DARWIN__ ? 'Import Configuration…' : 'Import configuration…',
          'Restore repositories and settings from a file',
          this.props.onImportConfiguration
        ),
      ]
    )
  }

  /** Get a repository that isn't on this computer yet. */
  private renderCloneOrCreateActions() {
    return this.renderActionGroup(
      'new',
      __DARWIN__ ? 'Clone or Create' : 'Clone or create',
      [
        this.renderAction(
          octicons.repoClone,
          __DARWIN__ ? 'Clone a Repository…' : 'Clone a repository…',
          'From one of your accounts or any URL',
          this.onShowClone
        ),
        this.renderAction(
          octicons.plus,
          __DARWIN__ ? 'Create a New Repository…' : 'Create a new repository…',
          'Start a new repository on this computer',
          this.props.onCreate
        ),
        this.renderTutorialRepositoryAction(),
      ]
    )
  }

  private renderGetStartedActions() {
    return (
      <div className="content-pane get-started-actions">
        {this.renderAddActions()}
        {this.renderCloneOrCreateActions()}

        <div className="drag-drop-info">
          <Octicon symbol={octicons.lightBulb} />
          <div>
            <strong>ProTip!</strong> Drag &amp; drop a repository folder here to
            add it to {__APP_NAME__}
          </div>
        </div>
      </div>
    )
  }
}
