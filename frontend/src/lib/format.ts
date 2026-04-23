// iBirdOS v2.0 — Global formatters

/**
 * Format a number as USD currency
 * All prices display in $ regardless of company currency setting
 */
export function formatUSD(amount: number | string | null | undefined): string {
  const num = parseFloat(String(amount || 0));
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Format as compact USD (e.g. $1.2k, $4.8M)
 */
export function formatUSDCompact(amount: number | string): string {
  const num = parseFloat(String(amount || 0));
  if (isNaN(num)) return '$0';
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(1)}k`;
  return `$${num.toFixed(2)}`;
}

/**
 * Format percentage with color class
 */
export function cogsColor(pct: number): string {
  if (pct <= 30) return 'var(--green)';
  if (pct <= 35) return 'var(--yellow)';
  return 'var(--red)';
}

export function cogsLabel(pct: number): string {
  if (pct <= 30) return 'Good';
  if (pct <= 35) return 'Watch';
  return 'High';
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Format reminder due date with urgency class
 */
export function reminderUrgency(dueAt: string): 'reminder-due' | 'reminder-soon' | 'reminder-ok' {
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) return 'reminder-due';
  if (diff < 24 * 60 * 60 * 1000) return 'reminder-soon';
  return 'reminder-ok';
}


