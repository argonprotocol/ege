<template>
  <button class="competition-button" type="button" :aria-label="`Increase ${label} by 10%. Drag ${increaseLeft ? 'left' : 'right'} to increase; ${increaseLeft ? 'right' : 'left'} to decrease.`"
    :disabled="disabled" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel"
    @lostpointercapture="cancel" @click="click" @keydown.left.prevent="nudge(increaseLeft ? 1 : -1)" @keydown.right.prevent="nudge(increaseLeft ? -1 : 1)">
    <svg class="competition-plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2V22M2 12H22" fill="none" stroke="currentColor" stroke-width="4" /></svg><span class="competition-label">Add 10% {{ label }}</span>
  </button>
</template>
<script setup lang="ts">
const props = defineProps<{ label: string; value: number; minimum: number; maximum?: number; fitViewport?: boolean; increaseLeft?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ change: [value: number]; increment: []; begin: []; end: [] }>();
let startX = 0, startValue = 0, pointer: number | null = null, dragged = false, suppressClick = false;
let dragMinimum = 0, dragMaximum = 0, rightTravel = 1, leftTravel = 1;
function down(e: PointerEvent) {
  if (e.button !== 0) return;
  emit('begin');
  startX = e.clientX; startValue = props.value; pointer = e.pointerId; dragged = false; suppressClick = false;
  // Freeze the range and available travel for the entire gesture.
  dragMinimum = props.minimum;
  dragMaximum = Math.max(startValue, props.maximum ?? startValue);
  rightTravel = Math.max(5, props.increaseLeft ? Math.min(220, document.documentElement.clientWidth - 24 - startX) : document.documentElement.clientWidth - 24 - startX);
  leftTravel = Math.max(5, props.increaseLeft ? startX - 24 : Math.min(220, startX - 24));
  const ecosystem = (e.currentTarget as HTMLElement).closest('.ecosystem');
  if (ecosystem) {
    const rect = ecosystem.getBoundingClientRect();
    const box = getComputedStyle(ecosystem, props.increaseLeft ? '::after' : '::before');
    const width = parseFloat(box.width);
    const left = props.increaseLeft ? rect.right - parseFloat(box.right) - width : rect.left + parseFloat(box.left);
    const right = left + width;
    if (Number.isFinite(left) && Number.isFinite(right)) {
      rightTravel = Math.max(5, right - startX);
      leftTravel = Math.max(5, startX - left);
    }
  }
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (pointer !== e.pointerId) return;
  const delta = e.clientX - startX;
  const changeDelta = props.increaseLeft ? -delta : delta;
  if (Math.abs(delta) > 4) dragged = true;
  if (!dragged) return;
  if (!props.fitViewport) {
    emit('change', Math.max(props.minimum, Math.max(startValue, .00000001) * Math.exp(changeDelta / 220)));
    return;
  }
  // Logarithmic travel gives small amounts precision while fitting large ranges.
  // Remove the click dead zone so crossing it never jumps the value.
  const distance = Math.max(0, Math.abs(delta) - 4);
  const progress = Math.min(1, distance / ((delta >= 0 ? rightTravel : leftTravel) - 4));
  const endpoint = changeDelta >= 0 ? dragMaximum : dragMinimum;
  const value = progress >= 1 ? endpoint
    : Math.expm1(Math.log1p(startValue) + progress * (Math.log1p(endpoint) - Math.log1p(startValue)));
  emit('change', Math.max(dragMinimum, Math.min(dragMaximum, value)));
}
function up(e: PointerEvent) {
  if (pointer !== e.pointerId) return;
  suppressClick = dragged; pointer = null;
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  emit('end');
}
function cancel() { if (pointer !== null) { suppressClick = true; emit('end'); } pointer = null; }
function click() { if (!suppressClick) emit('increment'); suppressClick = false; }
function nudge(direction: number) { if (direction > 0) emit('increment'); else { emit('begin'); emit('change', Math.max(props.minimum, props.value / 1.1)); emit('end'); } }
</script>
<style scoped>
.competition-button { display: inline-flex; justify-content: center; align-items: center; gap: 10px; min-height: 44px; padding: 10px 18px; border: 0; border-radius: 9px; color: white; background: #a526df; cursor: ew-resize; touch-action: none; user-select: none; font: inherit; }
.competition-plus { display: block; width: 24px; height: 24px; flex: none; }
.competition-label { font-size: 13px; font-weight: 600; }
.competition-button:hover { background: #9119c9; }
.competition-button:disabled { background: #e1dbe6; color: #81738c; cursor: default; }
</style>
