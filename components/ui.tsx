"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Info,
  Loader2,
  X,
} from "lucide-react";
import {
  badgeStyles,
  buttonStyles,
  inputClass,
  selectClass,
  textareaClass,
  type BadgeTone,
  type ButtonSize,
  type ButtonVariant,
} from "@/lib/ui";
import { cn } from "@/lib/utils";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={buttonStyles({ variant, size, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-line bg-surface", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={badgeStyles(tone, className)}>{children}</span>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(textareaClass, className)} {...props} />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(selectClass, className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
      />
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-[12px] font-medium text-ink-soft"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11.5px] leading-5 text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11.5px] leading-5 text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-ink-soft">{label}</p>
        {hint && <p className="mt-0.5 text-[11.5px] leading-5 text-faint">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors disabled:opacity-50",
          checked
            ? "border-accent/20 bg-accent"
            : "border-line-strong bg-paper",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-surface shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex flex-wrap rounded-full border border-line bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-[12px] font-medium transition",
            value === option.value
              ? "bg-surface text-ink shadow-[0_1px_3px_rgba(36,33,28,.1)]"
              : "text-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-rise max-h-[92vh] w-full overflow-y-auto rounded-t-[26px] border border-line bg-surface shadow-2xl sm:rounded-[26px]",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <h2 className="font-serif text-[22px] leading-tight">{title}</h2>
            {description && (
              <p className="mt-1 text-[12px] leading-5 text-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 mt-0.5 grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-paper hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <footer className="sticky bottom-0 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong/80 bg-surface/50 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="grid h-11 w-11 place-items-center rounded-full bg-paper text-muted">
        {icon ?? <Info className="h-5 w-5" />}
      </div>
      <h3 className="mt-4 font-serif text-[21px]">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type ToastTone = "default" | "success" | "error";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

const ToastContext = createContext<{
  push: (toast: ToastInput) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.round(Math.random() * 1000);
    setItems((current) => [
      ...current,
      {
        id,
        title: toast.title,
        description: toast.description,
        tone: toast.tone ?? "default",
      },
    ]);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 5200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "animate-rise pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 shadow-xl",
              item.tone === "error"
                ? "border-danger/25"
                : item.tone === "success"
                  ? "border-moss/25"
                  : "border-line",
            )}
          >
            <span
              className={cn(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                item.tone === "error"
                  ? "bg-accent-soft text-danger"
                  : item.tone === "success"
                    ? "bg-moss-soft text-moss"
                    : "bg-paper text-muted",
              )}
            >
              {item.tone === "error" ? (
                <AlertTriangle className="h-3 w-3" />
              ) : item.tone === "success" ? (
                <Check className="h-3 w-3" />
              ) : (
                <Info className="h-3 w-3" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-ink">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 text-[11.5px] leading-5 text-muted">
                  {item.description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() =>
                setItems((current) => current.filter((entry) => entry.id !== item.id))
              }
              className="text-faint transition hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
