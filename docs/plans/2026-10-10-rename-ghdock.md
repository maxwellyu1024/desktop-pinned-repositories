# 改名为 GHDock 与数据迁移

## 目标

fork 不再使用 “GitHub Desktop” 字样，统一更名为 **GHDock**。`app/package.json` 的
`productName`、`bundleID` 是唯一配置点，其余标识全部由它派生：

| 项目 | 改名前 | 改名后 |
| --- | --- | --- |
| 产品名 / 数据目录 | GitHub Desktop Pinned | GHDock |
| Bundle ID | io.github.maxwellyu1024.GitHubDesktopPinned | io.github.maxwellyu1024.GHDock |
| Windows 标识 / 安装目录 | GitHubDesktopPinned | GHDock（`%LOCALAPPDATA%\GHDock`） |
| 命令行工具 / Linux 包名 | github-desktop-pinned | ghdock |
| 钥匙串前缀 | GitHub Desktop Pinned | GHDock |

## 数据迁移

首次启动 GHDock 时，主进程在任何代码写入 userData 之前执行迁移
（`app/src/main-process/migrate-legacy-user-data.ts`，逻辑在 `app/src/lib/legacy-user-data.ts`）：

- 仅当新目录不存在、旧目录（`<appData>/GitHub Desktop Pinned`，开发构建带 `-dev`）存在时执行，
  因此只运行一次；官方构建不执行。
- 整个目录复制：IndexedDB（仓库、置顶）、Local Storage（账号列表、偏好）、窗口状态、日志等。
  页面来源仍是 `file://`，复制后的存储可直接使用。
- 只复制不删除，旧目录原样保留；Chromium 单实例锁等运行时文件不复制。
- 先复制到 `<新目录>.migrating`，完成后原子重命名；失败时清理临时目录，弹窗并退出，
  不创建新目录，下次启动重新迁移。
- 旧应用仍在运行（`SingletonLock` 指向本机存活进程）时弹窗提示先退出旧应用，然后退出，
  避免复制正在写入的 LevelDB。

钥匙串凭据以产品名为前缀。检查本机钥匙串，没有 `GitHub Desktop Pinned` 前缀的条目，
无需迁移；改名后在 GHDock 中登录即写入 `GHDock - …` 条目。

## 验证

- 单元测试 `app/test/unit/legacy-user-data-test.ts`：查找规则、完整复制、锁文件排除、失败回滚、运行检测。
- 用本机真实旧目录演练复制到临时目录：除 4 个运行时锁文件外内容完全一致。
