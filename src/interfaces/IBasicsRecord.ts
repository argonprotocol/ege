export interface IBasicsRecordMining {
  activeSeatCount: number;
  nextEpochSeatCount: number;
  activeBidCostsUsd: number;
  activeBlockRewardsUsd: number;
  currentMicronotsForBid: bigint;
  baseMicrogonRewardsPerBlock: bigint,
  baseMicronotRewardsPerBlock: bigint
}

export interface IBasicsRecordVaulting {
  count: number;
  eligibleBondCapital: number;
  valueInVaults: number;
  bitcoinLocked: number;
  bitcoinTxnCount: number;
  epochEarnings: number;
  argonBurnCapacity: number;
}

export interface IBasicsRecord {
  lastUpdatedAt: string;
  currentBlockNumber: number;
  activeArgonotStakes: number;
  baseMicrogonsMinedPerBlock: bigint;
  baseMicronotsMinedPerBlock: bigint;
  microgonsInCirculation: {
    fromBitcoin: bigint;
    fromMining: bigint;
    total: bigint;
  };
  micronotsInCirculation: bigint;
  usdForArgon: number;
  usdTargetForArgon: number;
  usdForArgonot: number;
  usdForBtc: number;
  totalMarketValueUsd: number;
  restabilizationLeverage: number;
  miningTDR: number;
  miningAPR: number;
  vaultingAPR: number;
  bondsAPR: number;
  bitcoinAPR: number;
  mining: IBasicsRecordMining;
  vaulting: IBasicsRecordVaulting;
}

export const defaultBasicsRecord: IBasicsRecord = {
  lastUpdatedAt: '',
  currentBlockNumber: 0,
  activeArgonotStakes: 0,
  baseMicrogonsMinedPerBlock: 0n,
  baseMicronotsMinedPerBlock: 0n,
  microgonsInCirculation: {
    fromBitcoin: 0n,
    fromMining: 0n,
    total: 0n,
  },
  micronotsInCirculation: 0n,
  usdForArgon: 0,
  usdTargetForArgon: 0,
  usdForArgonot: 0,
  usdForBtc: 0,
  totalMarketValueUsd: 0,
  restabilizationLeverage: 0,
  miningTDR: 0,
  miningAPR: 0,
  vaultingAPR: 0,
  bondsAPR: 0,
  bitcoinAPR: 0,
  mining: {
    activeSeatCount: 0,
    nextEpochSeatCount: 0,
    activeBidCostsUsd: 0,
    activeBlockRewardsUsd: 0,
    currentMicronotsForBid: 0n,
    baseMicrogonRewardsPerBlock: 0n,
    baseMicronotRewardsPerBlock: 0n
  },
  vaulting: {
    count: 0,
    eligibleBondCapital: 0,
    valueInVaults: 0,
    bitcoinLocked: 0,
    bitcoinTxnCount: 0,
    epochEarnings: 0,
    argonBurnCapacity: 0,
  }
};
