import clsx from "clsx";
import type { BenchmarkRun } from "../types";

interface Props {
  run: BenchmarkRun;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, "0")}m`;
}

export default function ProgressPanel({ run }: Props) {
  const total = run.progress_total || 0;
  const done = Math.min(run.progress_done || 0, total);
  const ratio = total > 0 ? done / total : 0;
  const percent = Math.round(ratio * 100);

  const startedAt = run.started_at ? new Date(run.started_at).getTime() : null;
  const completedAt = run.completed_at ? new Date(run.completed_at).getTime() : null;
  const now = Date.now();
  const elapsed = startedAt ? (completedAt ?? now) - startedAt : 0;
  const eta =
    run.status === "running" && startedAt && done > 0 && done < total
      ? (elapsed / done) * (total - done)
      : null;

  const isActive = run.status === "running" || run.status === "pending";
  const isFailed = run.status === "failed";

  const barColor = isFailed
    ? "bg-red-500"
    : run.status === "completed"
      ? "bg-emerald-500"
      : "bg-accent-600";

  return (
    <section
      className={clsx(
        "rounded-2xl border bg-white shadow-sm",
        isFailed ? "border-red-200" : "border-ink-200",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "inline-flex h-2.5 w-2.5 rounded-full",
              isActive && "animate-pulse",
              isFailed
                ? "bg-red-500"
                : run.status === "completed"
                  ? "bg-emerald-500"
                  : "bg-accent-500",
            )}
          />
          <div>
            <h2 className="text-base font-semibold text-ink-800">
              {labelForStatus(run)}
            </h2>
            {run.current_activity && (
              <p className="mt-0.5 truncate font-mono text-xs text-ink-500">
                {run.current_activity}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          {run.current_phase && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-600">
              phase: {run.current_phase}
            </span>
          )}
          {startedAt && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-600">
              elapsed: {formatDuration(elapsed)}
            </span>
          )}
          {eta != null && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
              ETA: ~{formatDuration(eta)}
            </span>
          )}
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="flex items-center justify-between text-xs font-medium text-ink-500">
          <span>
            {done.toLocaleString()} / {total.toLocaleString()} outputs
          </span>
          <span>{percent}%</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={clsx(
              "h-full rounded-full transition-[width] duration-500",
              barColor,
              isActive && "bg-[length:1rem_1rem] bg-progress-stripes animate-stripe-shift",
            )}
            style={{ width: `${Math.max(percent, total > 0 && done > 0 ? 3 : 0)}%` }}
          />
        </div>

        {run.error && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {run.error}
          </p>
        )}
      </div>
    </section>
  );
}

function labelForStatus(run: BenchmarkRun): string {
  switch (run.status) {
    case "pending":
      return "Queued — waiting to start";
    case "running":
      return run.current_phase === "judging"
        ? "Judging outputs…"
        : run.current_phase === "finalizing"
          ? "Finalizing run…"
          : "Generating outputs…";
    case "completed":
      return "Run completed";
    case "failed":
      return "Run failed";
    default:
      return "Run status";
  }
}
