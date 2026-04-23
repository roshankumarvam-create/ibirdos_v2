'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Flame } from 'lucide-react';

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    password: ''
  });

  const set = (k: string) => (e: any) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: any) {
    e.preventDefault();

    if (!form.full_name || !form.password) {
      toast.error('Please fill all fields');
      return;
    }

    try {
      setLoading(true);

      const res = await api.post('/auth/accept-invite', {
        token,
        full_name: form.full_name,
        password: form.password
      });

      const data = res?.data || res;

      if (!data?.token) {
        throw new Error('Invalid response');
      }

      localStorage.setItem(
        'ibirdos-auth',
        JSON.stringify({
          state: {
            user: data.user,
            token: data.token
          }
        })
      );

      toast.success('Welcome to iBirdOS 🚀');

      router.push('/dashboard');

    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ||
        err.message ||
        'Invite failed'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0b0f19',
      padding: 20
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#111827',
        padding: 30,
        borderRadius: 12,
        border: '1px solid #1f2937'
      }}>

        <div style={{ textAlign: 'center', marginBottom: 25 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: 10,
            background: '#f59e0b',
            marginBottom: 10
          }}>
            <Flame size={24} color="#000" />
          </div>

          <h2 style={{ color: 'white', margin: 0 }}>
            Accept Invitation
          </h2>

          <p style={{ color: '#9ca3af', fontSize: 13 }}>
            Join your team on iBirdOS
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <input
            placeholder="Your name"
            value={form.full_name}
            onChange={set('full_name')}
            style={inputStyle}
          />

          <input
            type="password"
            placeholder="Create password"
            value={form.password}
            onChange={set('password')}
            style={inputStyle}
          />

          <button style={buttonStyle} disabled={loading}>
            {loading ? 'Joining...' : 'Accept & Join →'}
          </button>

        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: '12px',
  borderRadius: 8,
  border: '1px solid #374151',
  background: '#0b0f19',
  color: 'white'
};

const buttonStyle = {
  padding: '12px',
  borderRadius: 8,
  background: '#f59e0b',
  border: 'none',
  fontWeight: 600,
  cursor: 'pointer'
};