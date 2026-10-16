import type { GrowthSide, SimulationView } from './GrowthSimulation';
import { projectGameDays, type SettledGameDay } from './gamePortfolio';
import { calculateNewCohortMiningApy, calculateVaultRevenueShare, createGrowthCycle, MAX_USABLE_BITCOIN } from './exponentialTriggers';
import { createPlayback } from './growthSimulatorPlayback';
import { ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER } from './vaultCalculator';
import type { IBasicsRecord } from '../interfaces/IBasicsRecord';

export const GAME_TARGET = 53.99;
const MINING_APY_FLOOR = 40;
export type GameView = SimulationView & { issuance: { mining: number; bitcoin: number; burned: number }; stopReason: string | null };
export function vaultCollateral(state: GameView['frame']['state']) {
  const argons = state.vaultArgonSecuritization;
  // The saved snapshot lacks separate vault ARGNOT holdings. Preserve the
  // engine's explicit 2:1 collateral assumption and expose both components.
  const argonots = argons * ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER;
  return { argons, argonots, total: argons + argonots };
}

export class GrowthGame {
  view: GameView;
  miners: number;
  bitcoin: number;
  private phase?: { side: GrowthSide; view: GameView; miners: number; bitcoin: number; previews: GameView[]; exactPreviews: Map<number, GameView> };
  private boundsCache = new Map<GrowthSide, GameView[]>();
  constructor(data: IBasicsRecord, initialCapital = 10_000) {
    const frame = createPlayback(createGrowthCycle(data), 0.5, initialCapital);
    this.miners = frame.state.seatCount;
    this.bitcoin = frame.state.bitcoinLocked;
    this.view = { frame, network: frame.state, days: [this.describeDay(frame.state)],
      vaultingPayout: this.vaultPayout(frame.state), before: { mining: frame.miningApy, vaulting: frame.vaultingApy },
      transfer: null, issuance: { mining: 0, bitcoin: 0, burned: 0 }, stopReason: null };
  }
  private describeDay(state: GameView['frame']['state']) {
    const date = new Date(state.snapshotAt);
    date.setUTCDate(date.getUTCDate() + state.elapsedDays);
    return { day: state.elapsedDays, date: date.toISOString(), miningApy: Math.min(calculateNewCohortMiningApy(state), 1e12), vaultingApy: Math.min(state.returns.vaultingApy, 1e12) };
  }
  private vaultPayout(state: GameView['frame']['state']) {
    return vaultCollateral(state).total + state.miningAuctionRevenue * calculateVaultRevenueShare(state);
  }
  apy(side: GrowthSide) { return side === 'mining' ? this.view.frame.miningApy : this.view.frame.vaultingApy; }
  qualifies(side: GrowthSide) { return this.apy(side) <= GAME_TARGET + 1e-8; }
  get won() { return this.qualifies('mining') && this.qualifies('vaulting'); }
  value(side: GrowthSide) { return side === 'mining' ? this.miners : this.bitcoin; }
  private input(view: GameView, side: GrowthSide) { return side === 'mining' ? view.frame.state.seatCount : view.frame.state.bitcoinLocked; }
  private settle(baseline: GameView, previous: GameView, day: SettledGameDay, side: GrowthSide): GameView {
    const state = day.state;
    const miningApy = Math.min(calculateNewCohortMiningApy(state), 1e12);
    const vaultingApy = Math.min(state.returns.vaultingApy, 1e12);
    const issuance = { mining: previous.issuance.mining + day.miningMint, bitcoin: previous.issuance.bitcoin + day.bitcoinMint, burned: previous.issuance.burned + day.burned };
    const expectedSupply = previous.network.argonCirculation + day.miningMint + day.bitcoinMint - day.burned;
    if (Math.abs(state.argonCirculation - expectedSupply) > Math.max(1e-6, expectedSupply * 1e-12)) throw new Error('Daily supply does not reconcile');
    const bids = (state.miningAuctionRevenue - baseline.frame.state.miningAuctionRevenue) * state.argonPriceUsd;
    const revenue = (state.miningAuctionRevenue * calculateVaultRevenueShare(state)
      - baseline.frame.state.miningAuctionRevenue * calculateVaultRevenueShare(baseline.frame.state)) * state.argonPriceUsd;
    const rewards = issuance.mining - baseline.issuance.mining;
    return { network: state, days: [...previous.days, this.describeDay(state)], issuance, stopReason: day.result.pauseReason,
      frame: { ...previous.frame, state, operatorAccount: day.account, operatorValue: day.account.value,
        miningApy, vaultingApy, networkValue: state.networkValueUsd, bidCosts: bids, revenue, miningRewards: rewards * state.argonPriceUsd, newArgon: rewards },
      vaultingPayout: this.vaultPayout(state), before: { mining: baseline.frame.miningApy, vaulting: baseline.frame.vaultingApy },
      transfer: { side, bids, revenue, rewards: rewards * state.argonPriceUsd, capital: (vaultCollateral(state).total - vaultCollateral(baseline.frame.state).total) * state.argonPriceUsd } };
  }
  private projectSelection(baseline: GameView, side: GrowthSide, value: number): GameView {
    let next = baseline;
    for (const day of projectGameDays(baseline.frame.state, baseline.frame.operatorAccount, side,
      side === 'mining' ? value : undefined, side === 'vaulting' ? value : undefined)) {
      const candidate = this.settle(baseline, next, day, side);
      if (!(candidate.frame.miningApy > MINING_APY_FLOOR)) break;
      next = candidate;
    }
    return next;
  }
  private safeMiningSelection(baseline: GameView, requested: number): GameView {
    let safe = baseline;
    let low = this.input(baseline, 'mining'), high = requested;
    // Search whole-miner selections using the same settlements as an actual drag.
    while (low < high) {
      const count = low + Math.ceil((high - low) / 2);
      const candidate = this.projectSelection(baseline, 'mining', count);
      if (candidate.frame.miningApy > MINING_APY_FLOOR && this.input(candidate, 'mining') === count) {
        low = count; safe = candidate;
      } else high = count - 1;
    }
    return safe;
  }
  private miningEndpoint(baseline: GameView, maximum: number): GameView {
    let high = maximum;
    let upper = this.projectSelection(baseline, 'mining', high);
    // Exact selections replace retiring cohorts, so their target may lie beyond
    // the automatic daily projection's final batch.
    while (this.input(upper, 'mining') === high && upper.frame.miningApy >= GAME_TARGET && high < Number.MAX_SAFE_INTEGER) {
      high = Math.min(Number.MAX_SAFE_INTEGER, high * 2);
      upper = this.projectSelection(baseline, 'mining', high);
    }
    let low = this.input(baseline, 'mining') + 1;
    // Locate the first whole-miner selection below the target, rather than
    // exposing the entire daily batch that crossed it.
    while (low < high) {
      const count = low + Math.floor((high - low) / 2);
      const candidate = this.projectSelection(baseline, 'mining', count);
      if (this.input(candidate, 'mining') !== count || candidate.frame.miningApy < GAME_TARGET) high = count;
      else low = count + 1;
    }
    const endpoint = this.projectSelection(baseline, 'mining', low);
    if (this.input(endpoint, 'mining') !== low) return this.safeMiningSelection(baseline, low);
    return endpoint.frame.miningApy > MINING_APY_FLOOR ? endpoint : this.safeMiningSelection(baseline, low);
  }
  private previews(side: GrowthSide): GameView[] {
    if (this.phase?.side === side) return this.phase.previews;
    const cached = this.boundsCache.get(side);
    if (cached) return cached;
    const baseline = this.view, previews = [baseline];
    if (this.qualifies(side) || (side === 'vaulting' && this.bitcoin >= MAX_USABLE_BITCOIN)) return previews;
    let previous = baseline;
    for (const day of projectGameDays(baseline.frame.state, baseline.frame.operatorAccount, side)) {
      const next = this.settle(baseline, previous, day, side);
      if (side === 'vaulting' && !(next.frame.miningApy > MINING_APY_FLOOR)) break;
      // Mining cohorts can retire before competition grows past the baseline.
      // Continue projecting rollover days; only expose increasing selections.
      if (side === 'vaulting' && this.input(next, side) < this.input(previous, side)) break;
      if (side === 'mining' && next.frame.miningApy <= GAME_TARGET && this.input(next, side) > this.input(baseline, side)) {
        const safe = this.miningEndpoint(baseline, this.input(next, side));
        while (previews.length > 1 && this.input(previews[previews.length - 1]!, side) >= this.input(safe, side)) previews.pop();
        if (this.input(safe, side) > this.input(previews[previews.length - 1]!, side)) previews.push(safe);
        break;
      }
      if (this.input(next, side) > this.input(previews[previews.length - 1]!, side)) previews.push(next);
      previous = next;
      if ((side === 'mining' ? next.frame.miningApy : next.frame.vaultingApy) <= GAME_TARGET || day.result.outcome !== 'in-progress') break;
    }
    this.boundsCache.set(side, previews);
    return previews;
  }
  begin(side: GrowthSide) {
    if (this.phase?.side === side) return;
    const previews = this.previews(side);
    this.phase = { side, view: this.view, miners: this.miners, bitcoin: this.bitcoin, previews, exactPreviews: new Map() };
  }
  minimum(side: GrowthSide) { this.begin(side); return this.input(this.phase!.view, side); }
  cycleBaseline(side: GrowthSide) {
    this.begin(side);
    const { view, miners, bitcoin } = this.phase!;
    return { view, miners, bitcoin };
  }
  targetValue(side: GrowthSide) { this.begin(side); return this.bounds(side).maximum; }
  bounds(side: GrowthSide) {
    const previews = this.previews(side);
    return { minimum: this.input(previews[0]!, side), maximum: this.input(previews[previews.length - 1]!, side), settlements: previews.map(view => this.input(view, side)) };
  }
  increment(side: GrowthSide) {
    if (this.qualifies(side)) return;
    this.begin(side);
    if (side === 'mining') { this.setValue(side, this.miners + 1); return; }
    const next = this.phase!.previews.find(view => this.input(view, side) > this.value(side));
    if (next) this.setValue(side, this.input(next, side));
  }
  setValue(side: GrowthSide, requested: number) {
    if (!Number.isFinite(requested)) return;
    this.begin(side);
    const previews = this.phase!.previews;
    const maximum = this.input(previews[previews.length - 1]!, side);
    const value = Math.max(this.input(previews[0]!, side), Math.min(maximum, side === 'mining' ? Math.round(requested) : requested));
    const phase = this.phase!;
    if (value === this.input(phase.view, side)) { this.apply(phase.view); return; }
    const cached = phase.exactPreviews.get(value);
    if (cached) { this.apply(cached); return; }
    let next = this.projectSelection(phase.view, side, value);
    if (this.input(next, side) !== value) return;
    if (side === 'mining' && next.frame.miningApy <= MINING_APY_FLOOR) {
      next = this.safeMiningSelection(phase.view, value);
      this.apply(next);
      return;
    }
    // Bound cached exact-input previews; missing entries replay deterministically.
    if (phase.exactPreviews.size >= 128) phase.exactPreviews.clear();
    phase.exactPreviews.set(value, next);
    this.apply(next);
  }
  private projectDay(side: GrowthSide, miners?: number): GameView | null {
    const iterator = projectGameDays(this.view.frame.state, this.view.frame.operatorAccount, side, miners);
    const day = iterator.next();
    iterator.return(undefined);
    if (day.done || day.value.result.pauseReason === 'no-progress') return null;
    return this.settle(this.view, this.view, day.value, side);
  }
  advanceDay(side: GrowthSide) {
    let next = this.projectDay(side);
    if (!next) return false;
    if (next.frame.miningApy <= MINING_APY_FLOOR) {
      if (side !== 'mining' || this.input(next, side) <= this.miners) return false;
      // Replay only this day with less competition; retain the largest safe count.
      let low = this.miners, high = this.input(next, side);
      let safe = this.projectDay(side, low);
      if (!safe || safe.frame.miningApy <= MINING_APY_FLOOR) return false;
      while (low < high) {
        const count = low + Math.ceil((high - low) / 2);
        const candidate = this.projectDay(side, count);
        if (candidate && candidate.frame.miningApy > MINING_APY_FLOOR && this.input(candidate, side) === count) {
          low = count; safe = candidate;
        } else high = count - 1;
      }
      next = safe;
    }
    this.phase = undefined;
    this.apply(next);
    return true;
  }
  private apply(view: GameView) {
    this.view = view;
    this.miners = view.frame.state.seatCount;
    this.bitcoin = view.frame.state.bitcoinLocked;
    this.boundsCache.clear();
  }
}
