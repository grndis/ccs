import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const hookPath = join(process.cwd(), 'lib', 'hooks', 'websearch-transformer.cjs');
type HookOutput = {
  hookSpecificOutput: {
    additionalContext: string;
    hookEventName: string;
    permissionDecision: string;
    permissionDecisionReason: string;
  };
};

const hook = require('../../../lib/hooks/websearch-transformer.cjs') as {
  buildFailureHookOutput: (
    query: string,
    errors: Array<{ provider: string; error: string }>
  ) => HookOutput;
  buildSuccessHookOutput: (
    query: string,
    providerName: string,
    content: string
  ) => HookOutput;
  extractDuckDuckGoResults: (html: string, count: number) => Array<{
    title: string;
    url: string;
    description: string;
  }>;
  formatStructuredSearchResults: (
    query: string,
    providerName: string,
    results: Array<{ title: string; url: string; description: string }>
  ) => string;
};

function runHookWithMockedFetch(mode: 'success' | 'failure') {
  const tempDir = mkdtempSync(join(tmpdir(), 'websearch-hook-'));
  const preloadPath = join(tempDir, 'mock-fetch.cjs');
  const html = `
    <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
    <a class="result__snippet">Example snippet</a>
  `.trim();
  const preloadScript =
    mode === 'success'
      ? `global.fetch = async () => ({ ok: true, text: async () => ${JSON.stringify(html)} });\n`
      : `global.fetch = async () => ({ ok: false, status: 503, text: async () => 'Service unavailable' });\n`;

  writeFileSync(preloadPath, preloadScript, 'utf8');

  try {
    return spawnSync('node', ['-r', preloadPath, hookPath], {
      encoding: 'utf8',
      input: JSON.stringify({
        tool_name: 'WebSearch',
        tool_input: { query: 'btc price' },
      }),
      env: {
        ...process.env,
        CCS_WEBSEARCH_ENABLED: '1',
        CCS_WEBSEARCH_SKIP: '0',
        CCS_WEBSEARCH_BRAVE: '0',
        CCS_WEBSEARCH_DUCKDUCKGO: '1',
        CCS_WEBSEARCH_EXA: '0',
        CCS_WEBSEARCH_GEMINI: '0',
        CCS_WEBSEARCH_GROK: '0',
        CCS_WEBSEARCH_OPENCODE: '0',
        CCS_WEBSEARCH_TAVILY: '0',
      },
    });
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

describe('websearch-transformer hook helpers', () => {
  it('extracts DuckDuckGo results and unwraps uddg redirect URLs', () => {
    const html = `
      <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example title</a>
      <a class="result__snippet">Example snippet</a>
      <a class="result__a" href="https://second.example.com/post">Second title</a>
      <a class="result__snippet">Second snippet</a>
    `;

    const results = hook.extractDuckDuckGoResults(html, 2);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Example title',
      url: 'https://example.com/article',
      description: 'Example snippet',
    });
    expect(results[1]).toEqual({
      title: 'Second title',
      url: 'https://second.example.com/post',
      description: 'Second snippet',
    });
  });

  it('formats structured search results for hook deny output', () => {
    const formatted = hook.formatStructuredSearchResults('ccs websearch', 'DuckDuckGo', [
      {
        title: 'Result title',
        url: 'https://example.com',
        description: 'Result snippet',
      },
    ]);

    expect(formatted).toContain('CCS local WebSearch evidence');
    expect(formatted).toContain('Provider: DuckDuckGo');
    expect(formatted).toContain('Query: "ccs websearch"');
    expect(formatted).toContain('Result count: 1');
    expect(formatted).toContain('1. Result title');
    expect(formatted).toContain('URL: https://example.com');
    expect(formatted).toContain('Snippet: Result snippet');
    expect(formatted).not.toContain('Use these results to answer the user directly.');
  });

  it('builds a structured success hook output with short deny reason and additional context', () => {
    const output = hook.buildSuccessHookOutput(
      'btc price',
      'Exa',
      'CCS local WebSearch evidence\nProvider: Exa'
    );

    expect(output.hookSpecificOutput).toEqual({
      additionalContext: 'CCS local WebSearch evidence\nProvider: Exa',
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'CCS already retrieved WebSearch results locally via Exa. Use the provided context instead of calling native WebSearch for "btc price".',
    });
    expect(output).not.toHaveProperty('decision');
    expect(output).not.toHaveProperty('reason');
    expect(output).not.toHaveProperty('additionalContext');
  });

  it('builds a concise failure hook output with provider failure details in additional context', () => {
    const output = hook.buildFailureHookOutput('btc price', [
      { provider: 'Exa', error: 'Exa timed out' },
      { provider: 'DuckDuckGo', error: 'DuckDuckGo returned 503' },
    ]);

    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toBe(
      'CCS could not complete local WebSearch for "btc price". Native WebSearch is unavailable for this profile.'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'Attempted providers: Exa: Exa timed out'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'DuckDuckGo: DuckDuckGo returned 503'
    );
  });

  it('emits runtime success output with additionalContext nested under hookSpecificOutput', () => {
    const result = runHookWithMockedFetch('success');

    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');

    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'CCS local WebSearch evidence'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain('Provider: DuckDuckGo');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'URL: https://example.com/article'
    );
    expect(output).not.toHaveProperty('additionalContext');
  });

  it('emits runtime failure output with attempted provider details nested under hookSpecificOutput', () => {
    const result = runHookWithMockedFetch('failure');

    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe('');

    const output = JSON.parse(result.stdout.trim()) as HookOutput;
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain(
      'Native WebSearch is unavailable for this profile.'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'CCS local WebSearch failed for "btc price".'
    );
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'Attempted providers: DuckDuckGo: DuckDuckGo returned 503'
    );
    expect(output).not.toHaveProperty('additionalContext');
  });
});
