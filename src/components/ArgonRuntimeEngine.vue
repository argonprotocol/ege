<template>
  <svg viewBox="0 0 360 360" class="runtime-engine" :class="{ active }"
    role="img" aria-label="Argon Runtime Engine capital circulation circuit">
    <circle cx="180" cy="180" r="176" class="board" />
    <circle cx="180" cy="180" r="170" class="contact-ring" />
    <g :transform="`rotate(${rotation} 180 180)`">
    <g fill="none" stroke-linejoin="round" stroke-linecap="round">
      <path v-for="(trace, i) in traces" :key="`trace-${i}`" :d="trace" class="trace"  />
      <g v-for="(trace, i) in traces" :key="`pulse-${i}`" class="flow">
        <path v-for="step in 12" :key="step" :d="trace" class="trail"
          :stroke-opacity="(13 - step) / 12"
          :stroke-width="0.7 + (13 - step) * 0.14"
          :stroke-dashoffset="flowOffset(i) + flowDirection * step * 2.3" />
      </g>
    </g>
    <circle v-for="([x,y], i) in busJunctions" :key="`bus-${i}`" :cx="x" :cy="y" r="1.75" fill="#9a8bb6" />
    <g v-for="component in components" :key="`${component.x}:${component.y}`">
      <rect :x="component.x" :y="component.y" :width="component.width" :height="component.height" rx="0.6" class="pad" />
      <path :d="component.mark" fill="none" stroke="#9a8bb6" stroke-width="0.8" />
    </g>
    <circle v-for="([x,y], i) in vias" :key="`via-${i}`" :cx="x" :cy="y" r="1.56"
      :fill="busJunctions.includes(vias[i]) ? '#9a8bb6' : '#fcfaff'" stroke="#a294bd" stroke-width="1" />
    <g class="chip">
      <rect v-for="(pin, i) in pins" :key="i" :x="pin.x" :y="pin.y" :width="pin.width" :height="pin.height" :transform="pin.transform" rx="0.6" />
    </g>
    </g>
    <g class="chip">
      <circle cx="180" cy="180" r="68" class="core" />
    </g>
    <text x="180" y="159" text-anchor="middle" class="label">
      <tspan x="180">Argon</tspan><tspan x="180" dy="28">Runtime</tspan><tspan x="180" dy="28">Engine</tspan>
    </text>
    <g v-for="x in [8,352]" :key="x">
      <path :d="`M${x} 165 L${x < 180 ? 10.66 : 349.34} 165`" class="trace" />
      <rect :x="x-12" y="153" width="24" height="24" rx="5" class="port" />
      <rect :x="x-4.5" y="160" width="9" height="10" rx="2" fill="#9180ae" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { onMounted, onScopeDispose, ref, watch } from 'vue';
const props = withDefaults(defineProps<{ active?: boolean; direction?: 'mining' | 'vaulting'; dragDirection?: number; rotation?: number }>(), {
  active: false, direction: 'mining', dragDirection: 0, rotation: 0,
});
const rotation = ref(0);
const phase = ref(0);
const flowDirection = ref(1);
const flowOffset = (index: number) => (index * 137.51 + phase.value) % 450;
let frame = 0;
let previousTime = 0;
let reducedMotion: MediaQueryList | undefined;
function animate(time: number) {
  const elapsed = previousTime ? Math.min(time - previousTime, 50) / 1000 : 0;
  previousTime = time;
  if (!reducedMotion?.matches) {
    phase.value = (phase.value - flowDirection.value * elapsed * 30) % 450;
  }
  frame = requestAnimationFrame(animate);
}
function stop() {
  cancelAnimationFrame(frame);
  frame = 0;
  previousTime = 0;
}
watch(() => props.rotation, angle => {
  if (!reducedMotion?.matches) rotation.value = angle;
});
watch(() => props.dragDirection, direction => {
  if (direction) flowDirection.value = direction;
}, { immediate: true });
watch(() => props.active, active => {
  stop();
  if (active) frame = requestAnimationFrame(animate);
});
onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (props.active && !frame) frame = requestAnimationFrame(animate);
});
onScopeDispose(stop);
// A seeded routing grid packs the annulus without crossing traces. Every
// branch belongs to one connected circuit; terminal pads mark all dead ends.
type Point = [number, number];
const traces: string[] = [];
const vias: Point[] = [];
const busJunctions: Point[] = [];
const pins: { x: number; y: number; width: number; height: number; transform?: string }[] = [];
const components: { x: number; y: number; width: number; height: number; mark: string }[] = [];
const pitch = 7.8;
const pointKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
const nodes: Point[] = [];
const index = new Map<string, number>();
for (let row = -21; row <= 21; row++) {
  const y = 180 + row * pitch;
  for (let column = -21; column <= 21; column++) {
    const x = 180 + column * pitch;
    if (Math.hypot(x - 180, y - 180) <= 162 && Math.hypot(x - 180, y - 180) >= 74) {
      index.set(pointKey(x, y), nodes.length);
      nodes.push([x, y]);
    }
  }
}
let seed = 41719;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const edges = nodes.map(() => [] as number[]);
const visited = new Set<number>();
const stack: { id: number; dx: number; dy: number }[] = [{ id: 0, dx: 1, dy: 0 }];
visited.add(0);
while (stack.length) {
  const current = stack[stack.length - 1];
  const [x, y] = nodes[current.id];
  const options = [[1, 0], [0, 1], [-1, 0], [0, -1]].flatMap(([dx, dy]) => {
    const id = index.get(pointKey(x + dx * pitch, y + dy * pitch));
    return id !== undefined && !visited.has(id) ? [{ id, dx, dy }] : [];
  });
  if (!options.length) { stack.pop(); continue; }
  const straight = options.find(option => option.dx === current.dx && option.dy === current.dy);
  const next = straight && random() < 0.6 ? straight : options[Math.floor(random() * options.length)];
  edges[current.id].push(next.id);
  edges[next.id].push(current.id);
  visited.add(next.id);
  stack.push(next);
}
// Merge each run between junctions into one animated path. Grid pitch guarantees
// clear separation, and shared vertices are explicit electrical connections.
const used = new Set<string>();
const edgeKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
function route(points: Point[]) {
  traces.push(points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' '));
}
for (let start = 0; start < nodes.length; start++) {
  if (edges[start].length === 2) continue;
  if (edges[start].length > 2) busJunctions.push(nodes[start]);
  if (edges[start].length === 1) vias.push(nodes[start]);
  for (const neighbor of edges[start]) {
    if (used.has(edgeKey(start, neighbor))) continue;
    const points = [nodes[start]];
    let previous = start;
    let current = neighbor;
    used.add(edgeKey(previous, current));
    while (true) {
      points.push(nodes[current]);
      if (edges[current].length !== 2) break;
      const next = edges[current].find(id => id !== previous)!;
      previous = current;
      current = next;
      used.add(edgeKey(previous, current));
    }
    route(points);
  }
}
// Chip leads stop at the first grid node along each cardinal/diagonal ray.
for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
  for (let step = 1; step < 30; step++) {
    const id = index.get(pointKey(180 + dx * step * pitch, 180 + dy * step * pitch));
    if (id === undefined) continue;
    const angle = Math.atan2(dy, dx);
    const x = 180 + 67 * Math.cos(angle);
    const y = 180 + 67 * Math.sin(angle);
    pins.push({ x, y: y - 1.95, width: 5, height: 3.9,
      transform: `rotate(${angle * 180 / Math.PI} ${x} ${y})` });
    route([[180 + 72 * Math.cos(angle), 180 + 72 * Math.sin(angle)], nodes[id]]);
    busJunctions.push(nodes[id]);
    break;
  }
}
// Perimeter buses follow the circular silhouette. Their radial taps start at
// the outermost grid node, so they never pass through the internal circuitry.
for (let sector = 0; sector < 12; sector++) {
  // Leave the input port corridor clear of the perimeter bus.
  if (sector === 6) continue;
  const angle = sector * Math.PI / 6;
  const candidates = nodes.map((point, id) => ({ point, id,
    angle: Math.atan2(point[1] - 180, point[0] - 180), radius: Math.hypot(point[0] - 180, point[1] - 180) }))
    .filter(node => Math.abs(Math.atan2(Math.sin(node.angle - angle), Math.cos(node.angle - angle))) < 0.035)
    .sort((a, b) => b.radius - a.radius);
  const node = candidates[0];
  if (!node) continue;
  const endAngle = node.angle + 0.38;
  const a: Point = [180 + 168 * Math.cos(node.angle), 180 + 168 * Math.sin(node.angle)];
  const b: Point = [180 + 168 * Math.cos(endAngle), 180 + 168 * Math.sin(endAngle)];
  traces.push(`M${node.point[0]} ${node.point[1]} L${a[0]} ${a[1]} A168 168 0 0 1 ${b[0]} ${b[1]}`);
  route([a, [180 + 170 * Math.cos(node.angle), 180 + 170 * Math.sin(node.angle)]]);
  busJunctions.push(node.point);
  vias.push(b);
}
// Small plated packages sit directly on existing branch terminals.
for (let i = 4; i < vias.length - 11; i += 13) {
  const [x, y] = vias[i];
  components.push({ x: x - 2.6, y: y - 2.6, width: 5.2, height: 5.2, mark: `M${x - 0.5} ${y} H${x + 0.5}` });
}
// The stationary ports contact the circular bus while circuitry rotates.

</script>

<style scoped>
.runtime-engine { overflow: visible; }
/* A crisp lower highlight makes the lavender linework feel recessed. */
.runtime-engine :is(path, circle, rect, text) { filter: drop-shadow(0 1px 0 #fff); }
.board { fill: #faf8ff55; stroke: #a294bd; stroke-width: 1.6; }
.trace { stroke: #b0a2c7; stroke-width: 1.56; }
.trace.faint { stroke: #d2c8e0; stroke-width: 1; }
.pad, .port { fill: #fcfaff; stroke: #a89abe; stroke-width: 1.2; }
.chip { fill: #faf7ff; stroke: #a89abe; stroke-width: 1.3; }
.core { stroke: #a294bd; stroke-width: 1.6; }
.label { fill: #807097; font: 600 22px Arial, sans-serif; letter-spacing: -0.5px; }
.contact-ring { fill: none; stroke: #b0a2c7; stroke-width: 1.2; }
.flow { opacity: 0; }
.active .flow { opacity: 1; }
.runtime-engine .trail { stroke: #59308c; stroke-dasharray: 2.4 447.6; filter: none; }
.active .core { animation: processing 1.6s ease-in-out infinite; }
@keyframes processing { 50% { fill: #eee8f5; } }
@media (prefers-reduced-motion: reduce) { .active .core { animation: none; } }
</style>
