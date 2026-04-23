'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import { UserPlus, Mail, Clock, CheckCircle, X, Loader } from 'lucide-react';

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'staff' });
  const [sending, setSending] = useState(false);

  const { data: company, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: () => api.get('/companies/me').then(r => r.data)
  });

  const removeStaff = useMutation({
    mutationFn: (userId: string) => api.delete(`/companies/staff/${userId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['company'] }); toast.success('Staff member removed'); }
  });

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteForm.email) { toast.error('Email required'); return; }
    setSending(true);
    try {
      await api.post('/auth/invite', inviteForm);
      toast.success(`Invite sent to ${inviteForm.email}`);
      queryClient.invalidateQueries({ queryKey: ['company'] });
      setShowInvite(false);
      setInviteForm({ email: '', role: 'staff' });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  const roleColors: Record<string, string> = {
    entrepreneur: 'badge-blue', unit_manager: 'badge-blue', manager: 'badge-green',
    staff: 'badge-gray', customer: 'badge-gray'
  };
  const roleLabels: Record<string, string> = {
    entrepreneur: 'Owner', unit_manager: 'Owner', district_manager: 'District Mgr',
    regional_manager: 'Regional Mgr', manager: 'Manager', staff: 'Staff', customer: 'Customer'
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Team</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              Invite and manage your team · Each role sees only what they need
            </p>
          </div>
          <button onClick={() => setShowInvite(true)} className="btn btn-primary">
            <UserPlus size={15} /> Invite member
          </button>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Role access guide */}
          <div className="card">
            <div className="card-header"><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Role permissions</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {[
                { role: 'Owner', perms: ['Full P&L & profit', 'Recipe costs', 'All analytics', 'Billing & settings', 'Invite anyone'], color: 'var(--brand)' },
                { role: 'Manager', perms: ['Orders & sales', 'Event management', 'Alerts', '— No cost data', '— No profit data'], color: 'var(--blue)' },
                { role: 'Staff', perms: ['Kitchen prep list', 'Order queue', 'Waste logging', '— No financials', '— No sales data'], color: 'var(--green)' },
                { role: 'Customer', perms: ['View menu', 'Place orders', 'Own order history', '— Nothing else', '— Isolated per restaurant'], color: 'var(--text-secondary)' }
              ].map(({ role, perms, color }) => (
                <div key={role} style={{ padding: '16px 20px', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 10, fontFamily: 'var(--font-display)' }}>{role}</div>
                  {perms.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, color: p.startsWith('—') ? 'var(--text-tertiary)' : 'var(--text-secondary)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                      {p.startsWith('—') ? p : `✓ ${p}`}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Active staff */}
          <div className="card">
            <div className="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Team members ({company?.staff?.length || 0})</span>
            </div>
            {isLoading ? <div style={{ padding: 30, textAlign: 'center' }}><Loader className="spinner" size={18} color="var(--brand)" /></div> : (
              <table className="table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last active</th><th></th></tr></thead>
                <tbody>
                  {company?.staff?.map((member: any) => (
                    <tr key={member.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--brand)', flexShrink: 0 }}>
                            {member.full_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 500 }}>{member.full_name}</span>
                          {member.id === user?.id && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>(you)</span>}
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{member.email}</td>
                      <td><span className={`badge ${roleColors[member.role] || 'badge-gray'}`} style={{ fontSize: 11 }}>{roleLabels[member.role] || member.role}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {member.last_login ? new Date(member.last_login).toLocaleDateString() : 'Never'}
                      </td>
                      <td>
                        {member.id !== user?.id && (
                          <button onClick={() => { if (confirm(`Remove ${member.full_name}?`)) removeStaff.mutate(member.id); }}
                            className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 12, color: 'var(--red)' }}>
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pending invites */}
          {company?.pending_invites?.length > 0 && (
            <div className="card">
              <div className="card-header"><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Pending invites</span></div>
              <div>
                {company.pending_invites.map((inv: any) => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Mail size={14} color="var(--text-tertiary)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{inv.email}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        Invited as {roleLabels[inv.role] || inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="badge badge-yellow" style={{ fontSize: 11 }}>
                      <Clock size={10} /> Pending
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Invite modal */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card animate-in" style={{ width: '100%', maxWidth: 420 }}>
            <div className="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Invite team member</span>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div className="card-body">
              <form onSubmit={sendInvite} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email address</label>
                  <input className="input" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="team@restaurant.com" required />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Role</label>
                  <select className="input" value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))} style={{ cursor: 'pointer' }}>
                    <option value="manager">Manager — sees orders & sales (no costs)</option>
                    <option value="staff">Kitchen Staff — sees prep list only</option>
                    <option value="customer">Customer — can order from your menu</option>
                  </select>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                  {inviteForm.role === 'manager' && '✓ Can see orders, events, and sales totals\n✗ Cannot see recipe costs or profit margins'}
                  {inviteForm.role === 'staff' && '✓ Can see kitchen prep lists and order queue\n✗ Cannot see any financial or cost data'}
                  {inviteForm.role === 'customer' && '✓ Can view menu and place orders\n✗ Sees only your restaurant, no other data'}
                </div>
                <button type="submit" className="btn btn-primary" disabled={sending} style={{ justifyContent: 'center' }}>
                  {sending ? <Loader size={15} className="spinner" /> : <Mail size={15} />}
                  {sending ? 'Sending...' : 'Send invite email'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


