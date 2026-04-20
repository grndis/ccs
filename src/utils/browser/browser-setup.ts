import { spawn } from 'child_process';
import * as fs from 'fs';
import { getBrowserConfig, mutateUnifiedConfig } from '../../config/unified-config-loader';
import type { BrowserConfig } from '../../config/unified-config-types';
import { getCcsPathDisplay } from '../config-manager';
import { type BrowserStatusPayload, getBrowserStatus } from './browser-status';
import { type BrowserRuntimeEnv, resolveBrowserRuntimeEnv } from './chrome-reuse';
import { ensureBrowserMcp } from './mcp-installer';
import {
  buildBrowserLaunchCommands,
  getEffectiveClaudeBrowserAttachConfig,
  getRecommendedBrowserUserDataDir,
  isManagedClaudeBrowserAttachConfig,
  type EffectiveClaudeBrowserAttachConfig,
} from './browser-settings';

export interface BrowserSetupOptions {
  launch?: boolean;
}

export interface BrowserSetupResult {
  configUpdated: boolean;
  createdUserDataDir: boolean;
  launchAttempted: boolean;
  launchStarted: boolean;
  launchCommand: string;
  launchError?: string;
  mcpReady: boolean;
  overrideActive: boolean;
  ready: boolean;
  runtimeEnv?: BrowserRuntimeEnv;
  status: BrowserStatusPayload;
  notes: string[];
}

export interface BrowserSetupDeps {
  getBrowserConfig: typeof getBrowserConfig;
  mutateUnifiedConfig: typeof mutateUnifiedConfig;
  ensureBrowserMcp: typeof ensureBrowserMcp;
  resolveBrowserRuntimeEnv: typeof resolveBrowserRuntimeEnv;
  getBrowserStatus: typeof getBrowserStatus;
  launchBrowserSession: (
    config: EffectiveClaudeBrowserAttachConfig
  ) => Promise<{ launchCommand: string; started: boolean; error?: string }>;
  sleep: (ms: number) => Promise<void>;
}

const defaultBrowserSetupDeps: BrowserSetupDeps = {
  getBrowserConfig,
  mutateUnifiedConfig,
  ensureBrowserMcp,
  resolveBrowserRuntimeEnv,
  getBrowserStatus,
  launchBrowserSession,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function runBrowserSetup(
  options: BrowserSetupOptions = {},
  deps: BrowserSetupDeps = defaultBrowserSetupDeps
): Promise<BrowserSetupResult> {
  const initialConfig = deps.getBrowserConfig();
  const configUpdated = persistBrowserSetupConfig(deps, initialConfig);
  const persistedConfig = deps.getBrowserConfig();
  const effectiveConfig = getEffectiveClaudeBrowserAttachConfig(persistedConfig);
  const createdUserDataDir = ensureBrowserUserDataDir(effectiveConfig.userDataDir);
  const mcpReady = deps.ensureBrowserMcp();
  const notes: string[] = [];

  if (effectiveConfig.overrideActive) {
    notes.push(
      `Current session is using ${effectiveConfig.source}; saved config may still be shadowed until that override is removed.`
    );
  }

  if (!mcpReady) {
    notes.push('CCS could not fully prepare the local browser MCP runtime.');
  }

  let runtimeEnv = await tryResolveBrowserRuntime(effectiveConfig, deps);
  let launchAttempted = false;
  let launchStarted = false;
  let launchError: string | undefined;
  const { launchCommand } = getPreferredLaunchInfo(effectiveConfig);

  if (!runtimeEnv && options.launch !== false) {
    launchAttempted = true;
    const launchResult = await deps.launchBrowserSession(effectiveConfig);
    launchStarted = launchResult.started;
    launchError = launchResult.error;
    runtimeEnv = launchStarted
      ? await waitForBrowserRuntime(effectiveConfig, deps)
      : await tryResolveBrowserRuntime(effectiveConfig, deps);

    if (launchError) {
      notes.push(launchError);
    }
  }

  const status = await deps.getBrowserStatus();
  return {
    configUpdated,
    createdUserDataDir,
    launchAttempted,
    launchStarted,
    launchCommand,
    launchError,
    mcpReady,
    overrideActive: effectiveConfig.overrideActive,
    ready: Boolean(runtimeEnv) && mcpReady,
    runtimeEnv,
    status,
    notes,
  };
}

function persistBrowserSetupConfig(deps: BrowserSetupDeps, currentConfig: BrowserConfig): boolean {
  const before = JSON.stringify(currentConfig);

  deps.mutateUnifiedConfig((config) => {
    const existingBrowser = config.browser ?? currentConfig;
    const currentUserDataDir = existingBrowser.claude.user_data_dir?.trim();

    config.browser = {
      claude: {
        enabled: true,
        user_data_dir: currentUserDataDir || getRecommendedBrowserUserDataDir(),
        devtools_port: currentConfig.claude.devtools_port,
      },
      codex: {
        enabled: existingBrowser.codex.enabled,
      },
    };
  });

  return JSON.stringify(deps.getBrowserConfig()) !== before;
}

function ensureBrowserUserDataDir(userDataDir: string): boolean {
  try {
    fs.statSync(userDataDir);
    return false;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && code !== 'ENOENT') {
      return false;
    }
  }

  try {
    fs.mkdirSync(userDataDir, { recursive: true, mode: 0o700 });
    return true;
  } catch {
    return false;
  }
}

async function tryResolveBrowserRuntime(
  config: EffectiveClaudeBrowserAttachConfig,
  deps: BrowserSetupDeps
): Promise<BrowserRuntimeEnv | undefined> {
  try {
    return await deps.resolveBrowserRuntimeEnv({
      profileDir: config.userDataDir,
      devtoolsPort: config.hasExplicitDevtoolsPort ? String(config.devtoolsPort) : undefined,
    });
  } catch {
    return undefined;
  }
}

async function waitForBrowserRuntime(
  config: EffectiveClaudeBrowserAttachConfig,
  deps: BrowserSetupDeps
): Promise<BrowserRuntimeEnv | undefined> {
  const deadline = Date.now() + 10000;

  while (Date.now() <= deadline) {
    const runtimeEnv = await tryResolveBrowserRuntime(config, deps);
    if (runtimeEnv) {
      return runtimeEnv;
    }

    await deps.sleep(250);
  }

  return undefined;
}

function getPreferredLaunchInfo(config: EffectiveClaudeBrowserAttachConfig): {
  launchCommand: string;
} {
  const userDataDirDisplay = isManagedClaudeBrowserAttachConfig(config)
    ? getCcsPathDisplay('browser', 'chrome-user-data')
    : config.userDataDir;
  const launchCommands = buildBrowserLaunchCommands(userDataDirDisplay, config.devtoolsPort);

  if (process.platform === 'win32') {
    return { launchCommand: launchCommands.win32 };
  }

  if (process.platform === 'darwin') {
    return { launchCommand: launchCommands.darwin };
  }

  return { launchCommand: launchCommands.linux };
}

function getLaunchCandidates(config: EffectiveClaudeBrowserAttachConfig): Array<{
  command: string;
  args: string[];
  displayCommand: string;
}> {
  const launchCommands = buildBrowserLaunchCommands(config.userDataDir, config.devtoolsPort);

  if (process.platform === 'darwin') {
    return [
      {
        command: 'open',
        args: [
          '-na',
          'Google Chrome',
          '--args',
          `--remote-debugging-port=${config.devtoolsPort}`,
          `--user-data-dir=${config.userDataDir}`,
        ],
        displayCommand: launchCommands.darwin,
      },
    ];
  }

  if (process.platform === 'win32') {
    return [
      {
        command: 'chrome.exe',
        args: [
          `--remote-debugging-port=${config.devtoolsPort}`,
          `--user-data-dir=${config.userDataDir}`,
        ],
        displayCommand: launchCommands.win32,
      },
    ];
  }

  return [
    {
      command: 'google-chrome',
      args: [
        `--remote-debugging-port=${config.devtoolsPort}`,
        `--user-data-dir=${config.userDataDir}`,
      ],
      displayCommand: launchCommands.linux,
    },
    {
      command: 'google-chrome-stable',
      args: [
        `--remote-debugging-port=${config.devtoolsPort}`,
        `--user-data-dir=${config.userDataDir}`,
      ],
      displayCommand: launchCommands.linux.replace('google-chrome', 'google-chrome-stable'),
    },
    {
      command: 'chromium',
      args: [
        `--remote-debugging-port=${config.devtoolsPort}`,
        `--user-data-dir=${config.userDataDir}`,
      ],
      displayCommand: launchCommands.linux.replace('google-chrome', 'chromium'),
    },
    {
      command: 'chromium-browser',
      args: [
        `--remote-debugging-port=${config.devtoolsPort}`,
        `--user-data-dir=${config.userDataDir}`,
      ],
      displayCommand: launchCommands.linux.replace('google-chrome', 'chromium-browser'),
    },
  ];
}

async function launchBrowserSession(
  config: EffectiveClaudeBrowserAttachConfig
): Promise<{ launchCommand: string; started: boolean; error?: string }> {
  let lastError: string | undefined;
  const candidates = getLaunchCandidates(config);

  for (const candidate of candidates) {
    const result = await spawnDetached(candidate.command, candidate.args);
    if (result.started) {
      return {
        launchCommand: candidate.displayCommand,
        started: true,
      };
    }

    if (!result.notFound) {
      return {
        launchCommand: candidate.displayCommand,
        started: false,
        error: `CCS could not start the browser automatically. ${result.error}`,
      };
    }

    lastError = result.error;
  }

  return {
    launchCommand: getPreferredLaunchInfo(config).launchCommand,
    started: false,
    error:
      lastError ??
      'CCS could not find a supported Chrome/Chromium executable to launch automatically.',
  };
}

async function spawnDetached(
  command: string,
  args: string[]
): Promise<{ started: boolean; notFound: boolean; error?: string }> {
  return await new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });

      child.once('error', (error) => {
        const errno = error as NodeJS.ErrnoException;
        resolve({
          started: false,
          notFound: errno.code === 'ENOENT',
          error: errno.message,
        });
      });
      child.once('spawn', () => {
        child.unref();
        resolve({ started: true, notFound: false });
      });
    } catch (error) {
      resolve({
        started: false,
        notFound: false,
        error: (error as Error).message,
      });
    }
  });
}
