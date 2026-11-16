export function QrLogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="8" fill="#0F172A" />
      <rect x="7" y="7" width="10" height="10" rx="2" stroke="#FFFFFF" strokeWidth="2.4" />
      <rect x="10.5" y="10.5" width="3" height="3" rx="0.5" fill="#FFFFFF" />
      <rect x="23" y="7" width="10" height="10" rx="2" stroke="#FFFFFF" strokeWidth="2.4" />
      <rect x="26.5" y="10.5" width="3" height="3" rx="0.5" fill="#FFFFFF" />
      <rect x="7" y="23" width="10" height="10" rx="2" stroke="#FFFFFF" strokeWidth="2.4" />
      <rect x="10.5" y="26.5" width="3" height="3" rx="0.5" fill="#FFFFFF" />
      <rect x="23" y="23" width="4" height="4" rx="1" fill="#10B981" />
      <rect x="29" y="23" width="4" height="4" rx="1" fill="#FFFFFF" />
      <rect x="23" y="29" width="4" height="4" rx="1" fill="#FFFFFF" />
      <rect x="29" y="29" width="4" height="4" rx="1" fill="#FFFFFF" />
    </svg>
  );
}
