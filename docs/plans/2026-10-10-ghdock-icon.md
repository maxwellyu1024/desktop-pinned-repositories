# GHDock 应用图标

## 设计

黑白灰风格，大写字母 “GHD” 加一条灰色横条（Dock 的意象）：

- 正式版：深灰渐变底（`#4a4a4a` → `#161616`），白色字母。
- 开发版：浅灰渐变底（`#fafafa` → `#cfcfcf`），深色字母；深色模式下字母为白色。

字母由 Helvetica Neue Bold 转为路径，SVG 不依赖任何字体。

## 源文件

| 文件 | 用途 |
| --- | --- |
| `app/static/logos/{prod,dev}/icon-logo.svg` | 扁平图标，渲染 Windows / Linux / 关于对话框的位图 |
| `app/static/logos/{prod,dev}/icon-logo.icon` | Icon Composer 图标（`Assets/GHD.svg` + `icon.json`），编译 macOS 26 的 Liquid Glass 图标 |
| `app/static/logos/win32-installer-splash.svg` | Windows 安装启动画面 |

## 生成

`script/build-icon-assets.sh`（需要 Xcode 与 `rsvg-convert`）由源文件生成全部产物：

- macOS：`Assets.car`、`icon-logo-legacy.icns`（actool）；actool 使用绝对路径编译，
  避免沿用上一个目录导致开发版与正式版图标相同。
- Windows：`icon-logo.ico`（16–256 共 7 个尺寸）、`win32-installer-splash.gif`。
- Linux：`app/static/linux/icon-logo.png`（512）。
- 关于对话框：`app/static/common/logo-64x64@2x.png`、`windows-logo-64x64@2x.png`（128）。

Windows “程序和功能”的图标（Squirrel `iconUrl`）在 fork 构建中指向仓库内的
`app/static/logos/prod/icon-logo.ico`，GitHub Actions 中固定到构建提交。

## 窗口标题栏

Windows 自绘标题栏左上角的应用标识由 GitHub 章鱼猫换为 `appMark`
（`app/src/ui/octicons/app-mark.ts`）：同样的 “GHD” 字母与横条，按 16px 高度绘制，
沿用标题栏的前景色与失焦半透明效果。Linux 使用系统标题栏，窗口图标为 `icon-logo.png`。
