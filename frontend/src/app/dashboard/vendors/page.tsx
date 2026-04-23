'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Sidebar from '@/components/shared/Sidebar';
import { Store, Link2, Link2Off, Search, Loader, CheckCircle } from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  'Full Range': 'badge-blue', 'Meat': 'badge-red', 'Seafood': 'badge-blue',
  'Specialty': 'badge-green', 'Paper/Janitorial': 'badge-gray', 'Produce': 'badge-green'
};

export default function VendorsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [connectModal, setConnectModal] = useState<any>(null);
  const [apiKey, setApiKey] = useState('');

  const { data: vendors, isLoading } = useQuery({
    queryKey: ['vendors', search],
    queryFn: () => api.get(`/vendors?search=${search}`).then(r => r.data)
  });

  const { data: connected } = useQuery({
    queryKey: ['connected-vendors'],
    queryFn: () => api.get('/vendors/connected').then(r => r.data)
  });

  const connect = useMutation({
    mutationFn: ({ vendorId, key }: any) => api.post(`/vendors/${vendorId}/connect`, { api_key: key }),
    onSuccess: () => {
      toast.success('Vendor connected');
      queryClient.invalidateQueries({ queryKey: ['connected-vendors'] });
      setConnectModal(null);
      setApiKey('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to connect')
  });

  const disconnect = useMutation({
    mutationFn: (vendorId: string) => api.delete(`/vendors/${vendorId}/disconnect`),
    onSuccess: () => { toast.success('Vendor disconnected'); queryClient.invalidateQueries({ queryKey: ['connected-vendors'] }); }
  });

  const isConnected = (vendorId: string) => connected?.some((c: any) => c.vendor_id === vendorId);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Vendor Hub</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            Connect suppliers · compare prices · 2–3% commission on hub orders
          </p>
        </div>

        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Connected vendors */}
          {connected && connected.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Connected ({connected.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {connected.map((conn: any) => (
                  <div key={conn.id} style={{ background: 'var(--surface-1)', border: '1px solid var(--green)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle size={14} color="var(--green)" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{conn.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{conn.category} · {conn.commission_pct}% commission</div>
                    </div>
                    <button onClick={() => { if (confirm(`Disconnect ${conn.name}?`)) disconnect.mutate(conn.vendor_id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', marginLeft: 4 }}>
                      <Link2Off size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: 320 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input className="input" style={{ paddingLeft: 36 }} placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Vendor grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {isLoading && <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spinner" size={20} color="var(--brand)" /></div>}
            {vendors?.map((vendor: any) => {
              const conn = isConnected(vendor.id);
              return (
                <div key={vendor.id} className="card">
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {vendor.name}
                          {vendor.is_verified && <span style={{ fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue)', padding: '1px 6px', borderRadius: 99, fontFamily: 'var(--font-mono)' }}>Verified</span>}
                        </div>
                        {vendor.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{vendor.description}</div>}
                      </div>
                      <span className={`badge ${CATEGORY_COLORS[vendor.category] || 'badge-gray'}`} style={{ fontSize: 10, flexShrink: 0 }}>{vendor.category}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {vendor.markets?.slice(0, 3).map((m: string) => (
                        <span key={m} style={{ fontSize: 10, background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 99, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{m}</span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      <span>Commission: {vendor.commission_pct}%</span>
                      <span style={{ textTransform: 'capitalize' }}>{vendor.api_type?.replace('_', ' ')}</span>
                    </div>

                    {conn ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--green)' }}>
                        <CheckCircle size={14} /> Connected
                      </div>
                    ) : (
                      <button onClick={() => setConnectModal(vendor)} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}>
                        <Link2 size={13} /> Connect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Connect modal */}
      {connectModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card animate-in" style={{ width: '100%', maxWidth: 420 }}>
            <div className="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Connect: {connectModal.name}</span>
              <button onClick={() => setConnectModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Connection type: </strong>{connectModal.api_type?.replace('_', ' ')}
                <br />{connectModal.description}
              </div>
              {connectModal.api_type === 'api_key' && (
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>API Key from {connectModal.name} dashboard</label>
                  <input className="input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your API key..." />
                </div>
              )}
              {connectModal.api_type === 'oauth' && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Click Connect to be redirected to {connectModal.name}'s authorization page.</div>
              )}
              {connectModal.api_type === 'new_account' && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>We'll send your connection request to {connectModal.name}. They'll reach out within 1-2 business days.</div>
              )}
              <button
                onClick={() => connect.mutate({ vendorId: connectModal.id, key: apiKey })}
                className="btn btn-primary"
                disabled={connect.isPending}
                style={{ justifyContent: 'center' }}>
                {connect.isPending ? <Loader size={14} className="spinner" /> : <Link2 size={14} />}
                {connect.isPending ? 'Connecting...' : 'Connect vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


