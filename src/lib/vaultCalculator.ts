export const MIN_VAULT_PROFIT_RATE = 0.01;
export const MAX_VAULT_PROFIT_RATE = 0.57;
export const BITCOIN_CORE_WEIGHT = 0.9;
export const BOND_CORE_WEIGHT = 0.1;
export const BITCOIN_CAPACITY_RATE = 0.15;
export const ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER = 2;
export const ARGONOT_RETURN_BONUS = 0.29;
export const DEFAULT_BOND_REVENUE_SHARE = 0.05;
export const DEFAULT_LIQUID_REVENUE_SHARE = 0.03;

const TEN_DAY_PERIODS_PER_YEAR = 365 / 10;
const MAX_CAPITAL_MULTIPLIER = 1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER;
const MAX_ARGONOT_BONUS_MULTIPLIER = 1 + ARGONOT_RETURN_BONUS;

export interface VaultCalculationInput {
  auctionRevenue: number;
  argonSecuritization: number;
  argonotSecuritizationValue: number;
  bitcoinLockedValue: number;
  bondCapital: number;
  minedArgons: number;
  bitcoinArgons: number;
  bondRevenueShare?: number;
  liquidRevenueShare?: number;
}

export interface VaultCalculation {
  desiredBitcoinSpace: number;
  vaultFactor: number;
  bitcoinUtilization: number;
  bondUtilization: number;
  argonotUtilization: number;
  coreUtilization: number;
  capitalInvested: number;
  adjustedMaxProfitRate: number;
  vaultProfitRate: number;
  tenDayProfit: number;
  tenDayReturn: number;
  apy: number;
}

export function calculateVaultReturns(input: VaultCalculationInput): VaultCalculation {
  const auctionRevenue = nonNegative(input.auctionRevenue);
  const argonSecuritization = nonNegative(input.argonSecuritization);
  const argonotSecuritizationValue = nonNegative(input.argonotSecuritizationValue);
  const bitcoinLockedValue = nonNegative(input.bitcoinLockedValue);
  const bondCapital = nonNegative(input.bondCapital);
  const minedArgons = nonNegative(input.minedArgons);
  const bitcoinArgons = nonNegative(input.bitcoinArgons);
  const bondRevenueShare = nonNegative(input.bondRevenueShare ?? DEFAULT_BOND_REVENUE_SHARE);
  const liquidRevenueShare = nonNegative(input.liquidRevenueShare ?? DEFAULT_LIQUID_REVENUE_SHARE);
  const desiredBitcoinSpace = Math.max(minedArgons * BITCOIN_CAPACITY_RATE, bitcoinArgons, 1);
  const vaultFactor = Math.min(1, argonSecuritization / desiredBitcoinSpace);
  const argonotCapacity = argonSecuritization * ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER;
  const argonotUtilization = argonotCapacity > 0
    ? Math.min(1, argonotSecuritizationValue / argonotCapacity)
    : 0;
  const bitcoinUtilization = argonSecuritization > 0
    ? Math.min(1, bitcoinLockedValue / argonSecuritization)
    : 0;
  const bondUtilization = argonSecuritization > 0
    ? Math.min(1, bondCapital / argonSecuritization)
    : 0;
  const coreUtilization = bitcoinUtilization
    * (BITCOIN_CORE_WEIGHT + BOND_CORE_WEIGHT * bondUtilization);
  const adjustedMaxProfitRate = Math.max(
    MIN_VAULT_PROFIT_RATE,
    MAX_VAULT_PROFIT_RATE
      - Math.max(0, bondRevenueShare - DEFAULT_BOND_REVENUE_SHARE)
      - Math.max(0, liquidRevenueShare - DEFAULT_LIQUID_REVENUE_SHARE),
  );
  const coreMaxProfitRate = adjustedMaxProfitRate
    / MAX_CAPITAL_MULTIPLIER
    / MAX_ARGONOT_BONUS_MULTIPLIER;
  const coreProfitRate = MIN_VAULT_PROFIT_RATE
    + coreUtilization * (coreMaxProfitRate - MIN_VAULT_PROFIT_RATE);
  const capitalInvested = argonSecuritization + argonotSecuritizationValue;
  const capitalMultiplier = argonSecuritization > 0
    ? capitalInvested / argonSecuritization
    : 1;
  const argonotBonusMultiplier = 1
    + ARGONOT_RETURN_BONUS * argonotUtilization * bitcoinUtilization;
  const vaultProfitRate = Math.min(
    adjustedMaxProfitRate,
    coreProfitRate * capitalMultiplier * argonotBonusMultiplier,
  );
  const tenDayProfit = auctionRevenue * vaultFactor * vaultProfitRate;
  const tenDayReturn = capitalInvested > 0 ? tenDayProfit / capitalInvested * 100 : 0;
  const apy = tenDayReturnToApy(tenDayReturn);

  return {
    desiredBitcoinSpace,
    vaultFactor,
    bitcoinUtilization,
    bondUtilization,
    argonotUtilization,
    coreUtilization,
    capitalInvested,
    adjustedMaxProfitRate,
    vaultProfitRate,
    tenDayProfit,
    tenDayReturn,
    apy,
  };
}

function tenDayReturnToApy(tenDayReturn: number): number {
  if (!Number.isFinite(tenDayReturn) || tenDayReturn <= -100) return 0;
  return ((1 + tenDayReturn / 100) ** TEN_DAY_PERIODS_PER_YEAR - 1) * 100;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
