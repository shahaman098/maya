import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="Maya home"
      className={cn("group inline-flex items-center gap-2.5", className)}
    >
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-surface shadow-[inset_0_1px_0_rgba(255,255,255,.18)] transition-transform duration-200 group-hover:-rotate-3">
        <span className="font-serif text-[21px] italic leading-none">m</span>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-serif text-[21px] tracking-[-0.02em]">Maya</span>
          <span className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.2em] text-faint">
            Voice studio
          </span>
        </span>
      )}
    </Link>
  );
}
