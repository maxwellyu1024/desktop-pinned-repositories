import * as Path from 'path'
import { Repository } from '../../models/repository'
import { Settings, SettingValue, validateSetting } from './settings'
import { findJsonSyntaxError } from './json-error-location'

/** The version of the configuration file format written by this build. */
export const ConfigurationFileVersion = 1

/** A repository entry in a configuration file. */
export interface IConfigurationRepository {
  /** The absolute path to the repository's working directory. */
  readonly path: string
  readonly alias: string | null
  readonly pinned: boolean
}

/**
 * The contents of a configuration file. Both sections are optional so that a
 * file can carry only repositories or only settings.
 */
export interface IConfiguration {
  /** Repositories in file order, which is also the order of pinned ones. */
  readonly repositories?: ReadonlyArray<IConfigurationRepository>
  readonly settings?: Settings
}

/** Thrown when a configuration file can't be parsed or is invalid. */
export class ConfigurationFileError extends Error {}

/** Shorten a path in the home directory to `~/…` for readability. */
export function toPortablePath(path: string, homeDirectory: string) {
  if (path === homeDirectory) {
    return '~'
  }

  const prefix = homeDirectory.endsWith(Path.sep)
    ? homeDirectory
    : homeDirectory + Path.sep

  return path.startsWith(prefix)
    ? `~${Path.sep}${path.substring(prefix.length)}`
    : path
}

/** Expand a leading `~` to the home directory. */
export function fromPortablePath(path: string, homeDirectory: string) {
  if (path === '~') {
    return homeDirectory
  }

  return path.startsWith('~/') || path.startsWith('~\\')
    ? Path.join(homeDirectory, path.substring(2))
    : path
}

/** Repositories in export order: pinned ones by pin order, then the rest. */
function sortForExport(repositories: ReadonlyArray<Repository>) {
  const pinned = repositories
    .filter(r => r.pinOrder !== null)
    .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0))

  const unpinned = repositories
    .filter(r => r.pinOrder === null)
    .sort((a, b) =>
      (a.alias ?? a.name).localeCompare(b.alias ?? b.name, undefined, {
        sensitivity: 'base',
      })
    )

  return [...pinned, ...unpinned]
}

/** Format an object on a single line, e.g. `{ "path": "~/dev", "pinned": true }`. */
function formatInline(entries: ReadonlyArray<[string, SettingValue]>) {
  const fields = entries.map(
    ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`
  )
  return `{ ${fields.join(', ')} }`
}

/**
 * Serialize repositories and settings into a configuration file meant to be
 * edited by hand: one repository per line and one setting per line.
 */
export function serializeConfiguration(
  repositories: ReadonlyArray<Repository>,
  settings: Settings,
  homeDirectory: string
): string {
  const repositoryLines = sortForExport(repositories).map(repository => {
    const fields: Array<[string, SettingValue]> = [
      ['path', toPortablePath(repository.path, homeDirectory)],
    ]
    if (repository.alias !== null) {
      fields.push(['alias', repository.alias])
    }
    if (repository.pinOrder !== null) {
      fields.push(['pinned', true])
    }
    return `    ${formatInline(fields)}`
  })

  const settingLines = Object.entries(settings).map(
    ([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`
  )

  const section = (
    name: string,
    open: string,
    lines: string[],
    close: string
  ) =>
    lines.length === 0
      ? `  "${name}": ${open}${close}`
      : `  "${name}": ${open}\n${lines.join(',\n')}\n  ${close}`

  return [
    '{',
    `  "version": ${ConfigurationFileVersion},`,
    section('repositories', '[', repositoryLines, ']') + ',',
    section('settings', '{', settingLines, '}'),
    '}',
    '',
  ].join('\n')
}

/** Describe the location of the first JSON syntax error as `line X, column Y`. */
function describeSyntaxError(text: string) {
  const offset = findJsonSyntaxError(text)
  if (offset === null) {
    return null
  }

  const before = text.substring(0, offset).split('\n')
  return `line ${before.length}, column ${before[before.length - 1].length + 1}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRepositories(
  value: unknown,
  homeDirectory: string
): ReadonlyArray<IConfigurationRepository> {
  if (!Array.isArray(value)) {
    throw new ConfigurationFileError('"repositories" must be an array.')
  }

  const seen = new Map<string, number>()

  return value.map((item: unknown, index) => {
    const at = `repositories[${index}]`

    if (!isPlainObject(item)) {
      throw new ConfigurationFileError(`${at} must be an object.`)
    }

    for (const key of Object.keys(item)) {
      if (key !== 'path' && key !== 'alias' && key !== 'pinned') {
        throw new ConfigurationFileError(
          `${at}.${key} is not supported. Use "path", "alias" or "pinned".`
        )
      }
    }

    const { path, alias, pinned } = item

    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new ConfigurationFileError(`${at}.path must be a non-empty string.`)
    }

    const absolutePath = Path.normalize(
      fromPortablePath(path.trim(), homeDirectory)
    )
    if (!Path.isAbsolute(absolutePath)) {
      throw new ConfigurationFileError(
        `${at}.path must be an absolute path or start with ~.`
      )
    }

    const key = __WIN32__ ? absolutePath.toLowerCase() : absolutePath
    const duplicateOf = seen.get(key)
    if (duplicateOf !== undefined) {
      throw new ConfigurationFileError(
        `${at}.path is the same as repositories[${duplicateOf}].path.`
      )
    }
    seen.set(key, index)

    if (alias !== undefined && alias !== null && typeof alias !== 'string') {
      throw new ConfigurationFileError(`${at}.alias must be a string or null.`)
    }

    if (pinned !== undefined && typeof pinned !== 'boolean') {
      throw new ConfigurationFileError(`${at}.pinned must be true or false.`)
    }

    const trimmedAlias = typeof alias === 'string' ? alias.trim() : ''

    return {
      path: absolutePath,
      alias: trimmedAlias.length > 0 ? trimmedAlias : null,
      pinned: pinned === true,
    }
  })
}

function parseSettings(value: unknown): Settings {
  if (!isPlainObject(value)) {
    throw new ConfigurationFileError('"settings" must be an object.')
  }

  for (const [key, setting] of Object.entries(value)) {
    const error = validateSetting(key, setting)
    if (error !== null) {
      throw new ConfigurationFileError(`settings.${key} ${error}.`)
    }
  }

  return value as Settings
}

/**
 * Parse and validate a configuration file.
 *
 * @throws ConfigurationFileError describing the first problem found.
 */
export function parseConfiguration(
  text: string,
  homeDirectory: string
): IConfiguration {
  // Some editors on Windows save UTF-8 with a byte order mark.
  const contents = text.replace(/^\uFEFF/, '')

  let json: unknown
  try {
    json = JSON.parse(contents)
  } catch {
    const location = describeSyntaxError(contents)
    throw new ConfigurationFileError(
      location === null
        ? 'The file is not valid JSON.'
        : `The file is not valid JSON (${location}).`
    )
  }

  if (!isPlainObject(json)) {
    throw new ConfigurationFileError('The file must contain a JSON object.')
  }

  for (const key of Object.keys(json)) {
    if (key !== 'version' && key !== 'repositories' && key !== 'settings') {
      throw new ConfigurationFileError(`"${key}" is not supported.`)
    }
  }

  if (json.version !== ConfigurationFileVersion) {
    throw new ConfigurationFileError(
      `"version" must be ${ConfigurationFileVersion}.`
    )
  }

  return {
    repositories:
      json.repositories === undefined
        ? undefined
        : parseRepositories(json.repositories, homeDirectory),
    settings:
      json.settings === undefined ? undefined : parseSettings(json.settings),
  }
}
