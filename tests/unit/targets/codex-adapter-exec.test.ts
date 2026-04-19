import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const spawnCalls: Array<{
  command: string;
  args: string[];
  options: Record<string, unknown> | undefined;
}> = [];
const originalPlatform = process.platform;

function createMockChild(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  exitCode: number | null;
  killed: boolean;
  pid: number;
  unref: () => EventEmitter;
  kill: () => boolean;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    exitCode: number | null;
    killed: boolean;
    pid: number;
    unref: () => EventEmitter;
    kill: () => boolean;
  };

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.pid = process.pid;
  child.unref = () => child;
  child.kill = () => {
    child.killed = true;
    child.exitCode = 1;
    return true;
  };

  return child;
}

mock.module('child_process', () => ({
  ...childProcess,
  spawn: (...spawnArgs: unknown[]) => {
    const command = String(spawnArgs[0] ?? '');
    const maybeArgs = spawnArgs[1];
    const args = Array.isArray(maybeArgs) ? (maybeArgs as string[]) : [];
    const options = (Array.isArray(maybeArgs) ? spawnArgs[2] : spawnArgs[1]) as
      | Record<string, unknown>
      | undefined;

    spawnCalls.push({ command, args, options });
    return createMockChild();
  },
}));

mock.module('../../../src/utils/signal-forwarder', () => ({
  wireChildProcessSignals: () => {},
}));

import { CodexAdapter } from '../../../src/targets/codex-adapter';
import { buildCodexBrowserMcpOverrides } from '../../../src/utils/browser-codex-overrides';

describe('codex-adapter exec', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-codex-adapter-exec-'));
    spawnCalls.length = 0;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('launches Windows cmd wrappers via cmd.exe when runtime overrides include browser MCP args', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const fakeCodex = path.join(tmpDir, 'codex.cmd');
    fs.writeFileSync(fakeCodex, '');

    const adapter = new CodexAdapter();
    const binaryInfo = {
      path: fakeCodex,
      needsShell: true,
      features: ['config-overrides'],
    };
    const args = adapter.buildArgs('default', ['--version'], {
      profileType: 'default',
      creds: {
        profile: 'default',
        baseUrl: '',
        apiKey: '',
        runtimeConfigOverrides: buildCodexBrowserMcpOverrides(),
      },
      binaryInfo,
    });

    adapter.exec(args, {}, { binaryInfo });

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.options?.shell).toBe('cmd.exe');
    expect(spawnCalls[0]?.command).toContain(fakeCodex);
    expect(spawnCalls[0]?.command).toContain('mcp_servers.ccs_browser.args=');
    expect(spawnCalls[0]?.command).toContain('@playwright/mcp@0.0.70');
  });
});
