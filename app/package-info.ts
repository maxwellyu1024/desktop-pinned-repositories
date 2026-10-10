import {
  bundleID,
  companyName,
  productName,
  repository,
  version,
} from './package.json'

export function getProductName() {
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : productName
}

export function getCompanyName() {
  return companyName
}

/** 源码仓库的网页地址，用于报告问题等链接。 */
export function getRepositoryURL() {
  return repository.url.replace(/\.git$/, '')
}

export function getVersion() {
  return version
}

export function getBundleID() {
  return process.env.NODE_ENV === 'development' ? `${bundleID}Dev` : bundleID
}

/** 官方 GitHub Desktop 的 Bundle ID，只有官方构建才接入更新与系统级协议。 */
const OfficialBundleID = 'com.github.GitHubClient'

/** 当前构建是否是官方 GitHub Desktop（而非独立身份的 fork）。 */
export function isOfficialApp() {
  return bundleID === OfficialBundleID
}

/**
 * Windows 上的应用标识：可执行文件名、Squirrel 包名与安装目录。
 * fork 由产品名派生，避免安装到官方 GitHub Desktop 的目录。
 */
export function getWindowsIdentifierName() {
  return isOfficialApp()
    ? 'GitHubDesktop'
    : productName.replace(/[^A-Za-z0-9]/g, '')
}

/** Linux 上的可执行文件名，同时用作 .deb 包名与安装目录名。 */
export function getLinuxExecutableName() {
  return isOfficialApp() ? 'desktop' : getCLIName()
}

/** 安装到 /usr/local/bin 的命令行工具名称。 */
export function getCLIName() {
  return isOfficialApp()
    ? 'github'
    : productName.toLowerCase().replace(/\s+/g, '-')
}
