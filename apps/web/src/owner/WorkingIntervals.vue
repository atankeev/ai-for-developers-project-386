<script setup lang="ts">
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import type { WorkingInterval } from '@call-calendar/api-contract';
const intervals = defineModel<WorkingInterval[] | null>({ required: true });
const props = withDefaults(
  defineProps<{
    context: string;
    error?: string;
    addLabel?: string;
    addAriaLabel?: string;
    removeLabel?: string;
    removeAriaLabel?: (index: number) => string;
  }>(),
  { addLabel: 'Добавить интервал', removeLabel: 'Удалить' },
);
</script>
<template>
  <div v-for="(interval, index) in intervals ?? []" :key="index" class="working-interval">
    <label
      >Начало<InputText
        v-model="interval.start"
        :aria-label="`${context}: начало ${index + 1}`"
        :aria-invalid="!!error"
        placeholder="HH:mm"
    /></label>
    <label
      >Конец<InputText
        v-model="interval.end"
        :aria-label="`${context}: конец ${index + 1}`"
        :aria-invalid="!!error"
        placeholder="HH:mm"
    /></label>
    <Button
      :label="removeLabel"
      :aria-label="props.removeAriaLabel?.(index) ?? `Удалить интервал ${index + 1}: ${context}`"
      severity="secondary"
      @click="intervals = intervals!.filter((_, position) => position !== index)"
    />
  </div>
  <p v-if="error" role="alert">{{ error }}</p>
  <Button
    :label="addLabel"
    :aria-label="addAriaLabel ?? `${addLabel}: ${context}`"
    severity="secondary"
    @click="intervals = [...(intervals ?? []), { start: '09:00', end: '18:00' }]"
  />
</template>
