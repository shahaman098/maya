"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  FlaskConical,
  Fingerprint,
  History,
  LayoutDashboard,
  Menu,
  PenLine,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { HealthProvider, ModelPill } from "@/components/health";
import { Logo } from "@/components/logo";
import { buttonStyles } from "@/lib/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/write", label: "Write", icon: PenLine },
  { href: "/voice", label: "Voice", icon: Fingerprint },
  { href: "/history", label: "History", icon: History },
  { href: "/lab", label: "Lab", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings },
];

const TITLES: Record<string, string> = {
  "/": "Your writing room",
  "/write": "Write",
  "/voice": "Your voice",
  "/history": "History",
  "/lab": "Lab",
  "/settings": "Settings",
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItems({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
              active
                ? "bg-ink text-paper shadow-[0_1px_0_rgba(255,255,255,.08)_inset]"
                : "text-muted hover:bg-surface hover:text-ink",
            )}
          >
            <Icon
              strokeWidth={1.8}
              className={cn(
                "h-[17px] w-[17px]",
                active
                  ? "text-paper/75"
                  : "text-faint transition group-hover:text-ink-soft",
              )}
            />
            {item.label}
            {active && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function LocalNote() {
  return (
    <div className="rounded-2xl border border-line bg-paper/60 p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-moss">
        <ShieldCheck className="h-3.5 w-3.5" />
        Local by default
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted">
        Samples live in a private SQLite file unless you point Maya at a hosted
        model.
      </p>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const title = TITLES[pathname] ?? "Maya";

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line/80 bg-surface/65 px-5 py-6 backdrop-blur-xl lg:flex">
        <Logo />
        <div className="mt-10 flex-1">
          <NavItems pathname={pathname} />
        </div>
        <LocalNote />
        <div className="mt-4 flex items-center justify-between px-1 text-[10px] text-faint">
          <span>Maya 0.1</span>
          <span>voice studio</span>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-ink lg:hidden"
            >
              <Menu className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>

            <p className="min-w-0 flex-1 truncate font-serif text-[19px] tracking-[-0.01em]">
              {title}
            </p>

            <ModelPill />

            <Link
              href="/write"
              className={cn(
                buttonStyles({ size: "sm", className: "hidden sm:inline-flex" }),
                "gap-1.5",
              )}
            >
              <PenLine className="h-3.5 w-3.5" />
              New rewrite
            </Link>

            <Link
              href="/write"
              aria-label="New rewrite"
              className="grid h-9 w-9 place-items-center rounded-full bg-accent text-surface transition hover:bg-accent-hover sm:hidden"
            >
              <PenLine className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 sm:pt-10 lg:px-8">
          {children}
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div className="animate-fade absolute inset-y-0 left-0 flex w-[282px] flex-col border-r border-line bg-surface px-5 py-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-paper hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-8 flex-1">
              <NavItems pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <LocalNote />
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <HealthProvider>
      <Shell>{children}</Shell>
    </HealthProvider>
  );
}
