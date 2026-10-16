import { advanceOperatorAccount, createOperatorAccount, type GrowthOperatorAccount } from "./growthOperatorAccount";
import {
  calculateNewCohortMiningApy,
  calculateVaultRevenueShare,
  isValidGrowthState,
  iterateGrowthCycle,
  RETURN_THRESHOLD_APY,
  MINING_RETURN_TOLERANCE,
  type GrowthCycleState,
} from "./exponentialTriggers";

export type PlaybackStep = 0 | 1 | 2 | 3 | 4 | 5;

export interface PlaybackFrame {
  state: GrowthCycleState;
  operatorAccount: GrowthOperatorAccount;
  operatorValue: number;
  step: PlaybackStep;
  completedCycles: number;
  cycleDays: number;
  miningApy: number;
  vaultingApy: number;
  bidCosts: number;
  revenue: number;
  newArgon: number;
  miningRewards: number;
  networkValue: number;
  demandMiningArgon: number;
  demandBitcoinArgon: number;
  demandArgonot: number;
  demandArgonotValueChange: number;
  history: number[];
  stopReason: "bitcoin-capacity" | "no-progress" | "invalid-state" | null;
}

export function createPlayback(state: GrowthCycleState, miningAllocation?: number, initialCapital?: number): PlaybackFrame {
  if (!isValidGrowthState(state)) throw new Error("Invalid initial growth state");
  const operatorAccount = createOperatorAccount(state, miningAllocation, initialCapital);
  return {
    state,
    operatorAccount,
    operatorValue: operatorAccount.value,
    step: 0,
    completedCycles: 0,
    cycleDays: 0,
    miningApy: Math.min(calculateNewCohortMiningApy(state), 1e12),
    vaultingApy: Math.min(state.returns.vaultingApy, 1e12),
    bidCosts: 0,
    revenue: 0,
    newArgon: 0,
    miningRewards: 0,
    networkValue: state.networkValueUsd,
    demandMiningArgon: 0,
    demandBitcoinArgon: 0,
    demandArgonot: 0,
    demandArgonotValueChange: 0,
    history: [state.networkValueUsd],
    stopReason: null,
  };
}

// Economic states advance only in the APY steps. The four other steps reveal
// already-calculated effects; they never mint funds or run the engine again.
export function* iteratePlaybackStep(
  initial: PlaybackFrame,
  engine: typeof iterateGrowthCycle = iterateGrowthCycle,
): Generator<PlaybackFrame, PlaybackFrame, void> {
  if (initial.stopReason === "no-progress" || initial.stopReason === "invalid-state") return initial;
  let frame = { ...initial, stopReason: null } as PlaybackFrame;
  const step = frame.step;
  if (step === 0 || step === 3) {
    if (step === 0) {
      frame.cycleDays = 0;
      frame.bidCosts = 0;
      frame.demandMiningArgon = 0;
      frame.demandBitcoinArgon = 0;
      frame.demandArgonot = 0;
      frame.demandArgonotValueChange = 0;
    }
    const side = step === 0 ? "mining" : "vaulting";
    const apy = side === "mining" ? calculateNewCohortMiningApy(frame.state) : frame.state.returns.vaultingApy;
    const needsAdjustment = side === "mining"
      ? apy > RETURN_THRESHOLD_APY + MINING_RETURN_TOLERANCE
      : apy >= RETURN_THRESHOLD_APY;
    if (needsAdjustment && frame.state.status === "running") {
      const startingDays = frame.cycleDays;
      const iterator = engine({ ...frame.state, activeSide: side });
      let previousMiningMint = 0;
      let previousArgonotMint = 0;
      while (true) {
        const next = iterator.next();
        if (next.done) break;
        const result = next.value;
        if (!isValidGrowthState(result.next)) {
          return { ...frame, stopReason: "invalid-state" };
        }
        const operatorAccount = advanceOperatorAccount(
          frame.operatorAccount,
          result.next,
          result.miningMintLoaded - previousMiningMint,
          result.argonotMintLoaded - previousArgonotMint,
        );
        previousMiningMint = result.miningMintLoaded;
        previousArgonotMint = result.argonotMintLoaded;
        frame = {
          ...frame,
          operatorAccount,
          operatorValue: operatorAccount.value,
          state: result.next,
          cycleDays: startingDays + result.days,
          networkValue: result.next.networkValueUsd,
          miningApy: step === 0 ? Math.min(calculateNewCohortMiningApy(result.next), 1e12) : frame.miningApy,
          vaultingApy: step === 3 ? Math.min(result.next.returns.vaultingApy, 1e12) : frame.vaultingApy,
          bidCosts: step === 0 ? result.argonBidAdded * initial.state.argonPriceUsd : frame.bidCosts,
          // Only newly issued miner ARGN enters this transfer. BTC-backed ARGN
          // and ARGNOT issuance remain in the engine's network valuation.
          newArgon: step === 3 ? result.miningMintLoaded : frame.newArgon,
          // Engine totals are cumulative within this invocation. Add the starting
          // totals so resuming a capacity pause retains the earlier issuance.
          demandMiningArgon: step === 3 ? initial.demandMiningArgon + result.miningMintLoaded : frame.demandMiningArgon,
          demandBitcoinArgon: step === 3 ? initial.demandBitcoinArgon + result.bitcoinMintLoaded : frame.demandBitcoinArgon,
          demandArgonot: step === 3 ? initial.demandArgonot + result.argonotMintLoaded : frame.demandArgonot,
          demandArgonotValueChange: step === 3
            ? initial.demandArgonotValueChange
              + (result.next.argonotCirculation * result.next.argonotPriceUsd
                - initial.state.argonotCirculation * initial.state.argonotPriceUsd) / initial.state.argonPriceUsd
            : frame.demandArgonotValueChange,
          stopReason: result.pauseReason,
        };
        yield frame;
        if (result.outcome === "paused") return frame;
        if (result.outcome !== "in-progress") break;
      }
    }
  } else if (step === 1) {
    frame = { ...frame, revenue: frame.bidCosts * calculateVaultRevenueShare(frame.state) };
    yield frame;
  } else if (step === 2) {
    frame = { ...frame, vaultingApy: Math.min(frame.state.returns.vaultingApy, 1e12) };
    yield frame;
  } else if (step === 4) {
    frame = { ...frame, miningRewards: frame.newArgon * frame.state.argonPriceUsd };
    yield frame;
  } else {
    frame = { ...frame, miningRewards: 0, miningApy: Math.min(calculateNewCohortMiningApy(frame.state), 1e12) };
    yield frame;
  }
  return {
    ...frame,
    step: ((step + 1) % 6) as PlaybackStep,
    cycleDays: step === 5 ? 0 : frame.cycleDays,
    completedCycles: frame.completedCycles + (step === 5 ? 1 : 0),
    bidCosts: step === 5 ? 0 : frame.bidCosts,
    revenue: step === 5 ? 0 : frame.revenue,
    newArgon: step === 5 ? 0 : frame.newArgon,
    history: step === 5 ? [...frame.history, frame.networkValue] : frame.history,
  };
}
