/** The kinds of keys Git can sign commits with, see `gpg.format`. */
export type SigningFormat = 'openpgp' | 'ssh' | 'x509'

export const SigningFormats: ReadonlyArray<SigningFormat> = [
  'openpgp',
  'ssh',
  'x509',
]

/** How commits made with an identity are signed. */
export interface IIdentitySigning {
  readonly format: SigningFormat

  /**
   * The value of `user.signingkey`: a key ID for OpenPGP and X.509, the path
   * to a public key or a `key::` literal for SSH. Never the private key.
   */
  readonly key: string
}

/**
 * Which repositories an identity applies to: those whose default remote is on
 * `host` and, when given, under `namespace`.
 */
export interface IIdentityRule {
  /** The real host, e.g. `github.com`, never an SSH host alias. */
  readonly host: string

  /**
   * A namespace prefix of the repository path, e.g. `octocat` or
   * `group/subgroup`. Matches whole path segments only.
   */
  readonly namespace?: string
}

/**
 * Who a repository commits and pushes as. Applying an identity writes it to
 * the repository's own `.git/config` so every Git client uses it.
 */
export interface IIdentity {
  readonly id: string

  /** A unique name for the identity, e.g. the account it represents. */
  readonly label: string

  /** `user.name` */
  readonly authorName: string

  /** `user.email` */
  readonly authorEmail: string

  readonly signing?: IIdentitySigning

  /**
   * A `Host` from the user's SSH configuration. SSH remotes on the same real
   * host are rewritten to `git@<alias>:<path>.git` so they use its key.
   */
  readonly sshHostAlias?: string

  /** In order of precedence for repositories that match several identities. */
  readonly rules: ReadonlyArray<IIdentityRule>
}

/** How a repository chooses its identity. */
export type RepositoryIdentityBinding =
  /** The identity whose rule matches the default remote, if any. */
  | { readonly kind: 'automatic' }
  /** No identity, the repository's Git configuration is left alone. */
  | { readonly kind: 'none' }
  /** The given identity, whatever the remote is. */
  | { readonly kind: 'identity'; readonly id: string }

export const AutomaticIdentityBinding: RepositoryIdentityBinding = {
  kind: 'automatic',
}

/** Whether two bindings choose the identity the same way. */
export function bindingsEqual(
  a: RepositoryIdentityBinding,
  b: RepositoryIdentityBinding
) {
  return (
    a.kind === b.kind &&
    (a.kind !== 'identity' || (b.kind === 'identity' && a.id === b.id))
  )
}
