import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UnifiedConfig } from '../../../../src/config/unified-config-types';
import { runBrowserSetup, type BrowserSetupDeps } from '../../../../src/utils/browser/browser-setup';

function createUnifiedConfig(userDataDir: string): UnifiedConfig {
  return {
    version: 12,
    default: undefined,
    profiles: {},
    profile_targets: {},
    copilot: {
      enabled: false,
      prompt: '',
      command: '',
      args: [],
      env: {},
      auto_install: false,
    },
    cursor: {
      enabled: false,
      model: '',
      port: 3891,
      daemon_mode: false,
      auth: {
        token: '',
      },
    },
    websearch: {
      enabled: false,
      providers: {},
    },
    browser: {
      claude: {
        enabled: false,
        user_data_dir: userDataDir,
        devtools_port: 9222,
      },
      codex: {
        enabled: true,
      },
    },
    image_analysis: {
      enabled: false,
      providers: {},
    },
    global_env: {},
    cliproxy_server: {
      mode: 'local',
      remote: {
        enabled: false,
        host: '',
        port: 0,
        protocol: 'http',
        auth_token: '',
        management_key: '',
      },
      local: {
        port: 8085,
        auto_start: true,
      },
    },
    cliproxy_safety: {
      concurrent_limit: 1,
      cooldown_seconds: 0,
      shared_responsibility: false,
    },
    quota_management: {
      enabled: false,
    },
    thinking: {
      mode: 'auto',
      show_warnings: true,
    },
    official_channels: {
      enabled: false,
      selected: [],
      unattended: false,
    },
    dashboard_auth: {
      enabled: false,
      users: [],
      session_secret: '',
    },
    logging: {
      enabled: true,
      profile_starts: true,
      delegation_calls: true,
      proxy_requests: false,
      quota_polls: false,
    },
  };
}

describe('browser setup', () => {
  let tempDir = '';

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('enables Claude browser attach and returns ready without launching when runtime already resolves', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-setup-'));
    const config = createUnifiedConfig(join(tempDir, 'browser-profile'));

    const deps: BrowserSetupDeps = {
      getBrowserConfig: () => config.browser,
      mutateUnifiedConfig: (mutator) => {
        mutator(config);
        return config;
      },
      ensureBrowserMcp: () => true,
      resolveBrowserRuntimeEnv: async () => ({
        CCS_BROWSER_USER_DATA_DIR: config.browser.claude.user_data_dir,
        CCS_BROWSER_DEVTOOLS_HOST: '127.0.0.1',
        CCS_BROWSER_DEVTOOLS_PORT: '9222',
        CCS_BROWSER_DEVTOOLS_HTTP_URL: 'http://127.0.0.1:9222',
        CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/test',
      }),
      getBrowserStatus: async () =>
        ({
          claude: {
            enabled: true,
            source: 'config',
            overrideActive: false,
            state: 'ready',
            title: 'Claude Browser Attach is ready.',
            detail: 'ready',
            nextStep: 'Launch Claude.',
            effectiveUserDataDir: config.browser.claude.user_data_dir,
            recommendedUserDataDir: config.browser.claude.user_data_dir,
            devtoolsPort: 9222,
            managedMcpServerName: 'ccs-browser',
            managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
            launchCommands: {
              darwin: 'open -na "Google Chrome" --args',
              linux: 'google-chrome --remote-debugging-port=9222',
              win32: 'chrome.exe --remote-debugging-port=9222',
            },
          },
          codex: {
            enabled: true,
            state: 'enabled',
            title: 'Codex Browser Tools are enabled.',
            detail: 'ready',
            nextStep: 'Use Codex.',
            serverName: 'ccs_browser',
            supportsConfigOverrides: true,
            binaryPath: '/usr/local/bin/codex',
          },
        }) as Awaited<ReturnType<BrowserSetupDeps['getBrowserStatus']>>,
      launchBrowserSession: async () => ({
        launchCommand: 'open -na "Google Chrome" --args --remote-debugging-port=9222',
        started: false,
      }),
      sleep: async () => undefined,
    };

    const result = await runBrowserSetup({ launch: false }, deps);

    expect(result.configUpdated).toBe(true);
    expect(result.createdUserDataDir).toBe(true);
    expect(result.launchAttempted).toBe(false);
    expect(result.ready).toBe(true);
    expect(config.browser.claude.enabled).toBe(true);
  });

  it('launches the browser session when runtime is not ready initially', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ccs-browser-setup-'));
    const config = createUnifiedConfig(join(tempDir, 'browser-profile'));
    let resolveCalls = 0;

    const deps: BrowserSetupDeps = {
      getBrowserConfig: () => config.browser,
      mutateUnifiedConfig: (mutator) => {
        mutator(config);
        return config;
      },
      ensureBrowserMcp: () => true,
      resolveBrowserRuntimeEnv: async () => {
        resolveCalls += 1;
        if (resolveCalls < 2) {
          throw new Error('Chrome reuse metadata not found');
        }

        return {
          CCS_BROWSER_USER_DATA_DIR: config.browser.claude.user_data_dir,
          CCS_BROWSER_DEVTOOLS_HOST: '127.0.0.1',
          CCS_BROWSER_DEVTOOLS_PORT: '9222',
          CCS_BROWSER_DEVTOOLS_HTTP_URL: 'http://127.0.0.1:9222',
          CCS_BROWSER_DEVTOOLS_WS_URL: 'ws://127.0.0.1/devtools/browser/test',
        };
      },
      getBrowserStatus: async () =>
        ({
          claude: {
            enabled: true,
            source: 'config',
            overrideActive: false,
            state: 'ready',
            title: 'Claude Browser Attach is ready.',
            detail: 'ready',
            nextStep: 'Launch Claude.',
            effectiveUserDataDir: config.browser.claude.user_data_dir,
            recommendedUserDataDir: config.browser.claude.user_data_dir,
            devtoolsPort: 9222,
            managedMcpServerName: 'ccs-browser',
            managedMcpServerPath: '/tmp/ccs-browser-server.cjs',
            launchCommands: {
              darwin: 'open -na "Google Chrome" --args',
              linux: 'google-chrome --remote-debugging-port=9222',
              win32: 'chrome.exe --remote-debugging-port=9222',
            },
          },
          codex: {
            enabled: true,
            state: 'enabled',
            title: 'Codex Browser Tools are enabled.',
            detail: 'ready',
            nextStep: 'Use Codex.',
            serverName: 'ccs_browser',
            supportsConfigOverrides: true,
            binaryPath: '/usr/local/bin/codex',
          },
        }) as Awaited<ReturnType<BrowserSetupDeps['getBrowserStatus']>>,
      launchBrowserSession: async () => ({
        launchCommand: 'open -na "Google Chrome" --args --remote-debugging-port=9222',
        started: true,
      }),
      sleep: async () => undefined,
    };

    const result = await runBrowserSetup({}, deps);

    expect(result.launchAttempted).toBe(true);
    expect(result.launchStarted).toBe(true);
    expect(result.ready).toBe(true);
    expect(resolveCalls).toBeGreaterThanOrEqual(2);
  });
});
