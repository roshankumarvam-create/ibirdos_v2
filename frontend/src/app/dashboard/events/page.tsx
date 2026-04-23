'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import { Plus, Truck, Users, DollarSign, Loader, X, ChefHat } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  draft: 'badge-gray', confirmed: 'badge-blue', in_progress: 'badge-yellow', completed: 'badge-green', cancelled: 'badge-red'
};

export default function EventsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const currency = '$';
  const [activeTab, setActiveTab] = useState<'events' | 'templates'>('events');
  const [selected, setSelected] = useState<any>(null);
  const [showFromTemplate, setShowFromTemplate] = useState<any>(null);
  const [fromTemplateForm, setFromTemplateForm] = useState({ event_date: '', headcount_actual: '', client_name: '', venue: '' });

  const { data: events, isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: () => api.get('/events').then(r => r.data)
  });

  const { data: templates } = useQuery({
    queryKey: ['event-templates'],
    queryFn: () => api.get('/event-templates').then(r => r.data),
    enabled: activeTab === 'templates'
  });

  const { data: eventPL } = useQuery({
    queryKey: ['event-pl', selected?.id],
    queryFn: () => api.get(`/event-templates/pl/${selected.id}`).then(r => r.data),
    enabled: !!selected?.id
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: any) => api.put(`/events/${id}/status`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['events'] }); toast.success('Status updated'); }
  });

  const createFromTemplate = useMutation({
    mutationFn: ({ templateId, data }: any) => api.post(`/event-templates/${templateId}/create-event`, data),
    onSuccess: () => {
      toast.success('Event created from template — prep list generated automatically');
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setShowFromTemplate(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed')
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Events</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>Catering events · booking to kitchen packet</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ key: 'events', label: 'Events' }, { key: 'templates', label: 'Templates' }].map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key as any)} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                background: activeTab === t.key ? 'var(--brand)' : 'var(--surface-3)',
                color: activeTab === t.key ? '#0d1117' : 'var(--text-secondary)'
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: selected ? '1fr 420px' : '1fr', gap: 20 }}>

          {/* EVENTS LIST */}
          {activeTab === 'events' && (
            <div>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Total events', value: events?.length || 0 },
                  { label: 'Confirmed', value: events?.filter((e: any) => e.status === 'confirmed').length || 0, color: 'var(--blue)' },
                  { label: 'Revenue', value: `${currency}${(events?.reduce((s: number, e: any) => s + Number(e.total_revenue || 0), 0) || 0).toLocaleString()}`, color: 'var(--brand)' },
                  { label: 'Profit', value: `${currency}${(events?.reduce((s: number, e: any) => s + Number(e.gross_profit || 0), 0) || 0).toLocaleString()}`, color: 'var(--green)' },
                ].map(k => (
                  <div key={k.label} className="stat-card">
                    <div className="stat-label">{k.label}</div>
                    <div className="stat-value" style={{ color: (k as any).color || 'var(--text-primary)', fontSize: 20 }}>{k.value}</div>
                  </div>
                ))}
              </div>

              <div className="card">
                {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spinner" size={20} color="var(--brand)" /></div>}
                <table className="table">
                  <thead><tr><th>Event</th><th>Date</th><th>Guests</th><th>Revenue</th><th>Profit</th><th>COGS</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {events?.map((event: any) => (
                      <tr key={event.id} onClick={() => setSelected(event)} style={{ cursor: 'pointer', background: selected?.id === event.id ? 'var(--surface-2)' : 'transparent' }}>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{event.name}</div>
                          {event.client_name && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{event.client_name}</div>}
                        </td>
                        <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{new Date(event.event_date).toLocaleDateString()}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{event.guest_count}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--brand)' }}>{currency}{Number(event.total_revenue || 0).toFixed(0)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: Number(event.gross_profit) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {currency}{Number(event.gross_profit || 0).toFixed(0)}
                        </td>
                        <td>
                          {event.total_revenue > 0 ? (
                            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: (event.food_cost_percent <= 30) ? 'var(--green)' : (event.food_cost_percent <= 35) ? 'var(--yellow)' : 'var(--red)', fontWeight: 600 }}>
                              {Number(event.food_cost_percent || 0).toFixed(1)}%
                            </span>
                          ) : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                        </td>
                        <td><span className={`badge ${STATUS_COLORS[event.status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{event.status}</span></td>
                        <td><button className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 11 }}>Detail</button></td>
                      </tr>
                    ))}
                    {!isLoading && events?.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        <Truck size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
                        No events yet — create one from a template
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TEMPLATES */}
          {activeTab === 'templates' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                {templates?.map((tmpl: any) => (
                  <div key={tmpl.id} className="card" style={{ cursor: 'pointer' }}>
                    <div className="card-body">
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>{tmpl.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{tmpl.description}</div>
                        </div>
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>{tmpl.event_type}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                        {[
                          { label: 'Default guests', value: tmpl.headcount_default },
                          { label: 'Recipes', value: `${tmpl.recipe_count} items` },
                          { label: 'Labor est.', value: `${tmpl.default_labor_pct}%` },
                          { label: 'Overhead', value: `${tmpl.default_overhead_pct}%` },
                        ].map(stat => (
                          <div key={stat.label} style={{ background: 'var(--surface-2)', borderRadius: 6, padding: '8px 10px' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>{stat.label}</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{stat.value}</div>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => { setShowFromTemplate(tmpl); setFromTemplateForm({ event_date: '', headcount_actual: String(tmpl.headcount_default), client_name: '', venue: '' }); }} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}>
                        <Plus size={14} /> Create event from this template
                      </button>
                    </div>
                  </div>
                ))}
                {(!templates || templates.length === 0) && (
                  <div style={{ gridColumn: '1/-1', padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--surface-1)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <ChefHat size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
                    No templates yet — templates let you quickly create Thu_132 or weekly recurring events
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Event detail / P&L panel */}
          {selected && eventPL && (
            <div className="card" style={{ position: 'sticky', top: 80, maxHeight: 'calc(100vh - 100px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>{eventPL.event.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {eventPL.event.guest_count} guests · {new Date(eventPL.event.event_date).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Full P&L */}
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 10 }}>Full P&L</div>
                  {[
                    { label: 'Revenue', value: eventPL.pl.revenue, color: 'var(--brand)' },
                    { label: 'Food cost', value: eventPL.pl.food_cost },
                    { label: 'Labor cost', value: eventPL.pl.labor_cost },
                    { label: 'Waste cost', value: eventPL.pl.waste_cost, color: 'var(--red)' },
                    { label: 'Total cost', value: eventPL.pl.total_cost },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <span>{r.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: (r as any).color || 'var(--text-primary)', fontWeight: (r as any).color ? 600 : 400 }}>
                        {currency}{Number(r.value).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', paddingTop: 10, marginTop: 4 }}>
                    <span>Gross Profit</span>
                    <span style={{ color: Number(eventPL.pl.gross_profit) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {currency}{Number(eventPL.pl.gross_profit).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                    {[
                      { label: 'Profit %', value: `${eventPL.pl.profit_pct}%`, color: Number(eventPL.pl.profit_pct) >= 20 ? 'var(--green)' : 'var(--yellow)' },
                      { label: 'COGS %', value: `${eventPL.pl.cogs_pct}%`, color: eventPL.pl.cogs_status === 'green' ? 'var(--green)' : eventPL.pl.cogs_status === 'yellow' ? 'var(--yellow)' : 'var(--red)' },
                      { label: 'Per head', value: `${currency}${eventPL.pl.cost_per_head}`, color: 'var(--text-primary)' },
                    ].map(stat => (
                      <div key={stat.label} style={{ textAlign: 'center', background: 'var(--surface-3)', borderRadius: 8, padding: '8px' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', color: stat.color }}>{stat.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status actions */}
                {selected.status !== 'completed' && selected.status !== 'cancelled' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selected.status === 'draft' && <button onClick={() => updateStatus.mutate({ id: selected.id, status: 'confirmed' })} className="btn btn-primary" style={{ justifyContent: 'center' }}>Confirm event</button>}
                    {selected.status === 'confirmed' && <button onClick={() => updateStatus.mutate({ id: selected.id, status: 'in_progress' })} className="btn btn-primary" style={{ justifyContent: 'center' }}>Start event</button>}
                    {selected.status === 'in_progress' && <button onClick={() => updateStatus.mutate({ id: selected.id, status: 'completed' })} className="btn btn-primary" style={{ justifyContent: 'center', background: 'var(--green)' }}>Complete event</button>}
                    <button onClick={() => { if (confirm('Cancel event?')) updateStatus.mutate({ id: selected.id, status: 'cancelled' }); }} className="btn btn-danger" style={{ justifyContent: 'center', fontSize: 12 }}>Cancel</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Create from template modal */}
      {showFromTemplate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card animate-in" style={{ width: '100%', maxWidth: 440 }}>
            <div className="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Create from: {showFromTemplate.name}</span>
              <button onClick={() => setShowFromTemplate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Event date *</label>
                <input className="input" type="datetime-local" value={fromTemplateForm.event_date} onChange={e => setFromTemplateForm(f => ({ ...f, event_date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Headcount (default: {showFromTemplate.headcount_default})</label>
                <input className="input" type="number" value={fromTemplateForm.headcount_actual} onChange={e => setFromTemplateForm(f => ({ ...f, headcount_actual: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Client name</label>
                <input className="input" value={fromTemplateForm.client_name} onChange={e => setFromTemplateForm(f => ({ ...f, client_name: e.target.value }))} placeholder="e.g. Corporate Lunch — Google" />
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Venue</label>
                <input className="input" value={fromTemplateForm.venue} onChange={e => setFromTemplateForm(f => ({ ...f, venue: e.target.value }))} placeholder="Location..." />
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Template includes: {showFromTemplate.recipe_count} recipes · Labor {showFromTemplate.default_labor_pct}% · Overhead {showFromTemplate.default_overhead_pct}% · Auto prep list
              </div>
              <button
                onClick={() => createFromTemplate.mutate({ templateId: showFromTemplate.id, data: { ...fromTemplateForm, headcount_actual: parseInt(fromTemplateForm.headcount_actual) || showFromTemplate.headcount_default } })}
                className="btn btn-primary"
                disabled={!fromTemplateForm.event_date || createFromTemplate.isPending}
                style={{ justifyContent: 'center' }}>
                {createFromTemplate.isPending ? <Loader size={14} className="spinner" /> : <Plus size={14} />}
                {createFromTemplate.isPending ? 'Creating...' : 'Create event & generate prep list'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


