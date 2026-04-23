'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import { Save, Loader, ExternalLink } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: company, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => api.get('/companies/me').then(r => r.data)
  });

  const [form, setForm] = useState<any>(null);

  // Populate form when company loads
  if (company && !form) {
    setForm({
      name: company.name || '',
      phone: company.phone || '',
      address: company.address || '',
      default_markup_percent: company.default_markup_percent || 150,
      default_tax_rate: company.default_tax_rate || 18,
      currency: company.currency || 'INR',
    });
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      await api.put('/companies/me', form);
      queryClient.invalidateQueries({ queryKey: ['company'] });
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !form) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader className="spinner" size={24} color="var(--brand)" />
      </main>
    </div>
  );

  const planLabels: Record<string, string> = {
    solo: 'Solo Chef — $99/mo', restaurant: 'Core Restaurant — $349/mo',
    multi_unit: 'Multi-Unit — $329/location', franchise: 'Franchise — $449/location',
    enterprise: 'Corporate Hub — $1,499/mo'
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Settings</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{company.name}</p>
          </div>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
            {saving ? <Loader size={14} className="spinner" /> : <Save size={14} />}
            Save changes
          </button>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Business profile */}
          <section>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 14 }}>Business Profile</div>
            <div className="card">
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Business name</label>
                    <input className="input" value={form.name} onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Phone</label>
                    <input className="input" value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} placeholder="+1 (415) 555-0100" />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Currency</label>
                    <select className="input" value={form.currency} onChange={e => setForm((f: any) => ({ ...f, currency: e.target.value }))} style={{ cursor: 'pointer' }}>
                      {['USD','INR','GBP','EUR','CAD','AUD','SGD'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Address</label>
                    <input className="input" value={form.address} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} placeholder="Business address" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing defaults */}
          <section>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 4 }}>Pricing Defaults</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>These apply to all new recipes unless overridden per recipe</div>
            <div className="card">
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Default markup %</label>
                  <div style={{ position: 'relative' }}>
                    <input className="input" type="number" min={0} max={1000} value={form.default_markup_percent} onChange={e => setForm((f: any) => ({ ...f, default_markup_percent: parseFloat(e.target.value) || 0 }))} style={{ paddingRight: 36 }} />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 14 }}>%</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    Cost × (1 + {form.default_markup_percent}%) = selling price
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Default tax rate %</label>
                  <div style={{ position: 'relative' }}>
                    <input className="input" type="number" min={0} max={50} step={0.5} value={form.default_tax_rate} onChange={e => setForm((f: any) => ({ ...f, default_tax_rate: parseFloat(e.target.value) || 0 }))} style={{ paddingRight: 36 }} />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 14 }}>%</span>
                  </div>
                </div>
                <div style={{ gridColumn: '1/-1', background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  COGS thresholds: ≤30% → Green · 30–35% → Yellow · &gt;35% → Red (per iBirdOS spec)
                </div>
              </div>
            </div>
          </section>

          {/* Plan */}
          <section>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 14 }}>Subscription</div>
            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{planLabels[company.plan_tier] || company.plan_tier}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Status: <span style={{ color: company.subscription_status === 'active' || company.subscription_status === 'trialing' ? 'var(--green)' : 'var(--red)' }}>
                        {company.subscription_status}
                      </span>
                      {company.subscription_status === 'trialing' && company.trial_ends_at && (
                        <span style={{ color: 'var(--text-tertiary)', marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          Trial ends: {new Date(company.trial_ends_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => window.open('https://billing.stripe.com', '_blank')}>
                    <ExternalLink size={13} /> Manage billing
                  </button>
                </div>

                {/* Public menu URL */}
                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>YOUR CUSTOMER MENU URL</div>
                  <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--brand)', wordBreak: 'break-all' }}>
                    {typeof window !== 'undefined' ? window.location.origin : ''}/restaurant/{company.slug}/menu
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>Share this link with customers so they can browse your menu and place orders</div>
                </div>
              </div>
            </div>
          </section>

          {/* Company URL */}
          <section>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 14 }}>Account Info</div>
            <div className="card">
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Company ID', value: company.id },
                  { label: 'Slug', value: company.slug },
                  { label: 'Owner email', value: user?.email },
                  { label: 'Role', value: user?.role },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}


