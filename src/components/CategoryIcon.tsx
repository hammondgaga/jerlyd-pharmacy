type Props = { categoryId: string; className?: string };

export function CategoryIcon({ categoryId, className = "" }: Props) {
  const cn = `category-icon ${className}`.trim();
  switch (categoryId) {
    case "anti_malaria":
      return (
        <svg className={cn} viewBox="0 0 48 48" fill="none" aria-hidden>
          <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path
            d="M16 28c2-6 6-10 8-10s6 4 8 10M14 20h4M30 20h4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "antibiotics":
      return (
        <svg className={cn} viewBox="0 0 48 48" fill="none" aria-hidden>
          <rect x="14" y="10" width="20" height="28" rx="10" stroke="currentColor" strokeWidth="2" />
          <path d="M24 10v28M14 24h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "pain_relief":
      return (
        <svg className={cn} viewBox="0 0 48 48" fill="none" aria-hidden>
          <path
            d="M24 8v32M8 24h32"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.35"
          />
          <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "supplements":
      return (
        <svg className={cn} viewBox="0 0 48 48" fill="none" aria-hidden>
          <path
            d="M12 32h24l-4-20H16l-4 20zM18 18h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "vitamins":
      return (
        <svg className={cn} viewBox="0 0 48 48" fill="none" aria-hidden>
          <circle cx="24" cy="28" r="12" stroke="currentColor" strokeWidth="2" />
          <path d="M24 8v8M24 36v4M8 28h4M36 28h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg className={cn} viewBox="0 0 48 48" fill="none" aria-hidden>
          <rect x="12" y="18" width="24" height="16" rx="8" stroke="currentColor" strokeWidth="2" />
          <path d="M18 18V14a6 6 0 0112 0v4" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}

export function PillPlaceholder({ className = "" }: { className?: string }) {
  return (
    <svg className={`pill-placeholder ${className}`.trim()} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="8" y="24" width="48" height="16" rx="8" fill="currentColor" fillOpacity="0.12" />
      <rect x="8" y="24" width="48" height="16" rx="8" stroke="currentColor" strokeWidth="2" />
      <line x1="32" y1="24" x2="32" y2="40" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
