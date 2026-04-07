import { useState } from 'react';
import { ArrowRightLeft, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CliproxyRoutingState, RoutingStrategy } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface RoutingGuidanceCardProps {
  className?: string;
  compact?: boolean;
  state?: CliproxyRoutingState;
  isLoading: boolean;
  isSaving: boolean;
  error?: Error | null;
  onApply: (strategy: RoutingStrategy) => void;
}

const STRATEGY_COPY: Record<RoutingStrategy, { title: string; description: string }> = {
  'round-robin': {
    title: 'Round Robin',
    description: 'Spread requests across matching accounts for even usage.',
  },
  'fill-first': {
    title: 'Fill First',
    description: 'Drain one healthy account first and keep backups untouched until needed.',
  },
};

export function RoutingGuidanceCard({
  className,
  compact = false,
  state,
  isLoading,
  isSaving,
  error,
  onApply,
}: RoutingGuidanceCardProps) {
  const currentStrategy = state?.strategy ?? 'round-robin';
  const [selected, setSelected] = useState<RoutingStrategy>(currentStrategy);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sourceLabel = state?.source === 'live' ? 'Live CLIProxy' : 'Saved startup default';
  const saveDisabled = isLoading || isSaving || !state || selected === currentStrategy;
  const detailToggleLabel = detailsOpen ? 'Hide details' : 'Show details';

  if (compact) {
    const handleApply = (s: RoutingStrategy) => {
      setSelected(s);
      if (s !== currentStrategy) {
        onApply(s);
      }
    };

    return (
      <div className={cn('flex items-center justify-between', className)}>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ArrowRightLeft className="h-3.5 w-3.5" />
          <span>Routing</span>
          {isSaving && <RefreshCw className="ml-0.5 h-3 w-3 shrink-0 animate-spin opacity-50" />}
        </div>

        <div className="flex items-center rounded-md border border-border/50 bg-muted/40 p-0.5">
          {(
            Object.entries(STRATEGY_COPY) as Array<
              [RoutingStrategy, { title: string; description: string }]
            >
          ).map(([strategy, copy]) => {
            const active = selected === strategy;
            return (
              <button
                key={strategy}
                type="button"
                className={cn(
                  'relative z-10 rounded-[4px] px-2 py-0.5 text-[10px] font-medium transition-all duration-200',
                  active
                    ? 'bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 dark:ring-white/10'
                    : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5'
                )}
                onClick={() => handleApply(strategy)}
                disabled={isLoading || isSaving || !!error}
                title={copy.description}
              >
                {copy.title}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className={cn('rounded-xl border border-border/70 bg-background', className)}>
      <div className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-primary">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div className="text-sm font-medium">Routing strategy</div>
            <Badge variant="secondary">{currentStrategy}</Badge>
            {state ? <Badge variant="outline">{sourceLabel}</Badge> : null}
            {state ? <Badge variant="outline">{state.target}</Badge> : null}
          </div>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
            Proxy-wide account rotation. CCS keeps round-robin as the default until you explicitly
            change it.
          </p>
        </div>

        <div className="flex flex-col gap-2 xl:items-end">
          <div className="inline-flex flex-wrap rounded-lg border border-border/70 bg-muted/35 p-1">
            {(
              Object.entries(STRATEGY_COPY) as Array<
                [RoutingStrategy, { title: string; description: string }]
              >
            ).map(([strategy, copy]) => {
              const active = selected === strategy;
              return (
                <button
                  key={strategy}
                  type="button"
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSelected(strategy)}
                  disabled={isLoading || isSaving || !!error}
                >
                  {copy.title}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => setDetailsOpen((open) => !open)}
            >
              {detailsOpen ? (
                <ChevronUp className="mr-1 h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="mr-1 h-3.5 w-3.5" />
              )}
              {detailToggleLabel}
            </Button>
            <Button size="sm" onClick={() => onApply(selected)} disabled={saveDisabled || !!error}>
              {isSaving ? 'Saving...' : `Use ${selected}`}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground xl:col-span-2">
          <span>Round robin spreads usage.</span>
          <span className="hidden text-border sm:inline">•</span>
          <span>Fill first keeps backup accounts cold until they are needed.</span>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm xl:col-span-2">
            {error.message}
          </div>
        ) : null}
        {!error && state?.message ? (
          <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground xl:col-span-2">
            {state.message}
          </div>
        ) : null}

        {detailsOpen ? (
          <div className="grid gap-4 border-t border-border/60 pt-3 md:grid-cols-2 xl:col-span-2">
            {(
              Object.entries(STRATEGY_COPY) as Array<
                [RoutingStrategy, { title: string; description: string }]
              >
            ).map(([strategy, copy]) => {
              const current = currentStrategy === strategy;
              return (
                <div key={strategy} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">{copy.title}</div>
                    {current ? <Badge variant="secondary">Current</Badge> : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{copy.description}</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
