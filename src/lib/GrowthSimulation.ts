import { calculateNewCohortMiningApy, calculateReturns, calculateVaultRevenueShare, createGrowthCycle,
  MAX_MINING_BID_PER_SEAT, MAX_USABLE_BITCOIN, MINING_COLLATERAL_MULTIPLIER, RETURN_THRESHOLD_APY,
  iterateGrowthCycle, isValidGrowthState, type GrowthCycleState, type GrowthSide } from './exponentialTriggers';
import { createPlayback, type PlaybackFrame } from './growthSimulatorPlayback';
import { ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER } from './vaultCalculator';
import type { IBasicsRecord } from '../interfaces/IBasicsRecord';

export type { GrowthSide } from './exponentialTriggers';
export type Transfer = { side: GrowthSide; bids: number; revenue: number; rewards: number; capital: number };
export type NetworkGrowth = Pick<GrowthCycleState,
  'elapsedDays' | 'argonCirculation' | 'argonotCirculation' | 'argonPriceUsd' | 'argonotPriceUsd' | 'networkValueUsd'>;
export type SimulationDay = { day: number; date: string; miningApy: number; vaultingApy: number };
function describeDay(state: GrowthCycleState): SimulationDay {
  const date = new Date(state.snapshotAt);
  date.setUTCDate(date.getUTCDate() + state.elapsedDays);
  return { day: state.elapsedDays, date: date.toISOString(),
    miningApy: Math.min(calculateNewCohortMiningApy(state), 1e12),
    vaultingApy: Math.min(state.returns.vaultingApy, 1e12) };
}
export type SimulationView = { days: SimulationDay[]; network: NetworkGrowth; frame: PlaybackFrame; vaultingPayout: number; before: { mining: number; vaulting: number }; transfer: Transfer | null };

export function apyFor(frame: PlaybackFrame, side: GrowthSide): number {
  return side === 'mining' ? frame.miningApy : frame.vaultingApy;
}

export const VAULTING_MIN_APY = 53.99;
export const minimumApyFor = (side: GrowthSide) => side === 'vaulting' ? VAULTING_MIN_APY : RETURN_THRESHOLD_APY;

// Capital needed to earn the requested annualized return on fixed ten-day earnings.
export function vaultingCapitalForApy(earnings: number, apy = VAULTING_MIN_APY): number {
  return earnings / ((1 + apy / 100) ** (10 / 365) - 1);
}

// Map slider travel to the same fraction of added capital used by the shaded fill.
export function createVaultingCapitalScale(view: SimulationView) {
  const state = view.frame.state;
  const total = state.vaultArgonSecuritization * (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER);
  const added = view.transfer?.side === 'vaulting' ? view.transfer.capital / state.argonPriceUsd : 0;
  const baseline = total - added;
  const earnings = view.vaultingPayout - total;
  const capacity = MAX_USABLE_BITCOIN * state.bitcoinPriceUsd / state.argonPriceUsd
    * (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER);
  const maximum = Math.max(baseline, Math.min(capacity, vaultingCapitalForApy(earnings)));
  const range = maximum - baseline;
  return {
    fraction: range > 0 ? Math.max(0, Math.min(1, added / range)) : 0,
    toPosition: (apy: number) => range > 0
      ? Math.max(0, Math.min(1, (vaultingCapitalForApy(earnings, apy) - baseline) / range)) : 0,
    toApy: (position: number) => {
      const capital = baseline + Math.max(0, Math.min(1, position)) * range;
      return Math.max(VAULTING_MIN_APY, ((1 + earnings / capital) ** (365 / 10) - 1) * 100);
    },
  };
}

function transferFrom(baseline: SimulationView, side: GrowthSide, target: number): SimulationView {
  const previous = baseline.frame.state;
  const state = structuredClone(previous);
  const price = state.argonPriceUsd;
  let rewardFunding = 0;
  if (side === 'mining') {
    const tenDayReturn = (1 + target / 100) ** (10 / 365) - 1;
    const rewardsUsd = (state.baseArgonRewards + state.pendingMiningMint) * price
      + state.baseArgonotRewards * state.argonotPriceUsd;
    // Website bidForTenDayReturn formula for a prospective ten-day cohort.
    state.miningAuctionRevenue = rewardsUsd / (1 + (1 + MINING_COLLATERAL_MULTIPLIER) * tenDayReturn) / price;
    state.expectedMiningAuctionRevenue = state.miningAuctionRevenue;
    state.seatCount = Math.max(state.seatCount, Math.ceil(state.miningAuctionRevenue / MAX_MINING_BID_PER_SEAT));
    state.argonsBidPerSeat = state.miningAuctionRevenue / state.seatCount;
    state.argonotsBidPerSeat = MINING_COLLATERAL_MULTIPLIER * state.argonsBidPerSeat * price / state.argonotPriceUsd;
    state.miningCohortSeats = Array.from({ length: 10 }, (_, i) => Math.floor(state.seatCount / 10) + (i >= 10 - state.seatCount % 10 ? 1 : 0));
    state.dailySeatCount = state.miningCohortSeats[9];
    state.miningAuctionCohortRevenues = state.miningCohortSeats.map(seats => seats * state.argonsBidPerSeat);
  } else {
    // Added principal is returned in the payout; only earnings stay fixed.
    const baselineCapital = previous.vaultArgonSecuritization * (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER);
    const totalCapital = vaultingCapitalForApy(baseline.vaultingPayout - baselineCapital, target);
    const capacity = MAX_USABLE_BITCOIN * state.bitcoinPriceUsd / price;
    state.vaultArgonSecuritization = Math.max(previous.vaultArgonSecuritization,
      Math.min(capacity, totalCapital / (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER)));
    rewardFunding = Math.max(0, state.vaultArgonSecuritization - previous.vaultArgonSecuritization);
    // TGF direct-transfer assumption: one additional ARGN of vault securitization
    // funds one ARGN of prospective mining rewards. This is not daily issuance:
    // circulation, time, prices and operator balances remain unchanged.
    state.pendingMiningMint += rewardFunding;
  }
  state.returns = calculateReturns(state);
  const miningApy = Math.min(calculateNewCohortMiningApy(state), 1e12);
  const bids = Math.max(0, state.miningAuctionRevenue - previous.miningAuctionRevenue) * price;
  const revenue = side === 'mining' ? Math.max(0, state.miningAuctionRevenue * calculateVaultRevenueShare(state)
    - previous.miningAuctionRevenue * calculateVaultRevenueShare(previous)) * price : 0;
  const rewards = rewardFunding * price;
  const capital = rewardFunding * (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER) * price;
  // Payout includes both new mining revenue and returned added vault principal.
  const vaultingPayout = baseline.vaultingPayout + (revenue + capital) / price;
  const vaultingCapital = state.vaultArgonSecuritization * (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER);
  const calculatedVaultingApy = ((vaultingPayout / vaultingCapital) ** (365 / 10) - 1) * 100;
  const vaultingApy = Math.abs(calculatedVaultingApy - VAULTING_MIN_APY) < 1e-8
    ? VAULTING_MIN_APY : Math.min(calculatedVaultingApy, 1e12);
  state.returns.vaultingApy = vaultingApy;
  const frame = { ...baseline.frame, state, miningApy, vaultingApy, bidCosts: bids, revenue,
    miningRewards: rewards, newArgon: 0 };
  return { days: baseline.days, network: baseline.network, frame, vaultingPayout, before: { mining: baseline.frame.miningApy, vaulting: baseline.frame.vaultingApy },
    transfer: { side, bids, revenue, rewards, capital } };
}

export class GrowthSimulation {
  view: SimulationView;
  scales: { mining: number; vaulting: number };
  private networkState: GrowthCycleState;
  private pendingNetworkDay?: GrowthCycleState;
  private session?: { side: GrowthSide; baseline: SimulationView; networkDays?: GrowthCycleState[] };

  constructor(data: IBasicsRecord) {
    const frame = createPlayback(createGrowthCycle(data), 0.5);
    this.networkState = structuredClone(frame.state);
    const highest = Math.max(frame.miningApy, frame.vaultingApy);
    this.scales = {
      mining: this.scaleFor(frame.miningApy, frame.miningApy < highest ? 0.25 : 0.75),
      vaulting: this.scaleFor(frame.vaultingApy, frame.vaultingApy < highest ? 0.25 : 0.75),
    };
    const vaultingPayout = frame.state.vaultArgonSecuritization * (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER)
      + frame.state.miningAuctionRevenue * calculateVaultRevenueShare(frame.state);
    this.view = { days: [describeDay(this.networkState)], network: this.networkState, frame, vaultingPayout, before: { mining: frame.miningApy, vaulting: frame.vaultingApy }, transfer: null };
    // Prepare the lower return's receiving scale before the first interaction.
    const source = frame.miningApy >= frame.vaultingApy ? 'mining' : 'vaulting';
    const receiver = source === 'mining' ? 'vaulting' : 'mining';
    const projected = transferFrom(this.view, source, minimumApyFor(source));
    this.scales[receiver] = this.scaleFor(apyFor(projected.frame, receiver));
  }

  private scaleFor(apy: number, fraction = 0.9): number {
    const target = Math.max(1, apy) / fraction;
    const increment = 10 ** (Math.floor(Math.log10(target)) - 1);
    return Math.ceil(target / increment) * increment;
  }

  canBegin(_side: GrowthSide): boolean {
    return true;
  }

  begin(side: GrowthSide): boolean {
    if (this.session?.side === side) return true;
    const days = this.session?.networkDays;
    if (days?.length) {
      // Commit only the previewed portion, never the unvisited end of the timeline.
      const position = this.view.network.elapsedDays - days[0].elapsedDays;
      const index = Math.min(days.length - 1, Math.floor(position + 1e-9));
      this.networkState = days[index];
      this.pendingNetworkDay = position - index > 1e-9 ? days[index + 1] : undefined;
    }
    this.session = { side, baseline: this.view };
    const receiver = side === 'mining' ? 'vaulting' : 'mining';
    const projected = transferFrom(this.view, side, minimumApyFor(side));
    this.scales = { ...this.scales, [receiver]: this.scaleFor(apyFor(projected.frame, receiver)) };
    return true;
  }

  limit(side: GrowthSide): number {
    return apyFor(this.session?.side === side ? this.session.baseline.frame : this.view.frame, side);
  }

  preview(side: GrowthSide, requestedApy: number): SimulationView {
    if (!Number.isFinite(requestedApy)) return this.view;
    if (!this.begin(side)) return this.view;
    const baseline = this.session!.baseline;
    const upper = apyFor(baseline.frame, side);
    const target = Math.max(minimumApyFor(side), Math.min(upper, requestedApy));
    this.view = target >= upper ? baseline : transferFrom(baseline, side, target);
    if (this.view !== baseline) this.view.network = this.previewNetwork(side, target, upper);
    return this.view;
  }

  private previewNetwork(side: GrowthSide, target: number, upper: number): NetworkGrowth {
    const session = this.session!;
    if (!session.networkDays) {
      const days = [this.networkState];
      // Finish any partially previewed daily settlement before changing its economic rules.
      // This preserves the exact value shown at the switch without minting a day twice.
      if (this.pendingNetworkDay) days.push(this.pendingNetworkDay);
      const engineStart = days[days.length - 1];
      // Cache actual daily engine states once per adjustment. Pointer updates only sample them.
      for (const result of iterateGrowthCycle({ ...engineStart, activeSide: side, status: 'running' })) {
        if (!isValidGrowthState(result.next)) break;
        days.push(result.next);
        if (result.outcome !== 'in-progress') break;
        if (days.length > 3650) throw new Error('Network growth phase exceeded ten years');
      }
      session.networkDays = days;
    }
    const days = session.networkDays;
    const progress = side === 'vaulting' ? createVaultingCapitalScale(this.view).fraction
      : Math.max(0, Math.min(1, Math.log(upper / target) / Math.log(upper / minimumApyFor(side))));
    const startOffset = session.baseline.network.elapsedDays - days[0].elapsedDays;
    const position = startOffset + progress * (days.length - 1 - startOffset);
    const index = Math.min(days.length - 1, Math.floor(position + 1e-9));
    this.view.days = [...session.baseline.days, ...days.slice(1, index + 1).map(describeDay)];
    const from = days[index];
    const to = days[Math.min(index + 1, days.length - 1)];
    const fraction = Math.max(0, position - index);
    const interpolate = (key: keyof NetworkGrowth) => from[key] + (to[key] - from[key]) * fraction;
    // Fractional previews remain continuous when either slider becomes the new baseline.
    return {
      elapsedDays: interpolate('elapsedDays'),
      argonCirculation: interpolate('argonCirculation'),
      argonotCirculation: interpolate('argonotCirculation'),
      argonPriceUsd: interpolate('argonPriceUsd'),
      argonotPriceUsd: interpolate('argonotPriceUsd'),
      networkValueUsd: interpolate('networkValueUsd'),
    };
  }

  commit(): void {
    // Releasing a gesture keeps the phase editable. Switching sides commits it.
  }

  cancel(): SimulationView {
    if (this.session) this.view = this.session.baseline;
    return this.view;
  }
}
