<template>
  <ApySlider capital-grip :position-scale="capitalScale" :warning-message="warningMessage" reversed compact-label label="Mining APY" side="left" :scale-maximum="scales.mining" :disabled="!enabled.mining" :snapshot-at="mainnetUpdatedAt"
    :current-apy="view.frame.miningApy" :reference-apy="view.before.mining" :limit-apy="limits.mining"
    :summary-label="view.transfer ? (view.transfer?.side === 'mining' ? 'Increased Bids by' : 'Added Rewards of') : undefined"
    :summary-amount="view.transfer?.side === 'mining' ? view.transfer.bids : view.transfer?.rewards"
    @begin="begin('mining')" @change="preview('mining', $event)" @cancel="cancel" @release="release" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MINING_COLLATERAL_MULTIPLIER, RETURN_THRESHOLD_APY } from '../lib/exponentialTriggers';
import ApySlider from './ApySlider.vue';
import { mainnetUpdatedAt } from '../lib/mainnet';
import { useGrowthSimulation } from '../lib/useGrowthSimulation';
const { view, limits, scales, enabled, begin, preview, release, cancel } = useGrowthSimulation();
// Use the added-bid fraction so the grip follows the fill, as on the vaulting side.
const capitalScale = computed(() => {
  const { frame: { state }, transfer } = view.value;
  const rewards = (state.baseArgonRewards + state.pendingMiningMint) * state.argonPriceUsd
    + state.baseArgonotRewards * state.argonotPriceUsd;
  const bidsForApy = (apy: number) => rewards
    / (1 + (1 + MINING_COLLATERAL_MULTIPLIER) * ((1 + apy / 100) ** (10 / 365) - 1));
  const added = transfer?.side === 'mining' ? transfer.bids : 0;
  const baseline = state.miningAuctionRevenue * state.argonPriceUsd - added;
  const range = Math.max(0, bidsForApy(RETURN_THRESHOLD_APY) - baseline);
  return {
    toPosition: (apy: number) => range > 0 ? Math.max(0, Math.min(1, (bidsForApy(apy) - baseline) / range)) : 0,
    toApy: (position: number) => {
      if (position >= 1) return RETURN_THRESHOLD_APY;
      const bids = baseline + Math.max(0, position) * range;
      const tenDayReturn = (rewards / bids - 1) / (1 + MINING_COLLATERAL_MULTIPLIER);
      return Math.max(RETURN_THRESHOLD_APY, ((1 + tenDayReturn) ** (365 / 10) - 1) * 100);
    },
  };
});
defineProps<{ warningMessage?: string }>();
</script>
