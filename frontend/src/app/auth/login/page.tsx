'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore, roleDashboard } from '@/lib/auth';
import { Eye, EyeOff } from 'lucide-react';
import logo from '@/components/shared/logo.png';
import Image from 'next/image';

export default function LoginPage() {
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [show, setShow] = useState(false);
const [loading, setLoading] = useState(false);

const { setUser } = useAuthStore();
const router = useRouter();

async function handleLogin(e: React.FormEvent) {
e.preventDefault();


if (!email || !password) {
  toast.error('Email and password required');
  return;
}

setLoading(true);

try {
  // 🔥 FIX: call API directly (no broken wrapper logic)
  const res = await api.post('/auth/login', {
    email: email.trim(),
    password
  });
  const data = res.data;
  console.log('LOGIN RESPONSE:', data);

  if (!data?.token || !data?.user) {
    throw new Error('Invalid login response');
  }

  // ✅ STORE USER
  setUser(data.user, data.token);

  const name = data.user.full_name?.split(' ')[0] || 'User';
  toast.success(`Welcome back, ${name}!`);

  // ✅ REDIRECT
  const redirect = roleDashboard(data.user.role || 'staff');
  router.push(redirect);

} catch (err: any) {
  console.error('LOGIN ERROR:', err);

  toast.error(
    err?.response?.data?.error ||
    err.message ||
    'Login failed'
  );
} finally {
  setLoading(false);
}


}

return (
<div
style={{
minHeight: '100vh',
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
background: 'var(--surface-0)',
padding: '40px 20px',
backgroundImage:
'radial-gradient(ellipse at 50% 0%, rgba(242,151,34,0.06) 0%, transparent 60%)',
}}
>
<div style={{ width: '100%', maxWidth: 400 }}>


    {/* LOGO */}
    <div style={{ textAlign: 'center', marginBottom: 40 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'var(--brand)',
          marginBottom: 16,
          overflow: 'hidden',
        }}
      >
        <Image
        src={logo}
        alt="logo"
        width={26}
        height={26}
        
        
      /> 
      </div>

      <h1 style={{ fontSize: 28, marginBottom: 6 }}>
        iBirdOS
      </h1>

      <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
        AI Kitchen Operating System
      </p>
    </div>

    {/* CARD */}
    <div className="card">
      <div className="card-body">

        <h2 style={{ fontSize: 18, marginBottom: 6 }}>
          Sign in
        </h2>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
          Owner Login - Welcome Back to IBird. 
        </p>

        <form
          onSubmit={handleLogin}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >

          {/* EMAIL */}
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@restaurant.com"
            autoComplete="email"
          />

          {/* PASSWORD */}
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ paddingRight: 44 }}
            />

            <button
              type="button"
              onClick={() => setShow(!show)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* SUBMIT */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in →'}
          </button>

        </form>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <Link href="/auth/register">
            New restaurant? Create workspace →
          </Link>
        </div>

      </div>
    </div>

  </div>
</div>


);
}
