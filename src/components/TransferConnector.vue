<template>
  <svg ref="svg" class="transfer-connector" :class="{ resting: !interacting }" >
    <defs>
      <marker id="transfer-arrow" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 Z" fill="#999" />
      </marker>
    </defs>
    <g class="connections" aria-hidden="true">
      <path v-for="(path, index) in paths" :key="index" :d="path" fill="none" stroke="#999" stroke-width="2.5"
        marker-end="url(#transfer-arrow)" />
    </g>
    <ArgonRuntimeEngine v-if="engine.size" :x="engine.x" :y="engine.y" :width="engine.size" :height="engine.size"
      :active="interacting && paths.length > 0" :direction="view.transfer?.side" :drag-direction="dragDirection" :rotation="circuitRotation" />
  </svg>
</template>

<script setup lang="ts">
import { onMounted, onScopeDispose, ref, watch } from 'vue';
import ArgonRuntimeEngine from './ArgonRuntimeEngine.vue';
import { useGrowthSimulation } from '../lib/useGrowthSimulation';

const { view, interacting, dragDirection, circuitRotation } = useGrowthSimulation();
const svg = ref<SVGSVGElement | null>(null);
const paths = ref<string[]>([]);
const engine = ref({ x: 0, y: 0, size: 0 });
let resizeObserver: ResizeObserver | undefined;
let mutationObserver: MutationObserver | undefined;
let animationFrame = 0;

function updatePath() {
  animationFrame = 0;
  const surface = svg.value;
  const workspace = surface?.parentElement;
  const transfer = view.value.transfer;
  const left = workspace?.querySelector<HTMLElement>('.apy-slider.left .bid-header')
    ?? workspace?.querySelector<HTMLElement>('.apy-slider.left .apy-card');
  const right = workspace?.querySelector<HTMLElement>('.apy-slider.right .bid-header')
    ?? workspace?.querySelector<HTMLElement>('.apy-slider.right .apy-card');
  if (!surface) return;
  const origin = surface.getBoundingClientRect();
  const size = Math.min(374.4, origin.width * 0.2236, origin.height * 0.4368) * 0.9;
  engine.value = { x: (origin.width - size) / 2, y: Math.min(origin.height * 0.75 - size / 2, origin.height - size - 12), size };
  if (!left || !right) {
    paths.value = [];
    return;
  }
  const leftBounds = left.getBoundingClientRect();
  const rightBounds = right.getBoundingClientRect();
  const leftPoint = { x: leftBounds.right - origin.left + 8,
    y: leftBounds.top + leftBounds.height / 2 - origin.top };
  const rightPoint = { x: rightBounds.left - origin.left - 8,
    y: rightBounds.top + rightBounds.height / 2 - origin.top };
  const leftPort = { x: engine.value.x + size * 8 / 360, y: engine.value.y + size * 165 / 360 };
  const rightPort = { x: engine.value.x + size * 352 / 360, y: engine.value.y + size * 165 / 360 };
  const segments = (transfer?.side ?? 'mining') === 'mining'
    ? [[leftPoint, leftPort], [rightPort, rightPoint]]
    : [[rightPoint, rightPort], [leftPort, leftPoint]];
  paths.value = segments.map(([start, end]) => {
    const bend = (end.x - start.x) * 0.45;
    return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
  });
}

function scheduleUpdate() {
  if (!animationFrame) animationFrame = requestAnimationFrame(updatePath);
}

watch(view, scheduleUpdate, { flush: 'post' });
onMounted(() => {
  const workspace = svg.value!.parentElement!;
  resizeObserver = new ResizeObserver(scheduleUpdate);
  resizeObserver.observe(workspace);
  mutationObserver = new MutationObserver(scheduleUpdate);
  // Card positioning changes after Vue rendering and viewport clamping.
  // Observe only the sliders, so updating the SVG cannot trigger itself.
  workspace.querySelectorAll('.apy-slider').forEach(slider => {
    resizeObserver!.observe(slider);
    mutationObserver!.observe(slider, { subtree: true, childList: true,
      attributes: true, attributeFilter: ['style', 'class'], characterData: true });
  });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('scroll', scheduleUpdate, true);
  scheduleUpdate();
});
onScopeDispose(() => {
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  cancelAnimationFrame(animationFrame);
  window.removeEventListener('resize', scheduleUpdate);
  window.removeEventListener('scroll', scheduleUpdate, true);
});
</script>

<style scoped>
.transfer-connector {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.transfer-connector.resting .connections { opacity: 0.45; }
.transfer-connector.resting .connections > path {
  stroke-dasharray: 1 6;
  stroke-linecap: round;
}
</style>
