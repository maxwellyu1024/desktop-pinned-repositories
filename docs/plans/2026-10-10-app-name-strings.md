# 界面文案中的应用名

## 目标

界面、对话框、通知、错误信息中硬编码的 “GitHub Desktop” 为 0 处，全部使用构建期常量
`__APP_NAME__`（`app/package.json` 的 `productName`；官方构建仍为 “GitHub Desktop”）。

## 常量

| 常量 | 来源 | 用途 |
| --- | --- | --- |
| `__APP_NAME__` | `productName` | 文案中的应用名 |
| `__REPOSITORY_URL__` | `repository.url`（去掉 `.git`） | 问题反馈链接、致谢页的源码链接 |

fork 仓库为 `https://github.com/maxwellyu1024/ghdock`。帮助菜单 “Report issue”
指向 `${__REPOSITORY_URL__}/issues/new/choose`，崩溃页指向 `${__REPOSITORY_URL__}/issues`。
fork 默认关闭 Issues，需在仓库 Settings → Features 中开启。

## 保留原文的位置

指代上游项目或 GitHub 产品本身，而非本应用：

- 服务条款（法律文本）。
- Copilot 设置项名称 “Copilot in GitHub Desktop” 以及 Copilot 文档链接标题。
- 致谢页 “based on GitHub Desktop” 与贡献者感谢页。
- 代码注释。

## 顺带修复

Windows 通知激活器 CLSID 查找与桌面快捷方式检查原先硬编码 `GitHub Desktop.lnk`，
Squirrel 实际按产品名创建 `GHDock.lnk`；改为 `${__APP_NAME__}.lnk`。

## 国际化

不引入国际化框架：上游没有 i18n，把文案抽取为键会改动数百个文件，每次合并上游都会冲突。
