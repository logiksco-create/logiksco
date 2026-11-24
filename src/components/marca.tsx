import { cn } from "@/lib/formato";

/** Isotipo: una ruta que conecta dos nodos (origen → destino). */
export function Isotipo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id="lk-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f6bff" />
          <stop offset="1" stopColor="#14c8b4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lk-g)" />
      <path
        d="M9 21.5c0-5 3.2-6.5 7-6.5s7-1.5 7-6.5"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="9" cy="22" r="2.6" fill="white" />
      <circle cx="23" cy="9.5" r="2.6" fill="white" fillOpacity="0.85" />
    </svg>
  );
}

export function Logo({ className, claro }: { className?: string; claro?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Isotipo />
      <span
        className={cn(
          "text-[17px] font-semibold tracking-tight",
          claro ? "text-white" : "text-fg",
        )}
      >
        LOGIKS<span className="text-accent">.CO</span>
      </span>
    </span>
  );
}
