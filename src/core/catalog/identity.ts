/** Canonical provider-qualified catalog identity shared by data layers. */
export function canonicalId(provider: string, externalId: string): string {
  return `${provider}:${externalId}`;
}
