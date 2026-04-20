import { loadOrCreateUnifiedConfig } from '../config/unified-config-loader';
import { OPENAI_COMPAT_PROXY_DEFAULT_PORT } from './proxy-daemon-paths';

export interface OpenAICompatProxyPortPreference {
  port: number;
  source: 'default' | 'profile';
}

export function resolveOpenAICompatProxyPortPreference(
  profileName: string
): OpenAICompatProxyPortPreference {
  const config = loadOrCreateUnifiedConfig();
  const profilePort = config.proxy?.profile_ports?.[profileName];
  if (typeof profilePort === 'number') {
    return { port: profilePort, source: 'profile' };
  }
  return {
    port: config.proxy?.port ?? OPENAI_COMPAT_PROXY_DEFAULT_PORT,
    source: 'default',
  };
}

export function resolveOpenAICompatProxyPreferredPort(profileName: string): number {
  return resolveOpenAICompatProxyPortPreference(profileName).port;
}
