<template>
  <DialogRoot :open="true"><DialogPortal><DialogOverlay class="game-scrim" />
    <DialogContent class="game-dialog" @escape-key-down="$emit('close')" @pointer-down-outside.prevent @interact-outside.prevent>
      <button class="dialog-close" aria-label="Close explanation" @click="$emit('close')">×</button>
      <span class="dialog-eyebrow">EXPONENTIAL GROWTH ENGINE MODEL</span>
      <DialogTitle>{{ title }}</DialogTitle>
      <DialogDescription as-child><div class="dialog-copy"><slot /></div></DialogDescription>
      <div class="dialog-actions"><slot name="actions" /></div>
    </DialogContent>
  </DialogPortal></DialogRoot>
</template>
<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui';
defineProps<{ title: string }>();
defineEmits<{ close: [] }>();
</script>
