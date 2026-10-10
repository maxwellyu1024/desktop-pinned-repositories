/** How a setting is encoded in localStorage. */
type SettingKind = 'boolean' | 'number' | 'string' | 'json'

/**
 * The user preferences included in an exported configuration, keyed by their
 * localStorage key. Account specific state, credentials, stats, window layout
 * and one-time prompts are intentionally left out.
 */
const ExportableSettings: Readonly<Record<string, SettingKind>> = {
  // Appearance
  theme: 'string',
  'tab-size': 'number',
  'always-show-worktree-list': 'boolean',
  dateFormat: 'string',
  timeFormat: 'string',
  numberFormat: 'string',
  preferAbsoluteDates: 'boolean',

  // Accessibility
  'underline-links': 'boolean',
  'diff-check-marks-visible': 'boolean',

  // Integrations
  externalEditor: 'string',
  'use-custom-editor': 'boolean',
  'custom-editor': 'json',
  shell: 'string',
  'use-custom-shell': 'boolean',
  'custom-shell': 'json',
  'copilot-app-path': 'string',

  // Diffs and changes
  'image-diff-type': 'number',
  'hide-whitespace-in-changes-diff': 'boolean',
  'hide-whitespace-in-diff': 'boolean',
  'hide-whitespace-in-pull-request-diff': 'boolean',
  'show-side-by-side-diff': 'boolean',
  'commit-spellcheck-enabled': 'boolean',
  showCommitLengthWarning: 'boolean',
  'show-changes-filter': 'boolean',
  'enable-repository-indicators': 'boolean',

  // Prompts
  askToMoveToApplicationsFolder: 'boolean',
  confirmRepoRemoval: 'boolean',
  confirmDiscardChanges: 'boolean',
  confirmDiscardChangesPermanentlyKey: 'boolean',
  confirmDiscardStash: 'boolean',
  confirmCheckoutCommit: 'boolean',
  confirmForcePush: 'boolean',
  confirmUndoCommit: 'boolean',
  confirmCommitFilteredChangesKey: 'boolean',
  confirmCommitMessageOverride: 'boolean',
  confirmWorktreeRemoval: 'boolean',
  uncommittedChangesStrategyKind: 'string',

  // Notifications
  'high-signal-notifications-enabled': 'boolean',

  // Git and network
  useWindowsOpenSSH: 'boolean',
  useExternalCredentialHelper: 'boolean',
  'git-hooks-env-enabled': 'boolean',
  'git-cache-hooks-env': 'boolean',
  'git-hook-env-shell': 'string',

  // Copilot
  'always-use-copilot-for-conflict-resolution': 'boolean',
}

/** A setting value as written in a configuration file. */
export type SettingValue = boolean | number | string | object

export type Settings = Readonly<Record<string, SettingValue>>

/** Whether the given key is a setting that can be exported and imported. */
export function isExportableSetting(key: string) {
  return Object.prototype.hasOwnProperty.call(ExportableSettings, key)
}

/**
 * Validate a setting value read from a configuration file.
 *
 * @returns An error message, or null if the value is valid for the key.
 */
export function validateSetting(key: string, value: unknown): string | null {
  if (!isExportableSetting(key)) {
    return 'is not a supported setting'
  }

  const kind = ExportableSettings[key]
  switch (kind) {
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false'
    case 'number':
      return typeof value === 'number' && Number.isInteger(value)
        ? null
        : 'must be an integer'
    case 'string':
      return typeof value === 'string' ? null : 'must be a string'
    case 'json':
      return typeof value === 'object' && value !== null
        ? null
        : 'must be an object'
  }
}

function decodeSetting(kind: SettingKind, raw: string): SettingValue | null {
  switch (kind) {
    case 'boolean':
      if (raw === '1' || raw === 'true') {
        return true
      }
      return raw === '0' || raw === 'false' ? false : null
    case 'number': {
      const value = parseInt(raw, 10)
      return isNaN(value) ? null : value
    }
    case 'string':
      return raw
    case 'json':
      try {
        const value = JSON.parse(raw)
        return typeof value === 'object' && value !== null ? value : null
      } catch {
        return null
      }
  }
}

function encodeSetting(kind: SettingKind, value: SettingValue): string {
  switch (kind) {
    case 'boolean':
      return value ? '1' : '0'
    case 'number':
    case 'string':
      return String(value)
    case 'json':
      return JSON.stringify(value)
  }
}

/** Read the exportable settings that have been set from localStorage. */
export function readSettings(storage: Storage = localStorage): Settings {
  const settings: Record<string, SettingValue> = {}

  for (const [key, kind] of Object.entries(ExportableSettings)) {
    const raw = storage.getItem(key)
    if (raw === null) {
      continue
    }

    const value = decodeSetting(kind, raw)
    if (value !== null) {
      settings[key] = value
    }
  }

  return settings
}

/**
 * Write imported settings to localStorage. Settings are loaded once at
 * startup, so the window has to be reloaded for them to take effect.
 */
export function writeSettings(
  settings: Settings,
  storage: Storage = localStorage
) {
  for (const [key, value] of Object.entries(settings)) {
    if (validateSetting(key, value) === null) {
      storage.setItem(key, encodeSetting(ExportableSettings[key], value))
    }
  }
}
