// The label shown on the band. plugin.json deliberately has no "version": leaving it
// out makes every commit to main an update for installed users. Change this only when
// cutting a visible release, and tag it (git tag -a vX.Y.Z).
export const BRAND = 'claudius-modulus'
export const VERSION = '1.9.3'

// 1.8.3 -> v1.8.3
export function versionLabel(version: string = VERSION): string {
  return `v${version}`
}

// The label links to its release page: v1.8.3 -> .../releases/tag/v1.8.3
export function releaseUrl(version: string = VERSION): string {
  return `https://github.com/thealrivera/claudius-modulus/releases/tag/${versionLabel(version)}`
}
