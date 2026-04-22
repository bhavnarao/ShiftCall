import React, { useId } from 'react';

// Refined sonar-pulse mark. Reads as concentric voice waves emanating from a
// single point — visually communicates "voice AI listening + responding."
// Uses currentColor so it inherits text color for anywhere we want a flat
// monochrome render (e.g., on dark headers). When `accent` is true, we paint
// it with the brand teal-violet gradient instead — reserved for hero spots.

interface LogoMarkProps {
  size?: number;
  accent?: boolean;
  className?: string;
}

export function LogoMark({ size = 24, accent = false, className = '' }: LogoMarkProps) {
  const gid = useId();
  const stroke = accent ? `url(#g-${gid})` : 'currentColor';
  const fill = accent ? `url(#g-${gid})` : 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {accent && (
        <defs>
          <linearGradient id={`g-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>
        </defs>
      )}
      {/* Outer arc — opens slightly to the right to evoke a "shift" / pivot */}
      <path
        d="M 6 16 a 10 10 0 1 1 13.5 9.4"
        stroke={stroke}
        strokeOpacity={accent ? 0.4 : 0.32}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Mid arc */}
      <path
        d="M 10 16 a 6 6 0 1 1 8.2 5.6"
        stroke={stroke}
        strokeOpacity={accent ? 0.75 : 0.65}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Center dot — the signal source */}
      <circle cx="16" cy="16" r="2.4" fill={fill} />
    </svg>
  );
}

interface LogoProps {
  size?: number;
  accent?: boolean;
  className?: string;
}

// Full lockup: mark + wordmark, properly aligned. Use this in headers, auth
// screens, and anywhere the brand name should appear next to the mark.
export function Logo({ size = 22, accent = false, className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} accent={accent} />
      <span
        className="font-semibold text-textMain"
        style={{
          fontSize: Math.round(size * 0.78),
          letterSpacing: '-0.022em',
          lineHeight: 1,
        }}
      >
        ShiftCall
      </span>
    </span>
  );
}
