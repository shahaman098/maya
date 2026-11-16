import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "soft";
export type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-45";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-surface shadow-[inset_0_1px_0_rgba(255,255,255,.16)] hover:bg-accent-hover active:translate-y-px",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-ink/20 hover:bg-surface-2",
  ghost: "text-muted hover:bg-ink/[0.045] hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
  soft: "bg-accent-soft text-accent hover:bg-accent-soft/80",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-10 px-4 text-[13px]",
  lg: "h-11 px-5 text-[13.5px]",
};

export function buttonStyles(options: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  const { variant = "primary", size = "md", className } = options;
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export const inputClass =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-[13px] text-ink shadow-[inset_0_1px_2px_rgba(36,33,28,.03)] transition placeholder:text-faint/80 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10 disabled:opacity-60";

export const textareaClass =
  "scroll-thin w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[13.5px] leading-6 text-ink shadow-[inset_0_1px_2px_rgba(36,33,28,.03)] transition placeholder:text-faint/80 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10 disabled:opacity-60";

export const selectClass =
  "h-10 w-full appearance-none rounded-xl border border-line bg-surface pl-3 pr-9 text-[13px] text-ink transition focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10 disabled:opacity-60";

export type BadgeTone = "neutral" | "accent" | "moss" | "amber" | "outline";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-line bg-paper text-muted",
  accent: "border-accent/15 bg-accent-soft text-accent",
  moss: "border-moss/15 bg-moss-soft text-moss",
  amber: "border-amber/20 bg-amber-soft text-amber",
  outline: "border-line bg-transparent text-muted",
};

export function badgeStyles(tone: BadgeTone = "neutral", className?: string): string {
  return cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
    badgeTones[tone],
    className,
  );
}
