'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function AdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  async function load() {
    try {
      const [s, u, c] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/companies')
      ]);

      setStats(s.data);
      setUsers(u.data);
      setCompanies(c.data);

    } catch (err) {
      console.error('Admin load failed', err);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 28, marginBottom: 20 }}>CEO Dashboard</h1>

      {/* STATS */}
      {stats && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 30 }}>
          <Card title="Users" value={stats.total_users} />
          <Card title="Companies" value={stats.total_companies} />
          <Card title="Active Subs" value={stats.active_subscriptions} />
        </div>
      )}

      {/* COMPANIES */}
      <h2>Companies</h2>
      <table style={{ width: '100%', marginBottom: 40 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.plan_tier}</td>
              <td>{c.subscription_status}</td>
              <td>
                <button onClick={() => upgradePlan(c.id)}>
                  Upgrade
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* USERS */}
      <h2>Users</h2>
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Company</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.company_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Simple card
function Card({ title, value }: any) {
  return (
    <div style={{
      padding: 20,
      border: '1px solid #eee',
      borderRadius: 10,
      width: 200
    }}>
      <h3>{title}</h3>
      <p style={{ fontSize: 22 }}>{value}</p>
    </div>
  );
}

// Plan upgrade (example)
async function upgradePlan(companyId: string) {
  await api.post('/admin/upgrade-plan', {
    company_id: companyId,
    plan: 'restaurant'
  });

  alert('Plan updated');
}