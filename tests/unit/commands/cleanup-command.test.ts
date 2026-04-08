import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleCleanupCommand } from '../../../src/commands/cleanup-command';
import { getCliproxyDir } from '../../../src/cliproxy/config-generator';
import { getNativeLogsDir } from '../../../src/services/logging';

describe('cleanup command', () => {
  let tempHome = '';
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-cleanup-command-'));
    process.env.CCS_HOME = tempHome;
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    fs.rmSync(tempHome, { recursive: true, force: true });
    tempHome = '';
  });

  it('reports only top-level log sizes in dry-run mode', async () => {
    const ccsLogsDir = getNativeLogsDir();
    const archiveDir = path.join(ccsLogsDir, 'archive');
    const cliproxyLogsDir = path.join(getCliproxyDir(), 'logs');

    fs.mkdirSync(archiveDir, { recursive: true });
    fs.mkdirSync(cliproxyLogsDir, { recursive: true });
    fs.writeFileSync(path.join(ccsLogsDir, 'current.jsonl'), 'x'.repeat(100));
    fs.writeFileSync(path.join(archiveDir, 'archived.jsonl.gz'), 'y'.repeat(2_000));

    const logSpy = spyOn(console, 'log').mockImplementation(() => {});

    try {
      await handleCleanupCommand(['--dry-run']);

      const output = logSpy.mock.calls
        .flatMap((call) => call.map((value) => String(value)))
        .join('\n');

      expect(output).toContain('CCS Logs: 1 files (100.00 B)');
      expect(output).toContain('Would delete 1 files (100.00 B)');
      expect(output).not.toContain('1.95 KB');
    } finally {
      logSpy.mockRestore();
    }
  });
});
