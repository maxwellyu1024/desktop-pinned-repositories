# Fork 构建改为独立应用

## 问题

Fork 构建与官方 GitHub Desktop 使用相同的产品名与 Bundle ID（`com.github.GitHubClient`），导致：

- 数据目录相同（`~/Library/Application Support/GitHub Desktop`）。Fork 使用更新的 Electron 写入 IndexedDB 后，官方版启动时无法读取并重建数据库，仓库列表、Pin 与排序全部丢失（2026-10-10 实际发生）。
- Fork 构建向官方更新服务器检查更新，官方更新包会覆盖 fork 应用。
- 启动时通过 `setAsDefaultProtocolClient` 抢占 `x-github-client`、`github-mac` 协议，github.com 的 “Open with GitHub Desktop” 会被导向 fork。
- 钥匙串条目同名（`GitHub - <endpoint>`、`GitHub Desktop - …`），fork 登录/登出会覆盖或删除官方版的凭据。
- 命令行工具同为 `/usr/local/bin/github`，安装时互相覆盖。

## 目标

Fork 与官方版可同时安装、同时运行，共享资源数为 0：

| 资源 | 官方版 | Fork |
| --- | --- | --- |
| 产品名 / 数据目录 | GitHub Desktop | GHDock |
| Bundle ID | com.github.GitHubClient | io.github.maxwellyu1024.GHDock |
| 自动更新 | 开启 | 关闭（检查入口、关于对话框按钮均不出现） |
| URL 协议 | x-github-client、github-mac、OAuth 回调 | 仅 OAuth 回调 |
| 钥匙串前缀 | GitHub / GitHub Desktop | GHDock |
| 命令行工具 | /usr/local/bin/github | /usr/local/bin/ghdock |

## 设计

### 身份来源

`app/package.json` 的 `productName`、`bundleID` 是唯一配置点。`app/package-info.ts` 新增：

- `isOfficialApp()`：`bundleID === 'com.github.GitHubClient'`。
- `getCLIName()`：官方为 `github`，其余为产品名转小写、空白替换为 `-`。

`app/app-info.ts` 注入编译期常量 `__OFFICIAL_APP__`、`__CLI_NAME__`（测试环境 `app/test/globals.mts` 同步注入）。

### 自动更新

`__OFFICIAL_APP__` 为 false 时：

- `App` 不启动定时检查，`checkForUpdates` 直接返回。
- `UpdateStore.checkForUpdates` 直接返回（所有检查的唯一出口）。
- 关于对话框不显示检查更新按钮。

### URL 协议

- `script/build.ts`：Info.plist 注册的 OAuth 回调协议与运行时一致——没有 OAuth secret 时为 `x-github-desktop-dev-auth`（此前 fork 注册 `x-github-desktop-auth`、运行时监听 dev 协议，浏览器登录回调无法回到应用）。`x-github-client`、`github-mac` 仅官方注册。
- `main.ts` 的 `possibleProtocols` 同样仅官方包含 `x-github-client` 与 Classic 协议，启动时不再抢占默认处理程序。
- 打开本地仓库使用 `open -a "GHDock" <目录>`（`open-file` 事件）或命令行工具。

### 钥匙串

新增 `app/src/lib/credential-key-prefix.ts`：

- `appCredentialKeyPrefix`：开发构建 `${__APP_NAME__} Dev`，否则 `__APP_NAME__`。官方版取值与原硬编码一致（`GitHub Desktop` / `GitHub Desktop Dev`）。
- `accountCredentialKeyPrefix`：官方生产构建保留历史值 `GitHub`，其余同 `appCredentialKeyPrefix`。

`auth.ts`（账户 token 与通用 git 凭据）、`ssh-credential-storage.ts`、`copilot/byok.ts` 改用上述前缀。

### 命令行工具与菜单

- `InstalledCLIPath = /usr/local/bin/${__CLI_NAME__}`，CLI 帮助文本使用 `__CLI_NAME__` 与 `__APP_NAME__`。
- macOS 应用菜单与 “About …” 菜单项使用 `__APP_NAME__`。

## 数据

Fork 使用全新数据目录，首次启动为空；仓库通过 `open -a` 批量添加。官方版数据目录不再被 fork 读写。

## 使用数据

非官方构建不向 GitHub 发送任何使用数据（`app/src/lib/stats/stats-store.ts`）：
默认的发送实现替换为本地丢弃，每日统计照常清空、opt-in ping 不发出；
设置 → Advanced 的 “Usage” 选项与欢迎页的使用数据说明在 fork 中不显示。

## 验收

- 打包产物为 `GHDock.app`，`CFBundleIdentifier` 为 `io.github.maxwellyu1024.GHDock`，`CFBundleURLSchemes` 仅含 `x-github-desktop-dev-auth`。
- 启动后数据写入 `~/Library/Application Support/GHDock`；日志无更新检查记录。
- `tsc --noEmit` 无新增错误；ESLint、Prettier 通过；相关单元测试通过。
