# fork 自动打包：macOS / Windows / Ubuntu

## 目标

推送 `development` 后，GitHub Actions 自动产出 3 个平台的安装包，无需任何证书或密钥：

| 平台 | Runner | 架构 | 产物 |
| --- | --- | --- | --- |
| macOS | `macos-14` | arm64 | `<productName>-arm64.zip`（ad-hoc 签名） |
| Windows | `windows-2022` | x64 | `<WindowsId>Setup-x64.exe`、`<WindowsId>Setup-x64.msi`（未签名） |
| Ubuntu | `ubuntu-22.04` | x64 | `<cliName>_<version>_amd64.deb` |

产物上传为 Actions 构建产物，并滚动更新预发布版本 `development-latest`。
fork 只保留 `fork-package.yml`。上游工作流（CI、CodeQL、triage、release）及其专用配置
（`.github/codeql`、`.github/aw`、`.github/actions/setup-windows-signing`）已删除：
它们依赖上游的签名证书与密钥，在 fork 中无法运行。合并上游时这些文件若有改动，
冲突一律按删除处理（`git rm`）。

登录用的 OAuth App 为可选配置：在仓库 Secrets 中同时设置 `DESKTOP_OAUTH_CLIENT_ID`、
`DESKTOP_OAUTH_CLIENT_SECRET`（回调地址 `x-github-desktop-auth://oauth`）后，打包版使用
自有 OAuth App；未设置时回退到上游公开的开发用 OAuth App，回调协议为
`x-github-desktop-dev-auth`。构建、打包、运行时三处的协议选择保持一致。

## Windows 独立身份

此前 Windows 标识沿用官方的 `GitHubDesktop`，Squirrel 会安装到
`%LOCALAPPDATA%\GitHubDesktop` 并覆盖官方应用，CLI `github` 也会冲突。终态：

- `getWindowsIdentifierName()` 移入 `app/package-info.ts`：官方构建为 `GitHubDesktop`，
  fork 由 `productName` 去掉非字母数字得到（`GHDock`），改名时自动跟随。
- 可执行文件、Squirrel 包名、安装目录、AppUserModelID
  （`com.squirrel.<id>.<id>`）全部使用该标识；通过 `__WINDOWS_IDENTIFIER__` 注入运行时。
- `cli/main.ts` 按标识启动 `<id>.exe`；`static/win32/github.{bat,sh}` 中的
  `GitHubDesktop.exe` 在构建时替换为 `<id>.exe`。
- Squirrel 写入 `bin` 的 CLI 跳板使用 `__CLI_NAME__`（`ghdock`），与官方 `github` 并存。
- 增量包（delta）仅官方构建生成，fork 不再拉取官方更新源做差分。

## Ubuntu 打包

- 可执行文件名：官方 `desktop`，fork 使用 `getCLIName()`（`ghdock`）。
- `script/package-linux.ts` 用 `dpkg-deb --root-owner-group` 生成 `.deb`，零新增依赖：
  - `/opt/<name>/`：打包后的应用；`chrome-sandbox` 设为 `4755`，满足 Ubuntu 24.04 的沙箱要求；
  - `/usr/bin/<name>` → `/opt/<name>/<name>`；
  - `/usr/share/applications/<name>.desktop`，含 OAuth 回调协议的 `x-scheme-handler`；
  - `/usr/share/icons/hicolor/512x512/apps/<name>.png`；
  - `DEBIAN/control`：版本号 `3.6.7-beta3` 转为 `3.6.7~beta3`，声明 Electron 运行依赖。
- 在 `ubuntu-22.04` 上构建，glibc 兼容 22.04 与 24.04；构建前安装 `libsecret-1-dev`（keytar）。

## 验证

- 本地：`tsc`、eslint、`dist-info`/`package-info` 相关单元测试。
- CI：3 个平台任务全部成功，`development-latest` 包含 4 个安装文件。
