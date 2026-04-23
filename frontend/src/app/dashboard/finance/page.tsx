'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import FoodCostBadge from '@/components/shared/FoodCostBadge';
import { TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';

const TOOLTIP = {
  contentStyle: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 },
  labelStyle: { color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }
};

function CogsBadge({ pct }: { pct: number }) {
  const p = Number(pct);
  const color = p <= 30 ? 'var(--green)' : p <= 35 ? 'var(--yellow)' : 'var(--red)';
  const label = p <= 30 ? 'Good' : p <= 35 ? 'Watch' : 'High';
  return <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color, fontWeight: 600 }}>{p.toFixed(1)}% {label}</span>;
}

export default function FinancePage() {
  const { user } = useAuthStore();
  const currency = '$';
  const [tab, setTab] = useState<'weekly'|'events'|'cogs'>('weekly');

  const { data: weekly } = useQuery({
    queryKey: ['finance-weekly'],
    queryFn: () => api.get('/finance/weekly?weeks=8').then(r => r.data),
    enabled: tab === 'weekly'
  });

  const { data: eventPL } = useQuery({
    queryKey: ['event-pl'],
    queryFn: () => api.get('/finance/event-pl-summary').then(r => r.data),
    enabled: tab === 'events'
  });

  const { data: cogsData } = useQuery({
    queryKey: ['cogs-overview'],
    queryFn: () => api.get('/finance/cogs-overview').then(r => r.data),
    enabled: tab === 'cogs'
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Finance & P&L</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            COGS target: ≤30% green · 30–35% yellow · &gt;35% red
          </p>
        </div>

        <div style={{ padding: '20px 28px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surface-2)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
            {[{ key: 'weekly', label: 'Weekly P&L' }, { key: 'events', label: 'Event P&L' }, { key: 'cogs', label: 'COGS Overview' }].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)} style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                fontFamily: 'var(--font-body)',
                background: tab === t.key ? 'var(--surface-1)' : 'transparent',
                color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: tab === t.key ? 500 : 400
              }}>{t.label}</button>
            ))}
          </div>

          {/* WEEKLY P&L */}
          {tab === 'weekly' && weekly && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                {[
                  { label: 'Total Revenue (8w)', value: `$${weekly.reduce((s: number, w: any) => s + Number(w.revenue), 0).toLocaleString()}` },
                  { label: 'Gross Profit (8w)', value: `$${weekly.reduce((s: number, w: any) => s + Number(w.gross_profit), 0).toLocaleString()}`, color: 'var(--green)' },
                  { label: 'Avg COGS %', value: weekly.length > 0 ? `${(weekly.reduce((s: number, w: any) => s + Number(w.cogs_pct), 0) / weekly.length).toFixed(1)}%` : '—',
                    color: weekly.length > 0 && (weekly.reduce((s: number, w: any) => s + Number(w.cogs_pct), 0) / weekly.length) <= 30 ? 'var(--green)' : 'var(--yellow)' },
                  { label: 'Total Orders (8w)', value: weekly.reduce((s: number, w: any) => s + Number(w.order_count), 0) }
                ].map(k => (
                  <div key={k.label} className="stat-card">
                    <div className="stat-label">{k.label}</div>
                    <div className="stat-value" style={{ color: (k as any).color || 'var(--text-primary)', fontSize: 20 }}>{k.value}</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div className="card-header"><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Weekly revenue vs food cost</span></div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={[...weekly].reverse()} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="week_start" tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip {...TOOLTIP} formatter={(v: any, n: string) => [`$${Number(v).toLocaleString()}`, n]} />
                      <Area type="monotone" dataKey="revenue" stroke="var(--brand)" strokeWidth={2} fill="url(#wRev)" name="Revenue" />
                      <Area type="monotone" dataKey="food_cost" stroke="var(--red)" strokeWidth={1.5} fill="none" strokeDasharray="4 2" name="Food Cost" />
                      <Area type="monotone" dataKey="gross_profit" stroke="var(--green)" strokeWidth={1.5} fill="none" strokeDasharray="2 2" name="Profit" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Weekly COGS % (target ≤30%)</span></div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={[...weekly].reverse()} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <XAxis dataKey="week_start" tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 50]} tickFormatter={v => `${v}%`} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip {...TOOLTIP} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'COGS']} />
                      <ReferenceLine y={30} stroke="var(--green)" strokeDasharray="4 2" label={{ value: '30%', fill: 'var(--green)', fontSize: 10 }} />
                      <ReferenceLine y={35} stroke="var(--yellow)" strokeDasharray="4 2" label={{ value: '35%', fill: 'var(--yellow)', fontSize: 10 }} />
                      <Bar dataKey="cogs_pct" name="COGS %" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* EVENT P&L */}
          {tab === 'events' && (
            <div className="card">
              <table className="table">
                <thead><tr><th>Event</th><th>Date</th><th>Guests</th><th>Revenue</th><th>Food Cost</th><th>Labor</th><th>Profit</th><th>COGS</th><th>Status</th></tr></thead>
                <tbody>
                  {eventPL?.map((e: any) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{e.name}</td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{new Date(e.event_date).toLocaleDateString()}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.guest_count}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>{currency}{Number(e.total_revenue).toLocaleString()}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{currency}{Number(e.total_food_cost).toLocaleString()}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{currency}{Number(e.total_labor_cost || 0).toLocaleString()}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: Number(e.gross_profit) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {currency}{Number(e.gross_profit).toLocaleString()}
                      </td>
                      <td><CogsBadge pct={e.cogs_pct} /></td>
                      <td><span className={`badge ${e.status === 'completed' ? 'badge-green' : 'badge-blue'}`} style={{ fontSize: 10 }}>{e.status}</span></td>
                    </tr>
                  ))}
                  {(!eventPL || eventPL.length === 0) && <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontSize: 13 }}>No events yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* COGS OVERVIEW */}
          {tab === 'cogs' && cogsData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                {[
                  { label: 'Total recipes', value: cogsData.summary?.total },
                  { label: '✓ Good (≤30%)', value: cogsData.summary?.green, color: 'var(--green)' },
                  { label: '~ Watch (30–35%)', value: cogsData.summary?.yellow, color: 'var(--yellow)' },
                  { label: '! High (>35%)', value: cogsData.summary?.red, color: 'var(--red)' }
                ].map(k => (
                  <div key={k.label} className="stat-card">
                    <div className="stat-label">{k.label}</div>
                    <div className="stat-value" style={{ color: (k as any).color || 'var(--text-primary)', fontSize: 22 }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {cogsData.summary?.red > 0 && (
                <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--red)' }}>
                  <AlertTriangle size={16} /> {cogsData.summary.red} recipe(s) above 35% COGS threshold — review markup or ingredients
                </div>
              )}

              <div className="card">
                <table className="table">
                  <thead><tr><th>Recipe</th><th>Category</th><th>Base cost</th><th>Selling price</th><th>Markup</th><th>COGS</th></tr></thead>
                  <tbody>
                    {cogsData.recipes?.map((r: any) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</td>
                        <td><span className="badge badge-gray" style={{ fontSize: 10 }}>{r.category || '—'}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{currency}{Number(r.base_cost).toFixed(2)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>{currency}{Number(r.selling_price).toFixed(2)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{Number(r.markup_percent).toFixed(0)}%</td>
                        <td><FoodCostBadge percent={parseFloat(r.food_cost_percent)} size="sm" showBar /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


