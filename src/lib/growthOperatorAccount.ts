import type { GrowthCycleState } from "./exponentialTriggers";
import { calculateMiningEntryBid, calculateVaultRevenueShare, MAX_MINING_BID_PER_SEAT, MINING_COLLATERAL_MULTIPLIER } from "./exponentialTriggers";
import { calculateVaultReturns } from "./vaultCalculator";

const SEAT_DAYS = 10;
const INITIAL_CAPITAL = 10_000;

export interface OperatorMiningPosition {
  seats: number;
  daysRemaining: number;
  prepaidBids: number;
  argonots: number;
}

export interface GrowthOperatorAccount {
  initialCapital: number;
  miningAllocation: number;
  miningCash: number;
  vaultCash: number;
  miningPositions: OperatorMiningPosition[];
  vaultArgons: number;
  vaultArgonots: number;
  recruitedBitcoinValue: number;
  recruitedBonds: number;
  recruitedStakeValue: number;
  miningIncome: number;
  vaultIncome: number;
  bidExpenses: number;
  elapsedDays: number;
  value: number;
}

// This account is a price-taking participant in the simulated network. Its
// holdings are a subset of network capital, not additional network issuance.
export function createOperatorAccount(
  state: GrowthCycleState,
  miningAllocation = 0.1 + Math.random() * 0.8,
): GrowthOperatorAccount {
  if (!Number.isFinite(miningAllocation) || miningAllocation < 0 || miningAllocation > 1) {
    throw new Error("Invalid operator allocation");
  }
  const account: GrowthOperatorAccount = {
    initialCapital: INITIAL_CAPITAL,
    miningAllocation,
    miningCash: INITIAL_CAPITAL * miningAllocation,
    vaultCash: INITIAL_CAPITAL * (1 - miningAllocation),
    miningPositions: [],
    vaultArgons: 0,
    vaultArgonots: 0,
    recruitedBitcoinValue: 0,
    recruitedBonds: 0,
    recruitedStakeValue: 0,
    miningIncome: 0,
    vaultIncome: 0,
    bidExpenses: 0,
    elapsedDays: state.elapsedDays,
    value: INITIAL_CAPITAL,
  };
  investAvailableCapital(account, state);
  account.value = operatorAccountValue(account, state);
  return account;
}

// Called once per actual engine day, never for a UI transfer or cycle boundary.
// Mint inputs are that day's issuance, not the engine's cumulative step totals.
export function advanceOperatorAccount(
  previous: GrowthOperatorAccount,
  state: GrowthCycleState,
  miningMint: number,
  argonotMint: number,
): GrowthOperatorAccount {
  if (state.elapsedDays === previous.elapsedDays) return previous;
  if (state.elapsedDays !== previous.elapsedDays + 1) throw new Error("Operator ledger requires daily states");
  const account = { ...previous, miningPositions: previous.miningPositions.map(position => ({ ...position })) };
  const argonotPrice = state.argonotPriceUsd / state.argonPriceUsd;
  const activeSeats = account.miningPositions.reduce((total, position) => total + position.seats, 0);
  // The engine pays aggregate daily rewards across active seats. Incoming seats
  // purchased below start earning tomorrow; annualized APYs are never compounded.
  const miningIncome = (miningMint + argonotMint * argonotPrice) * Math.min(1, activeSeats / state.seatCount);
  recruitCapital(account, state);
  const vaultIncome = Math.min(
    vaultReturns(account.vaultArgons, account.vaultArgonots, state).tenDayProfit,
    state.miningAuctionRevenue * calculateVaultRevenueShare(state),
  ) / SEAT_DAYS;
  account.miningIncome += miningIncome;
  account.vaultIncome += vaultIncome;
  let returnedCapital = 0;
  for (const position of account.miningPositions) {
    position.daysRemaining -= 1;
    if (position.daysRemaining === 0) returnedCapital += position.argonots * argonotPrice;
  }
  account.miningPositions = account.miningPositions.filter(position => position.daysRemaining > 0);
  // Reward ARGNOT and released mining collateral are exchanged at the current
  // modeled price. Vault collateral stays committed; only liquid proceeds move.
  const liquidProceeds = miningIncome + vaultIncome + returnedCapital;
  account.miningCash += liquidProceeds * account.miningAllocation;
  account.vaultCash += liquidProceeds * (1 - account.miningAllocation);
  account.elapsedDays = state.elapsedDays;
  investAvailableCapital(account, state);
  account.value = operatorAccountValue(account, state);
  return account;
}

export function operatorAccountValue(account: GrowthOperatorAccount, state: GrowthCycleState): number {
  const argonotPrice = state.argonotPriceUsd / state.argonPriceUsd;
  const miningValue = account.miningPositions.reduce((total, position) => (
    total + position.prepaidBids * position.daysRemaining / SEAT_DAYS + position.argonots * argonotPrice
  ), 0);
  // Unexpired seat expenses are carried at their remaining cost, not counted as
  // refundable ARGN. Recruited capital and future rewards are never owned assets.
  return account.miningCash + account.vaultCash + miningValue
    + account.vaultArgons + account.vaultArgonots * argonotPrice;
}

function investAvailableCapital(account: GrowthOperatorAccount, state: GrowthCycleState) {
  const argonotPrice = state.argonotPriceUsd / state.argonPriceUsd;
  // A phased or throttled historical bid is not a competitive entry quote.
  // If capacity has not expanded enough to meet the cap yet, keep cash liquid.
  const entryBid = Math.max(state.argonsBidPerSeat, calculateMiningEntryBid(state));
  const entryArgonots = MINING_COLLATERAL_MULTIPLIER * entryBid / argonotPrice;
  const seatCost = entryBid * (1 + MINING_COLLATERAL_MULTIPLIER);
  const activeSeats = account.miningPositions.reduce((total, position) => total + position.seats, 0);
  const seats = seatCost > 0 && entryBid <= MAX_MINING_BID_PER_SEAT ? Math.max(0, Math.min(
    Math.floor(account.miningCash / seatCost),
    state.dailySeatCount,
    Math.floor(state.seatCount - activeSeats),
  )) : 0;
  if (seats > 0) {
    account.miningCash = Math.max(0, account.miningCash - seats * seatCost);
    account.bidExpenses += seats * entryBid;
    account.miningPositions.push({
      seats,
      daysRemaining: SEAT_DAYS,
      prepaidBids: seats * entryBid,
      argonots: seats * entryArgonots,
    });
  }

  // Compare incremental vault earnings for feasible splits of new cash. Existing
  // collateral is not liquidated, and ARGNOT funding cannot exceed 2x ARGN.
  const budget = account.vaultCash;
  let bestArgons = 0;
  let bestArgonots = 0;
  let bestProfit = vaultReturns(account.vaultArgons, account.vaultArgonots, state).tenDayProfit;
  for (let allocation = 0; allocation <= 100; allocation++) {
    const argons = Math.min(budget * allocation / 100, Math.max(0, state.vaultArgonSecuritization - account.vaultArgons));
    const argonotValue = Math.min(
      budget - argons,
      Math.max(0, (account.vaultArgons + argons) * 2 - account.vaultArgonots * argonotPrice),
      Math.max(0, state.argonotCirculation - account.vaultArgonots) * argonotPrice,
    );
    const argonots = argonotValue / argonotPrice;
    const profit = vaultReturns(account.vaultArgons + argons, account.vaultArgonots + argonots, state).tenDayProfit;
    if (profit > bestProfit) {
      bestProfit = profit;
      bestArgons = argons;
      bestArgonots = argonots;
    }
  }
  account.vaultArgons += bestArgons;
  account.vaultArgonots += bestArgonots;
  account.vaultCash = Math.max(0, budget - bestArgons - bestArgonots * argonotPrice);
  recruitCapital(account, state);
}

function recruitCapital(account: GrowthOperatorAccount, state: GrowthCycleState) {
  account.recruitedBitcoinValue = Math.min(account.vaultArgons, state.bitcoinLocked * state.bitcoinPriceUsd / state.argonPriceUsd);
  account.recruitedBonds = Math.min(account.vaultArgons, state.bondCapital);
  const vaultShare = state.vaultArgonSecuritization > 0 ? Math.min(1, account.vaultArgons / state.vaultArgonSecuritization) : 0;
  account.recruitedStakeValue = state.argonotCirculation * state.stakePercent
    * state.argonotPriceUsd / state.argonPriceUsd * vaultShare;
}

function vaultReturns(argons: number, argonots: number, state: GrowthCycleState) {
  return calculateVaultReturns({
    auctionRevenue: state.miningAuctionRevenue,
    argonSecuritization: argons,
    argonotSecuritizationValue: argonots * state.argonotPriceUsd / state.argonPriceUsd,
    bitcoinLockedValue: Math.min(argons, state.bitcoinLocked * state.bitcoinPriceUsd / state.argonPriceUsd),
    bondCapital: Math.min(argons, state.bondCapital),
    minedArgons: state.minedArgons,
    bitcoinArgons: state.bitcoinArgons,
  });
}
