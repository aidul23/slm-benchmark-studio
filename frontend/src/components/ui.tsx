import clsx from "clsx";
import { ButtonHTMLAttributes, ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function Card({ children, className, title, description, actions }: CardProps) {
  return (
    <section
      className={clsx(
        "rounded-2xl border border-ink-200 bg-white shadow-sm",
        className,
      )}
    >
      {(title || description || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-ink-800">{title}</h2>}
            {description && (
              <p className="mt-1 text-sm text-ink-500">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variant === "primary" && "bg-accent-600 text-white hover:bg-accent-700",
        variant === "secondary" &&
          "border border-ink-200 bg-white text-ink-700 hover:bg-ink-100",
        variant === "ghost" && "text-ink-600 hover:bg-ink-100",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className,
      )}
    >
      {children}
    </button>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "warning";
}

export function Stat({ label, value, hint, tone = "default" }: StatProps) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div
        className={clsx(
          "mt-2 text-2xl font-semibold",
          tone === "good" && "text-emerald-600",
          tone === "warning" && "text-amber-600",
          tone === "default" && "text-ink-900",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}

interface BadgeProps {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "danger" | "info";
  className?: string;
}

export function Badge({ children, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-ink-100 text-ink-700",
        tone === "good" && "bg-emerald-100 text-emerald-700",
        tone === "warning" && "bg-amber-100 text-amber-700",
        tone === "danger" && "bg-red-100 text-red-700",
        tone === "info" && "bg-sky-100 text-sky-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function Input({ label, hint, className, ...rest }: InputProps) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block font-medium text-ink-700">{label}</span>}
      <input
        {...rest}
        className={clsx(
          "block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30",
          className,
        )}
      />
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
}

export function Textarea({ label, hint, className, ...rest }: TextareaProps) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block font-medium text-ink-700">{label}</span>}
      <textarea
        {...rest}
        className={clsx(
          "block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed shadow-sm transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30",
          className,
        )}
      />
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export function Select({ label, hint, className, children, ...rest }: SelectProps) {
  return (
    <label className="block text-sm">
      {label && <span className="mb-1 block font-medium text-ink-700">{label}</span>}
      <select
        {...rest}
        className={clsx(
          "block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30",
          className,
        )}
      >
        {children}
      </select>
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-10 text-center">
      <h3 className="text-sm font-semibold text-ink-700">{title}</h3>
      {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-ink-500">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
      {message}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: BadgeProps["tone"] =
    status === "completed"
      ? "good"
      : status === "running"
        ? "info"
        : status === "failed"
          ? "danger"
          : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}
