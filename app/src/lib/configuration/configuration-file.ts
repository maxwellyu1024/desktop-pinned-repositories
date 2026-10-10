import * as Path from 'path'
import { Repository } from '../../models/repository'
import { Settings, validateSetting } from './settings'
import { findJsonSyntaxError } from './json-error-location'
import {
  IIdentity,
  IIdentityRule,
  IIdentitySigning,
  SigningFormats,
} from '../../models/identity'
import { formatRules, parseRules } from '../identity/identity-rules'

/** The version of the configuration file format written by this build. */
export const ConfigurationFileVersion = 2

/** The versions this build reads, version 1 has no identities. */
const SupportedVersions: ReadonlyArray<number> = [1, 2]

/** An identity in a configuration file, identified by its label. */
export interface IConfigurationIdentity {
  readonly label: string
  readonly authorName: string
  readonly authorEmail: string
  readonly signing?: IIdentitySigning
  readonly sshHostAlias?: string
  readonly rules: ReadonlyArray<IIdentityRule>
}

/** A repository entry in a configuration file. */
export interface IConfigurationRepository {
  /** The absolute path to the repository's working directory. */
  readonly path: string
  readonly alias: string | null
  readonly pinned: boolean

  /**
   * The label of the identity the repository uses, null for none. Left out
   * when the entry doesn't say, which means choosing one automatically.
   */
  readonly identity?: string | null
}

/**
 * The contents of a configuration file. Every section is optional so that a
 * file can carry only some of them.
 */
export interface IConfiguration {
  /** Identities in order of precedence. */
  readonly identities?: ReadonlyArray<IConfigurationIdentity>

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
function formatInline(entries: ReadonlyArray<[string, unknown]>) {
  const fields = entries.map(
    ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`
  )
  return `{ ${fields.join(', ')} }`
}

/** The fields of an identity as written to a configuration file. */
export function toConfigurationIdentity(
  identity: IConfigurationIdentity
): IConfigurationIdentity {
  const { label, authorName, authorEmail, signing, sshHostAlias, rules } =
    identity
  return {
    label,
    authorName,
    authorEmail,
    ...(signing !== undefined ? { signing } : {}),
    ...(sshHostAlias !== undefined ? { sshHostAlias } : {}),
    rules,
  }
}

/** The identity of a repository as written to a configuration file. */
function formatRepositoryIdentity(
  repository: Repository,
  identities: ReadonlyArray<IIdentity>
): string | null | undefined {
  const binding = repository.identity
  switch (binding.kind) {
    case 'automatic':
      return undefined
    case 'none':
      return null
    case 'identity':
      return identities.find(i => i.id === binding.id)?.label
  }
}

/**
 * Serialize identities, repositories and settings into a configuration file
 * meant to be edited by hand: one entry per line.
 */
export function serializeConfiguration(
  identities: ReadonlyArray<IIdentity>,
  repositories: ReadonlyArray<Repository>,
  settings: Settings,
  homeDirectory: string
): string {
  const identityLines = identities.map(identity => {
    const { rules, ...fields } = toConfigurationIdentity(identity)
    const entries: Array<[string, unknown]> = [
      ...Object.entries(fields),
      ['rules', rules.map(rule => formatRules([rule]))],
    ]
    return `    ${formatInline(entries)}`
  })

  const repositoryLines = sortForExport(repositories).map(repository => {
    const fields: Array<[string, unknown]> = [
      ['path', toPortablePath(repository.path, homeDirectory)],
    ]
    if (repository.alias !== null) {
      fields.push(['alias', repository.alias])
    }
    if (repository.pinOrder !== null) {
      fields.push(['pinned', true])
    }
    const identity = formatRepositoryIdentity(repository, identities)
    if (identity !== undefined) {
      fields.push(['identity', identity])
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
    section('identities', '[', identityLines, ']') + ',',
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
  homeDirectory: string,
  identities: ReadonlyArray<IConfigurationIdentity> | undefined
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
      if (!RepositoryKeys.includes(key)) {
        throw new ConfigurationFileError(
          `${at}.${key} is not supported. Use "path", "alias", "pinned" or "identity".`
        )
      }
    }

    const { path, alias, pinned, identity } = item

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
      ...parseRepositoryIdentity(identity, `${at}.identity`, identities),
    }
  })
}

const RepositoryKeys: ReadonlyArray<string> = [
  'path',
  'alias',
  'pinned',
  'identity',
]

/** The identity of a repository entry, which must name one in the file. */
function parseRepositoryIdentity(
  value: unknown,
  at: string,
  identities: ReadonlyArray<IConfigurationIdentity> | undefined
): { readonly identity?: string | null } {
  if (value === undefined) {
    return {}
  }
  if (value === null) {
    return { identity: null }
  }
  if (typeof value !== 'string') {
    throw new ConfigurationFileError(`${at} must be a string or null.`)
  }

  const label = value.trim().toLowerCase()
  const identity = identities?.find(i => i.label.toLowerCase() === label)
  if (identity === undefined) {
    throw new ConfigurationFileError(
      `${at} must be the label of an identity in "identities".`
    )
  }

  return { identity: identity.label }
}

const IdentityKeys: ReadonlyArray<string> = [
  'label',
  'authorName',
  'authorEmail',
  'signing',
  'sshHostAlias',
  'rules',
]

function parseNonEmptyString(value: unknown, at: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigurationFileError(`${at} must be a non-empty string.`)
  }
  return value.trim()
}

function parseSigning(
  value: unknown,
  at: string
): IIdentitySigning | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (!isPlainObject(value)) {
    throw new ConfigurationFileError(`${at} must be an object or null.`)
  }

  for (const key of Object.keys(value)) {
    if (key !== 'format' && key !== 'key') {
      throw new ConfigurationFileError(
        `${at}.${key} is not supported. Use "format" or "key".`
      )
    }
  }

  const format = SigningFormats.find(f => f === value.format)
  if (format === undefined) {
    throw new ConfigurationFileError(
      `${at}.format must be one of ${SigningFormats.map(f => `"${f}"`).join(
        ', '
      )}.`
    )
  }

  return { format, key: parseNonEmptyString(value.key, `${at}.key`) }
}

function parseIdentityRules(
  value: unknown,
  at: string
): ReadonlyArray<IIdentityRule> {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value)) {
    throw new ConfigurationFileError(`${at} must be an array.`)
  }

  return value.map((rule: unknown, index) => {
    const parsed =
      typeof rule === 'string' && !rule.includes('\n') ? parseRules(rule) : []
    if (parsed.length !== 1) {
      throw new ConfigurationFileError(
        `${at}[${index}] must be a host, optionally followed by /namespace.`
      )
    }
    return parsed[0]
  })
}

function parseIdentities(
  value: unknown
): ReadonlyArray<IConfigurationIdentity> {
  if (!Array.isArray(value)) {
    throw new ConfigurationFileError('"identities" must be an array.')
  }

  const seen = new Map<string, number>()

  return value.map((item: unknown, index) => {
    const at = `identities[${index}]`

    if (!isPlainObject(item)) {
      throw new ConfigurationFileError(`${at} must be an object.`)
    }

    for (const key of Object.keys(item)) {
      if (!IdentityKeys.includes(key)) {
        throw new ConfigurationFileError(
          `${at}.${key} is not supported. Use ${IdentityKeys.map(
            k => `"${k}"`
          ).join(', ')}.`
        )
      }
    }

    const label = parseNonEmptyString(item.label, `${at}.label`)
    const duplicateOf = seen.get(label.toLowerCase())
    if (duplicateOf !== undefined) {
      throw new ConfigurationFileError(
        `${at}.label is the same as identities[${duplicateOf}].label.`
      )
    }
    seen.set(label.toLowerCase(), index)

    const { sshHostAlias } = item
    if (
      sshHostAlias !== undefined &&
      sshHostAlias !== null &&
      typeof sshHostAlias !== 'string'
    ) {
      throw new ConfigurationFileError(
        `${at}.sshHostAlias must be a string or null.`
      )
    }
    const alias = typeof sshHostAlias === 'string' ? sshHostAlias.trim() : ''
    const signing = parseSigning(item.signing, `${at}.signing`)

    return {
      label,
      authorName: parseNonEmptyString(item.authorName, `${at}.authorName`),
      authorEmail: parseNonEmptyString(item.authorEmail, `${at}.authorEmail`),
      ...(signing !== undefined ? { signing } : {}),
      ...(alias.length > 0 ? { sshHostAlias: alias } : {}),
      rules: parseIdentityRules(item.rules, `${at}.rules`),
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

const ConfigurationKeys: ReadonlyArray<string> = [
  'version',
  'identities',
  'repositories',
  'settings',
]

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
    if (!ConfigurationKeys.includes(key)) {
      throw new ConfigurationFileError(`"${key}" is not supported.`)
    }
  }

  if (!SupportedVersions.some(v => v === json.version)) {
    throw new ConfigurationFileError(
      `"version" must be ${SupportedVersions.join(' or ')}.`
    )
  }

  const identities =
    json.identities === undefined ? undefined : parseIdentities(json.identities)

  return {
    ...(identities !== undefined ? { identities } : {}),
    repositories:
      json.repositories === undefined
        ? undefined
        : parseRepositories(json.repositories, homeDirectory, identities),
    settings:
      json.settings === undefined ? undefined : parseSettings(json.settings),
  }
}
