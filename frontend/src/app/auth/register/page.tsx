'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { Flame } from 'lucide-react';

const DEV_BYPASS = process.env.NODE_ENV !== 'production';

export default function RegisterPage() {
const router = useRouter();
const { setUser } = useAuthStore();

const [loading, setLoading] = useState(false);

const [form, setForm] = useState({
full_name: '',
email: '',
password: '',
company_name: '',
plan_tier: 'restaurant'
});

const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
setForm(f => ({ ...f, [k]: e.target.value }));

async function handleSubmit(e: React.FormEvent) {
e.preventDefault();


if (!form.full_name || !form.email || !form.company_name) {
  toast.error('Please fill all fields');
  return;
}

if (form.password.length < 6) {
  toast.error('Password must be at least 6 characters');
  return;
}

setLoading(true);

try {
  // ✅ FIXED: get response properly
  const res = await api.post('/auth/register', form);
  const data = res.data;

  console.log('REGISTER RESPONSE:', data);

  if (!data?.token || !data?.user) {
    throw new Error('Invalid registration response');
  }

  // ✅ DEV MODE (skip stripe)
  if (DEV_BYPASS) {
    setUser(data.user, data.token);
    toast.success('Workspace created');
    router.push('/dashboard');
    return;
  }

  // 🔥 STRIPE
  const stripeRes = await api.post('/stripe/checkout', {
    plan: form.plan_tier
  });

  const stripeData = stripeRes.data;

  if (!stripeData?.url && !stripeData?.redirect_url) {
    throw new Error('Invalid payment response');
  }

  window.location.href = stripeData.url || stripeData.redirect_url;

} catch (err: any) {
  console.error('REGISTER ERROR:', err);

  toast.error(
    err?.response?.data?.error ||
    err.message ||
    'Registration failed'
  );
} finally {
  setLoading(false);
}


}

const plans = [
{ value: 'solo', label: 'Solo Chef — $49/mo (1 user only)' },
{ value: 'restaurant', label: 'Restaurant — $149/mo (up to 5 users)' }
];

return (
<div style={{
minHeight: '100vh',
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
background: 'var(--surface-0)',
padding: '40px 20px',
backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(242,151,34,0.06) 0%, transparent 60%)'
}}>
<div style={{ width: '100%', maxWidth: 460 }}>


    <div style={{ textAlign: 'center', marginBottom: 36 }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 48,
        borderRadius: 12,
        background: 'var(--brand)',
        marginBottom: 14
      }}>
        <Flame size={24} color="#0d1117" strokeWidth={2.5} />
      </div>

      <h1 style={{ fontSize: 26 }}>
        Create your workspace
      </h1>

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
        Start your plan • Secure Stripe checkout
      </p>
    </div>

    <div className="card">
      <div className="card-body">

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <input className="input"
            placeholder="Your name"
            value={form.full_name}
            onChange={set('full_name')}
            required
          />

          <input className="input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={set('email')}
            required
          />

          <input className="input"
            placeholder="Business name"
            value={form.company_name}
            onChange={set('company_name')}
            required
          />

          <select className="input"
            value={form.plan_tier}
            onChange={set('plan_tier')}
          >
            {plans.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          <input className="input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={set('password')}
            required
          />

          <button className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating workspace...' : 'Create workspace →'}
          </button>

        </form>

        <p style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account? <Link href="/auth/login">Sign in</Link>
        </p>

      </div>
    </div>

  </div>
</div>


);
}
