import { advanceOperatorAccount } from './growthOperatorAccount';
import { isValidGrowthState, iterateGrowthCycle, type GrowthCycleResult, type GrowthCycleState, type GrowthSide } from './exponentialTriggers';
import type { GrowthOperatorAccount } from './growthOperatorAccount';

export type SettledGameDay = {
  state: GrowthCycleState;
  account: GrowthOperatorAccount;
  miningMint: number;
  bitcoinMint: number;
  burned: number;
  result: GrowthCycleResult;
};

// The network and personal account consume the very same daily settlement.
// Engine results contain cumulative issuance; the account receives daily deltas.
export function* projectGameDays(state: GrowthCycleState, account: GrowthOperatorAccount, side: GrowthSide, miningSeats?: number, bitcoinTarget?: number): Generator<SettledGameDay> {
  let miningMint = 0, argonotMint = 0, bitcoinMint = 0, burned = 0;
  for (const result of iterateGrowthCycle({ ...state, activeSide: side, status: 'running' }, { miningSeats, bitcoinTarget })) {
    if (!isValidGrowthState(result.next) || result.pauseReason === 'invalid-state') throw new Error('Invalid daily simulation state');
    const dailyMiningMint = result.miningMintLoaded - miningMint;
    const dailyBitcoinMint = result.bitcoinMintLoaded - bitcoinMint;
    const dailyBurned = result.argonBurned - burned;
    account = advanceOperatorAccount(account, result.next, dailyMiningMint, result.argonotMintLoaded - argonotMint);
    miningMint = result.miningMintLoaded;
    argonotMint = result.argonotMintLoaded;
    bitcoinMint = result.bitcoinMintLoaded;
    burned = result.argonBurned;
    yield { state: result.next, account, miningMint: dailyMiningMint, bitcoinMint: dailyBitcoinMint, burned: dailyBurned, result };
    if (result.outcome !== 'in-progress') return;
    if (result.days >= 3650) throw new Error('Simulation phase exceeded ten years');
  }
}
