import { app, dialog } from 'electron'
import * as Path from 'path'
import {
  copyLegacyUserData,
  findLegacyUserDataPath,
  isUserDataInUse,
} from '../lib/legacy-user-data'

/**
 * 首次启动改名后的应用时，把改名前的用户数据（仓库列表、偏好设置、窗口状态、
 * 日志等）复制到新的数据目录。必须在任何代码写入 userData 之前调用。
 *
 * 迁移无法安全完成时直接退出，不创建新目录，下次启动会再次尝试。
 */
export function migrateLegacyUserData() {
  if (__OFFICIAL_APP__) {
    return
  }

  const userDataPath = app.getPath('userData')
  const source = findLegacyUserDataPath(
    app.getPath('appData'),
    userDataPath,
    __DEV__ ? '-dev' : ''
  )
  if (source === null) {
    return
  }

  const legacyName = Path.basename(source)

  if (isUserDataInUse(source)) {
    dialog.showErrorBox(
      `请先退出 ${legacyName}`,
      `${__APP_NAME__} 首次启动需要迁移 ${legacyName} 的数据。请退出 ${legacyName} 后重新打开 ${__APP_NAME__}。`
    )
    process.exit(0)
  }

  try {
    copyLegacyUserData(source, userDataPath)
  } catch (e) {
    dialog.showErrorBox(
      '数据迁移失败',
      `无法将 ${source} 复制到 ${userDataPath}：${e}\n\n原数据未做任何修改，请处理后重新打开 ${__APP_NAME__}。`
    )
    process.exit(1)
  }

  log.info(`Migrated user data from ${source} to ${userDataPath}`)
}
