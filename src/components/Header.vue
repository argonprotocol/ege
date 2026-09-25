<template>
  <header class="app-header">
    <div class="branding">
      <a class="argon-link" href="https://argon.network/" aria-label="Back to Argon Network">
      <svg class="back-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m17 6-10 10 10 10M25 6 15 16l10 10" />
      </svg>
      <Logo class="argon-logo" aria-hidden="true" />
      </a>
      <h1>The Growth Flywheel</h1>
    </div>
    <section class="header-stats" aria-label="Growth Flywheel statistics">
      <div v-for="group in statGroups" :key="group.title" class="stat-card">
        <h2>{{ group.title }}</h2>
        <dl>
          <div v-for="stat in group.stats" :key="stat.label" class="stat">
            <dt>
              <TooltipProvider v-if="stat.label === 'Days'" :delay-duration="150">
                <TooltipRoot>
                  <TooltipTrigger as-child>
                    <button type="button" class="days-trigger" aria-label="Days: view daily mining and vaulting APYs">Days</button>
                  </TooltipTrigger>
                  <TooltipPortal>
                    <TooltipContent side="bottom" :side-offset="10" :collision-padding="12"
                      class="days-tooltip">
                      <div class="days-table-scroll" tabindex="0" role="region" aria-label="Daily mining and vaulting APYs">
                        <table>
                          <thead>
                            <tr><th scope="col">Date</th><th scope="col">Mining APY</th><th scope="col">Vaulting APY</th></tr>
                          </thead>
                          <tbody>
                            <tr v-for="day in view.days" :key="day.day"
                              :aria-current="day.day === view.days[view.days.length - 1]?.day ? 'date' : undefined">
                              <th scope="row">{{ formatDay(day.day) }}</th>
                              <td>{{ formatDayApy(day.miningApy) }}</td>
                              <td>{{ formatDayApy(day.vaultingApy) }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <TooltipArrow class="days-tooltip-arrow" />
                    </TooltipContent>
                  </TooltipPortal>
                </TooltipRoot>
              </TooltipProvider>
              <template v-else>{{ stat.label }}</template>
            </dt>
            <dd v-if="typeof stat.value === 'number'" :title="stat.label === 'Current Value' ? 'Current simulated network value' : `Mainnet snapshot: ${mainnetUpdatedAt}`">₳{{ stat.value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 }) }}</dd>
            <dd v-else :title="stat.label === 'Days' ? 'Simulated elapsed days; fractional days preview daily growth' : 'Sample value from the mockup'">{{ stat.value }}</dd>
          </div>
        </dl>
      </div>
    </section>
    <nav class="header-actions" aria-label="Growth Flywheel actions">
      <button v-for="action in actions" :key="action.label" type="button" disabled
        :aria-label="action.label" :title="`${action.label} — coming soon`">
        <component :is="action.icon" aria-hidden="true" />
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent, TooltipArrow } from 'reka-ui';
import { useGrowthSimulation } from '../lib/useGrowthSimulation';
import Logo from '../assets/logo.svg';
import ResetIcon from '../assets/reset-outlined.svg';
import DownloadIcon from '../assets/download-outlined.svg';
import PlayIcon from '../assets/play-outlined.svg';
import InformationIcon from '../assets/information-outlined.svg';
import GithubIcon from '../assets/github-outlined.svg';
import { mainnetUpdatedAt, startingNetworkValue } from '../lib/mainnet';

// Personal portfolio metrics remain placeholders.
const { view } = useGrowthSimulation();
const timelineStart = new Date();
const formatDay = (day: number) => {
  const date = new Date(timelineStart);
  date.setDate(date.getDate() + day);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const formatDayApy = (apy: number) => `${apy.toLocaleString('en-US', {
  notation: 'compact', maximumFractionDigits: 1,
})}%`;
const statGroups = computed(() => [
  { title: 'Global Network', stats: [
    { label: 'Starting Value', value: startingNetworkValue },
    { label: 'Current Value', value: view.value.network.networkValueUsd / view.value.network.argonPriceUsd },
  ] },
  { title: 'Timeframe', stats: [
      { label: 'Days', value: view.value.network.elapsedDays.toLocaleString('en-US', { maximumFractionDigits: 2 }) }
    ] },
  { title: 'Personal Portfolio', stats: [
    { label: 'Starting Value', value: '₳10k' },
    { label: 'Current Value', value: '₳10.34k' },
  ] },
]);
const actions = [
  { label: 'Reset to defaults', icon: ResetIcon },
  { label: 'Download data', icon: DownloadIcon },
  { label: 'Watch video', icon: PlayIcon },
  { label: 'More information', icon: InformationIcon },
  { label: 'Open source code', icon: GithubIcon },
];
</script>

<style scoped>
.app-header {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(330px, 1.15fr) minmax(0, 2.6fr) minmax(330px, 1.15fr);
  grid-template-rows: 57px;
  align-items: center;
  gap: 10px;
  height: 57px;
  padding: 0 20px;
  border-bottom: 1px solid #b9bcc4;
  box-shadow: 0 1px 0 white;
}

.branding { display: flex; align-items: center; gap: 10px; }
.argon-link { display: flex; align-items: center; gap: 8px; color: #73179e; }
.back-icon { width: 28px; height: 28px; opacity: .4; }
.argon-link:hover .back-icon { opacity: 1; }
.argon-logo { width: 32px; height: 32px; }
.argon-logo :deep(path) { fill: #73179e; }
h1 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 200; white-space: nowrap; }
.header-stats { align-self: start; display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 5px; }
.stat-card { position: relative; text-align: center; }
.stat-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: #fdfbfd;
  border: 1px solid #b9bcc4;
  border-radius: 3px;
  box-shadow: 0 2px 3px #0003;
  mask-image: linear-gradient(transparent, black 55%);
}
h2 {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  margin: 0 8px;
  border-bottom: 1px solid #94a3b826;
  color: #92969e;
  font-size: 15px;
  font-weight: 600;
  text-transform: uppercase;
}
dl { display: flex; justify-content: space-around; margin: 0; padding: 14px 8px 16px; }
.stat { display: flex; flex-direction: column; }
dt { order: 1; color: #969aa3; font-size: 14px; line-height: 20px; white-space: nowrap; }
dd { margin: 0; color: #080808; font-size: 24px; line-height: 30px; font-weight: 700; }
.days-trigger {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.days-trigger:focus-visible { outline: 2px solid #8720b5; outline-offset: 3px; border-radius: 2px; }
.days-tooltip {
  z-index: 50;
  max-width: calc(100vw - 24px);
  padding: 8px;
  border: 1px solid #c6bdcc;
  border-radius: 6px;
  background: #fdfbfd;
  color: #34343e;
  box-shadow: 0 8px 24px #0002;
  font-size: 13px;
}
.days-table-scroll { max-height: min(320px, var(--reka-tooltip-content-available-height)); overflow: auto; }
.days-tooltip table { border-collapse: collapse; white-space: nowrap; font-variant-numeric: tabular-nums; }
.days-tooltip th, .days-tooltip td { padding: 8px 12px; text-align: right; }
.days-tooltip th:first-child { text-align: left; }
.days-tooltip thead th { position: sticky; top: 0; background: #fdfbfd; color: #77717d; font-weight: 600; }
.days-tooltip tbody th { font-weight: 500; }
.days-tooltip tbody tr { border-top: 1px solid #eee1f3; }
.days-tooltip tbody tr[aria-current] { background: #f5edf7; }
.days-tooltip-arrow { fill: #fdfbfd; }
.header-actions { display: flex; justify-content: flex-end; gap: 4px; }
.header-actions button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 40px;
  padding: 2px;
  border: 0;
  background: transparent;
  opacity: .65;
  cursor: not-allowed;
}
.header-actions svg { width: 24px; height: 24px; }
</style>
