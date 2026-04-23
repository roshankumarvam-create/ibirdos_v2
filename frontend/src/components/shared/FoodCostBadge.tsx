'use client';

interface FoodCostBadgeProps {
  percent: number;
  showBar?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

// Per iBirdOS spec: ≤30% green, 30-35% yellow, >35% red
export function fcStatus(pct: number) {
  if (pct <= 30) return 'green';
  if (pct <= 35) return 'yellow';
  return 'red';
}

export function fcColor(pct: number) {
  const s = fcStatus(pct);
  return s === 'green' ? 'var(--green)' : s === 'yellow' ? 'var(--yellow)' : 'var(--red)';
}

export default function FoodCostBadge({ percent, showBar = false, size = 'md' }: FoodCostBadgeProps) {
  const status = fcStatus(percent);
  const color = fcColor(percent);
  const bgClass = status === 'green' ? 'badge-green' : status === 'yellow' ? 'badge-yellow' : 'badge-red';
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 15 : 13;
  const label = status === 'green' ? 'Good' : status === 'yellow' ? 'Watch' : 'High';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <span className={`badge ${bgClass}`} style={{ fontSize, gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        {percent.toFixed(1)}%
        <span style={{ opacity: 0.7, fontSize: fontSize - 1 }}>{label}</span>
      </span>
      {showBar && (
        <div className="fc-bar" style={{ width: 80 }}>
          <div className="fc-bar-fill" style={{ width: `${Math.min(100, percent * 2.5)}%`, background: color }} />
        </div>
      )}
    </div>
  );
}


