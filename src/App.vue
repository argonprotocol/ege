<template>
  <div class="app-shell">
    <Header />
    <main ref="workspace"
      class="workspace h-[calc(100vh-77px)] min-h-[620px]! [--edge-inset:5%]"
      :data-expanded-side="expandedSide"
      aria-label="Growth Flywheel workspace">
      <div class="section-frames" aria-hidden="true"><div /><div /></div>
      <div class="section-controls">
        <button v-for="group in groups" :key="group.side" type="button"
          :aria-pressed="isSideActive(group.side)" :disabled="interacting || switchingSections"
          @click="expandSide(group.side)">
          {{ isSideActive(group.side) ? `Adjusting ${group.label}` : `Expand ${group.label}` }}
        </button>
      </div>
      <div class="apy-waterline pointer-events-none absolute top-[348px] inset-x-[4%]
        flex -translate-y-1/2 items-center gap-3.5 whitespace-nowrap
        text-[clamp(12px,1.2vw,14px)] leading-[1.2] text-[#45434d]">
        <div class="h-px flex-1 bg-[#c6bdcc]" aria-hidden="true" />
        <span class="uppercase bg-[#f5edf7] text-[#99909f] px-2">53.99% APY Waterline</span>
        <div class="h-px flex-1 bg-[#c6bdcc]" aria-hidden="true" />
      </div>
      <svg class="transfer-arrow pointer-events-none absolute inset-0 size-full overflow-visible text-[#999]"
        :class="{ 'opacity-85': !interacting }" aria-hidden="true">
        <path :d="transferPath" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="square" stroke-linejoin="miter" />
      </svg>
      <div class="capital-columns absolute top-[360px] inset-x-(--edge-inset) bottom-0
        flex items-stretch justify-between pb-0.5 border-x-0 border-t-0 border-b border-solid border-[#c6bdcc]"
        aria-label="Ten-day capital and payout comparison">
        <section v-for="group in groups" :key="group.side"
          class="column-pair flex items-end gap-6"
          :class="[group.side, { active: isSideActive(group.side) }]"
          :aria-label="`${group.label} capital and payout`"
          @click="expandSide(group.side)">
          <div v-for="column in group.columns" :key="column.label"
            class="value-column relative min-w-0 flex-1 px-2 py-6 text-center text-white
              [--capital-block-height:clamp(86px,7vw,132px)]"
            :class="[
              isSideActive(group.side) ? 'bg-[#a526df]' : 'bg-[#ded3e5]',
              { 'max-h-[calc(100%-var(--capital-block-height)-8px)]':
                column.label === `${group.label} Capital` && showCapitalAddition[group.side] },
            ]"
            :style="{ height: `${column.value / (column.label === `${group.label} Capital`
              ? group.capitalMaximum : group.maximum) * 100}%` }" :title="column.description">
            <div v-if="column.label === `${group.label} Capital` && showCapitalAddition[group.side]"
              class="transfer-block absolute bottom-[calc(100%+6px)] left-0 isolate
                flex h-(--capital-block-height) w-full flex-col justify-center
                border-x-2 border-y-0 border-dashed bg-[#f5edf7] px-1 pt-3 pb-3.5"
              :class="isSideActive(group.side) ? 'border-[#8720b5] text-[#8720b5]' : 'border-[#bc91ce] text-[#a77ab9]'"
              :data-transfer-side="group.side === transferSide ? group.side : undefined">
              <div class="transfer-fill pointer-events-none absolute inset-x-0 bottom-0 -z-10"
                :class="isSideActive(group.side) ? 'bg-[#ead0f6]' : 'bg-[#eee1f3]'"
                :style="{ height: `${group.side === transferSide
                  ? (transferSide === 'mining' ? miningTransferPercent : vaultingTransferPercent) : 0}%` }" aria-hidden="true" />
              <strong class="block text-[clamp(25px,2.15vw,44px)] leading-[1.2] font-bold tabular-nums">
                ₳{{ formatAmount(group.side === transferSide ? transferBlocks[group.side].amount : 0) }}
              </strong>
              <span class="mt-1 block text-[clamp(16px,1.2vw,24px)] font-light"
                :class="isSideActive(group.side) ? 'text-[#a526df]' : 'text-[#a77ab9]'">
                {{ group.side === 'mining' ? 'Added Bids' : 'Added Capital' }}
              </span>
            </div>
            <div v-if="group.side !== transferSide && column.label === transferBlocks[group.side].column
              && transferBlocks[group.side].amount > 0"
              class="transfer-block absolute bottom-[calc(100%+6px)] left-0 isolate w-full
                border-x-2 border-t-2 border-b-0 border-dashed border-[#8720b5] bg-[#f5edf7] px-1 pt-3 pb-3.5 text-[#8720b5]"
              :data-transfer-side="group.side" :aria-label="`${transferBlocks[group.side].label}: ${formatAmount(transferBlocks[group.side].amount)} argons`">
              <div class="transfer-fill pointer-events-none absolute inset-x-0 bottom-0 -z-10 bg-[#ead0f6]"
                :style="{ height: `${transferSide === 'mining' ? miningTransferPercent : vaultingTransferPercent}%` }" aria-hidden="true" />
              <strong class="block text-[clamp(25px,2.15vw,44px)] leading-[1.2] font-bold tabular-nums">
                ₳{{ formatAmount(transferBlocks[group.side].amount) }}
              </strong>
              <span class="mt-1 block text-[clamp(16px,1.2vw,24px)] font-light text-[#a526df]">
                {{ transferBlocks[group.side].label }}
              </span>
            </div>
            <strong class="block text-[clamp(25px,2.15vw,44px)] leading-[1.2] font-bold tabular-nums">
              ₳{{ formatAmount(column.value) }}
            </strong>
            <span class="mt-1 block text-[clamp(16px,1.2vw,24px)] font-light">{{ column.label }}</span>
          </div>
        </section>
      </div>
      <MiningSlider :inert="!isSideActive('mining') || switchingSections" :class="{ inactive: !isSideActive('mining') }" :style="sliderLayouts.mining" :warning-message="returnWarning('mining', 'Mining')" />
      <VaultingSlider :inert="!isSideActive('vaulting') || switchingSections" :class="{ inactive: !isSideActive('vaulting') }" :style="sliderLayouts.vaulting" :warning-message="returnWarning('vaulting', 'Vaulting')" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import Header from './components/Header.vue';
import MiningSlider from './components/MiningSlider.vue';
import VaultingSlider from './components/VaultingSlider.vue';
import { provideGrowthSimulation } from './lib/useGrowthSimulation';
import { createVaultingCapitalScale, VAULTING_MIN_APY } from './lib/GrowthSimulation';
import { MINING_COLLATERAL_MULTIPLIER, RETURN_THRESHOLD_APY } from './lib/exponentialTriggers';
import { ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER } from './lib/vaultCalculator';

const { view, interacting, circuitRotation } = provideGrowthSimulation();
const workspace = ref<HTMLElement | null>(null);
const transferPath = ref('');
const expandedSide = ref('mining');
const switchingSections = ref(false);
let sectionSwitchTimer: ReturnType<typeof setTimeout> | undefined;
function expandSide(side: string) {
  if (interacting.value || switchingSections.value || side === expandedSide.value) return;
  expandedSide.value = side;
  switchingSections.value = !reducedMotion?.matches;
  clearTimeout(sectionSwitchTimer);
  sectionSwitchTimer = setTimeout(() => { switchingSections.value = false; }, 350);
}
const sliderLayouts = ref<Record<string, Record<string, string>>>({ mining: {}, vaulting: {} });
function updateSliderLayouts() {
  // Keep pointer travel stable until release while the columns respond to the gesture.
  if (interacting.value || !workspace.value) return;
  const root = workspace.value;
  const origin = root.getBoundingClientRect();
  const layouts: Record<string, Record<string, string>> = {};
  for (const side of ['mining', 'vaulting']) {
    const columns = root.querySelectorAll<HTMLElement>(`.column-pair.${side} .value-column`);
    if (columns.length !== 2) continue;
    const tops = Array.from(columns, column => column.getBoundingClientRect().top - origin.top);
    const capitalColumn = columns[side === 'mining' ? 0 : 1];
    const capitalBounds = capitalColumn.getBoundingClientRect();
    const sectionBounds = capitalColumn.parentElement!.getBoundingClientRect();
    const capitalBox = capitalColumn.querySelector<HTMLElement>('.transfer-block');
    const bounds = capitalBox?.getBoundingClientRect();
    const top = bounds ? bounds.top + capitalBox!.clientTop - origin.top : Math.min(...tops);
    const height = capitalBox ? capitalBox.clientHeight : Math.abs(tops[0] - tops[1]);
    layouts[side] = { top: `${top}px`, height: `${Math.max(1, height)}px`,
      left: `${capitalBounds.left - origin.left}px`, right: 'auto', width: `${capitalBounds.width}px`,
      '--capital-width': `${capitalBounds.width}px`,
      '--section-offset': `${sectionBounds.left - capitalBounds.left}px`,
      '--slider-top': `${top}px`,
      '--section-width': `${columns[0].parentElement!.getBoundingClientRect().width}px` };
  }
  sliderLayouts.value = layouts;
}
const transferSide = computed(() => view.value.transfer?.side ?? 'mining');
const isSideActive = (side: string) => side === expandedSide.value;
const showReturnWarning = computed<Record<string, boolean>>(() => ({
  mining: view.value.frame.miningApy > 53.99,
  vaulting: view.value.frame.vaultingApy > VAULTING_MIN_APY,
}));
const returnWarning = (side: string, label: string) => showReturnWarning.value[side] && isSideActive(side)
  ? `Returns are higher than the S&P’s best year ever. Drag the capital grip upward to increase the network's ${label} Capital.`
  : undefined;
const showCapitalAddition = computed<Record<string, boolean>>(() => ({
  mining: showReturnWarning.value.mining
    || (view.value.transfer?.side === 'mining' && view.value.transfer.bids > 0),
  vaulting: showReturnWarning.value.vaulting
    || (view.value.transfer?.side === 'vaulting' && view.value.transfer.capital > 0),
}));
// During mining, vault revenue is a fixed share of bids, so both fills have the same percentage.
const miningTransferPercent = computed(() => {
  const { transfer, frame: { state } } = view.value;
  if (transfer?.side !== 'mining' || transfer.bids <= 0) return 0;
  const rewardsUsd = (state.baseArgonRewards + state.pendingMiningMint) * state.argonPriceUsd
    + state.baseArgonotRewards * state.argonotPriceUsd;
  const floorReturn = (1 + RETURN_THRESHOLD_APY / 100) ** (10 / 365) - 1;
  const maximumAuctionUsd = rewardsUsd / (1 + (1 + MINING_COLLATERAL_MULTIPLIER) * floorReturn);
  const remainingBids = Math.max(0, maximumAuctionUsd - state.miningAuctionRevenue * state.argonPriceUsd);
  return Math.min(100, transfer.bids / (transfer.bids + remainingBids) * 100);
});
// Added capital and rewards share the same funding amount at a fixed ratio.
const vaultingTransferPercent = computed(() => createVaultingCapitalScale(view.value).fraction * 100);
const transferBlocks = computed<Record<string, { column: string; label: string; amount: number }>>(() => {
  const transfer = view.value.transfer;
  // Transfers are stored in USD; match the columns' argon-equivalent units.
  const price = view.value.frame.state.argonPriceUsd;
  return transferSide.value === 'mining' ? {
    mining: { column: 'Mining Capital', label: 'Added Bids', amount: (transfer?.bids ?? 0) / price },
    vaulting: { column: 'Vaulting Payout', label: 'Added Revenue', amount: (transfer?.revenue ?? 0) / price },
  } : {
    mining: { column: 'Mining Payout', label: 'Added Rewards', amount: (transfer?.rewards ?? 0) / price },
    vaulting: { column: 'Vaulting Capital', label: 'Added Capital', amount: (transfer?.capital ?? 0) / price },
  };
});
function updateTransferPath() {
  const root = workspace.value;
  if (!root) return;
  const source = root.querySelector<HTMLElement>(`[data-transfer-side="${transferSide.value}"]`);
  const target = root.querySelector<HTMLElement>(`[data-transfer-side="${transferSide.value === 'mining' ? 'vaulting' : 'mining'}"]`);
  if (!source || !target) { transferGuide = undefined; transferPath.value = ''; return; }
  const origin = root.getBoundingClientRect();
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const forward = transferSide.value === 'mining';
  const x = from.left + from.width / 2 - origin.left;
  const y = from.top - origin.top - 8;
  const endX = (forward ? to.left - 10 : to.right + 10) - origin.left;
  const endY = to.top + to.height / 2 - origin.top;
  const laneY = Math.min(y - 20, endY);
  const bendX = endX + (forward ? -18 : 18);
  const points = [[x, y], [x, laneY], [bendX, laneY], [bendX, endY], [endX, endY]]
    .filter((point, index, all) => index === 0
      || Math.hypot(point[0] - all[index - 1][0], point[1] - all[index - 1][1]) > 0.01);
  // Round each corner, then space chevrons along the entire route so the
  // vertical and horizontal runs share one continuous spacing rhythm.
  let route = `M ${x} ${y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i];
    const [px, py] = points[i - 1];
    const [nx, ny] = points[i + 1];
    const incoming = Math.hypot(cx - px, cy - py);
    const outgoing = Math.hypot(nx - cx, ny - cy);
    const radius = Math.min(24, incoming / 2, outgoing / 2);
    route += ` L ${cx - (cx - px) / incoming * radius} ${cy - (cy - py) / incoming * radius}
      Q ${cx} ${cy} ${cx + (nx - cx) / outgoing * radius} ${cy + (ny - cy) / outgoing * radius}`;
  }
  route += ` L ${endX} ${endY}`;
  const guide = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  guide.setAttribute('d', route);
  transferGuide = guide;
  transferLength = guide.getTotalLength();
  renderTransferChevrons();
}
let transferGuide: SVGPathElement | undefined;
let transferLength = 0;
let flowOffset = 0;
let flowSpeed = 0;
let flowFrame = 0;
let lastFrameTime = 0;
let lastMovementTime = 0;
let reducedMotion: MediaQueryList | undefined;
function renderTransferChevrons() {
  const guide = transferGuide;
  const length = transferLength;
  if (!guide || !length) return;
  const count = Math.max(1, Math.floor(length / 11));
  const chevrons: string[] = [];
  for (let step = 0; step < count; step++) {
    const spacing = length / count;
    const offset = ((flowOffset % spacing) + spacing) % spacing;
    const distance = ((step + 0.5) * spacing + offset) % length;
    const center = guide.getPointAtLength(distance);
    const before = guide.getPointAtLength(Math.max(0, distance - 0.5));
    const after = guide.getPointAtLength(Math.min(length, distance + 0.5));
    const tangentLength = Math.hypot(after.x - before.x, after.y - before.y);
    if (!tangentLength) continue;
    const ux = (after.x - before.x) / tangentLength;
    const uy = (after.y - before.y) / tangentLength;
    chevrons.push(`M ${center.x - ux * 3 - uy * 7} ${center.y - uy * 3 + ux * 7}
      L ${center.x + ux * 3} ${center.y + uy * 3}
      L ${center.x - ux * 3 + uy * 7} ${center.y - uy * 3 - ux * 7}`);
  }
  transferPath.value = chevrons.join(' ');
}
function animateTransfer(time: number) {
  flowFrame = 0;
  if (!interacting.value || reducedMotion?.matches) return;
  const elapsed = Math.min(0.05, (time - lastFrameTime) / 1000);
  lastFrameTime = time;
  // Ease to a pause when the pointer stops moving, even if still held down.
  if (time - lastMovementTime > 100) flowSpeed *= Math.exp(-elapsed * 12);
  flowOffset += flowSpeed * elapsed;
  renderTransferChevrons();
  if (Math.abs(flowSpeed) > 0.5) flowFrame = requestAnimationFrame(animateTransfer);
}
watch(circuitRotation, (rotation, previous) => {
  if (!interacting.value || reducedMotion?.matches) return;
  const now = performance.now();
  const elapsed = Math.max(16, now - lastMovementTime);
  const delta = rotation - previous;
  if (!delta) return;
  const speed = Math.min(160, Math.max(24, Math.abs(delta) / elapsed * 1200));
  flowSpeed = Math.sign(delta) * speed;
  lastMovementTime = now;
  if (!flowFrame) {
    lastFrameTime = now;
    flowFrame = requestAnimationFrame(animateTransfer);
  }
});
watch(interacting, (active) => {
  if (active) return;
  cancelAnimationFrame(flowFrame);
  flowFrame = 0;
  flowSpeed = 0;
  lastMovementTime = 0;
  renderTransferChevrons();
});
let resizeObserver: ResizeObserver | undefined;
watch([view, interacting, expandedSide], () => { updateTransferPath(); updateSliderLayouts(); }, { flush: 'post' });
onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  resizeObserver = new ResizeObserver(() => { updateTransferPath(); updateSliderLayouts(); });
  resizeObserver.observe(workspace.value!);
  workspace.value!.querySelectorAll('.column-pair').forEach(pair => resizeObserver!.observe(pair));
  updateTransferPath();
  updateSliderLayouts();
});
onScopeDispose(() => {
  resizeObserver?.disconnect();
  clearTimeout(sectionSwitchTimer);
  cancelAnimationFrame(flowFrame);
});
const formatAmount = (value: number) => value.toLocaleString('en-US', { notation: value >= 1e9 ? 'compact' : 'standard', maximumFractionDigits: value >= 1e9 ? 2 : 0 });
const groups = computed(() => {
  const state = view.value.frame.state;
  const argonotValue = state.argonotPriceUsd / state.argonPriceUsd;
  // Show the mining phase's original capital and payout beneath its separate Added Bids block.
  const addedBids = view.value.transfer?.side === 'mining'
    ? view.value.transfer.bids / state.argonPriceUsd : 0;
  const miningCollateral = state.argonotsBidPerSeat * state.seatCount * argonotValue
    - addedBids * MINING_COLLATERAL_MULTIPLIER;
  const miningCapital = state.miningAuctionRevenue - addedBids + miningCollateral;
  const addedRewards = view.value.transfer?.side === 'vaulting'
    ? view.value.transfer.rewards / state.argonPriceUsd : 0;
  const miningPayout = state.baseArgonRewards + state.pendingMiningMint
    + state.baseArgonotRewards * argonotValue + miningCollateral - addedRewards;
  // Keep added securitization separate from base capital, but include it in payout.
  const vaultingBaseline = { ...state, vaultArgonSecuritization: state.vaultArgonSecuritization - addedRewards };
  const vaultingCapital = vaultingBaseline.vaultArgonSecuritization * (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER);
  const addedRevenue = view.value.transfer?.side === 'mining'
    ? view.value.transfer.revenue / state.argonPriceUsd : 0;
  const vaultingPayout = view.value.vaultingPayout - addedRevenue;
  // Added principal changes the payout amount without shrinking the base capital column.
  const addedCapital = addedRewards * (1 + ARGONOT_SECURITIZATION_CAPACITY_MULTIPLIER);
  return [
    { side: 'mining', label: 'Mining', maximum: Math.max(1, miningCapital, miningPayout),
      capitalMaximum: Math.max(1, miningCapital, miningPayout), columns: [
      { label: 'Mining Capital', value: miningCapital, description: 'Auction bids plus ARGNOT collateral, valued in argons.' },
      { label: 'Mining Payout', value: miningPayout, description: 'Prospective ten-day mining rewards plus returned ARGNOT collateral, valued in argons.' },
    ] },
    { side: 'vaulting', label: 'Vaulting', maximum: Math.max(1, vaultingCapital, vaultingPayout),
      capitalMaximum: Math.max(1, vaultingCapital, vaultingPayout - addedCapital), columns: [
      { label: 'Vaulting Payout', value: vaultingPayout, description: 'Vault capital plus ten-day vault revenue, valued in argons.' },
      { label: 'Vaulting Capital', value: vaultingCapital, description: 'ARGN securitization plus its matching ARGNOT allocation, valued in argons.' },
    ] },
  ];
});
</script>

<style scoped>
/* Keep existing pointer and keyboard controls while establishing the new column layout. */
.workspace :deep(.apy-slider) { top: 300px; bottom: auto; }
.workspace :deep(.slider-root) { top: 0; height: 100%; }
.workspace :deep(.slider-track) { margin-block: 0; }
.workspace :deep(.scale) { display: none; }
.workspace :deep(.apy-card) {
  top: calc(147px - var(--slider-top, 360px)) !important;
  left: var(--section-offset);
  width: var(--section-width);
  padding: 12px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #34343e;
}
.workspace :deep(.right .apy-card) { left: var(--section-offset); right: auto; }
.workspace :deep(.apy-card::before) { display: none; }
.workspace :deep(.apy-card span) { font-size: 20px; line-height: 28px; text-transform: none; }
.workspace :deep(.apy-card strong) { font-size: 36px; }
.workspace :deep(.bid-header) { display: none; }
.workspace :deep(.slider-root[data-disabled] .slider-track) { opacity: .45; }
/* Both pairs share the existing baseline; only their horizontal allocation changes. */
.workspace { --mining-width: calc((100% - 64px) * .7); --vaulting-width: calc((100% - 64px) * .3); }
.workspace[data-expanded-side="vaulting"] {
  --mining-width: calc((100% - 64px) * .3);
  --vaulting-width: calc((100% - 64px) * .7);
}
.workspace::before { display: none; }
.capital-columns { border-bottom: 0; }
.section-frames {
  position: absolute;
  inset: 100px var(--edge-inset) 0;
  z-index: -1;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.section-frames > div { position: relative; width: var(--mining-width); transition: width 320ms ease; }
.section-frames > div:last-child { width: var(--vaulting-width); }
.section-frames > div::before {
  content: '';
  position: absolute;
  inset: 0 -12px;
  background: #fdfbfd;
  border: 1px solid #c6bdcc;
  border-radius: 6px;
  mask-image: linear-gradient(transparent, black 55%);
}
.column-pair { min-width: 0; container-type: inline-size; transition: width 320ms ease; }
.column-pair.mining { width: var(--mining-width); }
.column-pair.vaulting { width: var(--vaulting-width); }
.column-pair:not(.active) { cursor: pointer; gap: 12px; }
.column-pair:not(.active) .value-column { color: #62516f; }
.column-pair:not(.active):hover .value-column { background-color: #d2bfdf; }
.column-pair strong { font-size: clamp(14px, 5cqw, 44px); overflow-wrap: anywhere; }
.column-pair span { font-size: clamp(12px, 2.7cqw, 24px); }
.apy-waterline { z-index: 3; }
.section-controls {
  position: absolute;
  top: 112px;
  inset-inline: var(--edge-inset);
  display: flex;
  justify-content: space-between;
}
.section-controls button {
  width: var(--mining-width);
  padding: 8px;
  border: 0;
  background: transparent;
  color: #8720b5;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: width 320ms ease;
}
.section-controls button:last-child { width: var(--vaulting-width); }
.section-controls button[aria-pressed="false"] { text-decoration: underline; text-underline-offset: 4px; }
.section-controls button:disabled { cursor: default; }
.workspace :deep(.inactive .slider-track), .workspace :deep(.inactive .slider-thumb) { visibility: hidden; }
.workspace :deep(.inactive .apy-card) { color: #776781; pointer-events: none; }
.workspace :deep(.inactive .apy-card strong) { font-size: 28px; }
.workspace :deep(.inactive .apy-card span) { font-size: 16px; }
@media (prefers-reduced-motion: reduce) {
  .column-pair, .section-controls button, .section-frames > div { transition: none; }
}
</style>
