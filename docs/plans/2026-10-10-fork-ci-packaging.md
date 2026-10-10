# fork 自动打包：macOS / Windows / Ubuntu

## 目标

推送 `development` 后，GitHub Actions 自动产出 3 个平台的安装包，无需任何证书或密钥：

| 平台 | Runner | 架构 | 产物 |
| --- | --- | --- | --- |
| macOS | `macos-14` | arm64 | `<productName>-arm64.zip`（ad-hoc 签名） |
| Windows | `windows-2022` | x64 | `<WindowsId>Setup-x64.exe`、`<WindowsId>Setup-x64.msi`（未签名） |
| Ubuntu | `ubuntu-22.04` | x64 | `<cliName>_<version>_amd64.deb` |

产物上传为 Actions 构建产物，并滚动更新预发布版本 `development-latest`。
上游工作流（CI、CodeQL、triage、release）在 GitHub 网页上停用，不改动文件，避免合并上游时冲突。

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
