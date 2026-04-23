'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Sidebar from '@/components/shared/Sidebar';
import { AlertTriangle, TrendingUp, TrendingDown, Package, Flame, CheckCheck, Trash2 } from 'lucide-react';

const ALERT_ICONS: Record<string, any> = {
  price_increase: TrendingUp,
  price_decrease: TrendingDown,
  low_stock: Package,
  high_food_cost: Flame,
  waste_threshold: AlertTriangle,
  recipe_cost_changed: Flame,
  trial_ending: AlertTriangle,
  payment_failed: AlertTriangle,
};

const ALERT_COLORS: Record<string, string> = {
  critical: 'var(--red)',
  warning: 'var(--yellow)',
  info: 'var(--blue)'
};

export default function AlertsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['alerts-all'],
    queryFn: () => api.get('/alerts?limit=100').then(r => r.data),
    refetchInterval: 30_000
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.put(`/alerts/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts-all'] })
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put('/alerts/read-all'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['alerts-all'] }); toast.success('All alerts marked as read'); }
  });

  const resolve = useMutation({
    mutationFn: (id: string) => api.delete(`/alerts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts-all'] })
  });

  const alerts = data?.alerts || [];
  const unread = data?.unread_count || 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar alertCount={unread} />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Alerts</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {unread} unread · auto-refreshes every 30s
            </p>
          </div>
          {unread > 0 && (
            <button onClick={() => markAllRead.mutate()} className="btn btn-ghost" style={{ fontSize: 13 }}>
              <CheckCheck size={15} /> Mark all read
            </button>
          )}
        </div>

        <div style={{ padding: '20px 28px', maxWidth: 800 }}>
          {/* Severity filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {['all','critical','warning','info'].map(f => (
              <span key={f} className="badge badge-gray" style={{ cursor: 'pointer', fontSize: 12, padding: '5px 12px', textTransform: 'capitalize' }}>{f}</span>
            ))}
          </div>

          {alerts.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
              <CheckCheck size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
              <div style={{ fontSize: 15, marginBottom: 6 }}>All clear</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>No alerts right now</div>
            </div>
          )}

          {alerts.map((alert: any) => {
            const Icon = ALERT_ICONS[alert.type] || AlertTriangle;
            const color = ALERT_COLORS[alert.severity] || 'var(--text-secondary)';
            return (
              <div key={alert.id} style={{
                background: alert.is_read ? 'var(--surface-1)' : 'var(--surface-2)',
                border: `1px solid ${alert.is_read ? 'var(--border)' : color + '40'}`,
                borderLeft: `3px solid ${alert.is_read ? 'var(--border)' : color}`,
                borderRadius: 10, padding: '16px 18px', marginBottom: 10,
                display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'all 0.2s'
              }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color={color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: alert.is_read ? 400 : 600, color: 'var(--text-primary)', marginBottom: 4 }}>{alert.title}</div>
                  {alert.body && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>{alert.body}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 12 }}>
                    <span>{new Date(alert.created_at).toLocaleString()}</span>
                    <span className={`badge ${alert.severity === 'critical' ? 'badge-red' : alert.severity === 'warning' ? 'badge-yellow' : 'badge-blue'}`} style={{ fontSize: 10 }}>{alert.severity}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {!alert.is_read && (
                    <button onClick={() => markRead.mutate(alert.id)} className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 12 }} title="Mark as read">
                      <CheckCheck size={14} />
                    </button>
                  )}
                  <button onClick={() => resolve.mutate(alert.id)} className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 12, color: 'var(--red)' }} title="Dismiss">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}


