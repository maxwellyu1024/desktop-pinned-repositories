import * as Path from 'path'
import { readFile } from 'fs/promises'

/** Sublime Text's data folder names in the application data directory. */
const DataDirectories = __LINUX__
  ? ['sublime-text', 'sublime-text-3']
  : ['Sublime Text', 'Sublime Text 3']

/**
 * Get the folders from a Sublime Text session file: those open in windows,
 * followed by the folder history.
 */
export function parseSublimeSession(text: string): ReadonlyArray<string> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return []
  }

  if (typeof json !== 'object' || json === null) {
    return []
  }

  const session = json as {
    windows?: ReadonlyArray<{ folders?: ReadonlyArray<{ path?: unknown }> }>
    folder_history?: ReadonlyArray<unknown>
  }

  const open = (Array.isArray(session.windows) ? session.windows : []).flatMap(
    window =>
      Array.isArray(window?.folders)
        ? window.folders.map((f: { path?: unknown }) => f?.path)
        : []
  )
  const history = Array.isArray(session.folder_history)
    ? session.folder_history
    : []

  return [...open, ...history].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  )
}

/** Read the folders from Sublime Text's session, if it's installed. */
export async function readSublimeTextFolders(
  appDataPath: string
): Promise<ReadonlyArray<string> | null> {
  for (const directory of DataDirectories) {
    const text = await readFile(
      Path.join(appDataPath, directory, 'Local', 'Session.sublime_session'),
      'utf8'
    ).catch(() => null)

    if (text !== null) {
      return parseSublimeSession(text)
    }
  }

  return null
}
