import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";

import { useParticipant } from "./ParticipantProvider";
import { Button } from "./ui";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/datasets", label: "Datasets" },
  { to: "/models", label: "Models" },
  { to: "/prompts", label: "Prompts" },
  { to: "/runs", label: "Runs" },
  { to: "/insights", label: "Insights" },
  { to: "/refinement", label: "Refinement" },
];

export default function Layout() {
  const { workshopMode, participantId, isAdminView, switchParticipant } = useParticipant();

  return (
    <div className="flex min-h-screen w-full bg-ink-50 text-ink-900">
      <aside className="hidden w-60 shrink-0 border-r border-ink-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-ink-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white shadow-sm">
            <BrandMark />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">SLM Benchmark</div>
            <div className="text-xs text-ink-400">Studio</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent-600 text-white shadow-sm"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {workshopMode && (
          <div className="border-t border-ink-200 px-4 py-3">
            <div className="rounded-lg bg-accent-50 px-3 py-2 text-xs">
              <div className="font-medium text-accent-800">
                {isAdminView ? "Instructor view" : "Signed in as"}
              </div>
              <div className="mt-0.5 font-mono text-accent-700">
                {isAdminView ? "All participants" : participantId}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-start px-0 text-accent-700 hover:bg-transparent hover:text-accent-900"
                onClick={switchParticipant}
              >
                Switch user
              </Button>
            </div>
          </div>
        )}
        <div className="border-t border-ink-200 px-4 py-4 text-xs text-ink-500">
        <div className="space-y-2">
          <a
            href="https://github.com/aidul23/slm-benchmark-studio"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-2 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <GithubIcon className="h-4 w-4" />
            GitHub Repository
          </a>

          <a
            href="https://github.com/aidul23/slm-benchmark-studio/issues"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-2 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <SupportIcon className="h-4 w-4" />
            Support / Issues
          </a>
        </div>

        {/* <div className="mt-4 rounded-lg bg-ink-50 px-3 py-2">
          <p className="font-medium text-ink-600">Local-first</p>
          <p className="mt-1 leading-relaxed text-ink-400">
            Ollama: <span className="font-mono">localhost:11434</span>
          </p>
        </div> */}
      </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-ink-200 bg-white px-6 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white shadow-sm">
            <BrandMark />
          </div>
          <div className="font-semibold">SLM Benchmark Studio</div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-6 py-8">
            <div className="flex-1">
              <Outlet />
            </div>
            <Footer />
          </div>
        </main>
      </div>
    </div>
  );
}

function Footer() {
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <footer className="mt-10 border-t border-ink-200 pt-4 pb-6 text-xs text-ink-500">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <span className="font-medium text-ink-700">SLM Benchmark Studio</span>
          <span className="mx-2 text-ink-300">·</span>
          <span>{dateLabel}</span>
        </div>
        <div>
          © {now.getFullYear()} Built by{" "}
          <span className="font-semibold text-ink-700"><a target="_blank" href="https://aidul23.github.io/aidulislam/">Md Aidul Islam</a> & <a target="_blank" href="https://mahade315.github.io/">Md Mahade Hasan</a></span>
        </div>
      </div>
    </footer>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V9" />
      <path d="M10 19V5" />
      <path d="M16 19v-7" />
      <path d="M22 19V14" />
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.866-.014-1.699-2.782.605-3.369-1.343-3.369-1.343-.455-1.158-1.11-1.467-1.11-1.467-.908-.621.069-.609.069-.609 1.004.071 1.532 1.034 1.532 1.034.892 1.531 2.341 1.089 2.91.833.091-.647.35-1.089.636-1.34-2.221-.253-4.555-1.113-4.555-4.951 0-1.094.39-1.988 1.03-2.688-.103-.254-.446-1.274.098-2.656 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.56 9.56 0 0 1 2.504.337c1.909-1.296 2.748-1.026 2.748-1.026.546 1.382.203 2.402.1 2.656.641.7 1.028 1.594 1.028 2.688 0 3.848-2.337 4.695-4.566 4.944.359.31.679.923.679 1.861 0 1.344-.012 2.428-.012 2.758 0 .267.18.578.688.48C19.138 20.2 22 16.447 22 12.021 22 6.484 17.523 2 12 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SupportIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 2-3 4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
