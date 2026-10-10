# 改名为 GHDock

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

## 旧版数据

不兼容、不迁移改名前 “GitHub Desktop Pinned” 的任何数据：不读取其数据目录、不作为“从其他应用添加”的来源、
不迁移钥匙串凭据。GHDock 从空数据目录开始，仓库通过“从其他应用添加”（GitHub Desktop、编辑器）、
“从文件夹添加”或导入配置文件重新加入。旧数据目录由用户自行处置，应用不做任何修改。

## 验证

- 代码中不存在对 “GitHub Desktop Pinned” 的引用（`grep` 结果为 0）。
