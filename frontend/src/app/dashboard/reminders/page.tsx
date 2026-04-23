'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatDateTime, reminderUrgency } from '@/lib/format';
import Sidebar from '@/components/shared/Sidebar';
import { Plus, Bell, CheckCircle, Trash2, Loader, X } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  event: 'badge-blue', invoice: 'badge-yellow', inventory: 'badge-red',
  payment: 'badge-red', follow_up: 'badge-green', general: 'badge-gray'
};

export default function RemindersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('false');
  const [form, setForm] = useState({ title: '', body: '', reminder_type: 'general', due_at: '', notify_email: true });

  const { data: reminders, isLoading } = useQuery({
    queryKey: ['reminders', filter],
    queryFn: () => api.get(`/reminders?done=${filter}`).then(r => r.data)
  });

  const { data: dueNow } = useQuery({
    queryKey: ['reminders-due'],
    queryFn: () => api.get('/reminders/due').then(r => r.data),
    refetchInterval: 60_000
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/reminders', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminders-due'] });
      toast.success('Reminder created');
      setShowCreate(false);
      setForm({ title: '', body: '', reminder_type: 'general', due_at: '', notify_email: true });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed')
  });

  const doneMut = useMutation({
    mutationFn: (id: string) => api.put(`/reminders/${id}/done`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reminders'] }); toast.success('Marked done'); }
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/reminders/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reminders'] }); }
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Reminders</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {dueNow?.length > 0 ? `⚠ ${dueNow.length} due now` : 'Upcoming reminders'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['false', 'true'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                background: filter === f ? 'var(--brand)' : 'var(--surface-3)',
                color: filter === f ? '#0d1117' : 'var(--text-secondary)'
              }}>{f === 'false' ? 'Active' : 'Completed'}</button>
            ))}
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Plus size={14} /> Add reminder
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Due now banner */}
          {dueNow?.length > 0 && filter === 'false' && (
            <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>
                ⚠ {dueNow.length} reminder(s) due now or overdue
              </div>
              {dueNow.map((r: any) => (
                <div key={r.id} style={{ fontSize: 12, color: 'var(--red)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                  · {r.title} — {formatDateTime(r.due_at)}
                </div>
              ))}
            </div>
          )}

          {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spinner" size={20} color="var(--brand)" /></div>}

          {reminders?.map((r: any) => {
            const urgency = filter === 'false' ? reminderUrgency(r.due_at) : 'reminder-ok';
            return (
              <div key={r.id} className={urgency} style={{ borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <Bell size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)' }}>{r.title}</div>
                    <span className={`badge ${TYPE_COLORS[r.reminder_type] || 'badge-gray'}`} style={{ fontSize: 10 }}>{r.reminder_type}</span>
                  </div>
                  {r.body && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{r.body}</div>}
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                    Due: {formatDateTime(r.due_at)}
                    {r.notify_email && ' · email notification on'}
                  </div>
                </div>
                {!r.is_done && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => doneMut.mutate(r.id)} className="btn btn-ghost" style={{ padding: '5px 8px' }} title="Mark done">
                      <CheckCircle size={14} />
                    </button>
                    <button onClick={() => deleteMut.mutate(r.id)} className="btn btn-ghost" style={{ padding: '5px 8px', color: 'var(--red)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {!isLoading && reminders?.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)', background: 'var(--surface-1)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <Bell size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
              <div>{filter === 'false' ? 'No active reminders' : 'No completed reminders'}</div>
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card animate-in" style={{ width: '100%', maxWidth: 440 }}>
            <div className="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>New reminder</span>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Title *</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Follow up with Sysco invoice" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Type</label>
                  <select className="input" value={form.reminder_type} onChange={e => setForm(f => ({ ...f, reminder_type: e.target.value }))} style={{ cursor: 'pointer' }}>
                    {['general', 'event', 'invoice', 'inventory', 'payment', 'follow_up'].map(t => (
                      <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Due at *</label>
                  <input className="input" type="datetime-local" value={form.due_at} onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea className="input" rows={2} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Optional details..." style={{ resize: 'none' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.notify_email} onChange={e => setForm(f => ({ ...f, notify_email: e.target.checked }))} />
                Send email notification when due
              </label>
              <button onClick={() => createMut.mutate(form)} className="btn btn-primary" disabled={!form.title || !form.due_at || createMut.isPending} style={{ justifyContent: 'center' }}>
                {createMut.isPending ? <Loader size={14} className="spinner" /> : <Bell size={14} />}
                Create reminder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


