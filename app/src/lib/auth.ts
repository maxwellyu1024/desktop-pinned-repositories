import { Account } from '../models/account'
import { accountCredentialKeyPrefix } from './credential-key-prefix'

/** Get the auth key for the user. */
export function getKeyForAccount(account: Account): string {
  return getKeyForEndpoint(account.endpoint)
}

/** Get the auth key for the endpoint. */
export function getKeyForEndpoint(endpoint: string): string {
  return `${accountCredentialKeyPrefix} - ${endpoint}`
}
