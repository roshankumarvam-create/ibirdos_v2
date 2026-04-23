'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore, canSeeFinancials, isManager } from '@/lib/auth';
import {
  LayoutDashboard, Package, FileText, ShoppingCart,
  ClipboardList, BarChart2, Bell, Settings, LogOut,
  Users, Truck, Scale, DollarSign, FileCheck, Store,
  UtensilsCrossed, AlarmClock
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

export default function Sidebar({ alertCount = 0 }: { alertCount?: number }) {
  const { user, logout } = useAuthStore();
  const pathname = usePathname();

  if (!user) return null;

  const role = user.role;

  const showFinancials = canSeeFinancials(role); // owner only
  const showManager = isManager(role); // owner + manager

  // ✅ CLEAN ROLE LOGIC
  const isKitchenUser = role === 'staff' || showManager;

  const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },

    ...(showManager ? [
      { label: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
      { label: 'Events', href: '/dashboard/events', icon: Truck }
    ] : []),

    ...(isKitchenUser ? [
      { label: 'Kitchen', href: '/kitchen', icon: UtensilsCrossed }
    ] : []),

    ...(showFinancials ? [
      { label: 'Menu', href: '/dashboard/menu', icon: UtensilsCrossed },
      { label: 'Recipes', href: '/dashboard/recipes', icon: UtensilsCrossed },
      { label: 'Ingredients', href: '/dashboard/ingredients', icon: Package },
      { label: 'Inventory', href: '/dashboard/inventory', icon: ClipboardList },
      { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
      { label: 'Yield', href: '/dashboard/yield', icon: Scale },
      { label: 'Quotations', href: '/dashboard/quotations', icon: FileCheck },
      { label: 'Finance & P&L', href: '/dashboard/finance', icon: DollarSign },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart2 },
      { label: 'Team', href: '/dashboard/team', icon: Users }
    ] : []),

    { label: 'Alerts', href: '/dashboard/alerts', icon: Bell, badge: alertCount },
    { label: 'Reminders', href: '/dashboard/reminders', icon: AlarmClock },
    { label: 'Vendors', href: '/dashboard/vendors', icon: Store },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings }
  ];

  // ✅ CLEAN ROLE LABELS
  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    owner: 'Owner',
    manager: 'Manager',
    staff: 'Staff',
    customer: 'Customer'
  };

  return (
    <aside className="sidebar">

      {/* LOGO */}
      <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
        <b>iBirdOS</b>
      </div>

      {/* COMPANY */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #eee' }}>
        {user.company_name}
      </div>

      {/* NAV */}
      <nav style={{ padding: 10 }}>
        {navItems.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 10,
                background: active ? '#eee' : 'transparent'
              }}>
                <Icon size={16} />
                {item.label}
                {item.badge && item.badge > 0 && (
                  <span>{item.badge}</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* USER */}
      <div style={{ padding: 20, borderTop: '1px solid #eee' }}>
        <div>{user.full_name}</div>
        <div style={{ fontSize: 12 }}>
          {roleLabels[role] || role}
        </div>

        <button onClick={logout}>
          Logout
        </button>
      </div>

    </aside>
  );
}