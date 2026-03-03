import { describe, expect, it } from 'bun:test';
import { getPresetById, isValidPresetId } from '../../../src/api/services/provider-presets';

describe('provider-presets', () => {
  it('resolves Alibaba Coding Plan preset id', () => {
    const preset = getPresetById('alibaba-coding-plan');
    expect(preset?.id).toBe('alibaba-coding-plan');
    expect(preset?.baseUrl).toBe('https://coding-intl.dashscope.aliyuncs.com/apps/anthropic');
    expect(preset?.defaultProfileName).toBe('albb');
  });

  it('resolves alibaba alias to Alibaba Coding Plan preset', () => {
    const preset = getPresetById('alibaba');
    expect(preset?.id).toBe('alibaba-coding-plan');
  });

  it('treats alibaba alias as a valid preset id', () => {
    expect(isValidPresetId('alibaba')).toBe(true);
  });

  it('resolves canonical km preset id', () => {
    const preset = getPresetById('km');
    expect(preset?.id).toBe('km');
  });

  it('resolves legacy kimi preset alias to km', () => {
    const preset = getPresetById('kimi');
    expect(preset?.id).toBe('km');
  });

  it('resolves preset id with extra whitespace', () => {
    const preset = getPresetById('  km  ');
    expect(preset?.id).toBe('km');
  });

  it('resolves uppercase legacy alias', () => {
    const preset = getPresetById('KIMI');
    expect(preset?.id).toBe('km');
  });

  it('treats legacy kimi alias as a valid preset id', () => {
    expect(isValidPresetId('kimi')).toBe(true);
  });

  it('uses non-reserved default profile name for qwen API preset', () => {
    const preset = getPresetById('qwen');
    expect(preset?.defaultProfileName).toBe('qwen-api');
  });
});
