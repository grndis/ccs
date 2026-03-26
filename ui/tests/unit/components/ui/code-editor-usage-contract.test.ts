import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const boundedConsumers = [
  {
    file: 'src/pages/cliproxy-ai-providers.tsx',
    expectedCount: 2,
  },
  {
    file: 'src/components/cliproxy/provider-editor/raw-editor-section.tsx',
    expectedCount: 1,
  },
  {
    file: 'src/components/profiles/editor/raw-editor-section.tsx',
    expectedCount: 1,
  },
  {
    file: 'src/components/copilot/config-form/raw-editor-section.tsx',
    expectedCount: 1,
  },
  {
    file: 'src/components/compatible-cli/raw-json-settings-editor-panel.tsx',
    expectedCount: 1,
  },
  {
    file: 'src/components/shared/settings-dialog.tsx',
    expectedCount: 1,
  },
] as const;

describe('bounded CodeEditor consumers', () => {
  it.each(boundedConsumers)('$file opts into fill-parent mode for every bounded editor', ({
    file,
    expectedCount,
  }) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    const matches = source.match(/heightMode="fill-parent"/g) ?? [];

    expect(matches).toHaveLength(expectedCount);
  });
});
