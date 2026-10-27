export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span className={`brand ${inverse ? "brand-inverse" : ""}`} aria-label="Nexo Assist">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4 27V6.5c0-1.2 1.4-1.9 2.4-1.1L22 19V5h6v21c0 1.2-1.4 1.9-2.4 1.1L10 13.5V27z" fill="currentColor" />
      </svg>
      {!compact && <strong>Nexo Assist</strong>}
    </span>
  );
}
