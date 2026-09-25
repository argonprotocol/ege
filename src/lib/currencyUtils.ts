// Mainnet token base units, matching the website helpers without an RPC dependency.
export function microgonToArgon(value: bigint): number {
  return Number(value) / 1_000_000;
}

export function micronotToArgonot(value: bigint): number {
  return Number(value) / 1_000_000;
}
