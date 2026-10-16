<template>
  <header class="app-header">
    <div class="branding">
      <a class="back-to-argon" href="https://argon.network/" aria-label="Back to Argon Network" title="Back to Argon Network"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 19.5-7.5-7.5 7.5-7.5m9 15-7.5-7.5 7.5-7.5" /></svg></a>
      <a class="brand-logo" href="https://argon.network/" aria-label="Argon Network"><Logo aria-hidden="true" /></a>
      <div><div class="model-selector" @mouseenter="isModelMenuOpen = true" @mouseleave="isModelMenuOpen = false" @focusin="isModelMenuOpen = true" @focusout="closeModelMenuOnBlur" @keydown.esc.stop.prevent="isModelMenuOpen = false">
        <h1><button type="button" class="model-selector-button" :aria-expanded="isModelMenuOpen" aria-controls="model-navigation" @click="isModelMenuOpen = true" @keydown.down.prevent="isModelMenuOpen = true">
          Exponential Growth Engine
          <svg class="model-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" /></svg>
        </button></h1>
        <nav v-show="isModelMenuOpen" id="model-navigation" class="model-dropdown" aria-label="Models">
            <a href="https://sam.argon.network/">Ultimate Death Spiral Model</a>
            <a href="https://llb.argon.network/">Liquid Locking for Bitcoin Model</a>
        </nav>
      </div><span>Discover how the ecosystem grows together</span></div>
    </div>
    <div class="header-actions"><button class="icon-button" @click="$emit('reset')" title="Restart lesson" aria-label="Restart lesson"><ResetIcon /></button><button class="icon-button" @click="$emit('help')" title="About this simulation" aria-label="About this simulation"><InformationIcon /></button></div>
  </header>
  <section class="portfolio-bar" aria-label="Simulated portfolio">
    <TooltipProvider :delay-duration="150" :disable-hoverable-content="true">
      <div v-for="group in statGroups" :key="group.className" class="stat-box" :class="group.className">
        <TooltipRoot v-for="stat in group.stats" :key="stat.label">
          <TooltipTrigger as-child>
            <div class="header-stat" tabindex="0" role="group" :aria-label="`${stat.label}: ${stat.value}`">
              <strong>{{ stat.value }}</strong><span>{{ stat.label }}</span>
            </div>
          </TooltipTrigger>
          <TooltipPortal><TooltipContent class="formula-tooltip header-stat-tooltip" side="bottom" :side-offset="5" :collision-padding="12">
            <p v-if="stat.description">{{ stat.description }}</p>
            <dl v-if="stat.label === 'Current Circulation'" class="circulation-breakdown">
              <div v-for="item in circulationBreakdown" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ exactMoney(item.value) }}</dd></div>
            </dl>
            <TooltipArrow class="ecosystem-tooltip-arrow" :width="24.5" :height="12.25" />
          </TooltipContent></TooltipPortal>
        </TooltipRoot>
        <div v-if="group.className === 'portfolio-values'" class="portfolio-callout starting-callout">
          <span><button class="starting-customize" @click="$emit('customize')">Customize your starting investment</button></span>
          <svg viewBox="0 0 90 30" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M1 25h60q20 0 20-22m-5 7 5-7 5 7" /></svg>
        </div>
        <div v-if="group.className === 'portfolio-values return-stat'" class="simulation-control">
          <button v-if="!playbackAlert" class="simulation-trigger" :disabled="playDisabled" :aria-label="running ? 'Pause full simulation' : 'Run full simulation'" @click="$emit('play')">
            <span class="simulation-play"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path v-if="running" d="M6 4h4v16H6zM14 4h4v16h-4z" /><path v-else d="M7 3l14 9-14 9z" /></svg></span>
            <span class="simulation-label">{{ running ? 'Pause Simulation' : 'Run Full Simulation' }}</span>
          </button>
          <TooltipRoot v-if="playbackAlert" :disable-hoverable-content="false">
            <TooltipTrigger as-child>
              <div class="playback-alert simulation-trigger" role="status" tabindex="0">
                <span class="simulation-play"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M10 1h12l9 9v12l-9 9H10l-9-9V10z" /><path stroke="white" stroke-width="4" stroke-linecap="round" d="M16 9v9" /><circle cx="16" cy="24" r="2" fill="white" /></svg></span>
                <p>{{ playbackAlert }}</p>
              </div>
            </TooltipTrigger>
            <TooltipPortal><TooltipContent class="formula-tooltip header-stat-tooltip" side="bottom" :side-offset="5" :collision-padding="12">
              <p>{{ playbackAlertDescription }}</p>
              <TooltipArrow class="ecosystem-tooltip-arrow" :width="24.5" :height="12.25" />
            </TooltipContent></TooltipPortal>
          </TooltipRoot>
          <p v-else-if="playbackStatus" class="playback-status" role="status">{{ playbackStatus }}</p>
        </div>
        <div v-if="group.className === 'network-stats'" class="portfolio-callout circulation-callout">
          <svg viewBox="0 0 90 30" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M89 25H29Q9 25 9 3m-5 7 5-7 5 7" /></svg>
          <span><a :href="panicUrl" target="_blank" rel="noopener noreferrer">What if the market panics and dumps everything?</a></span>
        </div>
      </div>
    </TooltipProvider>
    <details class="portfolio-details"><summary>What changes my balance?</summary><p>This simulated {{ exactMoney(initialPortfolio) }} account starts with a 50/50 allocation to mining and vaulting. Its value includes income, bid costs, and changes in holdings’ value. Network competition is separate from spending this account’s funds.</p><p>Settled mining income: <b>{{ money(miningIncome) }}</b> · Settled vault income: <b>{{ money(vaultIncome) }}</b>. These are gross income, not total profit.</p><p>Days advance with your adjustments, not wall-clock time. Starting network snapshot: {{ new Date(snapshotAt).toLocaleDateString('en-US') }}.</p></details>
  </section>
</template>
<script setup lang="ts">
const isModelMenuOpen = ref(false);
function closeModelMenuOnBlur(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
    isModelMenuOpen.value = false;
  }
}
import { computed, ref } from 'vue';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent, TooltipArrow } from 'reka-ui';
import Logo from '../assets/logo.svg';
import ResetIcon from '../assets/reset-outlined.svg';
import InformationIcon from '../assets/information-outlined.svg';
import { mainnetBasics } from '../lib/mainnet';
import { microgonToArgon } from '../lib/currencyUtils';
const props = defineProps<{ circulation: number; currentCirculation: number; lockedBitcoins: number; issuance: { mining: number; bitcoin: number; burned: number }; days: string; snapshotAt: string; initialPortfolio: number; currentPortfolio: number; miningIncome: number; vaultIncome: number; canUndo: boolean; running: boolean; playDisabled: boolean; playbackStatus: string; playbackAlert: string }>();
defineEmits<{ reset: []; help: []; undo: []; play: []; customize: [] }>();
const panicUrl = computed(() => {
  const url = new URL('https://uds.argon.network/');
  url.searchParams.set('circulation', String(props.currentCirculation));
  url.searchParams.set('bitcoinsInLiquidLocks', String(props.lockedBitcoins));
  return url.href;
});
const playbackAlertDescription = computed(() => {
  if (/capacity/i.test(props.playbackAlert)) return 'This scenario can lock up to 17.5 million BTC in vaults. That limit has been reached, so automatic playback has stopped. You can advance one day to follow reward and bid adjustments, use Undo to explore another path, or restart the lesson.';
  if (props.playbackAlert.includes('40%')) return 'Automatic playback has stopped because neither side can make another safe economic adjustment while keeping mining APY above 40%. Use Undo to explore a different path or restart the lesson.';
  if (props.playbackAlert.includes('ten-year')) return 'Automatic playback has reached its ten-year simulation limit and stopped. Use Undo to revisit earlier adjustments or restart the lesson.';
  return 'Both mining and vaulting have reached the 53.99% APY benchmark, so automatic playback has stopped. Use Undo to explore another path or restart the lesson.';
});
const gain = computed(() => props.initialPortfolio > 0 ? (props.currentPortfolio / props.initialPortfolio - 1) * 100 : 0);
const exactMoney = (value: number) => `₳${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const money = (value: number) => `₳${value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 })}`;
const statGroups = computed(() => [
  { className: 'portfolio-values', stats: [
    { label: 'Starting Portfolio', value: money(props.initialPortfolio), description: `Your simulated account starts with ${exactMoney(props.initialPortfolio)}, split equally between mining and vaulting.` },
    { label: 'Current Return', value: `${gain.value.toLocaleString('en-US', { notation: 'compact', minimumFractionDigits: Math.abs(gain.value) < 1000 ? 2 : 0, maximumFractionDigits: 2 })}%`, description: 'The percentage change in your portfolio since the simulation started: (current portfolio ÷ starting portfolio − 1) × 100. This is your total simulated return, not annualized APY.' },
  ] },
  { className: 'portfolio-values return-stat', stats: [
    { label: 'Simulated Days', value: props.days, description: 'Time advances with your adjustments, not wall-clock time. Each adjustment selects daily settlements for the simulation.' },
  ] },
  { className: 'network-stats', stats: [
    { label: 'Current Portfolio', value: money(props.currentPortfolio), description: `Your account is currently worth ${exactMoney(props.currentPortfolio)}. This includes income, bid costs, and changes in the value of your holdings.` },
    { label: 'Current Circulation', value: money(props.currentCirculation), description: 'Argons in circulation, combining the starting mainnet supply with simulated issuance, minus simulated burns.' },
  ] },
]);
const circulationBreakdown = computed(() => [
  { label: 'From Mining', value: microgonToArgon(mainnetBasics.microgonsInCirculation.fromMining) + props.issuance.mining },
  { label: 'From Bitcoin', value: microgonToArgon(mainnetBasics.microgonsInCirculation.fromBitcoin) + props.issuance.bitcoin },
  { label: 'Simulated Burns', value: props.issuance.burned },
  { label: 'Current Circulation', value: props.currentCirculation },
]);
</script>
<style scoped>
.model-selector { position: relative; min-width: 0; }
.model-selector-button { display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.model-selector-button:focus-visible { outline: 2px solid #a526df; outline-offset: 4px; border-radius: 4px; }
.model-caret { width: 16px; height: 16px; flex-shrink: 0; }
.model-dropdown { position: absolute; left: 0; top: 100%; z-index: 3000; width: max-content; max-width: calc(100vw - 32px); padding: 4px; border-radius: 4px; background: white; box-shadow: 0 10px 15px -3px #0000001a, 0 0 0 1px #1118270d; font-size: clamp(14px, 1.2vw, 20px); font-weight: 200; line-height: 1.4; color: #475569; }
.model-dropdown a { display: block; position: static; padding: 8px 12px; border-radius: 3px; color: inherit; text-decoration: none; white-space: normal; }
.model-dropdown a:hover, .model-dropdown a:focus-visible { color: #73179e; background: #FAF4FC; }
@media (max-width: 640px) { .model-dropdown { font-size: 16px; } }
.app-header { position: relative; z-index: 19; }

.playback-alert { position: static; gap: 5px; }
.playback-alert .simulation-play { cursor: default; background: #f7f4fa; border-color: #ded8e4; }
.playback-alert svg { width: 22px; height: 22px; }
</style>
