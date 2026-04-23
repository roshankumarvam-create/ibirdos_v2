'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import FoodCostBadge from '@/components/shared/FoodCostBadge';

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 },
  labelStyle: { color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }
};

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState('30d');
  const currency = '$';

  const { data: summary } = useQuery({
    queryKey: ['analytics-summary', period],
    queryFn: () => api.get(`/analytics/summary?period=${period}`).then(r => r.data)
  });

  const { data: chartData } = useQuery({
    queryKey: ['revenue-chart', period],
    queryFn: () => api.get(`/analytics/revenue-chart?period=${period}`).then(r => r.data)
  });

  const { data: topRecipes } = useQuery({
    queryKey: ['top-recipes'],
    queryFn: () => api.get('/analytics/top-recipes').then(r => r.data)
  });

  const { data: fcTrend } = useQuery({
    queryKey: ['fc-trend'],
    queryFn: () => api.get('/analytics/food-cost-trend').then(r => r.data)
  });

  const fcPieData = fcTrend?.summary ? [
    { name: 'Good (<30%)', value: fcTrend.summary.green, color: 'var(--green)' },
    { name: 'Watch (30-45%)', value: fcTrend.summary.yellow, color: 'var(--yellow)' },
    { name: 'High (>45%)', value: fcTrend.summary.red, color: 'var(--red)' }
  ].filter(d => d.value > 0) : [];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Analytics</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>Profit intelligence · owner view</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['7d','30d','90d'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                background: period === p ? 'var(--brand)' : 'var(--surface-3)',
                color: period === p ? '#0d1117' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)'
              }}>{p}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {[
              { label: 'Revenue', value: `${currency}${Number(summary?.total_revenue || 0).toLocaleString()}` },
              { label: 'Gross profit', value: `${currency}${Number(summary?.gross_profit || 0).toLocaleString()}`, color: 'var(--green)' },
              { label: 'Food cost %', value: `${Number(summary?.food_cost_percent || 0).toFixed(1)}%`,
                color: Number(summary?.food_cost_percent || 0) <= 32 ? 'var(--green)' : Number(summary?.food_cost_percent || 0) <= 45 ? 'var(--yellow)' : 'var(--red)' },
              { label: 'Orders', value: summary?.total_orders || '—' }
            ].map(k => (
              <div key={k.label} className="stat-card">
                <div className="stat-label">{k.label}</div>
                <div className="stat-value" style={{ color: k.color || 'var(--text-primary)', fontSize: 22 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Revenue chart */}
          <div className="card">
            <div className="card-header"><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Revenue vs Food Cost</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--red)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--red)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false}
                    tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                  <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${currency}${(v/1000).toFixed(0)}k`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(val: any, name: string) => [`${currency}${Number(val).toLocaleString()}`, name]} />
                  <Area type="monotone" dataKey="revenue" stroke="var(--brand)" strokeWidth={2} fill="url(#gRev)" name="Revenue" />
                  <Area type="monotone" dataKey="cost" stroke="var(--red)" strokeWidth={1.5} fill="url(#gCost)" name="Food Cost" strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Top recipes */}
            <div className="card">
              <div className="card-header"><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Top recipes — 30 days</span></div>
              <div>
                {topRecipes?.slice(0, 8).map((r: any, i: number) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', width: 18 }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{r.total_servings} served</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--brand)' }}>{currency}{Number(r.total_revenue).toLocaleString()}</div>
                      <FoodCostBadge percent={parseFloat(r.food_cost_percent)} size="sm" />
                    </div>
                  </div>
                ))}
                {(!topRecipes || topRecipes.length === 0) && (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No order data yet</div>
                )}
              </div>
            </div>

            {/* Food cost breakdown */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Recipe health breakdown</span>
                {fcTrend?.summary && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>avg {fcTrend.summary.avg_food_cost_percent}%</span>
                )}
              </div>
              <div className="card-body">
                {fcPieData.length > 0 && (
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={fcPieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} strokeWidth={0}>
                        {fcPieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                  {fcPieData.map(d => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
                      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{d.value} recipes</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


