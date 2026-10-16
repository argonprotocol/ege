<template>
    <details class="calculation-details"><summary>Numbers & calculations</summary>      <div class="return-total"><span>Annualized return</span><strong :title="`${apy.toLocaleString('en-US', { maximumFractionDigits: 2 })}% APY`">{{ formatApy(apy) }}</strong></div>    <dl class="economics"><div><dt>Capital committed</dt><dd>{{ money(capital) }}</dd></div><div><dt>{{ side === 'mining' ? 'Rewards over 10 days' : 'Earnings over 10 days' }}</dt><dd>{{ money(earnings) }}</dd></div></dl>
      <template v-if="side === 'mining'"><p>Ten-day rewards are shared across {{ miners.toLocaleString() }} miners. Bids and Argonot collateral make up the capital committed.</p><p class="formula">APY = (({{ money(payout / miners, 2) }} payout per seat ÷ {{ money(capital / miners, 2) }} cost per seat)<sup>36.5</sup> − 1) × 100</p><p>Total payout: {{ money(payout) }}, including returned collateral. Net gain over capital: {{ money(payout - capital) }}.</p></template>
      <template v-else><p>Vaulting capital: {{ money(vaultCollateral(state).argons) }} Argon + {{ money(vaultCollateral(state).argonots) }} in Argonot collateral value. The scenario assumes Argonot collateral worth twice the Argon collateral.</p><p class="formula">APY = (({{ money(payout) }} payout ÷ {{ money(capital) }} capital)<sup>36.5</sup> − 1) × 100</p><p>Total payout includes returned capital. {{ money(state.bondCapital) }} in Argon bonds affects the revenue share; it is not counted again as capital.</p></template>
      <p>The adjustment benchmark is 53.99% APY. It limits each phase; reaching it is not required to complete the lesson.</p>
    </details>
</template>
<script setup lang="ts">
import type { GrowthCycleState, GrowthSide } from '../lib/exponentialTriggers';
import { vaultCollateral } from '../lib/growthGame';
defineProps<{ side: GrowthSide; state: GrowthCycleState; apy: number; miners: number; capital: number; payout: number; earnings: number }>();
const money = (n: number, digits = 1) => `₳${n.toLocaleString('en-US', { notation: digits === 2 ? 'standard' : 'compact', maximumFractionDigits: digits })}`;
const formatApy = (n: number) => n >= 1e9 ? 'Over 1B%' : `${n.toLocaleString('en-US', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: n >= 10000 ? 1 : 2 })}%`;
</script>
