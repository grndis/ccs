import * as browserUtils from '../utils/browser';
import { getCcsPathDisplay } from '../utils/config-manager';
import { getNodePlatformKey } from '../utils/browser/platform';
import { color, dim, header, initUI, subheader } from '../utils/ui';

type HelpWriter = (line: string) => void;

function summarizeBrowserHealth(status: browserUtils.BrowserStatusPayload): {
  label: 'ready' | 'partial' | 'action required';
  exitCode: 0 | 1;
} {
  const claudeNeedsAttention = status.claude.enabled && status.claude.state !== 'ready';
  if (claudeNeedsAttention) {
    return { label: 'action required', exitCode: 1 };
  }

  if (status.codex.enabled && status.codex.state !== 'enabled') {
    return { label: 'partial', exitCode: 0 };
  }

  return { label: 'ready', exitCode: 0 };
}

function writeCommandTable(writeLine: HelpWriter): void {
  writeLine(subheader('Commands'));
  writeLine(
    `  ${color('ccs browser setup', 'command')}   Configure Claude Browser Attach and try to start the managed browser session`
  );
  writeLine(
    `  ${color('ccs browser status', 'command')}  Show Claude attach and Codex browser readiness`
  );
  writeLine(
    `  ${color('ccs browser doctor', 'command')}  Explain what is missing and how to fix it`
  );
  writeLine(
    `  ${color('ccs browser doctor --fix', 'command')}  ${dim('# Alias for browser setup')}`
  );
  writeLine('');
}

function writeIntro(writeLine: HelpWriter): void {
  writeLine('  Claude Browser Attach reuses a local Chrome session for Claude-target launches.');
  writeLine(
    '  Codex Browser Tools inject managed Playwright MCP overrides into Codex-target launches.'
  );
  writeLine('');
}

function writeClaudeStatus(
  status: browserUtils.BrowserStatusPayload['claude'],
  writeLine: HelpWriter,
  includeLaunchGuidance: boolean
): void {
  const userDataDirDisplay =
    status.effectiveUserDataDir === status.recommendedUserDataDir
      ? getCcsPathDisplay('browser', 'chrome-user-data')
      : status.effectiveUserDataDir;

  writeLine(subheader('Claude Browser Attach'));
  writeLine(`  State: ${status.state}`);
  writeLine(`  Enabled: ${status.enabled ? 'yes' : 'no'}`);
  writeLine(`  Source: ${status.source}${status.overrideActive ? ' (env override active)' : ''}`);
  writeLine(`  User data dir: ${userDataDirDisplay}`);
  writeLine(`  DevTools port: ${status.devtoolsPort}`);
  writeLine(`  Managed MCP: ${status.managedMcpServerName}`);
  writeLine(`  Managed path: ${status.managedMcpServerPath}`);
  if (status.runtimeEnv?.CCS_BROWSER_DEVTOOLS_HTTP_URL) {
    writeLine(`  DevTools endpoint: ${status.runtimeEnv.CCS_BROWSER_DEVTOOLS_HTTP_URL}`);
  }
  writeLine(`  Detail: ${status.detail}`);
  writeLine(`  Next step: ${status.nextStep}`);
  if (includeLaunchGuidance && status.enabled && status.state !== 'ready') {
    const platform = getNodePlatformKey();
    writeLine(`  Launch command (${platform}): ${status.launchCommands[platform]}`);
  }
  writeLine('');
}

function writeCodexStatus(
  status: browserUtils.BrowserStatusPayload['codex'],
  writeLine: HelpWriter
): void {
  writeLine(subheader('Codex Browser Tools'));
  writeLine(`  State: ${status.state}`);
  writeLine(`  Enabled: ${status.enabled ? 'yes' : 'no'}`);
  writeLine(`  Managed server: ${status.serverName}`);
  writeLine(`  Supports overrides: ${status.supportsConfigOverrides ? 'yes' : 'no'}`);
  writeLine(`  Codex binary: ${status.binaryPath || 'not detected'}`);
  if (status.version) {
    writeLine(`  Codex version: ${status.version}`);
  }
  writeLine(`  Detail: ${status.detail}`);
  writeLine(`  Next step: ${status.nextStep}`);
  writeLine('');
}

function writeSetupSummary(
  result: browserUtils.BrowserSetupResult,
  writeLine: HelpWriter,
  label: string
): void {
  writeLine(subheader('Overall'));
  writeLine(`  Command: ${label}`);
  writeLine(`  Result: ${result.ready ? 'ready' : 'action required'}`);
  writeLine(`  Config updated: ${result.configUpdated ? 'yes' : 'no'}`);
  writeLine(`  Created user-data dir: ${result.createdUserDataDir ? 'yes' : 'no'}`);
  writeLine(`  Browser MCP ready: ${result.mcpReady ? 'yes' : 'no'}`);
  if (result.launchAttempted) {
    writeLine(`  Browser launch: ${result.launchStarted ? 'started' : 'failed'}`);
  }
  writeLine(`  Launch command: ${result.launchCommand}`);
  if (result.notes.length > 0) {
    for (const note of result.notes) {
      writeLine(`  Note: ${note}`);
    }
  }
  writeLine('');
}

export async function showBrowserHelp(writeLine: HelpWriter = console.log): Promise<void> {
  await initUI();
  writeLine(header('CCS Browser Help'));
  writeLine('');
  writeIntro(writeLine);
  writeLine(subheader('Usage'));
  writeLine(`  ${color('ccs browser <setup|status|doctor>', 'command')}`);
  writeLine(`  ${color('ccs help browser', 'command')}`);
  writeLine('');
  writeCommandTable(writeLine);
  writeLine(subheader('What Each Lane Does'));
  writeLine('  Claude Browser Attach expects a Chrome user-data dir and remote debugging port.');
  writeLine('  Codex Browser Tools depend on a Codex build that supports --config overrides.');
  writeLine('');
  writeLine(subheader('Examples'));
  writeLine(
    `  ${color('ccs browser setup', 'command')}   ${dim('# Configure and start the managed browser session')}`
  );
  writeLine(
    `  ${color('ccs browser setup --no-launch', 'command')}  ${dim('# Save setup only, do not start Chrome')}`
  );
  writeLine(
    `  ${color('ccs browser doctor', 'command')}  ${dim('# Detailed troubleshooting output')}`
  );
  writeLine(
    `  ${color('ccs browser doctor --fix', 'command')}  ${dim('# Run the setup flow from doctor')}`
  );
  writeLine(
    `  ${color('ccs config', 'command')}          ${dim('# Open Settings > Browser in the dashboard')}`
  );
  writeLine('');
}

function isHelpRequest(args: string[]): boolean {
  return args.length === 0 || args.includes('--help') || args.includes('-h');
}

export async function handleBrowserCommand(
  args: string[],
  writeLine: HelpWriter = console.log
): Promise<void> {
  if (isHelpRequest(args)) {
    await showBrowserHelp(writeLine);
    return;
  }

  const subcommand = args[0];
  if (subcommand === 'setup' || (subcommand === 'doctor' && args.includes('--fix'))) {
    await initUI();
    const result = await browserUtils.runBrowserSetup({
      launch: !args.includes('--no-launch'),
    });

    const label = subcommand === 'setup' ? 'ccs browser setup' : 'ccs browser doctor --fix';
    writeLine(header(label));
    writeLine('');
    writeIntro(writeLine);
    writeSetupSummary(result, writeLine, label);
    writeClaudeStatus(result.status.claude, writeLine, !result.ready);
    writeCodexStatus(result.status.codex, writeLine);
    process.exitCode = result.ready ? 0 : 1;
    return;
  }

  if (subcommand !== 'status' && subcommand !== 'doctor') {
    await initUI();
    writeLine(color(`Unknown browser subcommand: ${subcommand}`, 'error'));
    writeLine('');
    writeLine(`  ${dim('Supported subcommands: setup, status, doctor')}`);
    writeLine('');
    process.exitCode = 1;
    return;
  }

  await initUI();
  const status = await browserUtils.getBrowserStatus();

  writeLine(header(`ccs browser ${subcommand}`));
  writeLine('');
  writeIntro(writeLine);

  if (subcommand === 'doctor') {
    const summary = summarizeBrowserHealth(status);
    writeLine(subheader('Overall'));
    writeLine(`  Claude Browser Attach: ${status.claude.title}`);
    writeLine(`  Codex Browser Tools: ${status.codex.title}`);
    writeLine(`  Result: ${summary.label}`);
    writeLine('');
  }

  writeClaudeStatus(status.claude, writeLine, subcommand === 'doctor');
  writeCodexStatus(status.codex, writeLine);

  if (subcommand === 'doctor') {
    process.exitCode = summarizeBrowserHealth(status).exitCode;
  }
}
