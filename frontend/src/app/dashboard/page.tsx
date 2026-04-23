'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '@/lib/api';
import { useAuthStore, canSeeFinancials, isManager, roleDashboard } from '@/lib/auth';
import { formatUSD, formatUSDCompact, cogsColor } from '@/lib/format';
import Sidebar from '@/components/shared/Sidebar';
import FoodCostBadge from '@/components/shared/FoodCostBadge';
import { AlertTriangle, TrendingUp, TrendingDown, RefreshCw, ArrowRight } from 'lucide-react';

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 },
  labelStyle: { color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }
};

function StatCard({ label, value, sub, trend, color }: any) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          {trend === 'up' && <TrendingUp size={11} color="var(--green)" />}
          {trend === 'down' && <TrendingDown size={11} color="var(--red)" />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  // ✅ CLEAN REDIRECT SYSTEM
  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }

    // central routing
    router.push(roleDashboard(user.role));

  }, [user]);

  const showFinancials = user ? canSeeFinancials(user.role) : false;
  const showManager = user ? isManager(user.role) : false;

  const { data: summary, refetch } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => api.get('/analytics/summary?period=7d').then(r => r.data),
    enabled: showFinancials
  });

  const { data: chartData } = useQuery({
    queryKey: ['revenue-chart'],
    queryFn: () => api.get('/analytics/revenue-chart?period=30d').then(r => r.data),
    enabled: showFinancials
  });

  const { data: alertData } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get('/alerts?unread_only=true&limit=5').then(r => r.data),
    refetchInterval: 60000
  });

  const { data: recipes } = useQuery({
    queryKey: ['recipes-fc'],
    queryFn: () => api.get('/analytics/food-cost-trend').then(r => r.data),
    enabled: showFinancials
  });

  const { data: orders } = useQuery({
    queryKey: ['orders-recent'],
    queryFn: () => api.get('/orders?limit=5').then(r => r.data),
    enabled: showManager
  });

  if (!user) return null;

  const alertCount = alertData?.unread_count || 0;
  const fcPct = Number(summary?.food_cost_percent || 0);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar alertCount={alertCount} />

      <main style={{ flex: 1 }}>
        {/* HEADER */}
        <div style={{ padding: 20, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <h1>{showFinancials ? 'Profit Dashboard' : 'Operations Dashboard'}</h1>
            <p>{user.company_name}</p>
          </div>
          <button onClick={() => refetch()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div style={{ padding: 20 }}>

          {/* MANAGER NOTICE */}
          {user.role === 'manager' && (
            <div style={{ marginBottom: 20 }}>
              Manager view — financial data restricted
            </div>
          )}

          {/* OWNER STATS */}
          {showFinancials && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              <StatCard label="Revenue" value={formatUSDCompact(summary?.total_revenue || 0)} />
              <StatCard label="Profit" value={formatUSDCompact(summary?.gross_profit || 0)} />
              <StatCard label="Food Cost %" value={`${fcPct.toFixed(1)}%`} color={cogsColor(fcPct)} />
              <StatCard label="Orders" value={summary?.total_orders || 0} />
            </div>
          )}

          {/* MANAGER STATS */}
          {!showFinancials && showManager && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <StatCard label="Orders" value={orders?.length || 0} />
              <StatCard label="Pending" value={orders?.filter((o:any)=>o.status==='pending').length || 0} />
              <StatCard label="Alerts" value={alertCount} />
            </div>
          )}

          {/* CHART */}
          {showFinancials && chartData && (
            <div style={{ marginTop: 30 }}>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Area dataKey="revenue" stroke="#6366f1" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ALERTS */}
          <div style={{ marginTop: 30 }}>
            <h3>Alerts</h3>
            {alertData?.alerts?.map((a:any)=>(
              <div key={a.id} style={{ padding: 10 }}>
                <AlertTriangle size={14}/> {a.title}
              </div>
            ))}
          </div>

          {/* RECIPES */}
          {showFinancials && recipes && (
            <div style={{ marginTop: 30 }}>
              <h3>Recipes</h3>
              {recipes.recipes?.slice(0,5).map((r:any)=>(
                <div key={r.id} style={{ display:'flex', justifyContent:'space-between' }}>
                  {r.name}
                  <FoodCostBadge percent={parseFloat(r.food_cost_percent)} />
                </div>
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}