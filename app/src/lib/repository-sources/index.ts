import * as Path from 'path'
import { existsSync } from 'fs'
import { resolveRepositoryRoots } from './find-repository-root'
import { readVSCodeFolders, VSCodeFamilyEditors } from './vscode'
import { readJetBrainsProjects } from './jetbrains'
import { readZedProjects } from './zed'
import { readSublimeTextFolders } from './sublime-text'

/** An app that knows about repositories, and the repositories found in it. */
export interface IRepositorySource {
  /** The app's name, matching the editor name used for opening repositories. */
  readonly name: string

  /** Repository working directories, in the order the app lists them. */
  readonly paths: ReadonlyArray<string>
}

export interface IRepositorySourceEnvironment {
  /** The system application data directory. */
  readonly appDataPath: string

  /** This app's own user data directory, which isn't offered as a source. */
  readonly userDataPath: string

  readonly homeDirectory: string

  /** Read the repositories of a GitHub Desktop installation. */
  readonly readDesktopRepositories: (
    dataPath: string
  ) => Promise<ReadonlyArray<string>>
}

/** The GitHub Desktop installations this app can import from. */
const DesktopProductNames = ['GitHub Desktop']

/** Find the paths each installed app knows about, before resolving them. */
async function findCandidates(
  environment: IRepositorySourceEnvironment
): Promise<ReadonlyArray<IRepositorySource>> {
  const { appDataPath, userDataPath, homeDirectory } = environment
  const sources = new Array<Promise<IRepositorySource | null>>()

  const read = (
    name: string,
    readPaths: () => Promise<ReadonlyArray<string> | null>
  ) =>
    sources.push(
      readPaths().then(
        paths => (paths === null ? null : { name, paths }),
        e => {
          log.warn(`Could not read repositories from ${name}`, e)
          return null
        }
      )
    )

  for (const name of DesktopProductNames) {
    const dataPath = Path.join(appDataPath, name)
    if (
      Path.resolve(dataPath) !== Path.resolve(userDataPath) &&
      existsSync(Path.join(dataPath, 'IndexedDB'))
    ) {
      read(name, () => environment.readDesktopRepositories(dataPath))
    }
  }

  for (const { name, dataDirectory } of VSCodeFamilyEditors) {
    const dataPath = Path.join(appDataPath, dataDirectory)
    if (existsSync(dataPath)) {
      read(name, () => readVSCodeFolders(dataPath))
    }
  }

  const jetBrains = await readJetBrainsProjects(appDataPath, homeDirectory)
  for (const [name, paths] of jetBrains) {
    read(name, async () => paths)
  }

  for (const [name, paths] of readZedProjects(appDataPath, homeDirectory)) {
    read(name, async () => paths)
  }

  read('Sublime Text', () => readSublimeTextFolders(appDataPath))

  const found = await Promise.all(sources)
  return found.filter((s): s is IRepositorySource => s !== null)
}

/**
 * Find the Git repositories known to other installed apps: GitHub Desktop
 * (including builds under former names of this app) and code editors.
 *
 * Folders inside a repository resolve to the repository, folders that aren't
 * in a repository are dropped, and so are apps left without any repository.
 */
export async function findRepositorySources(
  environment: IRepositorySourceEnvironment
): Promise<ReadonlyArray<IRepositorySource>> {
  const candidates = await findCandidates(environment)

  const sources = await Promise.all(
    candidates.map(async ({ name, paths }) => ({
      name,
      paths: await resolveRepositoryRoots(paths, environment.homeDirectory),
    }))
  )

  return sources.filter(s => s.paths.length > 0)
}
