<template>
  <section class="learning-guide" :class="{ complete: completed }" aria-label="Learning guide">
    <div><span class="eyebrow">{{ exploring ? 'FREE EXPLORATION' : completed ? 'LOOP COMPLETE' : miningDone ? 'STEP 2 OF 2 · VAULTING → MINING' : 'STEP 1 OF 2 · MINING → VAULTING' }}</span>
      <h2>{{ exploring ? 'Explore the ecosystem. Watch your simulated portfolio.' : completed ? 'You’ve connected both sides of the loop.' : miningDone ? 'Now add BTC. Watch mining rewards respond.' : 'Add miners. Watch vault revenue respond.' }}</h2>
      <p>{{ exploring ? 'Try either side, inspect the calculations, or undo your last adjustment. No APY target is required.' : completed ? 'Mining bids support vault revenue. Added vault capital funds mining rewards in this scenario. Your portfolio shows the personal effect as the simulation advances.' : miningDone ? 'The extra bids helped vaults. Adding BTC now increases vault capital and funds rewards for miners.' : 'More competition lowers the return per miner, while a share of the additional bids goes to vaults.' }}</p>
    </div>
    <div class="guide-actions"><button v-if="miningDone && !completed && !exploring" class="primary-button" @click="$emit('vaulting')">Try vaulting →</button><button v-if="completed && !exploring" class="primary-button" @click="$emit('explore')">Explore freely →</button><button v-if="!exploring && !completed" class="text-button" @click="$emit('explore')">Skip guide</button><button v-if="exploring" class="text-button" @click="$emit('restart')">Replay lesson</button></div>
  </section>
</template>
<script setup lang="ts">
defineProps<{ miningDone: boolean; completed: boolean; exploring: boolean }>();
defineEmits<{ vaulting: []; explore: []; restart: [] }>();
</script>
