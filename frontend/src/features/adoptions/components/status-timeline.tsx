import { Check, CircleDashed, X } from 'lucide-react';
import { STATUS_FLOW, STATUS_META, type Application, type ApplicationStatus } from '@/types/adoption';
import { cn } from '@/lib/utils';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Shows progress along the happy path, with rejected/withdrawn rendered as a terminal detour
 * rather than a missing step — an application that ended early did not simply stall.
 */
export function StatusTimeline({ application }: { application: Application }) {
  const { status, statusHistory } = application;
  const ended = status === 'rejected' || status === 'withdrawn';

  const reachedAt = new Map<ApplicationStatus, string>();
  for (const entry of statusHistory) {
    if (!reachedAt.has(entry.status)) reachedAt.set(entry.status, entry.at);
  }

  const currentIndex = STATUS_FLOW.indexOf(status);
  const steps = ended
    ? // Everything actually reached, then the terminal state.
      [...STATUS_FLOW.filter((s) => reachedAt.has(s)), status]
    : STATUS_FLOW;

  return (
    <ol className="flex flex-col">
      {steps.map((step, index) => {
        const isTerminal = ended && index === steps.length - 1;
        const stepIndex = STATUS_FLOW.indexOf(step);
        const isDone = !ended && stepIndex < currentIndex;
        const isCurrent = !ended && stepIndex === currentIndex;
        const at = reachedAt.get(step);
        const meta = STATUS_META[step];

        const historyNote = statusHistory.find((entry) => entry.status === step && entry.note)?.note;

        return (
          <li key={`${step}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full',
                  isTerminal && step === 'rejected' && 'bg-destructive/10 text-destructive',
                  isTerminal && step === 'withdrawn' && 'bg-muted text-muted-foreground',
                  isDone && 'bg-success/15 text-success',
                  isCurrent && 'bg-brand-gradient text-white',
                  !isDone && !isCurrent && !isTerminal && 'bg-muted text-muted-foreground',
                )}
              >
                {isTerminal ? (
                  <X className="size-4" />
                ) : isDone ? (
                  <Check className="size-4" />
                ) : isCurrent ? (
                  <Check className="size-4" />
                ) : (
                  <CircleDashed className="size-4" />
                )}
              </span>

              {index < steps.length - 1 ? (
                <span
                  className={cn('my-1 w-0.5 flex-1', isDone ? 'bg-success/40' : 'bg-border')}
                  aria-hidden="true"
                />
              ) : null}
            </div>

            <div className={cn('flex-1', index < steps.length - 1 && 'pb-6')}>
              <p
                className={cn(
                  'font-medium',
                  !isDone && !isCurrent && !isTerminal && 'text-muted-foreground',
                )}
              >
                {meta.label}
                {isCurrent ? (
                  <span className="text-primary-strong ml-2 text-xs font-semibold">Current</span>
                ) : null}
              </p>

              {at ? (
                <p className="text-muted-foreground text-xs">{formatDate(at)}</p>
              ) : (
                <p className="text-muted-foreground text-xs">Not yet</p>
              )}

              {(isCurrent || isTerminal) && meta.description ? (
                <p className="text-muted-foreground mt-1 text-sm">{meta.description}</p>
              ) : null}

              {historyNote ? (
                <div className="bg-muted/50 mt-2 rounded-lg p-3">
                  <p className="text-muted-foreground mb-0.5 text-xs">Note from the shelter</p>
                  <p className="text-sm">{historyNote}</p>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
