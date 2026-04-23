'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import { Plus, Search, Pencil, Trash2, TrendingUp, TrendingDown, X, Loader, ChevronRight } from 'lucide-react';

const UNITS = ['kg','g','lb','oz','l','ml','each','case','dozen','bunch'];
const CATEGORIES = ['Protein','Produce','Dairy','Grain','Spice','Oil','Sauce','Beverage','Dry Good','Frozen','Other'];

export default function IngredientsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const currency = user?.currency || '₹';
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{show:boolean; item?:any}>({ show: false });
  const [form, setForm] = useState({ name:'', category:'', unit:'kg', current_price:'', supplier:'', allergens:'' });
  const [saving, setSaving] = useState(false);
  const [historyId, setHistoryId] = useState<string|null>(null);

  const { data: ingredients, isLoading } = useQuery({
    queryKey: ['ingredients', search],
    queryFn: () => api.get(`/ingredients?search=${search}`).then(r => r.data)
  });

  const { data: priceHistory } = useQuery({
    queryKey: ['price-history', historyId],
    queryFn: () => api.get(`/finance/price-history/${historyId}`).then(r => r.data),
    enabled: !!historyId
  });

  function openCreate() {
    setForm({ name:'', category:'', unit:'kg', current_price:'', supplier:'', allergens:'' });
    setModal({ show: true });
  }

  function openEdit(ing: any) {
    setForm({
      name: ing.name, category: ing.category||'', unit: ing.unit,
      current_price: ing.current_price, supplier: ing.supplier||'', allergens: (ing.allergens||[]).join(', ')
    });
    setModal({ show: true, item: ing });
  }

  async function handleSave() {
    if (!form.name || !form.current_price) { toast.error('Name and price required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        current_price: parseFloat(form.current_price),
        allergens: form.allergens ? form.allergens.split(',').map(s => s.trim()).filter(Boolean) : []
      };
      if (modal.item) {
        await api.put(`/ingredients/${modal.item.id}`, payload);
        toast.success('Ingredient updated — all recipes recalculated');
      } else {
        await api.post('/ingredients', payload);
        toast.success('Ingredient created');
      }
      queryClient.invalidateQueries({ queryKey: ['ingredients'] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setModal({ show: false });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ingredients/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ingredients'] }); toast.success('Ingredient removed'); }
  });

  // Group by category
  const grouped = ingredients?.reduce((acc: any, ing: any) => {
    const cat = ing.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ing);
    return acc;
  }, {});

  const priceChangePct = (ing: any) => {
    if (!ing.previous_price || ing.previous_price === 0) return null;
    return ((ing.current_price - ing.previous_price) / ing.previous_price * 100);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        {/* Topbar */}
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Ingredients</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {ingredients?.length || 0} ingredients · price changes auto-recalculate all recipes
            </p>
          </div>
          <button onClick={openCreate} className="btn btn-primary"><Plus size={15} /> Add ingredient</button>
        </div>

        <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: historyId ? '1fr 340px' : '1fr', gap: 20 }}>
          <div>
            {/* Search */}
            <div style={{ position: 'relative', maxWidth: 320, marginBottom: 20 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input className="input" style={{ paddingLeft: 36 }} placeholder="Search ingredients..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spinner" size={20} color="var(--brand)" /></div>}

            {/* Grouped by category */}
            {grouped && Object.entries(grouped).map(([cat, items]: [string, any]) => (
              <div key={cat} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>
                  {cat} ({items.length})
                </div>
                <div className="card">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Unit</th>
                        <th>Price</th>
                        <th>vs Previous</th>
                        <th>Supplier</th>
                        <th>Updated</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((ing: any) => {
                        const changePct = priceChangePct(ing);
                        return (
                          <tr key={ing.id}>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{ing.name}</div>
                              {ing.allergens?.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                                  {ing.allergens.map((a: string) => (
                                    <span key={a} style={{ fontSize: 10, background: 'var(--yellow-bg)', color: 'var(--yellow)', padding: '1px 5px', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>{a}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{ing.unit}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--brand)' }}>
                              {currency}{Number(ing.current_price).toFixed(2)}
                            </td>
                            <td>
                              {changePct !== null ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {changePct > 0
                                    ? <TrendingUp size={13} color="var(--red)" />
                                    : <TrendingDown size={13} color="var(--green)" />
                                  }
                                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: changePct > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 500 }}>
                                    {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                                  </span>
                                </div>
                              ) : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ing.supplier || '—'}</td>
                            <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                              {ing.price_updated_at ? new Date(ing.price_updated_at).toLocaleDateString() : '—'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={() => setHistoryId(historyId === ing.id ? null : ing.id)} className="btn btn-ghost" style={{ padding: '5px 8px' }} title="Price history">
                                  <ChevronRight size={13} style={{ transform: historyId === ing.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                                </button>
                                <button onClick={() => openEdit(ing)} className="btn btn-ghost" style={{ padding: '5px 8px' }}>
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => { if (confirm(`Remove ${ing.name}?`)) deleteMut.mutate(ing.id); }} className="btn btn-danger" style={{ padding: '5px 8px' }}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {!isLoading && ingredients?.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-tertiary)' }}>
                <div style={{ fontSize: 15, marginBottom: 12 }}>No ingredients yet</div>
                <button onClick={openCreate} className="btn btn-primary" style={{ margin: '0 auto' }}><Plus size={14} /> Add first ingredient</button>
              </div>
            )}
          </div>

          {/* Price history panel */}
          {historyId && priceHistory && (
            <div className="card" style={{ position: 'sticky', top: 80, maxHeight: 'calc(100vh - 100px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>{priceHistory.ingredient?.name}</div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Current: {currency}{Number(priceHistory.ingredient?.current_price).toFixed(2)}/{priceHistory.ingredient?.unit}
                  </div>
                </div>
                <button onClick={() => setHistoryId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
                {priceHistory.history?.length === 0 && (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No price history yet</div>
                )}
                {priceHistory.history?.map((pp: any, idx: number) => {
                  const prev = priceHistory.history[idx + 1];
                  const change = prev ? ((pp.price_per_unit - prev.price_per_unit) / prev.price_per_unit * 100) : null;
                  return (
                    <div key={pp.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {currency}{Number(pp.price_per_unit).toFixed(2)}/{pp.unit}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                          {pp.invoice_supplier || pp.supplier || 'Manual'} · {new Date(pp.recorded_at).toLocaleDateString()}
                        </div>
                      </div>
                      {change !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {change > 0 ? <TrendingUp size={13} color="var(--red)" /> : <TrendingDown size={13} color="var(--green)" />}
                          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: change > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 500 }}>
                            {change > 0 ? '+' : ''}{change.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit modal */}
      {modal.show && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card animate-in" style={{ width: '100%', maxWidth: 460 }}>
            <div className="card-header">
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{modal.item ? 'Edit' : 'Add'} Ingredient</span>
              <button onClick={() => setModal({ show: false })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {modal.item && (
                <div style={{ background: 'var(--yellow-bg)', border: '1px solid var(--yellow)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--yellow)' }}>
                  Changing the price will immediately recalculate all recipes that use this ingredient
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Name *</label>
                  <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Chicken Breast" />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Category</label>
                  <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ cursor: 'pointer' }}>
                    <option value="">Select...</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Unit *</label>
                  <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={{ cursor: 'pointer' }}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Price per {form.unit} *</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: 14 }}>{currency}</span>
                    <input className="input" type="number" min={0} step={0.01} value={form.current_price} onChange={e => setForm(f => ({ ...f, current_price: e.target.value }))} style={{ paddingLeft: 28 }} placeholder="0.00" />
                  </div>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Supplier</label>
                  <input className="input" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="e.g. Sysco, US Foods..." />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Allergens (comma-separated)</label>
                  <input className="input" value={form.allergens} onChange={e => setForm(f => ({ ...f, allergens: e.target.value }))} placeholder="e.g. gluten, dairy, nuts" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button onClick={() => setModal({ show: false })} className="btn btn-ghost">Cancel</button>
                <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader size={14} className="spinner" /> : null}
                  {modal.item ? 'Update' : 'Create'} ingredient
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


