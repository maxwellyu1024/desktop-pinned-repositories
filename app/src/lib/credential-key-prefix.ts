/**
 * Prefix for keychain entries owned by this app (SSH passphrases, Copilot
 * BYOK secrets, git credentials). Derived from the product name so that an
 * independently branded build never reads or overwrites the official app's
 * entries.
 */
export const appCredentialKeyPrefix = __DEV__
  ? `${__APP_NAME__} Dev`
  : __APP_NAME__

/**
 * Prefix for keychain entries holding account tokens. The official production
 * app keeps its historical `GitHub` prefix so existing sign-ins survive.
 */
export const accountCredentialKeyPrefix =
  __OFFICIAL_APP__ && !__DEV__ ? 'GitHub' : appCredentialKeyPrefix
