/** ReverseSpec brand mark — mirrored spec brackets. */

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#0b1326" />
      <defs>
        <linearGradient id="rs-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2e5bff" />
          <stop offset="1" stopColor="#4cd7f6" />
        </linearGradient>
      </defs>
      <path d="M27 16 L15 32 L27 48" fill="none" stroke="#571bc1"
        strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M37 16 L49 32 L37 48" fill="none" stroke="url(#rs-g)"
        strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="3" fill="#b8c3ff" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      {!compact && (
        <span className="font-head text-h3 tracking-tight text-primary">
          ReverseSpec
        </span>
      )}
    </span>
  );
}
