<template>
  <ApySlider capital-grip :warning-message="warningMessage" :position-scale="capitalScale" :apy-floor="VAULTING_MIN_APY" reversed compact-label label="Vaulting APY" side="right" :scale-maximum="scales.vaulting" :disabled="!enabled.vaulting" :snapshot-at="mainnetUpdatedAt"
    :current-apy="view.frame.vaultingApy" :reference-apy="view.before.vaulting" :limit-apy="limits.vaulting"
    :summary-label="view.transfer ? (view.transfer?.side === 'mining' ? 'Added Revenue of' : 'Increased Capital by') : undefined"
    :summary-amount="view.transfer?.side === 'mining' ? view.transfer.revenue : view.transfer?.capital"
    @begin="begin('vaulting')" @change="preview('vaulting', $event)" @cancel="cancel" @release="release" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ApySlider from './ApySlider.vue';
import { createVaultingCapitalScale, VAULTING_MIN_APY } from '../lib/GrowthSimulation';
import { mainnetUpdatedAt } from '../lib/mainnet';
import { useGrowthSimulation } from '../lib/useGrowthSimulation';
const { view, limits, scales, enabled, begin, preview, release, cancel } = useGrowthSimulation();
const capitalScale = computed(() => createVaultingCapitalScale(view.value));
defineProps<{ warningMessage?: string }>();
</script>
