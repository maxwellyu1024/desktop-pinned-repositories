/* eslint-disable no-sync */

import * as Fs from 'fs'
import * as Os from 'os'
import * as Path from 'path'

/** 改名前使用过的产品名；首次启动时从中迁移用户数据。 */
export const legacyProductNames: ReadonlyArray<string> = [
  'GitHub Desktop Pinned',
]

/** Chromium 单实例锁等运行时文件，属于创建它们的进程，不复制。 */
const instanceFiles = new Set([
  'SingletonLock',
  'SingletonSocket',
  'SingletonCookie',
  'DevToolsActivePort',
  'lockfile',
])

/**
 * 新数据目录是否还没有任何内容。Electron 在主进程脚本运行前就会创建空的
 * userData 目录，因此首次启动的判断依据是目录为空，而不是目录不存在。
 */
function isEmptyOrMissing(path: string) {
  try {
    return Fs.readdirSync(path).length === 0
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT'
  }
}

/**
 * 找到需要迁移的旧数据目录。新目录有内容时不迁移，保证只在首次启动时执行一次。
 *
 * @param appDataPath 系统应用数据目录（`app.getPath('appData')`）
 * @param userDataPath 当前应用数据目录（`app.getPath('userData')`）
 * @param suffix 开发构建的目录后缀（`-dev`）
 */
export function findLegacyUserDataPath(
  appDataPath: string,
  userDataPath: string,
  suffix: string
): string | null {
  if (!isEmptyOrMissing(userDataPath)) {
    return null
  }

  for (const name of legacyProductNames) {
    const path = Path.join(appDataPath, `${name}${suffix}`)
    if (path !== userDataPath && Fs.existsSync(path)) {
      return path
    }
  }

  return null
}

/**
 * 旧应用是否仍在使用该数据目录。macOS 与 Linux 上 Chromium 的单实例锁是指向
 * `<hostname>-<pid>` 的符号链接。
 */
export function isUserDataInUse(userDataPath: string): boolean {
  let target: string
  try {
    target = Fs.readlinkSync(Path.join(userDataPath, 'SingletonLock'))
  } catch {
    return false
  }

  const separator = target.lastIndexOf('-')
  const hostname = target.slice(0, separator)
  const pid = parseInt(target.slice(separator + 1), 10)
  if (hostname !== Os.hostname() || isNaN(pid)) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // EPERM 表示进程存在但属于其他用户
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * 将旧数据目录完整复制到新目录，旧目录保持不变。先复制到临时目录再重命名，
 * 中途失败不会留下不完整的新目录，下次启动会重新迁移。新目录只能为空或不存在。
 */
export function copyLegacyUserData(source: string, destination: string) {
  const staging = `${destination}.migrating`
  Fs.rmSync(staging, { recursive: true, force: true })

  try {
    Fs.cpSync(source, staging, {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
      filter: path => !instanceFiles.has(Path.basename(path)),
    })
    // Electron 启动时创建的空目录，删除后才能在所有平台上重命名
    if (Fs.existsSync(destination)) {
      Fs.rmdirSync(destination)
    }
    Fs.renameSync(staging, destination)
  } catch (e) {
    Fs.rmSync(staging, { recursive: true, force: true })
    throw e
  }
}
