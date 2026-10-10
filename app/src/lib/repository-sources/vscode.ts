import * as Path from 'path'
import { readdir, readFile } from 'fs/promises'
import { fileURLToPath } from 'url'

/**
 * Editors based on Visual Studio Code, with the name used for opening them and
 * the folder holding their data in the application data directory.
 */
export const VSCodeFamilyEditors: ReadonlyArray<{
  readonly name: string
  readonly dataDirectory: string
}> = [
  { name: 'Visual Studio Code', dataDirectory: 'Code' },
  { name: 'Visual Studio Code (Insiders)', dataDirectory: 'Code - Insiders' },
  { name: 'VSCodium', dataDirectory: 'VSCodium' },
  { name: 'Cursor', dataDirectory: 'Cursor' },
  { name: 'Windsurf', dataDirectory: 'Windsurf' },
]

/**
 * Get the folder a `workspace.json` file from VS Code's workspace storage
 * refers to. Remote folders and multi-root workspaces are ignored.
 */
export function parseVSCodeWorkspace(text: string): string | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }

  if (typeof json !== 'object' || json === null || !('folder' in json)) {
    return null
  }

  const { folder } = json
  if (typeof folder !== 'string' || !folder.startsWith('file:')) {
    return null
  }

  try {
    return fileURLToPath(folder)
  } catch {
    return null
  }
}

/**
 * Read the folders opened in a VS Code based editor. VS Code keeps a storage
 * folder per opened workspace, each with a `workspace.json` naming it.
 *
 * @param dataPath The editor's data directory, e.g. `…/Application Support/Code`.
 */
export async function readVSCodeFolders(
  dataPath: string
): Promise<ReadonlyArray<string>> {
  const storage = Path.join(dataPath, 'User', 'workspaceStorage')
  const entries = await readdir(storage, { withFileTypes: true }).catch(
    () => []
  )

  const folders = await Promise.all(
    entries
      .filter(e => e.isDirectory())
      .map(e =>
        readFile(Path.join(storage, e.name, 'workspace.json'), 'utf8').then(
          parseVSCodeWorkspace,
          () => null
        )
      )
  )

  return folders.filter((f): f is string => f !== null)
}
