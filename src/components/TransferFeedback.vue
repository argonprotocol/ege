<template>
  <section class="flow-diagram" aria-label="Follow the money">
    <div class="flow-intro"><span class="eyebrow">FOLLOW THE MONEY</span><h2>{{ source }} drives {{ receiver.toLowerCase() }}.</h2><p role="status" aria-live="polite">{{ narration }}</p></div>
    <div class="flow-track">
      <template v-for="(label, index) in labels" :key="label">
        <div v-if="index" class="flow-pipe" :class="{ lit: stage > index }" aria-hidden="true"><i />➜</div>
        <div class="flow-node" :class="{ current: stage === index + 1, revealed: stage > index }">
          <span class="flow-step">{{ index + 1 }}</span><EcosystemIcon :kind="index === 0 ? (side === 'mining' ? 'miners' : 'bitcoin') : 'payout'" />
          <span>{{ label }}</span>
          <strong v-if="(index === 0 || stage > index)">{{ values[index] }}</strong><strong v-else class="flow-placeholder">{{ index === 0 ? 'Start here' : '—' }}</strong>
          <slot v-if="index === 0" name="control" />
        </div>
      </template>
    </div>
    <slot name="details" />
    <p class="flow-caption">{{ side === 'mining' ? 'More miners → more capital → a share of bids goes to vaults → vault returns change.' : 'More BTC → more vault capital → funding for mining rewards → mining returns change.' }}</p>
  </section>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import EcosystemIcon from './EcosystemIcon.vue';
import type { GrowthSide } from '../lib/GrowthSimulation';
const props = defineProps<{ feedback: { side: GrowthSide; amount: number; inputChange: number; beforeApy: number; afterApy: number } | null; stage: number; active: GrowthSide; capital: number; input: number; busy: boolean }>();
const side = computed(() => props.feedback?.side ?? props.active);
const source = computed(() => side.value === 'mining' ? 'Mining' : 'Vaulting');
const receiver = computed(() => side.value === 'mining' ? 'Vaulting' : 'Mining');
const labels = computed(() => [side.value === 'mining' ? 'Miners' : 'BTC in vaults', `${source.value} capital`, side.value === 'mining' ? 'To vault revenue' : 'To mining rewards', `${receiver.value} return`]);
const money = (n: number) => `₳${n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}`;
const apy = (n: number) => n >= 1e9 ? 'Over 1B%' : `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const values = computed(() => [props.input.toLocaleString('en-US', { minimumFractionDigits: side.value === 'mining' ? 0 : 1, maximumFractionDigits: side.value === 'mining' ? 0 : 1 }), money(props.capital), `${(props.feedback?.amount ?? 0) >= 0 ? '+' : '−'}${money(Math.abs(props.feedback?.amount ?? 0))}`, apy(props.feedback?.afterApy ?? 0)]);
const narration = computed(() => {
  if (!props.feedback || !props.stage) return `Use the + button on the first node. Follow one change all the way to ${receiver.value.toLowerCase()}.`;
  const f = props.feedback;
  if (props.stage === 1) return `You ${f.inputChange >= 0 ? 'added' : 'removed'} ${Math.abs(f.inputChange).toLocaleString('en-US', { minimumFractionDigits: side.value === 'mining' ? 0 : 1, maximumFractionDigits: side.value === 'mining' ? 0 : 1 })} ${side.value === 'mining' ? 'miners' : 'BTC'}.`;
  if (props.stage === 2) return `${source.value} capital ${f.inputChange >= 0 ? 'increases' : 'decreases'} to ${money(props.capital)}.`;
  if (props.stage === 3) return side.value === 'mining' ? 'A share of the changed mining bids flows to vaults.' : 'The changed vault capital funds mining rewards in this model.';
  return `${receiver.value} returns ${f.afterApy >= f.beforeApy ? 'rise' : 'fall'} from ${apy(f.beforeApy)} to ${apy(f.afterApy)}.`;
});
</script>
