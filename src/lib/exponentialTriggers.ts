import type { IBasicsRecord } from "../interfaces/IBasicsRecord";
import { microgonToArgon, micronotToArgonot } from "./currencyUtils";
import {
  ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER,
  BITCOIN_CAPACITY_RATE,
  calculateVaultReturns,
  MAX_VAULT_PROFIT_RATE,
} from "./vaultCalculator";

export const MAX_MINING_BID_PER_SEAT = 50_000;
export const MINING_COLLATERAL_MULTIPLIER = 2;

export const RETURN_THRESHOLD_APY = 53.3;
export const TARGET_RETURN_APY = 53.98;
export const MINING_RETURN_TOLERANCE = 1e-6;
export const STAKE_REVENUE_SHARE = 0.15;
export const BOND_REVENUE_SHARE = 0.05;
export const LIQUID_REVENUE_SHARE = 0.03;
export const UNISWAP_RESERVE_SHARE = 0.10;
export const BLOCK_REWARD_DAMPENER = 0.75;
// Scenario assumption: the usable BTC supply, shared by locks and vault capacity.
export const MAX_USABLE_BITCOIN = 17_500_000;
// Maximum assumed market discount as BTC capacity runs out; valuation stays fixed.
export const POST_CAP_ARGON_PRICE_DISCOUNT = 0.01;
const MINER_REWARD_SHARE = 0.75;
export const MINIMUM_MINING_ARGONS_PER_BLOCK = 5 * MINER_REWARD_SHARE;

export const BLOCKS_PER_COHORT = 14_400;
const DAYS_PER_COHORT = 10;
const TEN_DAY_PERIODS_PER_YEAR = 365 / 10;
const MAX_DAILY_COMPETITION_GROWTH = 0.5;
const MAX_DAILY_BITCOIN_GROWTH = 1;
const MAX_DAILY_ARGONOT_PRICE_CHANGE = 0.5;

export type GrowthSide = "mining" | "vaulting";
export type GrowthStatus = "running" | "returns-normalized";

export interface GrowthReturns {
  // Blended network-wide return; competition uses calculateNewCohortMiningApy.
  miningApy: number;
  vaultingApy: number;
  stakesApy: number;
  bondsApy: number;
}

export interface GrowthCycleState {
  cycle: number;
  elapsedDays: number;
  status: GrowthStatus;
  activeSide: GrowthSide | null;
  snapshotAt: string;
  argonPriceUsd: number;
  argonotPriceUsd: number;
  bitcoinPriceUsd: number;
  networkValueUsd: number;
  argonCirculation: number;
  argonotCirculation: number;
  minedArgons: number;
  bitcoinArgons: number;
  bitcoinLocked: number;
  // Daily committed capacity in BTC-equivalent units, including mining-day pauses.
  bitcoinCapacityHistory: number[];
  expectedDaysToBitcoinCapacity: number | null;
  capacityMarketPressure: number;
  expectedMiningAuctionRevenue: number;
  seatCount: number;
  dailySeatCount: number;
  miningCohortSeats: number[];
  argonotsBidPerSeat: number;
  argonsBidPerSeat: number;
  miningAuctionRevenue: number;
  // Ten bid groups; daily turnover starts when the market anticipates capacity.
  miningAuctionCohortRevenues: number[];
  // Ten-day-equivalent miner rewards. During the capacity taper, this is the next
  // cohort's quote; active cohorts retain the rates recorded below.
  baseArgonRewards: number;
  miningCohortBaseArgonRewards: number[];
  // Actual additional ARGN already paid to each bid group, excluding base rewards.
  // These are income records, not unissued requests or additional circulation.
  miningCohortMintedArgons: number[];
  rewardReductionActive: boolean;
  baseArgonotRewards: number;
  pendingMiningMint: number;
  vaultArgonSecuritization: number;
  bondCapital: number;
  stakePercent: number;
  returns: GrowthReturns;
}

export interface GrowthCycleResult {
  side: GrowthSide;
  days: number;
  outcome: "in-progress" | "complete" | "capacity-limited" | "paused";
  pauseReason: "no-progress" | "invalid-state" | "bitcoin-capacity" | null;
  startingReturnApy: number;
  endingReturnApy: number;
  argonBidAdded: number;
  auctionRevenueAdded: number;
  vaultSecuritizationAdded: number;
  bondCapitalAdded: number;
  argonotsStakedAdded: number;
  // Signed market-price change; staking income can support a lower price.
  argonotPriceAddedUsd: number;
  bitcoinLockedAdded: number;
  miningMintLoaded: number;
  argonotMintLoaded: number;
  miningMintRequested: number;
  bitcoinMintLoaded: number;
  argonBurned: number;
  networkValueAddedUsd: number;
  growthCapped: boolean;
  next: GrowthCycleState;
}

type GrowthDayResult = Omit<GrowthCycleResult, "days" | "outcome" | "pauseReason">;

const SUMMED_CHANGE_FIELDS = [
  "argonBidAdded", "auctionRevenueAdded", "vaultSecuritizationAdded", "bondCapitalAdded",
  "argonotsStakedAdded", "argonotPriceAddedUsd", "bitcoinLockedAdded", "miningMintLoaded",
  "argonotMintLoaded", "miningMintRequested", "bitcoinMintLoaded", "argonBurned", "networkValueAddedUsd",
] as const;

export function createGrowthCycle(data: IBasicsRecord): GrowthCycleState {
  const argonPriceUsd = positiveOr(data.usdForArgon, positiveOr(data.usdTargetForArgon, 1));
  const argonotPriceUsd = positiveOr(data.usdForArgonot, argonPriceUsd);
  const bitcoinPriceUsd = positiveOr(data.usdForBtc, 1);
  const argonCirculation = microgonToArgon(data.microgonsInCirculation.total);
  const argonotCirculation = micronotToArgonot(data.micronotsInCirculation);
  const minedArgons = microgonToArgon(data.microgonsInCirculation.fromMining);
  const bitcoinArgons = microgonToArgon(data.microgonsInCirculation.fromBitcoin);
  let seatCount = Math.max(10, Math.floor(data.mining.nextEpochSeatCount));
  const baseArgonRewards = microgonToArgon(data.mining.baseMicrogonRewardsPerBlock) * BLOCKS_PER_COHORT;
  const baseArgonotRewards = micronotToArgonot(data.mining.baseMicronotRewardsPerBlock) * BLOCKS_PER_COHORT;
  const vaultArgonSecuritization = Math.max(
    1,
    data.vaulting.valueInVaults / bitcoinPriceUsd * bitcoinPriceUsd / argonPriceUsd,
  );
  const stakePercent = argonotCirculation > 0
    ? clamp(data.activeArgonotStakes / argonotCirculation, 0, 1)
    : 0;
  let argonsBidPerSeat = bidForTenDayReturn({
    targetTdr: Math.max(0, data.miningTDR),
    argonPriceUsd,
    argonotPriceUsd,
    argonRewardsPerSeat: baseArgonRewards / seatCount,
    argonotRewardsPerSeat: baseArgonotRewards / seatCount,
  });

  const initialAuctionRevenue = argonsBidPerSeat * seatCount;
  seatCount = Math.max(seatCount, Math.ceil(initialAuctionRevenue / MAX_MINING_BID_PER_SEAT));
  argonsBidPerSeat = initialAuctionRevenue / seatCount;
  const argonotsBidPerSeat = MINING_COLLATERAL_MULTIPLIER * argonsBidPerSeat * argonPriceUsd / argonotPriceUsd;
  const miningCohortSeats = Array.from({ length: DAYS_PER_COHORT }, (_, index) => (
    Math.floor(seatCount / DAYS_PER_COHORT) + (index >= DAYS_PER_COHORT - seatCount % DAYS_PER_COHORT ? 1 : 0)
  ));

  return finalizeCycle({
    cycle: 0,
    elapsedDays: 0,
    status: "running",
    activeSide: null,
    snapshotAt: data.lastUpdatedAt,
    argonPriceUsd,
    argonotPriceUsd,
    bitcoinPriceUsd,
    networkValueUsd: positiveOr(data.totalMarketValueUsd, argonCirculation * argonPriceUsd + argonotCirculation * argonotPriceUsd),
    argonCirculation,
    argonotCirculation,
    minedArgons,
    bitcoinArgons,
    bitcoinLocked: Math.max(0, data.vaulting.bitcoinLocked),
    bitcoinCapacityHistory: [Math.min(MAX_USABLE_BITCOIN, Math.max(
      data.vaulting.bitcoinLocked,
      vaultArgonSecuritization * argonPriceUsd / bitcoinPriceUsd,
    ))],
    expectedDaysToBitcoinCapacity: data.vaulting.bitcoinLocked >= MAX_USABLE_BITCOIN
      || vaultArgonSecuritization >= MAX_USABLE_BITCOIN * bitcoinPriceUsd / argonPriceUsd ? 0 : null,
    capacityMarketPressure: data.vaulting.bitcoinLocked >= MAX_USABLE_BITCOIN
      || vaultArgonSecuritization >= MAX_USABLE_BITCOIN * bitcoinPriceUsd / argonPriceUsd ? 1 : 0,
    expectedMiningAuctionRevenue: argonsBidPerSeat * seatCount,
    seatCount,
    dailySeatCount: miningCohortSeats[DAYS_PER_COHORT - 1],
    miningCohortSeats,
    argonotsBidPerSeat,
    argonsBidPerSeat,
    miningAuctionRevenue: argonsBidPerSeat * seatCount,
    miningAuctionCohortRevenues: miningCohortSeats.map(seats => argonsBidPerSeat * seats),
    baseArgonRewards,
    miningCohortBaseArgonRewards: Array(DAYS_PER_COHORT).fill(baseArgonRewards),
    miningCohortMintedArgons: Array(DAYS_PER_COHORT).fill(0),
    rewardReductionActive: data.vaulting.bitcoinLocked >= MAX_USABLE_BITCOIN
      || vaultArgonSecuritization >= MAX_USABLE_BITCOIN * bitcoinPriceUsd / argonPriceUsd,
    baseArgonotRewards,
    pendingMiningMint: 0,
    vaultArgonSecuritization,
    bondCapital: Math.max(0, data.vaulting.eligibleBondCapital),
    stakePercent,
    returns: emptyReturns(),
  });
}

export function runGrowthCycle(current: GrowthCycleState): GrowthCycleResult {
  const cycle = iterateGrowthCycle(current);
  let step = cycle.next();
  while (!step.done && step.value.outcome === "in-progress") step = cycle.next();
  return step.value;
}

export function* iterateGrowthCycle(
  current: GrowthCycleState,
): Generator<GrowthCycleResult, GrowthCycleResult, void> {
  if (!current.activeSide || current.status !== "running") {
    return emptyResult(current);
  }

  const side = current.activeSide;
  let state = current;
  let result: GrowthCycleResult = { ...emptyResult(current), outcome: "in-progress" };
  while (true) {
    const day = runGrowthDay(state, side);
    if (!isValidGrowthState(day.next)) {
      result = {
        ...result,
        outcome: "paused",
        pauseReason: "invalid-state",
        next: { ...result.next, cycle: current.cycle + 1, activeSide: side, status: "running" },
      };
      yield result;
      return result;
    }
    const complete = side === "mining"
      ? day.endingReturnApy <= RETURN_THRESHOLD_APY + MINING_RETURN_TOLERANCE
      : day.endingReturnApy < RETURN_THRESHOLD_APY;
    const days = result.days + 1;
    const unchanged = Object.entries(state).every(([key, value]) => (
      typeof value !== "number" || key === "cycle" || key === "elapsedDays"
      || value === day.next[key as keyof GrowthCycleState]
    )) && state.miningAuctionCohortRevenues.every((value, index) => (
      value === day.next.miningAuctionCohortRevenues[index]
    )) && state.miningCohortBaseArgonRewards.every((value, index) => (
      value === day.next.miningCohortBaseArgonRewards[index]
    )) && state.miningCohortMintedArgons.every((value, index) => (
      value === day.next.miningCohortMintedArgons[index]
    ));
    const capacityJustReached = side === "vaulting"
      && state.vaultArgonSecuritization < maximumVaultSecuritization(state)
      && day.next.vaultArgonSecuritization >= maximumVaultSecuritization(day.next);
    const pauseReason = complete ? null : capacityJustReached ? "bitcoin-capacity" : unchanged ? "no-progress" : null;
    result = {
      ...result,
      days,
      outcome: complete ? "complete" : capacityJustReached ? "capacity-limited" : pauseReason ? "paused" : "in-progress",
      pauseReason,
      endingReturnApy: day.endingReturnApy,
      growthCapped: result.growthCapped || day.growthCapped,
      next: {
        ...day.next,
        cycle: current.cycle + 1,
        // Only the first arrival at capacity ends an adjustment early. Later
        // cycles keep their selected side until its return reaches the target.
        activeSide: complete || capacityJustReached ? day.next.activeSide : side,
        status: complete || capacityJustReached ? day.next.status : "running",
      },
    };
    for (const field of SUMMED_CHANGE_FIELDS) result[field] += day[field];
    state = day.next;
    yield result;
    if (complete || pauseReason === "no-progress" || pauseReason === "bitcoin-capacity") return result;
  }
}

export function isValidGrowthState(state: GrowthCycleState): boolean {
  return Object.values(state).every(value => typeof value !== "number" || Number.isFinite(value))
    && Object.values(state.returns).every(value => !Number.isNaN(value) && value !== -Infinity)
    && state.miningCohortSeats.length === DAYS_PER_COHORT
    && state.miningCohortSeats.every(seats => Number.isSafeInteger(seats) && seats > 0)
    && state.miningCohortSeats.reduce((total, seats) => total + seats, 0) === state.seatCount
    && Number.isSafeInteger(state.dailySeatCount) && state.dailySeatCount > 0
    && state.argonsBidPerSeat <= MAX_MINING_BID_PER_SEAT + 1e-8
    && state.miningAuctionCohortRevenues.length === DAYS_PER_COHORT
    && state.miningAuctionCohortRevenues.every(value => Number.isFinite(value) && value >= 0)
    && state.miningCohortBaseArgonRewards.length === DAYS_PER_COHORT
    && state.miningCohortBaseArgonRewards.every(value => Number.isFinite(value) && value >= 0)
    && state.miningCohortMintedArgons.length === DAYS_PER_COHORT
    && state.miningCohortMintedArgons.every(value => Number.isFinite(value) && value >= 0)
    && state.bitcoinCapacityHistory.length > 0 && state.bitcoinCapacityHistory.length <= DAYS_PER_COHORT + 1
    && state.bitcoinCapacityHistory.every(value => Number.isFinite(value) && value >= 0 && value <= MAX_USABLE_BITCOIN)
    && (state.expectedDaysToBitcoinCapacity === null || state.expectedDaysToBitcoinCapacity >= 0)
    && state.capacityMarketPressure >= 0 && state.capacityMarketPressure <= 1
    && state.expectedMiningAuctionRevenue >= 0
    && state.baseArgonRewards >= 0
    && state.networkValueUsd >= 0
    && state.argonPriceUsd > 0 && state.argonotPriceUsd > 0 && state.bitcoinPriceUsd > 0
    && state.bitcoinLocked >= 0 && state.bitcoinLocked <= MAX_USABLE_BITCOIN
    && state.vaultArgonSecuritization >= 0
    && state.vaultArgonSecuritization <= maximumVaultSecuritization(state);
}

function maximumVaultSecuritization(state: GrowthCycleState): number {
  return MAX_USABLE_BITCOIN * state.bitcoinPriceUsd / state.argonPriceUsd;
}

function expectedDaysToCapacity(history: number[]): number | null {
  const used = history[history.length - 1];
  if (used >= MAX_USABLE_BITCOIN) return 0;
  const days = history.length - 1;
  const start = history[0];
  if (days <= 0 || start <= 0 || used <= start) return null;
  const dailyLogGrowth = Math.log(used / start) / days;
  const forecast = Math.log(MAX_USABLE_BITCOIN / used) / dailyLogGrowth;
  return Number.isFinite(forecast) ? Math.max(0, forecast) : null;
}

function capacityPressure(daysToCapacity: number | null): number {
  return daysToCapacity === null ? 0 : clamp(1 - daysToCapacity / DAYS_PER_COHORT, 0, 1);
}

function nextBaseArgonRewards(state: GrowthCycleState, pressure: number): number {
  // A scenario of fading growth demand and increasing below-target pressure,
  // not a new mainchain rule. At full capacity this is the existing contraction.
  const priceDeviation = 1 / (1 - POST_CAP_ARGON_PRICE_DISCOUNT * pressure) - 1;
  const quote = state.baseArgonRewards
    + state.pendingMiningMint * BLOCK_REWARD_DAMPENER * (1 - pressure)
    - state.argonCirculation * priceDeviation * BLOCK_REWARD_DAMPENER * MINER_REWARD_SHARE;
  return pressure > 0 ? Math.max(MINIMUM_MINING_ARGONS_PER_BLOCK * BLOCKS_PER_COHORT, quote) : quote;
}

function forecastAuctionRevenue(state: GrowthCycleState): number {
  if (state.capacityMarketPressure <= 0) return state.miningAuctionRevenue;
  let forecast = state;
  let expectedRevenue = 0;
  // Average the auction run rate across ten daily replacements, retaining the
  // income from old contracts as they roll off, not just the terminal rate.
  // Hold the current ARGNOT price and existing vault capital fixed: do not manufacture
  // price gains or assume unrequested funding to support hypothetical bids.
  for (let day = 1; day <= DAYS_PER_COHORT; day += 1) {
    const mining = runDailyMiningFrame(forecast, false);
    const pressure = capacityPressure(state.expectedDaysToBitcoinCapacity === null
      ? null : Math.max(0, state.expectedDaysToBitcoinCapacity - day));
    const burn = Math.min(
      forecast.argonCirculation + mining.argonMinted,
      mining.settledAuctionRevenue * Math.max(0, MAX_VAULT_PROFIT_RATE - calculateVaultRevenueShare(forecast)),
    );
    const minedArgons = forecast.minedArgons + mining.argonMinted;
    const originCirculation = minedArgons + forecast.bitcoinArgons;
    const miningOriginShare = originCirculation > 0 ? minedArgons / originCirculation : 0;
    expectedRevenue += mining.auctionRevenue / DAYS_PER_COHORT;
    forecast = {
      ...forecast,
      baseArgonRewards: nextBaseArgonRewards(forecast, pressure),
      argonsBidPerSeat: mining.argonsBidPerSeat,
      miningAuctionRevenue: mining.auctionRevenue,
      miningAuctionCohortRevenues: mining.cohortRevenues,
      seatCount: mining.seatCount,
      dailySeatCount: mining.dailySeatCount,
      miningCohortSeats: mining.cohortSeats,
      miningCohortBaseArgonRewards: mining.cohortBaseArgonRewards,
      miningCohortMintedArgons: mining.cohortMintedArgons,
      argonCirculation: forecast.argonCirculation + mining.argonMinted - burn,
      argonotCirculation: forecast.argonotCirculation + mining.argonotMinted,
      minedArgons: Math.max(0, minedArgons - burn * miningOriginShare),
      bitcoinArgons: Math.max(0, forecast.bitcoinArgons - burn * (1 - miningOriginShare)),
      // Only today's known funding request is projected, once.
      pendingMiningMint: 0,
    };
  }
  // Near capacity, capitalize weaker expected income, not speculative increases.
  return Math.min(state.miningAuctionRevenue, expectedRevenue);
}

function runGrowthDay(current: GrowthCycleState, side: GrowthSide): GrowthDayResult {
  const proposed = settleGrowthDay(current, side);
  if (side !== "mining" || proposed.endingReturnApy >= RETURN_THRESHOLD_APY - MINING_RETURN_TOLERANCE) return proposed;
  // Seat dilution and ARGNOT repricing happen inside the projection. Solve the
  // incoming auction against that fully settled state, never clamp displayed APY.
  let low = 1e-12;
  let high = 1;
  let settled = settleGrowthDay(current, side, low);
  if (settled.endingReturnApy < RETURN_THRESHOLD_APY) return proposed;
  for (let iteration = 0; iteration < 48; iteration++) {
    const scale = (low + high) / 2;
    const candidate = settleGrowthDay(current, side, scale);
    if (candidate.endingReturnApy >= RETURN_THRESHOLD_APY) {
      low = scale;
      settled = candidate;
    } else {
      high = scale;
    }
    if (Math.abs(settled.endingReturnApy - RETURN_THRESHOLD_APY) <= MINING_RETURN_TOLERANCE / 10) break;
  }
  return settled;
}

function settleGrowthDay(current: GrowthCycleState, side: GrowthSide, miningBidScale = 1): GrowthDayResult {
  // Resolve the market's price response before committing today's replacement
  // bid. All projections start from the same opening balances: previews neither
  // advance a day nor feed their minted income back into a second day's bids.
  const preview = projectGrowthDay(current, side, undefined, miningBidScale);
  const entryPrice = preview.next.argonotPriceUsd;
  if (entryPrice === current.argonotPriceUsd) return preview;

  let settled = projectGrowthDay(current, side, entryPrice, miningBidScale);
  if (entryPrice > settled.maximumFundedArgonotPriceUsd) {
    // Repricing the incoming bid can change funding demand. If that leaves less
    // room for a price increase, settle the largest affordable price first.
    const affordablePrice = maximizeOptionalValue(current.argonotPriceUsd, entryPrice, price => {
      const candidate = projectGrowthDay(current, side, price, miningBidScale);
      return price <= candidate.maximumFundedArgonotPriceUsd;
    });
    settled = projectGrowthDay(current, side, affordablePrice, miningBidScale);
  }
  return settled;
}

function projectGrowthDay(
  current: GrowthCycleState,
  side: GrowthSide,
  entryArgonotPriceUsd?: number,
  miningBidScale = 1,
): GrowthDayResult & { maximumFundedArgonotPriceUsd: number } {
  const startingReturnApy = side === "mining" ? calculateNewCohortMiningApy(current) : current.returns.vaultingApy;
  const biddingPrice = entryArgonotPriceUsd ?? current.argonotPriceUsd;
  // The engine stages aggregate auction revenue by phase. Operator entry quotes
  // are calculated separately every day so staged revenue cannot set cheap bids.
  const dailyMining = runDailyMiningFrame({ ...current, argonotPriceUsd: biddingPrice }, side === "mining", miningBidScale);
  const argonsBidPerSeat = dailyMining.argonsBidPerSeat;
  const auctionRevenue = dailyMining.auctionRevenue;
  const maximumDailyVaultSecuritization = Math.min(
    current.vaultArgonSecuritization * (1 + MAX_DAILY_COMPETITION_GROWTH),
    maximumVaultSecuritization(current),
  );
  let vaultSecuritizationGrowthCapped = false;
  let vaultArgonSecuritization = current.vaultArgonSecuritization;

  if (side === "vaulting") {
    const desiredVaultSecuritization = solveVaultSecuritization({
      ...current,
      miningAuctionRevenue: auctionRevenue,
    });
    vaultSecuritizationGrowthCapped = desiredVaultSecuritization > maximumDailyVaultSecuritization;
    vaultArgonSecuritization = Math.min(desiredVaultSecuritization, maximumDailyVaultSecuritization);
  }

  const argonBidAdded = current.rewardReductionActive
    ? auctionRevenue - current.miningAuctionRevenue
    : side === "mining"
    ? Math.max(0, auctionRevenue - current.miningAuctionRevenue)
    : 0;
  const miningMintLoaded = dailyMining.argonMinted;
  const argonotMintLoaded = dailyMining.argonotMinted;
  const unallocatedVaultRevenueShare = Math.max(
    0,
    MAX_VAULT_PROFIT_RATE - calculateVaultRevenueShare(current),
  );
  const circulationBeforeBurn = current.argonCirculation + miningMintLoaded;
  const argonBurned = Math.min(
    circulationBeforeBurn,
    dailyMining.settledAuctionRevenue * unallocatedVaultRevenueShare,
  );
  const minedArgonsBeforeBurn = current.minedArgons + miningMintLoaded;
  const bitcoinArgonsBeforeBurn = current.bitcoinArgons;
  const originCirculationBeforeBurn = minedArgonsBeforeBurn + bitcoinArgonsBeforeBurn;
  const miningOriginShare = originCirculationBeforeBurn > 0
    ? minedArgonsBeforeBurn / originCirculationBeforeBurn
    : 0;
  const minedArgonsAfterBurn = Math.max(0, minedArgonsBeforeBurn - argonBurned * miningOriginShare);
  const bitcoinArgonsAfterBurn = Math.max(
    0,
    bitcoinArgonsBeforeBurn - argonBurned * (1 - miningOriginShare),
  );
  const circulationAfterMining = Math.max(0, circulationBeforeBurn - argonBurned);
  const maximumOptionalGrowthUsd = current.networkValueUsd;
  const currentBitcoinLockedValue = current.argonPriceUsd > 0
    ? current.bitcoinLocked * current.bitcoinPriceUsd / current.argonPriceUsd
    : 0;
  const availableBitcoinSpace = Math.max(0, vaultArgonSecuritization - currentBitcoinLockedValue);
  const desiredBitcoinMint = Math.min(
    availableBitcoinSpace,
    currentBitcoinLockedValue * MAX_DAILY_BITCOIN_GROWTH,
    Math.max(0, MAX_USABLE_BITCOIN - current.bitcoinLocked)
      * current.bitcoinPriceUsd / current.argonPriceUsd,
  );
  const additionalMiningRequest = (bitcoinMint: number, bondCapital: number) => Math.max(
    0,
    calculateAllocationShortage({
      circulation: circulationAfterMining + bitcoinMint,
      miningBidCapital: auctionRevenue,
      vaultSecuritization: vaultArgonSecuritization,
      bondCapital,
    }),
  );
  const projectedGrowthUsd = (
    bitcoinMint: number,
    argonotPriceUsd = current.argonotPriceUsd,
  ) => (
    (miningMintLoaded + bitcoinMint - argonBurned) * current.argonPriceUsd
    + argonotMintLoaded * argonotPriceUsd
    + (argonotPriceUsd - current.argonotPriceUsd) * current.argonotCirculation
  );

  const primaryProjectedGrowthUsd = projectedGrowthUsd(0);
  const minimumProjectedGrowthUsd = primaryProjectedGrowthUsd
    + additionalMiningRequest(0, current.bondCapital) * current.argonPriceUsd;
  const optionalGrowthAllowed = side === "vaulting"
    && minimumProjectedGrowthUsd <= maximumOptionalGrowthUsd;
  const fundedBitcoinMint = optionalGrowthAllowed
    ? maximizeOptionalValue(0, desiredBitcoinMint, value => (
      projectedGrowthUsd(value)
        + additionalMiningRequest(value, current.bondCapital) * current.argonPriceUsd
        <= maximumOptionalGrowthUsd
    ))
    : 0;
  const bitcoinLocked = Math.min(
    MAX_USABLE_BITCOIN,
    current.bitcoinLocked * (1 + MAX_DAILY_BITCOIN_GROWTH),
    current.bitcoinLocked + fundedBitcoinMint * current.argonPriceUsd / current.bitcoinPriceUsd,
  );
  const bitcoinLockedAdded = Math.max(0, bitcoinLocked - current.bitcoinLocked);
  // Issue only for the actual bounded lock increment, including at the ceiling.
  const bitcoinMintLoaded = bitcoinLockedAdded * current.bitcoinPriceUsd / current.argonPriceUsd;
  const idealBondCapital = Math.max(current.bondCapital, vaultArgonSecuritization);
  const bondCapital = optionalGrowthAllowed
    ? maximizeOptionalValue(current.bondCapital, idealBondCapital, value => (
      projectedGrowthUsd(bitcoinMintLoaded)
        + additionalMiningRequest(bitcoinMintLoaded, value) * current.argonPriceUsd
        <= maximumOptionalGrowthUsd
    ))
    : current.bondCapital;

  if (side === "vaulting") {
    const desiredVaultSecuritization = solveVaultSecuritization({
      ...current,
      miningAuctionRevenue: auctionRevenue,
      minedArgons: minedArgonsAfterBurn,
      bitcoinArgons: bitcoinArgonsAfterBurn + bitcoinMintLoaded,
      bitcoinLocked,
      bondCapital,
      vaultArgonSecuritization,
    });
    vaultSecuritizationGrowthCapped ||= desiredVaultSecuritization > maximumDailyVaultSecuritization;
    vaultArgonSecuritization = Math.min(desiredVaultSecuritization, maximumDailyVaultSecuritization);
  }

  const vaultSecuritizationAdded = Math.max(
    0,
    vaultArgonSecuritization - current.vaultArgonSecuritization,
  );
  const finalIdealBondCapital = Math.max(current.bondCapital, vaultArgonSecuritization);
  const miningMintRequested = additionalMiningRequest(bitcoinMintLoaded, bondCapital);
  const growthBeforeStakesUsd = projectedGrowthUsd(bitcoinMintLoaded)
    + miningMintRequested * current.argonPriceUsd;
  const nextArgonotCirculation = current.argonotCirculation + argonotMintLoaded;
  const currentStakedArgonots = current.argonotCirculation * current.stakePercent;
  const heldStakePercent = nextArgonotCirculation > 0
    ? currentStakedArgonots / nextArgonotCirculation
    : 0;
  const bitcoinCapacityHistory = [...current.bitcoinCapacityHistory, Math.min(MAX_USABLE_BITCOIN, Math.max(
    bitcoinLocked,
    vaultArgonSecuritization * current.argonPriceUsd / current.bitcoinPriceUsd,
  ))].slice(-(DAYS_PER_COHORT + 1));
  const expectedDaysToBitcoinCapacity = expectedDaysToCapacity(bitcoinCapacityHistory);
  const capacityMarketPressure = capacityPressure(expectedDaysToBitcoinCapacity);
  const rewardReductionActive = current.rewardReductionActive || capacityMarketPressure > 0;
  const baseArgonRewards = nextBaseArgonRewards(current, capacityMarketPressure);
  const miningCohortBaseArgonRewards = current.rewardReductionActive
    ? dailyMining.cohortBaseArgonRewards
    : Array(DAYS_PER_COHORT).fill(rewardReductionActive ? current.baseArgonRewards : baseArgonRewards);
  const pendingMiningMint = miningMintRequested;
  const pricingState = {
    ...current,
    argonotPriceUsd: biddingPrice,
    argonCirculation: circulationAfterMining + bitcoinMintLoaded,
    argonotCirculation: nextArgonotCirculation,
    minedArgons: minedArgonsAfterBurn,
    bitcoinArgons: bitcoinArgonsAfterBurn + bitcoinMintLoaded,
    bitcoinLocked,
    vaultArgonSecuritization,
    bondCapital,
    stakePercent: heldStakePercent,
    miningAuctionRevenue: auctionRevenue,
    miningAuctionCohortRevenues: dailyMining.cohortRevenues,
    seatCount: dailyMining.seatCount,
    dailySeatCount: dailyMining.dailySeatCount,
    miningCohortSeats: dailyMining.cohortSeats,
    argonsBidPerSeat,
    baseArgonRewards,
    miningCohortBaseArgonRewards,
    miningCohortMintedArgons: dailyMining.cohortMintedArgons,
    pendingMiningMint,
    rewardReductionActive,
    bitcoinCapacityHistory,
    expectedDaysToBitcoinCapacity,
    capacityMarketPressure,
  };
  const expectedMiningAuctionRevenue = forecastAuctionRevenue(pricingState);
  // The preview resolves one price response from expected staking income.
  // Settlement holds that price fixed; updated income informs the next day
  // rather than marking down a bid immediately after it was committed.
  const idealStakeResolution = side === "vaulting"
    ? solveStakeCompetition(pricingState, expectedMiningAuctionRevenue)
    : { stakePercent: heldStakePercent, argonotPriceUsd: current.argonotPriceUsd };
  const stakePercent = optionalGrowthAllowed ? idealStakeResolution.stakePercent : heldStakePercent;
  const maximumArgonotPriceIncrease = nextArgonotCirculation > 0
    ? Math.max(0, maximumOptionalGrowthUsd - growthBeforeStakesUsd) / nextArgonotCirculation
    : 0;
  const maximumDailyArgonotPriceChange = current.argonotPriceUsd
    * MAX_DAILY_ARGONOT_PRICE_CHANGE;
  const desiredArgonotPriceChange = idealStakeResolution.argonotPriceUsd - current.argonotPriceUsd;
  const maximumFundedArgonotPriceUsd = current.argonotPriceUsd + (optionalGrowthAllowed
    ? Math.min(maximumArgonotPriceIncrease, maximumDailyArgonotPriceChange)
    : 0);
  // A markdown is not additional capital and must not be blocked by the
  // optional network-growth budget. Upward changes retain that funding limit.
  const argonotPriceAddedUsd = entryArgonotPriceUsd !== undefined
    ? entryArgonotPriceUsd - current.argonotPriceUsd
    : desiredArgonotPriceChange < 0
    ? Math.max(desiredArgonotPriceChange, -maximumDailyArgonotPriceChange)
    : optionalGrowthAllowed
    ? Math.min(
      desiredArgonotPriceChange,
      maximumArgonotPriceIncrease,
      maximumDailyArgonotPriceChange,
    )
    : 0;
  const argonotPriceUsd = current.argonotPriceUsd + argonotPriceAddedUsd;
  const networkValueAddedUsd = (miningMintLoaded + bitcoinMintLoaded - argonBurned) * current.argonPriceUsd
    + argonotMintLoaded * argonotPriceUsd
    + argonotPriceAddedUsd * current.argonotCirculation;
  const networkValueUsd = current.networkValueUsd + networkValueAddedUsd;
  const growthCapped = dailyMining.growthCapped || vaultSecuritizationGrowthCapped || (side === "vaulting" && (
    desiredBitcoinMint - bitcoinMintLoaded > 0.000001
    || availableBitcoinSpace - desiredBitcoinMint > 0.000001
    || finalIdealBondCapital - bondCapital > 0.000001
    || idealStakeResolution.stakePercent - stakePercent > 0.000001
    || Math.abs(idealStakeResolution.argonotPriceUsd - argonotPriceUsd) > 0.000001
  ));

  const next = finalizeCycle({
    ...current,
    elapsedDays: current.elapsedDays + 1,
    status: "running",
    activeSide: null,
    argonotPriceUsd,
    networkValueUsd,
    argonCirculation: circulationAfterMining + bitcoinMintLoaded,
    argonotCirculation: nextArgonotCirculation,
    minedArgons: minedArgonsAfterBurn,
    bitcoinArgons: bitcoinArgonsAfterBurn + bitcoinMintLoaded,
    bitcoinLocked,
    bitcoinCapacityHistory,
    expectedDaysToBitcoinCapacity,
    capacityMarketPressure,
    expectedMiningAuctionRevenue,
    argonsBidPerSeat,
    argonotsBidPerSeat: MINING_COLLATERAL_MULTIPLIER * argonsBidPerSeat * current.argonPriceUsd / argonotPriceUsd,
    miningAuctionRevenue: auctionRevenue,
    miningAuctionCohortRevenues: dailyMining.cohortRevenues,
    seatCount: dailyMining.seatCount,
    dailySeatCount: dailyMining.dailySeatCount,
    miningCohortSeats: dailyMining.cohortSeats,
    baseArgonRewards,
    miningCohortBaseArgonRewards,
    miningCohortMintedArgons: dailyMining.cohortMintedArgons,
    rewardReductionActive,
    pendingMiningMint,
    vaultArgonSecuritization,
    bondCapital,
    stakePercent,
    returns: emptyReturns(),
  });

  const endingReturnApy = side === "mining"
    ? calculateNewCohortMiningApy(next)
    : next.returns.vaultingApy;

  return {
    side,
    maximumFundedArgonotPriceUsd,
    startingReturnApy,
    endingReturnApy,
    argonBidAdded,
    auctionRevenueAdded: argonBidAdded,
    vaultSecuritizationAdded,
    bondCapitalAdded: Math.max(0, bondCapital - current.bondCapital),
    argonotsStakedAdded: side === "vaulting"
      ? Math.max(0, stakePercent * nextArgonotCirculation - currentStakedArgonots)
      : 0,
    argonotPriceAddedUsd,
    bitcoinLockedAdded,
    miningMintLoaded,
    argonotMintLoaded,
    miningMintRequested,
    bitcoinMintLoaded,
    argonBurned,
    networkValueAddedUsd,
    growthCapped,
    next,
  };
}

export function calculateReturns(state: GrowthCycleState): GrowthReturns {
  const auctionRevenue = state.miningAuctionRevenue;
  return {
    miningApy: calculateMiningApy(state),
    vaultingApy: calculateVaultingApy(state),
    stakesApy: calculateStakeApy(state, auctionRevenue),
    bondsApy: calculateBondApy(state, auctionRevenue),
  };
}

export function calculateExpectedStakeApy(state: GrowthCycleState): number {
  return calculateStakeApy(state, state.expectedMiningAuctionRevenue);
}

// A new operator competes at the current reward-based price, not the average
// paid by legacy cohorts or a bid constrained by the network's growth throttle.
export function calculateMiningEntryBid(state: GrowthCycleState): number {
  return bidForTenDayReturn({
    targetTdr: apyToTenDayReturn(RETURN_THRESHOLD_APY),
    argonPriceUsd: state.argonPriceUsd,
    argonotPriceUsd: state.argonotPriceUsd,
    argonRewardsPerSeat: miningArgonRewardsPerSeat(state),
    argonotRewardsPerSeat: state.baseArgonotRewards / state.seatCount,
  });
}

export function calculateNewCohortMiningApy(state: GrowthCycleState): number {
  const cohorts = state.miningAuctionCohortRevenues;
  const latestCohortRevenue = cohorts[cohorts.length - 1];
  if (latestCohortRevenue === undefined) return calculateMiningApy(state);
  // Reuse the mining formula with the newest daily cohort's bid cost per seat.
  const latestCohortReward = state.rewardReductionActive
    ? state.miningCohortBaseArgonRewards[state.miningCohortBaseArgonRewards.length - 1]
    : state.baseArgonRewards;
  return calculateMiningApy(
    { ...state, miningAuctionRevenue: latestCohortRevenue / state.miningCohortSeats[DAYS_PER_COHORT - 1] * state.seatCount },
    latestCohortReward,
    state.miningCohortMintedArgons[state.miningCohortMintedArgons.length - 1] / state.miningCohortSeats[DAYS_PER_COHORT - 1] * state.seatCount,
  );
}

export function calculateAverageMiningBaseRewards(state: GrowthCycleState): number {
  if (!state.rewardReductionActive) return state.baseArgonRewards;
  return state.miningCohortBaseArgonRewards.reduce((total, reward) => total + reward, 0) / DAYS_PER_COHORT;
}

function finalizeCycle(state: GrowthCycleState): GrowthCycleState {
  const returns = calculateReturns(state);
  const miningApy = calculateNewCohortMiningApy(state);
  const returnsNormalized = miningApy <= RETURN_THRESHOLD_APY + MINING_RETURN_TOLERANCE
    && returns.vaultingApy < RETURN_THRESHOLD_APY;
  const activeSide = returnsNormalized
    ? null
    : returns.vaultingApy > miningApy ? "vaulting" : "mining";

  return {
    ...state,
    status: returnsNormalized ? "returns-normalized" : "running",
    activeSide,
    returns,
  };
}

function calculateMiningApy(
  state: GrowthCycleState,
  baseArgonRewards = calculateAverageMiningBaseRewards(state),
  mintedArgons = state.miningCohortMintedArgons.reduce((total, reward) => total + reward, 0),
): number {
  const aggregateArgonBidPerSeat = state.miningAuctionRevenue / state.seatCount;
  const argonRewardsPerSeat = miningArgonRewardsPerSeat(state, baseArgonRewards, mintedArgons);
  const argonotRewardsPerSeat = state.baseArgonotRewards / state.seatCount;
  const endingValue = argonRewardsPerSeat * state.argonPriceUsd
    + (state.argonotsBidPerSeat + argonotRewardsPerSeat) * state.argonotPriceUsd;
  const bidValue = aggregateArgonBidPerSeat * state.argonPriceUsd
    + state.argonotsBidPerSeat * state.argonotPriceUsd;
  if (bidValue <= 0) return 0;
  return tenDayReturnToApy((endingValue - bidValue) / bidValue * 100);
}

function miningArgonRewardsPerSeat(
  state: GrowthCycleState,
  baseArgonRewards = state.baseArgonRewards,
  mintedArgons = 0,
): number {
  // A new bidder has no earned income. An existing cohort retains its share of
  // issued minting and may also receive the next known, still-unissued request.
  // All amounts here are network-equivalent; divide across seats exactly once.
  return (baseArgonRewards + mintedArgons + state.pendingMiningMint) / state.seatCount;
}

interface DailyMiningResult {
  seatCount: number;
  dailySeatCount: number;
  cohortSeats: number[];
  argonsBidPerSeat: number;
  auctionRevenue: number;
  cohortRevenues: number[];
  cohortBaseArgonRewards: number[];
  cohortMintedArgons: number[];
  settledAuctionRevenue: number;
  argonMinted: number;
  argonotMinted: number;
  growthCapped: boolean;
}

function runDailyMiningFrame(
  current: GrowthCycleState,
  competitionEnabled: boolean,
  bidScale = 1,
): DailyMiningResult {
  const dailySeats = current.dailySeatCount;
  // Once capacity is anticipated, bids and reward commitments expire together
  // every elapsed day, including vaulting days. Older contracts are not repriced.
  const cohortBaseArgonRewards = [...current.miningCohortBaseArgonRewards.slice(1), current.baseArgonRewards];
  const activeBaseArgonRewards = current.rewardReductionActive
    ? cohortBaseArgonRewards.reduce((total, reward) => total + reward, 0) / DAYS_PER_COHORT
    : current.baseArgonRewards;
  const dailyArgonMint = activeBaseArgonRewards / DAYS_PER_COHORT
    + current.pendingMiningMint;
  const dailyArgonotMint = current.baseArgonotRewards / DAYS_PER_COHORT;
  const fallbackCohortRevenue = current.miningAuctionRevenue / DAYS_PER_COHORT;
  const cohortRevenues = current.miningAuctionCohortRevenues.length === DAYS_PER_COHORT
    ? current.miningAuctionCohortRevenues.map(value => Math.max(0, value))
    : Array(DAYS_PER_COHORT).fill(fallbackCohortRevenue);
  // Seat contracts roll every day, including vaulting days. New seats do not
  // inherit the retired cohort's rewards.
  const retainedMintedArgons = [...current.miningCohortMintedArgons.slice(1), 0];

  const rewardBasedBidPerSeat = bidForTenDayReturn({
    targetTdr: apyToTenDayReturn(RETURN_THRESHOLD_APY),
    argonPriceUsd: current.argonPriceUsd,
    argonotPriceUsd: current.argonotPriceUsd,
    argonRewardsPerSeat: miningArgonRewardsPerSeat(current),
    argonotRewardsPerSeat: current.baseArgonotRewards / current.seatCount,
  });
  // Aggregate revenue follows the selected adjustment phase. Fresh operator
  // bids use calculateMiningEntryBid, including during vaulting days.
  const targetBidPerSeat = competitionEnabled
    ? Math.max(current.argonsBidPerSeat, rewardBasedBidPerSeat)
    : current.rewardReductionActive ? Math.min(current.argonsBidPerSeat, rewardBasedBidPerSeat) : current.argonsBidPerSeat;
  const expiredCohortRevenue = cohortRevenues.shift() ?? 0;
  const retainedAuctionRevenue = cohortRevenues.reduce((total, value) => total + value, 0);
  const maximumMiningBidCapital = Math.max(
    0,
    (current.argonCirculation + dailyArgonMint) * (1 - UNISWAP_RESERVE_SHARE)
      - current.vaultArgonSecuritization
      - current.bondCapital,
  );
  const affordableDailyRevenue = Math.max(0, maximumMiningBidCapital - retainedAuctionRevenue);
  const desiredDailyRevenue = targetBidPerSeat * dailySeats;
  const maximumDailyBidRevenue = current.argonsBidPerSeat
    * (1 + MAX_DAILY_COMPETITION_GROWTH) * dailySeats;
  const maximumDailyTotalRevenue = Math.max(
    0,
    current.miningAuctionRevenue * (1 + MAX_DAILY_COMPETITION_GROWTH) - retainedAuctionRevenue,
  );
  cohortRevenues.push(Math.min(
    desiredDailyRevenue,
    affordableDailyRevenue,
    maximumDailyBidRevenue,
    maximumDailyTotalRevenue,
  ) * bidScale);

  const latestDailyRevenue = cohortRevenues[cohortRevenues.length - 1] ?? 0;
  const retainedSeats = current.miningCohortSeats.slice(1).reduce((total, seats) => total + seats, 0);
  const requiredSeats = Math.ceil(rewardBasedBidPerSeat * current.seatCount / MAX_MINING_BID_PER_SEAT);
  const dailySeatCount = Math.max(
    dailySeats,
    Math.ceil(latestDailyRevenue / MAX_MINING_BID_PER_SEAT),
    requiredSeats - retainedSeats,
  );
  const cohortSeats = [...current.miningCohortSeats.slice(1), dailySeatCount];
  const seatCount = cohortSeats.reduce((total, seats) => total + seats, 0);
  const cohortMintedArgons = retainedMintedArgons.map((earned, index) => (
    earned + current.pendingMiningMint * cohortSeats[index] / seatCount
  ));
  return {
    seatCount,
    dailySeatCount,
    cohortSeats,
    argonsBidPerSeat: latestDailyRevenue / dailySeatCount,
    auctionRevenue: cohortRevenues.reduce((total, value) => total + value, 0),
    cohortRevenues,
    cohortBaseArgonRewards,
    cohortMintedArgons,
    settledAuctionRevenue: expiredCohortRevenue,
    argonMinted: dailyArgonMint,
    argonotMinted: dailyArgonotMint,
    growthCapped: latestDailyRevenue < desiredDailyRevenue - 0.000001,
  };
}

function calculateVaultingApy(state: GrowthCycleState): number {
  return calculateVaultingReturns(state).apy;
}

export function calculateVaultRevenueShare(state: GrowthCycleState): number {
  if (state.miningAuctionRevenue <= 0) return 0;
  return calculateVaultingReturns(state).tenDayProfit / state.miningAuctionRevenue;
}

function calculateVaultingReturns(state: GrowthCycleState) {
  const securitization = state.vaultArgonSecuritization;
  const bitcoinLockedValue = state.argonPriceUsd > 0
    ? state.bitcoinLocked * state.bitcoinPriceUsd / state.argonPriceUsd
    : 0;
  return calculateVaultReturns({
    auctionRevenue: state.miningAuctionRevenue,
    argonSecuritization: securitization,
    argonotSecuritizationValue: securitization * ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER,
    bitcoinLockedValue,
    bondCapital: state.bondCapital,
    minedArgons: state.minedArgons,
    bitcoinArgons: state.bitcoinArgons,
    bondRevenueShare: BOND_REVENUE_SHARE,
    liquidRevenueShare: LIQUID_REVENUE_SHARE,
  });
}

function calculateStakeApy(state: GrowthCycleState, auctionRevenue: number): number {
  const stakedArgonots = state.argonotCirculation * state.stakePercent;
  const principalValueUsd = stakedArgonots * state.argonotPriceUsd;
  if (principalValueUsd <= 0) return 0;
  const profitValueUsd = auctionRevenue * STAKE_REVENUE_SHARE * state.argonPriceUsd;
  return tenDayReturnToApy(profitValueUsd / principalValueUsd * 100);
}

function calculateBondApy(state: GrowthCycleState, auctionRevenue: number): number {
  if (state.bondCapital <= 0) return 0;
  const desiredBitcoinSpace = Math.max(state.minedArgons * BITCOIN_CAPACITY_RATE, state.bitcoinArgons, 1);
  const eligibility = Math.min(1, state.bondCapital / desiredBitcoinSpace);
  const tenDayProfit = auctionRevenue * eligibility * BOND_REVENUE_SHARE;
  return tenDayReturnToApy(tenDayProfit / state.bondCapital * 100);
}

function solveVaultSecuritization(state: GrowthCycleState): number {
  return solveIncreasingValue(state.vaultArgonSecuritization, value => {
    const candidate = { ...state, vaultArgonSecuritization: value };
    return calculateVaultingApy(candidate) < RETURN_THRESHOLD_APY;
  });
}

function solveStakeCompetition(
  state: GrowthCycleState,
  auctionRevenue: number,
): { stakePercent: number; argonotPriceUsd: number } {
  const targetTdrRatio = apyToTenDayReturn(TARGET_RETURN_APY) / 100;
  const requiredPrincipalUsd = auctionRevenue * STAKE_REVENUE_SHARE * state.argonPriceUsd / targetTdrRatio;
  if (calculateStakeApy(state, auctionRevenue) < RETURN_THRESHOLD_APY) {
    const stakedArgonots = state.argonotCirculation * state.stakePercent;
    return {
      stakePercent: state.stakePercent,
      argonotPriceUsd: stakedArgonots > 0
        ? Math.min(state.argonotPriceUsd, requiredPrincipalUsd / stakedArgonots)
        : state.argonotPriceUsd,
    };
  }

  const requiredArgonotsAtCurrentPrice = requiredPrincipalUsd / state.argonotPriceUsd;
  const requiredStakePercent = state.argonotCirculation > 0
    ? requiredArgonotsAtCurrentPrice / state.argonotCirculation
    : 1;

  if (requiredStakePercent <= 1) {
    return {
      stakePercent: Math.max(state.stakePercent, Math.min(1, requiredStakePercent * 1.000001)),
      argonotPriceUsd: state.argonotPriceUsd,
    };
  }

  const requiredPrice = state.argonotCirculation > 0
    ? requiredPrincipalUsd / state.argonotCirculation
    : state.argonotPriceUsd;
  return {
    stakePercent: 1,
    argonotPriceUsd: Math.max(state.argonotPriceUsd, requiredPrice * 1.000001),
  };
}

function bidForTenDayReturn({
  targetTdr,
  argonPriceUsd,
  argonotPriceUsd,
  argonRewardsPerSeat,
  argonotRewardsPerSeat,
}: {
  targetTdr: number;
  argonPriceUsd: number;
  argonotPriceUsd: number;
  argonRewardsPerSeat: number;
  argonotRewardsPerSeat: number;
}): number {
  const rewardsValue = argonRewardsPerSeat * argonPriceUsd + argonotRewardsPerSeat * argonotPriceUsd;
  return Math.max(0, rewardsValue / (1 + (1 + MINING_COLLATERAL_MULTIPLIER) * targetTdr / 100) / argonPriceUsd);
}

function solveIncreasingValue(startingValue: number, predicate: (value: number) => boolean): number {
  if (predicate(startingValue)) return startingValue;
  let low = startingValue;
  let high = Math.max(1, startingValue * 2);
  for (let index = 0; index < 64 && !predicate(high); index += 1) high *= 2;
  for (let index = 0; index < 80; index += 1) {
    const middle = (low + high) / 2;
    if (predicate(middle)) high = middle;
    else low = middle;
  }
  return high;
}

function maximizeOptionalValue(minimum: number, desired: number, predicate: (value: number) => boolean): number {
  if (desired <= minimum || predicate(desired)) return desired;
  if (!predicate(minimum)) return minimum;
  let low = minimum;
  let high = desired;
  for (let index = 0; index < 80; index += 1) {
    const middle = (low + high) / 2;
    if (predicate(middle)) low = middle;
    else high = middle;
  }
  return low;
}

function calculateAllocationShortage({
  circulation,
  miningBidCapital,
  vaultSecuritization,
  bondCapital,
}: {
  circulation: number;
  miningBidCapital: number;
  vaultSecuritization: number;
  bondCapital: number;
}): number {
  const allocatedArgons = miningBidCapital + vaultSecuritization + bondCapital;
  const requiredCirculation = allocatedArgons / (1 - UNISWAP_RESERVE_SHARE);
  return Math.max(0, requiredCirculation - circulation);
}

function tenDayReturnToApy(tenDayReturn: number): number {
  if (tenDayReturn <= -100) return -100;
  return ((1 + tenDayReturn / 100) ** TEN_DAY_PERIODS_PER_YEAR - 1) * 100;
}

function apyToTenDayReturn(apy: number): number {
  return ((1 + apy / 100) ** (1 / TEN_DAY_PERIODS_PER_YEAR) - 1) * 100;
}

function emptyReturns(): GrowthReturns {
  return { miningApy: 0, vaultingApy: 0, stakesApy: 0, bondsApy: 0 };
}

function emptyResult(current: GrowthCycleState): GrowthCycleResult {
  const side = current.activeSide ?? "mining";
  const apy = side === "mining" ? calculateNewCohortMiningApy(current) : current.returns.vaultingApy;
  return {
    side,
    days: 0,
    outcome: "complete",
    pauseReason: null,
    startingReturnApy: apy,
    endingReturnApy: apy,
    argonBidAdded: 0,
    auctionRevenueAdded: 0,
    vaultSecuritizationAdded: 0,
    bondCapitalAdded: 0,
    argonotsStakedAdded: 0,
    argonotPriceAddedUsd: 0,
    bitcoinLockedAdded: 0,
    miningMintLoaded: 0,
    argonotMintLoaded: 0,
    miningMintRequested: 0,
    bitcoinMintLoaded: 0,
    argonBurned: 0,
    networkValueAddedUsd: 0,
    growthCapped: false,
    next: current,
  };
}

function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
