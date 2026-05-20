import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";

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
        <div className="border-t border-ink-200 px-5 py-4 text-xs text-ink-400">
          <p className="font-medium text-ink-500">Local-first</p>
          <p className="mt-1 leading-relaxed">
            Powered by Ollama at <span className="font-mono">localhost:11434</span>
          </p>
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
          <span className="font-semibold text-ink-700">Md Aidul Islam</span>
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
