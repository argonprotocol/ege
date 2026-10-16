<template>
  <TooltipProvider :delay-duration="150" :disable-hoverable-content="true"><div class="ecosystem-viewport" tabindex="0" aria-label="Ecosystem diagram; scroll horizontally on narrow screens"><section class="ecosystem" :class="{ sequencing: busy }" aria-label="Mining and vaulting ecosystem" @click="activateSide" @mousemove="hoverSide" @mouseleave="hovered = null" :data-hovered="bitcoin >= MAX_USABLE_BITCOIN - 1e-6 ? null : hovered">
    <div class="ecosystem-headings">
      <div>
        <h2 :class="{ focused: focused === 'mining' }">Mining Operations</h2>
        <p class="ecosystem-intro">More miners increase competition and lower mining returns.<br>A share of their bids flows to vaults, raising vaulting returns.</p>
      </div>
      <div>
        <h2 :class="{ focused: focused === 'vaulting' }">Vaulting Operations</h2>
        <p class="ecosystem-intro">More BTC increases competition and lowers vaulting returns.<br>The added capital funds mining rewards, raising mining returns.</p>
      </div>
    </div>
    <p class="ecosystem-narration" role="status" aria-live="polite">{{ narration }}</p>
    <p class="ecosystem-mobile-hint">Swipe across to follow the connections between mining and vaulting.</p>
    <div class="ecosystem-scroll">
      <div ref="mapElement" class="ecosystem-map" @keydown.esc.stop="closeTooltip">
        <div v-if="guideTarget" :class="{ 'left-target': guideTarget === 'toVaulting' || guideTarget === 'vaultingApy', 'mining-apy-guide': guided && guideTarget === 'miningApy', 'below-target': sliderPrompt || (guideTarget !== 'miningApy' && nodes.find(node => node.id === guideTarget)?.y! < 250) }" class="guided-tooltip" role="dialog" aria-label="Guided walkthrough"
          :style="guideStyle" @click.stop>
          <strong>{{ startHere ? 'Start Here' : startVaulting ? 'Try Vaulting' : nodeLabel(guideTarget).replace(/\b[a-z]/g, letter => letter.toUpperCase()) }}</strong>
          <p>{{ startHere ? 'Increasing the mining competition is the only way to bring the Mining APY down to a reasonable level.' : startVaulting ? 'Increase the BTC locked in vaults to see how vault capital funds mining rewards.' : nodeDescription(guideTarget) }}</p>
          <div v-if="!sliderPrompt" class="guided-tooltip-actions">
            <button class="primary-button" :disabled="guideCatchingUp || guideStage === 2" @click="emit('prev')">← Prev</button>
            <button class="primary-button" :disabled="guideCatchingUp" @click="emit('next')">{{ guideStage === 6 ? 'Finish' : 'Next →' }}</button>
          </div>
        </div>
        <svg class="ecosystem-links" :viewBox="`0 0 ${mapSize.width} ${mapSize.height}`" aria-label="Ecosystem connections">
          <defs><clipPath id="eco-active-half"><rect :x="focused === 'mining' ? 0 : mapSize.width / 2" y="0" :width="mapSize.width / 2" :height="mapSize.height" /></clipPath><marker id="eco-arrow" viewBox="0 0 10 10" preserveAspectRatio="none" refX="0" refY="5" markerUnits="userSpaceOnUse" markerWidth="15" markerHeight="17.5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="context-stroke" /></marker></defs>
          <defs><marker id="eco-preview-arrow" viewBox="0 0 8 8" refX="8" refY="4" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L8 4L0 8Z" fill="context-stroke" /></marker></defs>
          <path v-if="previewApy" :d="previewPath()" class="mining-preview-path" :class="{ explored: explored === `preview-${active}` }"
            :style="{ opacity: !preparing && stage === nodeStep(`${active}Apy`) ? 1 : undefined }" marker-end="url(#eco-preview-arrow)" />
          <path v-for="edge in edges" :key="edge.id" :d="edgePath(edge.id)" class="ecosystem-edge" :class="{ calculation: edge.calculation, explored: explored === edge.id }" :marker-end="edge.id === 'payout-miningapy' ? undefined : 'url(#eco-arrow)'" />
          <template v-for="edge in edges" :key="`highlight-${edge.id}`"><path v-if="stage >= edgeStep(edge)" :d="edgePath(edge.id)" class="ecosystem-edge lit" :class="{ calculation: edge.calculation, explored: explored === edge.id, travelling: busy && stage === edgeStep(edge) }" :marker-end="edge.id === 'payout-miningapy' ? undefined : 'url(#eco-arrow)'" /></template>
          <path v-if="active === 'vaulting' && stage >= 6" :d="sharedApyTip()" class="ecosystem-edge calculation lit" :class="{ explored: explored === 'payout-miningapy' }" marker-end="url(#eco-arrow)" />
          <!-- SVG paints later elements on top; keep the explored line above every other line. -->
          <template v-for="edge in edges" :key="`explored-${edge.id}`">
            <path v-if="explored === edge.id" :d="edgePath(edge.id)" class="ecosystem-edge explored"
              :class="{ calculation: edge.calculation }" pointer-events="none"
              :marker-end="edge.id === 'payout-miningapy' ? undefined : 'url(#eco-arrow)'" />
          </template>
          <path v-if="explored === 'payout-miningapy' && active === 'vaulting' && stage >= 6"
            :d="sharedApyTip()" class="ecosystem-edge calculation explored" marker-end="url(#eco-arrow)" pointer-events="none" />
          <path v-if="previewApy && explored === `preview-${active}`" :d="previewPath()"
            class="mining-preview-path explored" marker-end="url(#eco-preview-arrow)" pointer-events="none" />
          <TooltipRoot v-for="connection in explorableConnections" :key="`target-${connection.id}-${connection.path}`"
            :open="explored === connection.id" :disable-closing-trigger="true"
            @update:open="setTooltipOpen(connection.id, $event)">
            <TooltipTrigger as-child :reference="tooltipAnchor">
              <path :d="connection.path" class="ecosystem-edge-target" tabindex="0" role="button" :aria-label="connection.label"
                @pointermove="moveTooltip(connection.id, $event)" @focus="openTooltip(connection.id, $event)"
                @click.stop="openTooltip(connection.id, $event)" @keydown.enter.stop.prevent="openTooltip(connection.id, $event)"
                @keydown.space.stop.prevent="openTooltip(connection.id, $event)" />
            </TooltipTrigger>
            <!-- Reset the SVG namespace before Reka portals the HTML tooltip to body. -->
            <foreignObject width="0" height="0"><TooltipPortal><TooltipContent class="ecosystem-tooltip" :side="tooltipSide" :side-offset="6"
              :collision-padding="12" :arrow-padding="12" position-strategy="fixed" update-position-strategy="always"
              @vue:mounted="measureTooltip" @escape-key-down="closeTooltip">
              <div class="ecosystem-tooltip-body"><strong>{{ tooltipContent.label }}</strong><p>{{ tooltipContent.description }}</p></div>
              <TooltipArrow class="ecosystem-tooltip-arrow" :width="24.5" :height="12.25" />
            </TooltipContent></TooltipPortal></foreignObject>
          </TooltipRoot>
        </svg>
        <TooltipRoot v-for="node in nodes" :key="node.id" :open="explored === node.id" :disable-closing-trigger="true"
          @update:open="setTooltipOpen(node.id, $event)">
        <TooltipTrigger as-child :reference="tooltipAnchor">
        <div :data-node="node.id" tabindex="0" role="group" :aria-label="node.label" @pointermove="moveTooltip(node.id, $event)" @focus="openTooltip(node.id, $event)" @click="inspectNode(node.id, $event)" @pointerdown="guardControlTooltip($event)" @keydown="inspectNodeKey(node.id, $event)" class="ecosystem-node" :class="{ explored: explored === node.id, hot: isHot(node.id), previewing: pendingApy === node.id, visited: stage > 0 && nodeStep(node.id) <= stage, inactive: stage === 0 ? node.id !== 'miners' : (node.x < 600 ? 'mining' : 'vaulting') !== focused && !(stage > 0 && nodeStep(node.id) <= stage), supporting: node.supporting, 'apy-node': node.id.endsWith('Apy') }" :style="{ left: `${layoutX(node.x) / 12}%`, top: `${node.y / 7}%` }">
          <div class="ecosystem-value">
            <strong><template v-if="isWaiting(node.id)">----</template><template v-else-if="node.id.endsWith('Apy')">{{ format(node.id, displayed(node.id)).slice(0, -1) }}<sup class="apy-percent">%</sup></template><template v-else>{{ format(node.id, displayed(node.id)) }}</template></strong>
            <div v-if="!preparing && stage > 0 && nodeStep(node.id) <= stage && !(active === 'mining' && node.id === 'miningPayout')" class="step-pill" :title="changeTitle(node.id)">
              <span v-if="Number.isInteger(nodeStep(node.id))" class="step-letter" :aria-label="`Step ${String.fromCharCode(64 + nodeStep(node.id))}`">{{ String.fromCharCode(64 + nodeStep(node.id)) }}</span>
              <span class="step-change">{{ changeLabel(node.id) }}</span>
            </div>
          </div>
          <span>{{ node.label }}</span>
          <div v-if="pendingApy === node.id" class="mining-preview-result" aria-live="polite">
            <span class="mining-preview-value">{{ format(node.id, after[node.id] ?? 0) }}</span>
          </div>
          <template v-if="node.id === 'miners' || node.id === 'bitcoin'">
            <slot :name="node.id === 'miners' ? 'mining-control' : 'vaulting-control'" />
          </template>
          <small v-if="node.id === 'toVaulting' || node.id === 'toMining'">Latest adjustment</small>
        </div>
        </TooltipTrigger>
        <TooltipPortal><TooltipContent class="ecosystem-tooltip" :side="tooltipSide" :side-offset="6"
          :collision-padding="12" :arrow-padding="12" position-strategy="fixed" update-position-strategy="always"
          @vue:mounted="measureTooltip" @escape-key-down="closeTooltip">
          <div class="ecosystem-tooltip-body"><strong>{{ tooltipContent.label }}</strong><p>{{ tooltipContent.description }}</p></div>
          <TooltipArrow class="ecosystem-tooltip-arrow" :width="24.5" :height="12.25" />
        </TooltipContent></TooltipPortal>
        </TooltipRoot>
      </div>
    </div>
    <div class="ecosystem-legend"><span>━━ Funds / revenue</span><span>┄┄ Calculation input</span><span>Drag the + controls to adjust competition.</span></div>
    <div class="ecosystem-details"><slot name="details" /></div>
  </section></div></TooltipProvider>
</template>
<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent, TooltipArrow } from 'reka-ui';
import { MAX_USABLE_BITCOIN, type GrowthSide } from '../lib/exponentialTriggers';
export type EcosystemValues = Record<string, number>;
const props = defineProps<{ active: GrowthSide; focused: GrowthSide; preparing: boolean; stage: number; busy: boolean; before: EcosystemValues; after: EcosystemValues; miners: number; bitcoin: number; guided: boolean; guideStage: number; guideCatchingUp: boolean; startHere: boolean; startVaulting: boolean; miningTransfer: number; vaultingTransfer: number }>();
const emit = defineEmits<{ activate: [side: GrowthSide]; prev: []; next: [] }>();
const finalHighlightExpired = ref(false);
const stopHighlightWatch = watch(
 () => [props.active, props.stage, props.preparing, props.guided] as const,
 ([, stage, preparing], _, onCleanup) => {
  finalHighlightExpired.value = false;
  if (preparing || stage !== 6 || props.guided) return;
  const timer = setTimeout(() => { finalHighlightExpired.value = true; }, 1500);
  onCleanup(() => clearTimeout(timer));
 },
 { immediate: true },
);
onUnmounted(stopHighlightWatch);
const layoutX = (x: number) => x >= 600 ? x - 24 : x;
const mapElement = ref<HTMLElement | null>(null);
const sliderPrompt = computed(() => props.startHere || props.startVaulting);
const startHereAnchor = ref<{ x: number; y: number; left: number } | null>(null);
function measureStartHere() {
 const map = mapElement.value;
 const target = props.startVaulting ? 'bitcoin' : 'miners';
 const thumb = map?.querySelector<HTMLElement>(`[data-node='${target}'] .competition-slider-thumb`);
 const slider = map?.querySelector<HTMLElement>(`[data-node='${target}'] .competition-slider`);
 const miners = map?.querySelector<HTMLElement>(`[data-node='${target}']`);
 if (!map || !thumb || !slider || !miners) return;
 const origin = map.getBoundingClientRect(), nib = thumb.getBoundingClientRect();
 startHereAnchor.value = { x: (nib.left + nib.right) / 2 - origin.left, y: slider.getBoundingClientRect().bottom - origin.top + 18, left: miners.getBoundingClientRect().left - origin.left };
}
watch(() => [props.startHere, props.startVaulting, props.miners, props.bitcoin], async () => {
 await nextTick();
 measureStartHere();
}, { immediate: true });
const mapSize = ref({ width: 1200, height: 620 });
const valueWidths = ref<Record<string, number>>({});
let resizeObserver: ResizeObserver | undefined;
onMounted(() => {
  const update = () => {
    if (!mapElement.value) return;
    mapSize.value = { width: mapElement.value.clientWidth, height: mapElement.value.clientHeight };
    const widths: Record<string, number> = {};
    mapElement.value.querySelectorAll<HTMLElement>('[data-node] > .ecosystem-value').forEach(value => {
      const id = value.parentElement!.dataset.node!;
      widths[id] = value.getBoundingClientRect().width;
    });
    valueWidths.value = widths;
    measureStartHere();
  };
  update();
  resizeObserver = new ResizeObserver(update);
  if (mapElement.value) {
    resizeObserver.observe(mapElement.value);
    mapElement.value.querySelectorAll('[data-node] > .ecosystem-value').forEach(value => resizeObserver!.observe(value));
  }
});
onUnmounted(() => {
 resizeObserver?.disconnect();
 cancelAnimationFrame(tooltipFrame);
 window.removeEventListener('scroll', closeTooltip, true);
 window.removeEventListener('resize', closeTooltip);
});
onMounted(() => {
 window.addEventListener('scroll', closeTooltip, true);
 window.addEventListener('resize', closeTooltip);
});
const pendingApy = computed(() => {
 const input = props.active === 'mining' ? 'miners' : 'bitcoin';
 const apy = `${props.active}Apy`;
 if (props.after[input] === props.before[input]) return null;
 return props.preparing || (props.busy && props.stage < nodeStep(apy)) ? apy : null;
});
const previewApy = computed(() => props.preparing ? pendingApy.value
 : props.busy && props.stage <= nodeStep(`${props.active}Apy`)
   && props.after[props.active === 'mining' ? 'miners' : 'bitcoin'] !== props.before[props.active === 'mining' ? 'miners' : 'bitcoin']
   ? `${props.active}Apy` : null);
const previewTarget = ref<{ left: number; right: number; y: number } | null>(null);
watch(() => [pendingApy.value, props.after[`${props.active}Apy`], mapSize.value] as const, async () => {
 await nextTick();
 const map = mapElement.value;
 const value = map?.querySelector<HTMLElement>(`[data-node='${pendingApy.value}'] .mining-preview-value`);
 if (!map || !value) { previewTarget.value = null; return; }
 const origin = map.getBoundingClientRect(), rect = value.getBoundingClientRect();
 previewTarget.value = { left: rect.left - origin.left, right: rect.right - origin.left, y: (rect.top + rect.bottom) / 2 - origin.top };
}, { immediate: true });
function previewPath() {
 const target = previewTarget.value;
 if (props.active === 'vaulting') {
  const start = bounds('bitcoin'), end = bounds('vaultingApy');
  const x = (target?.right ?? end.right) + 8;
  const targetY = target?.y ?? end.y;
  const y = start.bottom + 48;
  return `M${start.x} ${y}C${start.x} ${targetY} ${x+60} ${targetY} ${x} ${targetY}`;
 }
 const start = bounds('miners'), end = bounds('miningApy');
 const x = (target?.left ?? end.left) - 8;
 const targetY = target?.y ?? end.y;
 return `M${start.x} ${start.top-24}C${start.x} ${targetY} ${x-60} ${targetY} ${x} ${targetY}`;
}
type Point = { x: number; y: number };
const clearance = 1, arrowLength = 15, bendRadius = 24;
function bounds(id: string) {
 const node = nodes.find(n => n.id === id)!;
 const x = layoutX(node.x) / 1200 * mapSize.value.width;
 const y = node.y / 700 * mapSize.value.height;
 const width = id.endsWith('Apy') ? 200 : id === 'miners' || id === 'bitcoin' ? 140 : (valueWidths.value[id] ?? 150);
 const height = id.endsWith('Apy') ? 100 : id === 'miners' || id === 'bitcoin' ? 74 : 90;
 const boxed = id === 'miners' || id === 'bitcoin';
 // Connect to the text area, excluding unused vertical padding. Keep room
 // above values when the narrow layout places step pills there.
 const topInset = !boxed && mapSize.value.width > 1500 ? 18 : 0;
 const bottomInset = boxed ? 0 : 10;
 return { x, y, left:x-width/2, right:x+width/2, top:y-height/2+topInset, bottom:y+height/2-bottomInset };
}
function port(id: string, side: 'left'|'right'|'top'|'bottom', offset = 0): Point {
 const b = bounds(id);
 const gap = id === 'miners' || id === 'bitcoin' ? 14 : 10;
 // The numeric row sits 6px above the value-and-label block's center.
 return side === 'left' || side === 'right'
  ? { x: b[side] + (side === 'left' ? -gap : gap), y: b.y - 6 + offset }
  : { x: b.x + offset, y: b[side] + (side === 'top' ? -clearance : clearance) };
}
// Round in screen pixels so bends and arrowheads never stretch with the canvas.
function route(points: Point[]) {
 const p = points.map(point => ({...point}));
 const last = p[p.length-1]!, previous = p[p.length-2]!;
 const distance = Math.hypot(last.x-previous.x,last.y-previous.y);
 last.x -= (last.x-previous.x)/distance*arrowLength;
 last.y -= (last.y-previous.y)/distance*arrowLength;
 let d = `M${p[0]!.x} ${p[0]!.y}`;
 for(let i=1;i<p.length-1;i++) {
  const a=p[i-1]!, b=p[i]!, c=p[i+1]!;
  const incoming=Math.hypot(b.x-a.x,b.y-a.y), outgoing=Math.hypot(c.x-b.x,c.y-b.y);
  const r=Math.min(bendRadius,incoming/2,outgoing/2);
  if(!incoming || !outgoing) continue;
  d+=`L${b.x-(b.x-a.x)/incoming*r} ${b.y-(b.y-a.y)/incoming*r}Q${b.x} ${b.y} ${b.x+(c.x-b.x)/outgoing*r} ${b.y+(c.y-b.y)/outgoing*r}`;
 }
 return d+`L${last.x} ${last.y}`;
}
function edgePath(id: string) {
 const capital=port('miningCapital','top'), apy=port('miningApy','bottom');
 if(id==='capital-miningapy') {
  return route([capital, apy]);
 }
 const connections: Record<string,[string,'left'|'right'|'top'|'bottom',string,'left'|'right'|'top'|'bottom']> = {
  'miners-capital':['miners','right','miningCapital','left'],
  'capital-revenue':['miningCapital','bottom','toVaulting','top'],
  'revenue-payout':['toVaulting','right','vaultingPayout','left'],
  'btc-security':['bitcoin','left','securitization','right'],
  'security-vaultapy':['securitization','bottom','vaultingApy','top'],
  'stakes-payout':['stakes','bottom','miningPayout','top'],
  'security-rewards':['securitization','left','toMining','top'],
  'rewards-payout':['toMining','bottom','miningPayout','right'],
  'bonds-payout':['bonds','top','miningPayout','right'],
  'payout-vaultapy':['vaultingPayout','right','vaultingApy','bottom'],
  'payout-miningapy':['miningPayout','top','miningApy','bottom'],
 };
 const [from,fromSide,to,toSide]=connections[id]!;
 const start=port(from,fromSide,id==='payout-miningapy'?-24:0);
 const end=port(to,toSide);
 // Match the arrow clearance above and below the APY capsule (9px inset below, 14px above).
 if(id==='payout-vaultapy') end.y = bounds('vaultingApy').y + 50;
 if(id==='security-vaultapy') end.y = bounds('vaultingApy').y - 45;
 if(id==='payout-miningapy') {
  // End the dotted input slightly above the stakes arrow into the payout.
  start.y -= 10;
  const y=start.y-bendRadius*2;
  const joinY = end.y + arrowLength + bendRadius;
  return `M${start.x} ${start.y}V${y+bendRadius}Q${start.x} ${y} ${start.x-bendRadius} ${y}H${end.x+bendRadius*2}C${end.x} ${y} ${end.x} ${joinY+bendRadius} ${end.x} ${joinY}V${end.y+arrowLength}`;
 }
 if(start.x===end.x || start.y===end.y) return route([start,end]);
 return route([start,fromSide==='left'||fromSide==='right'?{x:end.x,y:start.y}:{x:start.x,y:end.y},end]);
}
function sharedApyTip() {
 const end = port('miningApy','bottom');
 return `M${end.x} ${end.y+arrowLength+bendRadius}V${end.y+arrowLength}`;
}

function activateSide(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('button, summary, a, .competition-slider')) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  emit('activate', event.clientX < box.left + box.width / 2 ? 'mining' : 'vaulting');
}
const hovered = ref<GrowthSide | null>(null);
function hoverSide(event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  hovered.value = event.clientX < box.left + box.width / 2 ? 'mining' : 'vaulting';
}
const nodes = [
  { id: 'miners', label: 'Miners', x: 105, y: 365 }, { id: 'miningCapital', label: 'Mining capital', x: 310, y: 365 },
  { id: 'miningPayout', label: 'Mining payout', x: 490, y: 365 }, { id: 'miningApy', label: 'Mining APY', x: 310, y: 90 },
  { id: 'stakes', label: 'Argonot stakes', x: 490, y: 215, supporting: true },
  { id: 'toVaulting', label: 'To vault revenue', x: 310, y: 605 }, { id: 'vaultingPayout', label: 'Vaulting payout', x: 735, y: 605 },
  { id: 'bitcoin', label: 'BTC in vaults', x: 1100, y: 90 }, { id: 'securitization', label: 'Securitization', x: 900, y: 90 },
  { id: 'toMining', label: 'To mining rewards', x: 735, y: 215 }, { id: 'bonds', label: 'Argon bonds', x: 735, y: 485, supporting: true },
  { id: 'vaultingApy', label: 'Vaulting APY', x: 900, y: 365 },
];
const edges = [
 { id:'miners-capital', side:'mining', stage:2 },
 { id:'capital-revenue', side:'mining', stage:3 },
 { id:'revenue-payout', side:'mining', stage:4 },
 { id:'payout-vaultapy', side:'mining', stage:5, calculation:true },
 { id:'btc-security', side:'vaulting', stage:2 },
 { id:'security-rewards', side:'vaulting', stage:4 },
 { id:'rewards-payout', side:'vaulting', stage:5 },
 { id:'payout-miningapy', side:'vaulting', stage:6, calculation:true },
 { id:'capital-miningapy', side:'mining', stage:2, calculation:true },
 { id:'security-vaultapy', side:'vaulting', stage:3, calculation:true },
 { id:'stakes-payout', side:'vaulting', stage:5 },
 { id:'bonds-payout', side:'vaulting', stage:5 },
];
// Each semantic connection owns its explanation, including temporary APY previews.
const nodeDescriptions: Record<string, string> = {
 miners: 'The number of miners competing for rewards. Their auction bids contribute mining capital and supply vault revenue. Use the slider to explore increased competition.',
 miningCapital: 'Capital committed to mining: auction bids plus Argonot stake collateral. It is compared with mining payout to calculate mining APY; auction revenue also supports vaults.',
 miningPayout: 'The modeled mining payout, including returned capital and rewards. Vault-funded rewards and returned Argonot stake collateral feed this amount, which is compared with mining capital for APY.',
 miningApy: 'Annual percentage yield calculated by compounding the modeled ten-day mining return over a year. Mining capital and payout determine it; more competing miners can lower the return.',
 stakes: 'The Argon value of Argonot stake collateral committed to mining. It forms part of mining capital and contributes to the modeled payout.',
 toVaulting: 'The latest change in revenue flowing from mining auction bids to vaults. This is an adjustment amount, rather than the total vault revenue.',
 vaultingPayout: 'The modeled vaulting payout, including capital and earnings. Mining auction revenue supports earnings; payout and securitization determine vaulting APY.',
 bitcoin: 'Bitcoin locked in vaults, measured in BTC. Adding BTC changes the modeled vault capital and rewards available to mining. Use the slider to explore competition.',
 securitization: 'Combined vault collateral: Argon securitization plus the Argon-equivalent value of Argonot securitization. Argonot collateral value is separate from circulating Argons.',
 toMining: 'The latest change in mining rewards supported by vaulting. This adjustment flows into mining payout and can change mining APY.',
 bonds: 'Argon capital committed to bonds. The map shows bonds as supporting capital connected to mining payout; bond utilization also affects vault returns. This value is distinct from the rewards paid to miners.',
 vaultingApy: 'Annual percentage yield calculated by compounding the modeled ten-day vaulting return over a year. Securitization and vaulting payout determine it; added vault capital can lower the return.',
};
const guideTarget = computed(() => {
 if (props.startHere) return 'miners';
 if (props.startVaulting) return 'bitcoin';
 if (!props.guided) return null;
 if (props.guideStage === 3.5) return 'miningCapital';
 return nodes.find(node => nodeStep(node.id) === props.guideStage)?.id ?? null;
});
const guideStyle = computed(() => {
 if (sliderPrompt.value && startHereAnchor.value) {
  const { x, y } = startHereAnchor.value;
  const left = Math.max(0, Math.min(startHereAnchor.value.left - 30, mapSize.value.width - 300) - (props.startVaulting ? 30 : 0));
  return { left: `${left}px`, top: `${y}px`, transform: 'none', '--guide-arrow-left': `${x - left - 8}px` };
 }
 const node = nodes.find(node => node.id === guideTarget.value);
 if (!node) return {};
 if (node.id === 'toVaulting' || node.id === 'vaultingApy') {
  const halfValueWidth = (valueWidths.value[node.id] ?? 0) / 2;
  const apyNode = mapElement.value?.querySelector<HTMLElement>("[data-node='vaultingApy']");
  const halfTargetWidth = node.id === 'toVaulting' ? halfValueWidth : (apyNode?.getBoundingClientRect().width ?? 200) / 2;
  const offset = halfTargetWidth + 16;
  return { left: `calc(${layoutX(node.x) / 12}% - ${offset}px)`, top: `${node.y / 7}%`, transform: 'translate(-100%, -50%)' };
 }
 return { left: `${Math.min(76, Math.max(14, layoutX(node.x) / 12))}%`, top: `${node.y / 7}%`, transform: node.y < 250 && node.id !== 'miningApy' ? 'translate(-50%, 70px)' : 'translate(-50%, calc(-100% - 64px))' };
});
watch(() => [props.guided, props.startHere, props.startVaulting], closeTooltip);
const connectionDescriptions: Record<string, [string, string, string]> = {
 'miners-capital': ['miners', 'miningCapital', 'Competing miners commit auction bids and stake collateral, increasing the capital used in the mining return calculation.'],
 'capital-revenue': ['miningCapital', 'toVaulting', 'A share of mining auction revenue supports vault earnings. The receiving item shows the latest change in this revenue.'],
 'revenue-payout': ['toVaulting', 'vaultingPayout', 'The change in mining-funded vault revenue changes the modeled vaulting payout.'],
 'payout-vaultapy': ['vaultingPayout', 'vaultingApy', 'Calculation input: vaulting payout is compared with securitization capital to calculate the ten-day return, then annualized by compounding.'],
 'btc-security': ['bitcoin', 'securitization', 'BTC locked in vaults changes the modeled capital committed to securitization, expressed in Argons.'],
 'security-rewards': ['securitization', 'toMining', 'Vault capital supports mining rewards. The receiving item shows the latest adjustment to those rewards.'],
 'rewards-payout': ['toMining', 'miningPayout', 'The change in vault-supported mining rewards changes the modeled mining payout.'],
 'payout-miningapy': ['miningPayout', 'miningApy', 'Calculation input: mining payout is compared with mining capital to calculate the ten-day return, then annualized by compounding.'],
 'capital-miningapy': ['miningCapital', 'miningApy', 'Calculation input: mining capital is the invested amount against which mining payout is compared. More capital competing for rewards can reduce APY.'],
 'security-vaultapy': ['securitization', 'vaultingApy', 'Calculation input: securitization supplies the capital against which vaulting payout is compared. More capital competing for revenue can reduce APY.'],
 'stakes-payout': ['stakes', 'miningPayout', 'Argonot stake collateral contributes to the capital included in the modeled mining payout.'],
 'bonds-payout': ['bonds', 'miningPayout', 'This link identifies bonds as supporting capital in the ecosystem. The displayed bond capital is distinct from the mining rewards and returned stake collateral that make up mining payout.'],
 'preview-mining': ['miners', 'miningApy', 'Preview calculation: changing the number of competing miners changes mining capital and the projected mining APY before the full revenue sequence finishes.'],
 'preview-vaulting': ['bitcoin', 'vaultingApy', 'Preview calculation: changing BTC in vaults changes vault capital and the projected vaulting APY before the full reward sequence finishes.'],
};
type TooltipSide = 'top' | 'right' | 'bottom' | 'left';
const tooltip = shallowRef<{ id: string; element: Element; x: number; y: number } | null>(null);
const explored = ref<string | null>(null);
const tooltipSide = ref<TooltipSide>('right');
const tooltipRect = shallowRef(new DOMRect());
const tooltipAnchor = { getBoundingClientRect: () => tooltipRect.value };
let tooltipSize = { width: 320, height: 180 };
let tooltipFrame = 0;
const nodeLabel = (id: string) => nodes.find(node => node.id === id)!.label;
function nodeDescription(id: string) {
 if (id !== 'securitization') return nodeDescriptions[id];
 return `${nodeDescriptions[id]} Argons: ${format('securitization', props.after.argonSecuritization ?? 0)}. Argonot collateral value: ${format('securitization', props.after.argonotSecuritization ?? 0)}. This scenario assumes Argonot collateral worth twice the Argon collateral.`;
}
const tooltipContent = computed(() => {
 const id = explored.value;
 if (!id) return { label: '', description: '' };
 const connection = connectionDescriptions[id];
 return connection
  ? { label: `${nodeLabel(connection[0])} → ${nodeLabel(connection[1])}`, description: connection[2] }
  : { label: nodeLabel(id), description: nodeDescription(id) };
});
const explorableConnections = computed(() => [
 ...edges.map(edge => ({ id: edge.id, path: edgePath(edge.id) + (edge.id === 'payout-miningapy' && props.active === 'vaulting' && props.stage >= 6 ? sharedApyTip() : ''), label: `${nodeLabel(connectionDescriptions[edge.id]![0])} to ${nodeLabel(connectionDescriptions[edge.id]![1])}` })),
 ...(previewApy.value ? [{ id: `preview-${props.active}`, path: previewPath(), label: `${props.active} APY preview calculation` }] : []),
]);
function closeTooltip() {
 explored.value = null;
 tooltip.value = null;
 cancelAnimationFrame(tooltipFrame);
 tooltipFrame = 0;
}
function setTooltipOpen(id: string, open: boolean) {
 if (open && tooltip.value?.id === id) explored.value = id;
 else if (!open && explored.value === id) closeTooltip();
}
function trackTooltip(id: string, event: Event) {
 const element = event.currentTarget as Element;
 const box = element.getBoundingClientRect();
 const pointer = event instanceof PointerEvent || (event instanceof MouseEvent && event.detail !== 0);
 tooltip.value = { id, element, x: pointer ? (event as MouseEvent).clientX : box.left + box.width / 2,
  y: pointer ? (event as MouseEvent).clientY : box.top + box.height / 2 };
 positionTooltip();
}
function openTooltip(id: string, event: Event) {
 if (props.guided) return;
 trackTooltip(id, event);
 explored.value = id;
}
function moveTooltip(id: string, event: PointerEvent) {
 if (props.guided) return;
 if ((event.target as Element).closest('button, input, .competition-slider')) {
  if (explored.value === id) closeTooltip();
  return;
 }
 // Update once per frame; Reka's virtual anchor follows the latest pointer position.
 tooltip.value = { id, element: event.currentTarget as Element, x: event.clientX, y: event.clientY };
 if (event.pointerType !== 'touch') explored.value = id;
 if (!tooltipFrame) tooltipFrame = requestAnimationFrame(() => {
  tooltipFrame = 0;
  positionTooltip();
 });
}
watch(explored, id => { if (id) measureTooltip(); });
async function measureTooltip() {
 await nextTick();
 await nextTick();
 const content = document.querySelector<HTMLElement>('.ecosystem-tooltip');
 if (!content || !tooltip.value) return;
 tooltipSize = { width: content.offsetWidth, height: content.offsetHeight };
 positionTooltip();
}
function positionTooltip() {
 const target = tooltip.value;
 if (!target) return;
 let box = target.element.getBoundingClientRect();
 const node = target.element.matches('.ecosystem-node');
 if (node) {
  // Protect the stat and label, allowing the tooltip to overlap padding and glow.
  const textBounds = [...target.element.querySelectorAll('.ecosystem-value > strong, :scope > span')]
   .map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
  if (textBounds.length) {
   const left = Math.min(...textBounds.map(rect => rect.left));
   const top = Math.min(...textBounds.map(rect => rect.top));
   const right = Math.max(...textBounds.map(rect => rect.right));
   const bottom = Math.max(...textBounds.map(rect => rect.bottom));
   box = new DOMRect(left, top, right - left, bottom - top);
  }
 }
 const x = Math.max(box.left, Math.min(target.x, box.right));
 const y = Math.max(box.top, Math.min(target.y, box.bottom));
 const gap = 18.25; // Includes the content offset and arrow height.
 const width = Math.min(tooltipSize.width, window.innerWidth - 24), height = tooltipSize.height;
 const points: Point[] = [];
 if (!node && target.element instanceof SVGPathElement) {
  const matrix = target.element.getScreenCTM();
  if (matrix) {
   const length = target.element.getTotalLength();
   const samples = Math.min(200, Math.max(2, Math.ceil(length / 6)));
   for (let i = 0; i <= samples; i++) {
    const point = target.element.getPointAtLength(length * i / samples).matrixTransform(matrix);
    points.push({ x: point.x, y: point.y });
   }
  }
 }
 const candidates = (['right', 'left', 'top', 'bottom'] as TooltipSide[]).map(side => {
  const horizontal = side === 'left' || side === 'right';
  // Project the mouse onto the text edge so the stat and label remain visible.
  const anchor = node ? horizontal ? new DOMRect(box.left, y, box.width, 0)
   : new DOMRect(x, box.top, 0, box.height) : new DOMRect(x, y, 0, 0);
  let left = horizontal ? side === 'right' ? anchor.right + gap : anchor.left - gap - width : x - width / 2;
  let top = horizontal ? y - height / 2 : side === 'bottom' ? anchor.bottom + gap : anchor.top - gap - height;
  // Match Reka's cross-axis viewport shift when scoring available positions.
  if (horizontal) top = Math.max(12, Math.min(top, window.innerHeight - height - 12));
  else left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
  const right = left + width, bottom = top + height;
  const overflow = Math.max(0, 12 - left) + Math.max(0, right - window.innerWidth + 12)
   + Math.max(0, 12 - top) + Math.max(0, bottom - window.innerHeight + 12);
  const overlap = node ? Math.max(0, Math.min(right, box.right) - Math.max(left, box.left))
    * Math.max(0, Math.min(bottom, box.bottom) - Math.max(top, box.top))
   : points.filter(point => point.x >= left - 8 && point.x <= right + 8 && point.y >= top - 8 && point.y <= bottom + 8).length;
  return { side, anchor, score: overflow * 1000 + overlap * 100 + (side === tooltipSide.value ? 0 : 1) };
 });
 candidates.sort((a, b) => a.score - b.score);
 tooltipSide.value = candidates[0]!.side;
 tooltipRect.value = candidates[0]!.anchor;
}
function guardControlTooltip(event: PointerEvent) {
 if ((event.target as Element).closest('button, input, .competition-slider')) closeTooltip();
}
function inspectNodeKey(id: string, event: KeyboardEvent) {
 if (!['Enter', ' '].includes(event.key) || (event.target as Element).closest('button, input, .competition-slider')) return;
 event.preventDefault();
 event.stopPropagation();
 openTooltip(id, event);
}
function inspectNode(id: string, event: MouseEvent) {
 if ((event.target as Element).closest('button, input, .competition-slider')) return;
 event.stopPropagation();
 openTooltip(id, event);
}
watch(() => [props.active, previewApy.value], () => {
 if (explored.value?.startsWith('preview-') && (explored.value !== `preview-${props.active}` || !previewApy.value)) closeTooltip();
});
function edgeStep(edge: typeof edges[number]) {
 if (props.active === 'vaulting') return edge.id === 'payout-vaultapy' ? 3 : edge.side === 'vaulting' ? edge.stage : 99;
 const steps: Record<string, number> = { 'miners-capital':2, 'capital-miningapy':3, 'payout-miningapy':3, 'capital-revenue':4, 'revenue-payout':5, 'payout-vaultapy':6 };
 return steps[edge.id] ?? 99;
}
function isHot(id: string) {
 if (finalHighlightExpired.value) return false;
 if (props.active === 'mining' && props.stage === 3.5) return id === 'miningCapital';
 if (props.active === 'vaulting' && props.stage === 2.5) return id === 'securitization' || id === 'vaultingPayout';
 return props.stage > 0 && (nodeStep(id) === props.stage || (props.active === 'mining' && (id === 'miningCapital' || id === 'miningPayout') && props.stage >= 2.5 && props.stage <= 3));
}
function nodeStep(id: string) {
 const steps: Record<string,number> = props.active === 'mining' ? {miners:1,miningCapital:2,miningPayout:2.5,miningApy:3,toVaulting:4,vaultingPayout:5,vaultingApy:6} : {bitcoin:1,securitization:2,vaultingPayout:2.5,vaultingApy:3,toMining:4,miningPayout:5,miningApy:6};
 return steps[id] ?? 99;
}
function isWaiting(id: string) {
 if (!props.busy || id.endsWith('Apy')) return false;
 if (props.active === 'vaulting' && props.preparing && id === 'vaultingPayout') return false;
 if (props.active === 'vaulting' && ['miners', 'miningCapital', 'stakes'].includes(id)) return false;
 if ((props.active === 'mining' && id === 'stakes') || (props.active === 'vaulting' && id === 'bonds')) return false;
 const step = nodeStep(id);
 if (step < 99) return props.stage < step;
 // Supporting values without a flow step update when the sequence finishes.
 return props.before[id] !== props.after[id] && props.stage < 6;
}
function displayed(id: string) {
 if (id === 'miningPayout' && props.active === 'mining' && props.stage >= 3) return props.after[id] ?? 0;
 if (id === 'miners') return props.miners;
 if (id === 'bitcoin') return props.bitcoin;
 if (id === 'toVaulting') return props.miningTransfer;
 if (id === 'toMining') return props.vaultingTransfer;
 return (props.stage >= 6 || props.stage >= nodeStep(id) ? props.after : props.before)[id] ?? 0;
}
const compact = (n:number) => n.toLocaleString('en-US',{notation:'compact',maximumFractionDigits:2});
function format(id:string,n:number) {
 if((id==='miners' || id==='bitcoin') && Math.abs(n)>=1000) return compact(n);
 if(id==='miners') return n.toLocaleString('en-US');
 if(id==='bitcoin') {
  const decimals = Math.abs(n) < 10 ? 2 : 1;
  return n.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
 }
 if(id.endsWith('Apy')) return n >= 1e9 ? 'Over 1B%' : `${compact(n)}%`;
 return `${id.startsWith('to') && n >= 0 ? '+' : ''}₳${compact(n)}`;
}
const delta = (id:string) => (props.after[id] ?? 0) - (props.before[id] ?? 0);
function changeLabel(id: string) {
 const change = id.startsWith('to') ? displayed(id) : delta(id), magnitude = Math.abs(change);
 const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
 if (id.endsWith('Apy')) return `${sign}${compact(Math.min(magnitude, 1e9))}%`;
 if (id.startsWith('to')) return `${sign}₳${compact(magnitude)}`;
 return `${sign}${format(id, magnitude)}${id === 'bitcoin' ? ' BTC' : ''}`;
}
function changeTitle(id: string) {
 const change = id.startsWith('to') ? displayed(id) : delta(id);
 return `${change > 0 ? '+' : ''}${change.toLocaleString('en-US', { maximumFractionDigits: 2 })}${id.endsWith('Apy') ? '%' : id === 'bitcoin' ? ' BTC' : ''} from this adjustment`;
}
const narration = computed(() => {
 if(!props.stage) return 'Add miners or BTC, then follow the highlighted path across the ecosystem.';
 if (props.active === 'mining' && props.stage === 3.5) return 'Mining capital supplies the bids that fund vault revenue.';
 if (props.active === 'mining' && props.stage === 2.5) return 'Mining capital and payout are compared before calculating APY.';
 if (props.active === 'vaulting' && props.stage === 2.5) return 'Securitization and vaulting payout are compared before calculating APY.';
 if (props.active === 'mining') return ['', 'Mining competition changes.', 'Mining capital updates.', 'Both inputs determine mining APY.', 'A share of mining revenue flows to vaults.', 'Vaulting payout updates.', 'Vaulting APY reflects the new payout.'][props.stage];
 const source = 'Vaulting';
 const receiver = 'mining';
 return [``,`${source} competition changes.`,`${source} capital changes the return on that side.`,`${source} APY reflects capital and payout.`,`Follow the changed revenue across to ${receiver}.`,`The ${receiver} payout updates.`,`The ${receiver} APY reflects the new payout.`][props.stage];
});
</script>
