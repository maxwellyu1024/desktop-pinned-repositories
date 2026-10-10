import * as Path from 'path'
import { stat } from 'fs/promises'

const isDirectory = (path: string) =>
  stat(path).then(
    s => s.isDirectory(),
    () => false
  )

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  )

/**
 * Find the working directory of the Git repository containing `path`, which
 * can be the repository itself or a folder inside it.
 *
 * The search doesn't go above the home directory, so a dotfiles repository in
 * the home directory doesn't claim every folder below it.
 *
 * @returns null when the path doesn't exist or isn't inside a repository.
 */
export async function findRepositoryRoot(
  path: string,
  homeDirectory: string
): Promise<string | null> {
  let directory = Path.resolve(path)

  if (!(await isDirectory(directory))) {
    return null
  }

  const home = Path.resolve(homeDirectory)

  while (true) {
    if (await exists(Path.join(directory, '.git'))) {
      return directory
    }

    const parent = Path.dirname(directory)
    if (parent === directory || parent === home) {
      return null
    }
    directory = parent
  }
}

/**
 * Resolve paths to the repositories containing them, dropping paths outside
 * any repository and duplicates. The order of the first occurrences is kept.
 */
export async function resolveRepositoryRoots(
  paths: ReadonlyArray<string>,
  homeDirectory: string
): Promise<ReadonlyArray<string>> {
  const roots = await Promise.all(
    paths.map(p => findRepositoryRoot(p, homeDirectory))
  )

  const seen = new Set<string>()
  const result = new Array<string>()

  for (const root of roots) {
    if (root === null) {
      continue
    }

    const key = __WIN32__ ? root.toLowerCase() : root
    if (!seen.has(key)) {
      seen.add(key)
      result.push(root)
    }
  }

  return result
}
