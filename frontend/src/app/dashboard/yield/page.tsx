'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import { Scale, TrendingDown, Plus, Camera, Loader, ChevronDown } from 'lucide-react';

function CogsBar({ pct }: { pct: number }) {
  const color = pct <= 30 ? 'var(--green)' : pct <= 35 ? 'var(--yellow)' : 'var(--red)';
  const label = pct <= 30 ? 'Good' : pct <= 35 ? 'Watch' : 'High';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct * 2)}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color, fontWeight: 600, minWidth: 50 }}>
        {pct.toFixed(1)}% {label}
      </span>
    </div>
  );
}

export default function YieldPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showLog, setShowLog] = useState(false);
  const [form, setForm] = useState({
    ingredient_id: '', event_id: '', recipe_id: '',
    starting_weight_oz: '', trim_loss_oz: '', cooking_method: '', notes: ''
  });
  const [photos, setPhotos] = useState<File[]>([]);

  const { data: ingredients } = useQuery({
    queryKey: ['ingredients'],
    queryFn: () => api.get('/ingredients').then(r => r.data)
  });

  const { data: summary, isLoading } = useQuery({
    queryKey: ['yield-summary'],
    queryFn: () => api.get('/yield/summary?days=30').then(r => r.data)
  });

  const { data: predictions } = useQuery({
    queryKey: ['yield-predictions'],
    queryFn: () => api.get('/yield/predictions').then(r => r.data)
  });

  const { data: logs } = useQuery({
    queryKey: ['yield-logs'],
    queryFn: () => api.get('/yield?limit=20').then(r => r.data)
  });

  const logYield = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) formData.append(k, v); });
      photos.forEach(p => formData.append('photos', p));
      return api.post('/yield', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      toast.success('Yield logged — prediction updated');
      queryClient.invalidateQueries({ queryKey: ['yield-summary'] });
      queryClient.invalidateQueries({ queryKey: ['yield-predictions'] });
      queryClient.invalidateQueries({ queryKey: ['yield-logs'] });
      setShowLog(false);
      setForm({ ingredient_id: '', event_id: '', recipe_id: '', starting_weight_oz: '', trim_loss_oz: '', cooking_method: '', notes: '' });
      setPhotos([]);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to log yield')
  });

  const yieldPct = form.starting_weight_oz && form.trim_loss_oz
    ? (((parseFloat(form.starting_weight_oz) - parseFloat(form.trim_loss_oz)) / parseFloat(form.starting_weight_oz)) * 100).toFixed(1)
    : null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Yield Tracking</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              Log trim loss → AI predicts future yield · Target: chicken trim ≤12%
            </p>
          </div>
          <button onClick={() => setShowLog(true)} className="btn btn-primary">
            <Plus size={15} /> Log yield
          </button>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary stats */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div className="stat-card">
                <div className="stat-label">Total waste cost (30d)</div>
                <div className="stat-value" style={{ color: 'var(--red)' }}>${Number(summary.totals?.total_waste_cost || 0).toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Avg yield %</div>
                <div className="stat-value" style={{ color: 'var(--green)' }}>{Number(summary.totals?.overall_avg_yield_pct || 0).toFixed(1)}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Yield logs</div>
                <div className="stat-value">{summary.totals?.total_logs || 0}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Per-ingredient yield breakdown */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Waste by ingredient — 30 days</span>
              </div>
              <div>
                {isLoading && <div style={{ padding: 30, textAlign: 'center' }}><Loader className="spinner" size={18} color="var(--brand)" /></div>}
                {summary?.by_ingredient?.map((item: any) => (
                  <div key={item.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                        ${Number(item.waste_cost_usd || 0).toFixed(2)} waste
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
                      <span>avg yield: <strong style={{ color: 'var(--green)' }}>{Number(item.avg_yield_pct || 0).toFixed(1)}%</strong></span>
                      <span>avg waste: <strong style={{ color: 'var(--red)' }}>{Number(item.avg_waste_pct || 0).toFixed(1)}%</strong></span>
                      <span>trim: {Number(item.total_trim_loss_oz || 0).toFixed(1)} oz</span>
                      <span>{item.log_count} logs</span>
                    </div>
                    <CogsBar pct={Number(item.avg_waste_pct || 0)} />
                  </div>
                ))}
                {(!summary?.by_ingredient || summary.by_ingredient.length === 0) && !isLoading && (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                    No yield data yet — start logging
                  </div>
                )}
              </div>
            </div>

            {/* AI Predictions */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>AI yield predictions</span>
              </div>
              <div>
                {predictions?.map((p: any) => (
                  <div key={p.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{p.ingredient_name}</div>
                      <span style={{
                        fontSize: 11, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 99,
                        background: 'var(--blue-bg)', color: 'var(--blue)'
                      }}>{Number(p.confidence_score).toFixed(0)}% confidence</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-display)' }}>{Number(p.predicted_yield_pct).toFixed(1)}%</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>predicted yield</div>
                      </div>
                      <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)', fontFamily: 'var(--font-display)' }}>{Number(p.predicted_waste_pct).toFixed(1)}%</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>predicted waste</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                      Based on {p.sample_count} logs · avg start {Number(p.avg_starting_oz).toFixed(1)} oz → {Number(p.avg_final_oz).toFixed(1)} oz
                    </div>
                  </div>
                ))}
                {(!predictions || predictions.length === 0) && (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Log 3+ yield entries to generate predictions</div>
                )}
              </div>
            </div>
          </div>

          {/* Recent logs */}
          <div className="card">
            <div className="card-header"><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Recent yield logs</span></div>
            <table className="table">
              <thead><tr><th>Ingredient</th><th>Start (oz)</th><th>Trim (oz)</th><th>Yield (oz)</th><th>Yield %</th><th>Waste %</th><th>Method</th><th>Logged</th></tr></thead>
              <tbody>
                {logs?.map((log: any) => (
                  <tr key={log.id}>
                    <td style={{ fontWeight: 500 }}>{log.ingredient_name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{Number(log.starting_weight_oz).toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--red)' }}>{Number(log.trim_loss_oz).toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green)' }}>{Number(log.final_yield_oz).toFixed(1)}</td>
                    <td><span className={`badge ${Number(log.yield_pct)>=88?'badge-green':Number(log.yield_pct)>=75?'badge-yellow':'badge-red'}`} style={{fontSize:11}}>{Number(log.yield_pct).toFixed(1)}%</span></td>
                    <td><span className={`badge ${Number(log.waste_pct)<=12?'badge-green':Number(log.waste_pct)<=25?'badge-yellow':'badge-red'}`} style={{fontSize:11}}>{Number(log.waste_pct).toFixed(1)}%</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{log.cooking_method || '—'}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{new Date(log.logged_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {(!logs || logs.length === 0) && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: 13 }}>No yield logs yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Log yield modal */}
      {showLog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card animate-in" style={{ width: '100%', maxWidth: 500 }}>
            <div className="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Log yield measurement</span>
              <button onClick={() => setShowLog(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Ingredient *</label>
                <select className="input" value={form.ingredient_id} onChange={e => setForm(f => ({ ...f, ingredient_id: e.target.value }))} style={{ cursor: 'pointer' }}>
                  <option value="">Select ingredient...</option>
                  {ingredients?.map((i: any) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Starting weight (oz) *</label>
                  <input className="input" type="number" min={0} step={0.1} value={form.starting_weight_oz} onChange={e => setForm(f => ({ ...f, starting_weight_oz: e.target.value }))} placeholder="e.g. 56" />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Trim/loss (oz)</label>
                  <input className="input" type="number" min={0} step={0.1} value={form.trim_loss_oz} onChange={e => setForm(f => ({ ...f, trim_loss_oz: e.target.value }))} placeholder="e.g. 6.7" />
                </div>
              </div>

              {yieldPct && (
                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Calculated yield:</span>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font-display)' }}>{yieldPct}% yield</span>
                    <span style={{ fontSize: 13, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                      {(100 - parseFloat(yieldPct)).toFixed(1)}% waste
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Cooking method</label>
                <input className="input" value={form.cooking_method} onChange={e => setForm(f => ({ ...f, cooking_method: e.target.value }))} placeholder="e.g. Raw trim, Roasted, Braised..." />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observations..." style={{ resize: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Photos (optional)</label>
                <input type="file" accept="image/*" multiple onChange={e => setPhotos(Array.from(e.target.files || []))}
                  style={{ fontSize: 13, color: 'var(--text-secondary)' }} />
                {photos.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{photos.length} photo(s) selected</div>}
              </div>
              <button
                onClick={() => logYield.mutate()}
                className="btn btn-primary"
                disabled={!form.ingredient_id || !form.starting_weight_oz || logYield.isPending}
                style={{ justifyContent: 'center' }}>
                {logYield.isPending ? <Loader size={15} className="spinner" /> : <Scale size={15} />}
                {logYield.isPending ? 'Logging...' : 'Log yield'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


