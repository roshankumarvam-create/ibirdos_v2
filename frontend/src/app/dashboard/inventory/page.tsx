'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Sidebar from '@/components/shared/Sidebar';
import { Package, AlertTriangle, Loader, Upload, Save } from 'lucide-react';

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});

  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then(r => r.data)
  });

  const { data: lowStock } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then(r => r.data)
  });

  const updateStock = useMutation({
    mutationFn: ({ ingredientId, data }: any) => api.put(`/inventory/${ingredientId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      toast.success('Stock updated');
      setEditId(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Update failed')
  });

  function startEdit(inv: any) {
    setEditId(inv.ingredient_id);
    setEditValues({ quantity_on_hand: inv.quantity_on_hand, reorder_threshold: inv.reorder_threshold });
  }

  function saveEdit(inv: any) {
    updateStock.mutate({
      ingredientId: inv.ingredient_id,
      data: {
        quantity_on_hand: parseFloat(editValues.quantity_on_hand) || 0,
        reorder_threshold: parseFloat(editValues.reorder_threshold) || 0,
        location_id: inv.location_id
      }
    });
  }

  const stockPct = (inv: any) => {
    if (!inv.reorder_threshold || inv.reorder_threshold === 0) return 100;
    return Math.min(100, (inv.quantity_on_hand / (inv.reorder_threshold * 2)) * 100);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Inventory</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              Stock auto-deducts on orders · alerts fire when below threshold
            </p>
          </div>
          <button onClick={() => window.location.href = '/dashboard/invoices'} className="btn btn-ghost" style={{ fontSize: 13 }}>
            <Upload size={14} /> Upload invoice to restock
          </button>
        </div>

        <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Low stock alert */}
          {lowStock && lowStock.length > 0 && (
            <div style={{ background: 'var(--red-bg)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={16} color="var(--red)" />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>{lowStock.length} items below reorder threshold</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {lowStock.map((item: any) => (
                  <div key={item.ingredient_id} style={{
                    background: 'var(--surface-2)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: 8,
                    padding: '8px 14px', fontSize: 13
                  }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.name}</div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      <span style={{ color: 'var(--red)' }}>{Number(item.quantity_on_hand).toFixed(1)} {item.unit}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}> / need {Number(item.reorder_threshold).toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inventory table */}
          <div className="card">
            {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spinner" size={20} color="var(--brand)" /></div>}
            {!isLoading && inventory?.length === 0 && (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <Package size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                <div style={{ fontSize: 15, marginBottom: 8 }}>No inventory records</div>
                <div style={{ fontSize: 13 }}>Stock is created automatically when orders are placed or invoices are confirmed</div>
              </div>
            )}
            {inventory && inventory.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>Category</th>
                    <th>On Hand</th>
                    <th>Reorder At</th>
                    <th>Stock Level</th>
                    <th>Est. Value</th>
                    <th>Last Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((inv: any) => {
                    const isEditing = editId === inv.ingredient_id;
                    const pct = stockPct(inv);
                    const isLow = inv.is_low_stock;
                    return (
                      <tr key={inv.id} style={{ background: isLow ? 'rgba(248,81,73,0.04)' : 'transparent' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isLow && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />}
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{inv.name}</span>
                          </div>
                        </td>
                        <td><span className="badge badge-gray" style={{ fontSize: 10 }}>{inv.category || '—'}</span></td>
                        <td>
                          {isEditing ? (
                            <input type="number" min={0} step={0.1} value={editValues.quantity_on_hand}
                              onChange={e => setEditValues(v => ({ ...v, quantity_on_hand: e.target.value }))}
                              style={{ width: 90, background: 'var(--surface-3)', border: '1px solid var(--brand)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)' }} />
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: isLow ? 'var(--red)' : 'var(--text-primary)', fontWeight: isLow ? 600 : 400 }}>
                              {Number(inv.quantity_on_hand).toFixed(2)} {inv.unit}
                            </span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input type="number" min={0} step={0.1} value={editValues.reorder_threshold}
                              onChange={e => setEditValues(v => ({ ...v, reorder_threshold: e.target.value }))}
                              style={{ width: 90, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)' }} />
                          ) : (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                              {Number(inv.reorder_threshold).toFixed(1)} {inv.unit}
                            </span>
                          )}
                        </td>
                        <td style={{ width: 140 }}>
                          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 3,
                              width: `${Math.min(100, pct)}%`,
                              background: pct < 30 ? 'var(--red)' : pct < 60 ? 'var(--yellow)' : 'var(--green)',
                              transition: 'width 0.3s'
                            }} />
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{Math.round(pct)}%</div>
                        </td>
                        <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {inv.current_price ? `$${(inv.quantity_on_hand * inv.current_price).toFixed(2)}` : '—'}
                        </td>
                        <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                          {new Date(inv.last_updated).toLocaleDateString()}
                        </td>
                        <td>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => saveEdit(inv)} className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 12 }}>
                                <Save size={12} /> Save
                              </button>
                              <button onClick={() => setEditId(null)} className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 12 }}>✕</button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(inv)} className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }}>Edit</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


