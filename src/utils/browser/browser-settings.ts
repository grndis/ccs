import * as path from 'path';
import type { BrowserConfig } from '../../config/unified-config-types';
import { getCcsDir } from '../config-manager';
import { expandPath } from '../helpers';

export type BrowserOverrideSource = 'CCS_BROWSER_USER_DATA_DIR' | 'CCS_BROWSER_PROFILE_DIR';

export interface EffectiveClaudeBrowserAttachConfig {
  enabled: boolean;
  source: 'config' | BrowserOverrideSource;
  overrideActive: boolean;
  userDataDir: string;
  devtoolsPort: number;
  hasExplicitDevtoolsPort: boolean;
}

export function getRecommendedBrowserUserDataDir(): string {
  return path.join(getCcsDir(), 'browser', 'chrome-user-data');
}

export function resolveBrowserUserDataDir(value?: string): string | undefined {
  return value?.trim() ? expandPath(value) : undefined;
}

export function getBrowserAttachOverride(env: NodeJS.ProcessEnv = process.env): {
  userDataDir?: string;
  devtoolsPort?: number;
  source?: BrowserOverrideSource;
} {
  const explicitUserDataDir = resolveBrowserUserDataDir(env.CCS_BROWSER_USER_DATA_DIR);
  if (explicitUserDataDir) {
    return {
      userDataDir: explicitUserDataDir,
      devtoolsPort: parseDevtoolsPort(env.CCS_BROWSER_DEVTOOLS_PORT),
      source: 'CCS_BROWSER_USER_DATA_DIR',
    };
  }

  const legacyProfileDir = resolveBrowserUserDataDir(env.CCS_BROWSER_PROFILE_DIR);
  if (legacyProfileDir) {
    return {
      userDataDir: legacyProfileDir,
      devtoolsPort: parseDevtoolsPort(env.CCS_BROWSER_DEVTOOLS_PORT),
      source: 'CCS_BROWSER_PROFILE_DIR',
    };
  }

  return {};
}

export function getEffectiveClaudeBrowserAttachConfig(
  config: BrowserConfig,
  env: NodeJS.ProcessEnv = process.env
): EffectiveClaudeBrowserAttachConfig {
  const override = getBrowserAttachOverride(env);
  const configUserDataDir =
    resolveBrowserUserDataDir(config.claude.user_data_dir) ?? getRecommendedBrowserUserDataDir();
  const configPort = normalizeDevtoolsPort(config.claude.devtools_port);

  if (override.userDataDir) {
    return {
      enabled: true,
      source: override.source as BrowserOverrideSource,
      overrideActive: true,
      userDataDir: override.userDataDir,
      devtoolsPort: override.devtoolsPort ?? configPort,
      hasExplicitDevtoolsPort: override.devtoolsPort !== undefined,
    };
  }

  return {
    enabled: config.claude.enabled,
    source: 'config',
    overrideActive: false,
    userDataDir: configUserDataDir,
    devtoolsPort: configPort,
    hasExplicitDevtoolsPort: true,
  };
}

function parseDevtoolsPort(value?: string): number | undefined {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return normalizeDevtoolsPort(Number.parseInt(value.trim(), 10));
}

function normalizeDevtoolsPort(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 9222;
  }

  const port = Math.floor(value as number);
  if (port < 1 || port > 65535) {
    return 9222;
  }

  return port;
}
