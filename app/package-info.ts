import { bundleID, companyName, productName, version } from './package.json'

export function getProductName() {
  return process.env.NODE_ENV === 'development'
    ? `${productName}-dev`
    : productName
}

export function getCompanyName() {
  return companyName
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

/** 安装到 /usr/local/bin 的命令行工具名称。 */
export function getCLIName() {
  return isOfficialApp()
    ? 'github'
    : productName.toLowerCase().replace(/\s+/g, '-')
}
