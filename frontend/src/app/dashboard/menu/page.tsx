'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { formatUSD } from '@/lib/format';
import Sidebar from '@/components/shared/Sidebar';
import FoodCostBadge from '@/components/shared/FoodCostBadge';
import { ExternalLink, Flame, TrendingUp } from 'lucide-react';

export default function MenuPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  const { data: recipes, isLoading } = useQuery({
    queryKey: ['menu-recipes'],
    queryFn: () => api.get('/recipes').then(r => r.data)
  });

  const grouped = recipes?.reduce((acc: any, r: any) => {
    const cat = r.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {}) || {};

  const totalRecipes = recipes?.length || 0;
  const avgMargin = recipes?.length
    ? (recipes.reduce((s: number, r: any) => s + (100 - parseFloat(r.food_cost_percent || 0)), 0) / recipes.length).toFixed(1)
    : '0.0';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Menu</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {totalRecipes} items · avg margin {avgMargin}%
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {user?.company_slug && (
              <a href={`/restaurant/${user.company_slug}/menu`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <button className="btn btn-ghost" style={{ fontSize: 13 }}>
                  <ExternalLink size={14} /> Client view
                </button>
              </a>
            )}
            <button onClick={() => router.push('/dashboard/recipes')} className="btn btn-primary" style={{ fontSize: 13 }}>
              <Flame size={14} /> Manage recipes
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Total items', value: totalRecipes },
              { label: 'Avg margin', value: `${avgMargin}%`, color: 'var(--green)' },
              { label: 'Available', value: recipes?.filter((r: any) => r.is_available).length || 0 },
              { label: 'Categories', value: Object.keys(grouped).length }
            ].map(k => (
              <div key={k.label} className="stat-card">
                <div className="stat-label">{k.label}</div>
                <div className="stat-value" style={{ color: (k as any).color || 'var(--text-primary)', fontSize: 22 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {Object.entries(grouped).map(([category, items]: [string, any]) => (
            <div key={category} style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                {category} ({items.length})
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div className="card">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Selling Price</th>
                      <th>Cost</th>
                      <th>Margin %</th>
                      <th>Food Cost %</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((recipe: any) => {
                      const margin = recipe.selling_price > 0 && recipe.base_cost
                        ? ((recipe.selling_price - recipe.base_cost) / recipe.selling_price * 100)
                        : null;
                      return (
                        <tr key={recipe.id}>
                          <td>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{recipe.name}</div>
                            {recipe.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{recipe.description.substring(0, 70)}</div>}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--brand)' }}>
                            {formatUSD(recipe.selling_price)}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                            {recipe.base_cost ? formatUSD(recipe.base_cost) : '—'}
                          </td>
                          <td>
                            {margin !== null ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <TrendingUp size={12} color="var(--green)" />
                                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--green)', fontWeight: 600 }}>
                                  {margin.toFixed(1)}%
                                </span>
                              </div>
                            ) : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                          </td>
                          <td>
                            {recipe.food_cost_percent
                              ? <FoodCostBadge percent={parseFloat(recipe.food_cost_percent)} size="sm" showBar />
                              : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                          </td>
                          <td>
                            <span className={`badge ${recipe.is_available ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 11 }}>
                              {recipe.is_available ? 'Available' : 'Hidden'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {!isLoading && totalRecipes === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
              <Flame size={36} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
              <div style={{ fontSize: 15, marginBottom: 12 }}>No menu items yet</div>
              <button onClick={() => router.push('/dashboard/recipes')} className="btn btn-primary" style={{ margin: '0 auto' }}>
                Create first recipe
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


