import snapshot from '../data/argonBasics.json';
import type { IBasicsRecord } from '../interfaces/IBasicsRecord';
import { calculateNewCohortMiningApy, createGrowthCycle } from './exponentialTriggers';

// Decode the website's JsonExt bigint strings without its RPC dependencies.
export const mainnetBasics: IBasicsRecord = JSON.parse(JSON.stringify(snapshot), (_, value) =>
  typeof value === 'string' && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value);
const initialState = createGrowthCycle(mainnetBasics);
export const miningApy = Math.min(calculateNewCohortMiningApy(initialState), 1e12);
export const vaultingApy = Math.min(initialState.returns.vaultingApy, 1e12);
export const mainnetUpdatedAt = snapshot.lastUpdatedAt;
export const startingNetworkValue = initialState.networkValueUsd / initialState.argonPriceUsd;
