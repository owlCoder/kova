import { memo } from 'react';
import type { ModelInfo } from '../../../packages/protocol/src/ModelInfo.js';

export const ModelPicker = memo(function ModelPicker({
  models,
  model,
  busy,
  onChange,
}: {
  models: readonly ModelInfo[] | undefined;
  model: string;
  busy: boolean;
  onChange(value: string): void;
}) {
  return (
    <select
      aria-label="Model"
      title={model}
      value={model}
      disabled={busy}
      onChange={(event) => onChange(event.target.value)}
    >
      {!models?.some((item) => item.id === model) && (
        <option value={model}>{model || 'Choose model'}</option>
      )}
      {models?.map((item) => (
        <option key={item.id} value={item.id}>
          {item.displayName}
          {item.tools !== 'Supported' ? ' · chat only' : ''}
        </option>
      ))}
    </select>
  );
});
