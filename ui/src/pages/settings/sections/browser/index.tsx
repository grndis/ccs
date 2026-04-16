import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Monitor,
  RefreshCw,
  SearchCheck,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrowserConfig, useRawConfig } from '../../hooks';
import type { BrowserConfig } from '../../types';

function getPlatformKey(): 'darwin' | 'linux' | 'win32' {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'darwin';
  if (platform.includes('win')) return 'win32';
  return 'linux';
}

function parsePortDraft(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const port = Number.parseInt(value.trim(), 10);
  if (port < 1 || port > 65535) {
    return null;
  }

  return port;
}

function statusTone(state: string) {
  if (state === 'ready' || state === 'enabled') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (state === 'disabled') {
    return 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300';
  }
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

function stateLabel(state: string) {
  return state.replaceAll('_', ' ');
}

function buildLaunchCommand(
  userDataDir: string,
  devtoolsPort: number,
  platform: 'darwin' | 'linux' | 'win32'
): string {
  const quotedPath = JSON.stringify(userDataDir);
  if (platform === 'darwin') {
    return `open -na "Google Chrome" --args --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
  }
  if (platform === 'win32') {
    return `chrome.exe --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
  }
  return `google-chrome --remote-debugging-port=${devtoolsPort} --user-data-dir=${quotedPath}`;
}

function updateClaudeDraft(
  source: BrowserConfig,
  updates: Partial<BrowserConfig['claude']>
): BrowserConfig {
  return {
    ...source,
    claude: {
      ...source.claude,
      ...updates,
    },
  };
}

function updateCodexDraft(
  source: BrowserConfig,
  updates: Partial<BrowserConfig['codex']>
): BrowserConfig {
  return {
    ...source,
    codex: {
      ...source.codex,
      ...updates,
    },
  };
}

export default function BrowserSection() {
  const { t } = useTranslation();
  const { fetchRawConfig } = useRawConfig();
  const {
    config,
    status,
    loading,
    statusLoading,
    saving,
    error,
    success,
    fetchConfig,
    fetchStatus,
    saveConfig,
  } = useBrowserConfig();

  const [draft, setDraft] = useState<BrowserConfig | null>(null);
  const [claudePortDraft, setClaudePortDraft] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (!actionMessage && !success) return;
    const timer = window.setTimeout(() => setActionMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [actionMessage, success]);

  const effectiveConfig = draft ?? config;
  const preferredLaunchCommand = useMemo(() => {
    if (!effectiveConfig) return '';
    return buildLaunchCommand(
      effectiveConfig.claude.userDataDir,
      effectiveConfig.claude.devtoolsPort,
      getPlatformKey()
    );
  }, [effectiveConfig]);

  const displayedClaudePort =
    claudePortDraft ?? String(effectiveConfig?.claude.devtoolsPort ?? 9222);
  const claudePort = parsePortDraft(displayedClaudePort);
  const claudePortInvalid = displayedClaudePort.trim().length > 0 && claudePort === null;

  const hasClaudeChanges =
    config !== null &&
    effectiveConfig !== null &&
    (config.claude.enabled !== effectiveConfig.claude.enabled ||
      config.claude.userDataDir !== effectiveConfig.claude.userDataDir ||
      config.claude.devtoolsPort !== claudePort);
  const hasCodexChanges =
    config !== null &&
    effectiveConfig !== null &&
    config.codex.enabled !== effectiveConfig.codex.enabled;

  const refreshAll = useCallback(async () => {
    setActionMessage(null);
    setDraft(null);
    setClaudePortDraft(null);
    await Promise.all([fetchConfig(), fetchRawConfig()]);
  }, [fetchConfig, fetchRawConfig]);

  const refreshStatus = useCallback(async () => {
    const nextStatus = await fetchStatus();
    if (nextStatus) {
      setActionMessage(t('settingsPage.browserSection.messages.statusRefreshed'));
    }
  }, [fetchStatus, t]);

  const saveClaudeSettings = useCallback(async () => {
    if (!effectiveConfig || claudePort === null) return;

    const saved = await saveConfig({
      claude: {
        enabled: effectiveConfig.claude.enabled,
        userDataDir: effectiveConfig.claude.userDataDir.trim(),
        devtoolsPort: claudePort,
      },
    });

    if (saved) {
      await fetchRawConfig();
      setActionMessage(null);
      setDraft(null);
      setClaudePortDraft(null);
    }
  }, [claudePort, effectiveConfig, fetchRawConfig, saveConfig]);

  const saveCodexSettings = useCallback(async () => {
    if (!effectiveConfig) return;

    const saved = await saveConfig({
      codex: {
        enabled: effectiveConfig.codex.enabled,
      },
    });

    if (saved) {
      await fetchRawConfig();
      setActionMessage(null);
      setDraft(null);
      setClaudePortDraft(null);
    }
  }, [effectiveConfig, fetchRawConfig, saveConfig]);

  const copyLaunchCommand = useCallback(async () => {
    if (!preferredLaunchCommand) return;
    await navigator.clipboard.writeText(preferredLaunchCommand);
    setActionMessage(t('settingsPage.browserSection.messages.launchCommandCopied'));
  }, [preferredLaunchCommand, t]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span>{t('settings.loading')}</span>
        </div>
      </div>
    );
  }

  if (!config || !status || !effectiveConfig) {
    return (
      <div className="p-5">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error ?? t('settingsPage.browserSection.description')}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('sharedPage.retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'absolute left-5 right-5 top-20 z-10 transition-all duration-200 ease-out',
          error || success || actionMessage
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-2 opacity-0'
        )}
      >
        {error && (
          <Alert variant="destructive" className="py-2 shadow-lg">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && (success || actionMessage) && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 shadow-lg dark:border-emerald-900/50 dark:bg-emerald-950/80 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">
              {actionMessage ?? t('commonToast.settingsSaved')}
            </span>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">{t('settingsPage.browserSection.title')}</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('settingsPage.browserSection.description')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={saving || loading}>
              <RefreshCw className={cn('mr-2 h-4 w-4', statusLoading && 'animate-spin')} />
              {t('settings.refresh')}
            </Button>
          </div>

          <Alert>
            <Wrench className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">{t('settingsPage.browserSection.primaryTitle')}</span>{' '}
              {t('settingsPage.browserSection.primaryDescription')}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{t('settingsPage.browserSection.claude.title')}</CardTitle>
                  <CardDescription>
                    {t('settingsPage.browserSection.claude.description')}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={statusTone(status.claude.state)}>
                  {stateLabel(status.claude.state)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <Label htmlFor="browser-claude-enabled">
                    {t('settingsPage.browserSection.claude.enabledLabel')}
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('settingsPage.browserSection.claude.enabledDescription')}
                  </p>
                </div>
                <Switch
                  id="browser-claude-enabled"
                  checked={effectiveConfig.claude.enabled}
                  onCheckedChange={(next) =>
                    setDraft((current) =>
                      updateClaudeDraft(current ?? effectiveConfig, { enabled: next })
                    )
                  }
                  aria-label={t('settingsPage.browserSection.claude.enabledLabel')}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="browser-claude-user-data-dir">
                    {t('settingsPage.browserSection.claude.userDataDir')}
                  </Label>
                  <Input
                    id="browser-claude-user-data-dir"
                    value={effectiveConfig.claude.userDataDir}
                    onChange={(event) =>
                      setDraft((current) =>
                        updateClaudeDraft(current ?? effectiveConfig, {
                          userDataDir: event.target.value,
                        })
                      )
                    }
                    placeholder={status.claude.recommendedUserDataDir}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settingsPage.browserSection.claude.userDataDirHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="browser-claude-devtools-port">
                    {t('settingsPage.browserSection.claude.devtoolsPort')}
                  </Label>
                  <Input
                    id="browser-claude-devtools-port"
                    value={displayedClaudePort}
                    onChange={(event) => setClaudePortDraft(event.target.value)}
                    inputMode="numeric"
                  />
                  <p
                    className={cn(
                      'text-xs text-muted-foreground',
                      claudePortInvalid && 'text-destructive'
                    )}
                  >
                    {claudePortInvalid
                      ? t('settingsPage.browserSection.claude.devtoolsPortInvalid')
                      : t('settingsPage.browserSection.claude.devtoolsPortHint')}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.readiness')}
                  </p>
                  <p className="mt-1 font-medium">{status.claude.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{status.claude.detail}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.nextStep')}
                  </p>
                  <p className="mt-1 text-sm">{status.claude.nextStep}</p>
                </div>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.claude.effectivePath')}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs">
                    {status.claude.effectiveUserDataDir}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('settingsPage.browserSection.claude.recommendedPath')}:{' '}
                    {status.claude.recommendedUserDataDir}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.claude.managedRuntime')}
                  </p>
                  <p className="mt-1">{status.claude.managedMcpServerName}</p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    {status.claude.managedMcpServerPath}
                  </p>
                </div>
              </div>

              {status.claude.overrideActive ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('settingsPage.browserSection.claude.overrideMessage', {
                      source: status.claude.source,
                    })}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {t('settingsPage.browserSection.claude.launchGuidance')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('settingsPage.browserSection.claude.launchGuidanceHint')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyLaunchCommand}
                    disabled={!preferredLaunchCommand}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t('settingsPage.browserSection.actions.copyLaunchCommand')}
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  <code>{preferredLaunchCommand}</code>
                </pre>
                {status.claude.runtimeEnv?.CCS_BROWSER_DEVTOOLS_HTTP_URL ? (
                  <p className="text-xs text-muted-foreground">
                    DevTools: {status.claude.runtimeEnv.CCS_BROWSER_DEVTOOLS_HTTP_URL}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={saveClaudeSettings}
                  disabled={saving || claudePortInvalid || !hasClaudeChanges}
                >
                  {saving ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {t('settingsPage.browserSection.actions.saveClaude')}
                </Button>
                <Button
                  variant="outline"
                  onClick={refreshStatus}
                  disabled={saving || statusLoading || hasClaudeChanges || claudePortInvalid}
                >
                  <SearchCheck className="mr-2 h-4 w-4" />
                  {t('settingsPage.browserSection.actions.testConnection')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{t('settingsPage.browserSection.codex.title')}</CardTitle>
                  <CardDescription>
                    {t('settingsPage.browserSection.codex.description')}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={statusTone(status.codex.state)}>
                  {stateLabel(status.codex.state)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <Label htmlFor="browser-codex-enabled">
                    {t('settingsPage.browserSection.codex.enabledLabel')}
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('settingsPage.browserSection.codex.enabledDescription')}
                  </p>
                </div>
                <Switch
                  id="browser-codex-enabled"
                  checked={effectiveConfig.codex.enabled}
                  onCheckedChange={(next) =>
                    setDraft((current) =>
                      updateCodexDraft(current ?? effectiveConfig, { enabled: next })
                    )
                  }
                  aria-label={t('settingsPage.browserSection.codex.enabledLabel')}
                />
              </div>

              <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.readiness')}
                  </p>
                  <p className="mt-1 font-medium">{status.codex.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{status.codex.detail}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.nextStep')}
                  </p>
                  <p className="mt-1 text-sm">{status.codex.nextStep}</p>
                </div>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.codex.serverName')}
                  </p>
                  <p className="mt-1 font-mono text-xs">{status.codex.serverName}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.codex.overrideSupport')}
                  </p>
                  <p className="mt-1">
                    {status.codex.supportsConfigOverrides
                      ? t('settingsPage.browserSection.codex.overrideSupported')
                      : t('settingsPage.browserSection.codex.overrideUnsupported')}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('settingsPage.browserSection.codex.binary')}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs">
                    {status.codex.binaryPath ?? t('settingsPage.browserSection.codex.notDetected')}
                  </p>
                  {status.codex.version ? (
                    <p className="mt-2 text-xs text-muted-foreground">{status.codex.version}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveCodexSettings} disabled={saving || !hasCodexChanges}>
                  {saving ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {t('settingsPage.browserSection.actions.saveCodex')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
