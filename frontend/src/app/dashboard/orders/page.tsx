'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore, canSeeFinancials } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import { ShoppingCart, Search, Filter, Loader, ChevronRight } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  pending: 'badge-blue', confirmed: 'badge-blue', preparing: 'badge-yellow',
  ready: 'badge-green', delivered: 'badge-green', cancelled: 'badge-red'
};

const STATUS_FLOW = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];

export default function OrdersPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const showFinancials = user ? canSeeFinancials(user.role) : false;
  const currency = '$';

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: () => api.get(`/orders?status=${statusFilter}&limit=100`).then(r => r.data),
    refetchInterval: 30_000
  });

  const { data: orderDetail } = useQuery({
    queryKey: ['order-detail', selected?.id],
    queryFn: () => api.get(`/orders/${selected.id}`).then(r => r.data),
    enabled: !!selected?.id
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: any) => api.put(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-detail', selected?.id] });
      toast.success('Order status updated');
    }
  });

  const nextStatus = (current: string) => {
    const idx = STATUS_FLOW.indexOf(current);
    return idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
  };

  // Group orders by status for kanban-style view
  const grouped = {
    pending: orders?.filter((o: any) => ['pending', 'confirmed'].includes(o.status)) || [],
    preparing: orders?.filter((o: any) => o.status === 'preparing') || [],
    ready: orders?.filter((o: any) => o.status === 'ready') || [],
    delivered: orders?.filter((o: any) => o.status === 'delivered') || [],
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Orders</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {orders?.length || 0} orders · live updates every 30s
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['','pending','preparing','ready','delivered','cancelled'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
                fontFamily: 'var(--font-mono)', textTransform: 'capitalize',
                background: statusFilter === s ? 'var(--brand)' : 'var(--surface-3)',
                color: statusFilter === s ? '#0d1117' : 'var(--text-secondary)'
              }}>{s || 'All'}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: selected ? '1fr 400px' : '1fr', gap: 20 }}>

          {/* Kanban columns */}
          {!statusFilter && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {Object.entries(grouped).map(([col, colOrders]) => (
                <div key={col}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{col}</span>
                    <span style={{ background: 'var(--surface-3)', padding: '1px 8px', borderRadius: 99 }}>{colOrders.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colOrders.map((order: any) => (
                      <div key={order.id} onClick={() => setSelected(order)} style={{
                        background: 'var(--surface-1)', border: `1px solid ${selected?.id === order.id ? 'var(--brand)' : 'var(--border)'}`,
                        borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.12s'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>{order.order_number}</span>
                          <span className={`badge ${STATUS_COLORS[order.status] || 'badge-gray'}`} style={{ fontSize: 10 }}>{order.status}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          {order.order_type?.replace('_', ' ')}
                          {order.table_number && ` · Table ${order.table_number}`}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                          {currency}{Number(order.total).toFixed(0)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                          {new Date(order.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    ))}
                    {colOrders.length === 0 && (
                      <div style={{ background: 'var(--surface-1)', border: '1px dashed var(--border)', borderRadius: 10, padding: '24px 14px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                        No orders
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Flat list when filtered */}
          {statusFilter && (
            <div className="card">
              {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spinner" size={20} color="var(--brand)" /></div>}
              <table className="table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Type</th>
                    <th>Items</th>
                    <th>Total</th>
                    {showFinancials && <th>Profit</th>}
                    <th>Status</th>
                    <th>Time</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders?.map((order: any) => (
                    <tr key={order.id} onClick={() => setSelected(order)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--brand)', fontWeight: 600 }}>{order.order_number}</td>
                      <td style={{ fontSize: 12, textTransform: 'capitalize' }}>{order.order_type?.replace('_', ' ')}{order.table_number ? ` · ${order.table_number}` : ''}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{order.item_count} items</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{currency}{Number(order.total).toFixed(2)}</td>
                      {showFinancials && <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: Number(order.gross_profit) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {currency}{Number(order.gross_profit || 0).toFixed(2)}
                      </td>}
                      <td><span className={`badge ${STATUS_COLORS[order.status] || 'badge-gray'}`} style={{ fontSize: 11 }}>{order.status}</span></td>
                      <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                        {new Date(order.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td><ChevronRight size={14} color="var(--text-tertiary)" /></td>
                    </tr>
                  ))}
                  {!isLoading && orders?.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontSize: 13 }}>No orders found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Order detail panel */}
          {selected && orderDetail && (
            <div className="card" style={{ position: 'sticky', top: 80, maxHeight: 'calc(100vh - 100px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--brand)' }}>{orderDetail.order_number}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {orderDetail.order_type?.replace('_', ' ')}
                    {orderDetail.table_number ? ` · Table ${orderDetail.table_number}` : ''}
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {/* Items */}
                {orderDetail.items?.map((item: any) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{item.recipe_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>x{item.quantity}</div>
                      {item.special_requests && <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 2 }}>⚠ {item.special_requests}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{currency}{Number(item.line_total).toFixed(2)}</div>
                      {showFinancials && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>cost: {currency}{Number(item.line_cost || 0).toFixed(2)}</div>}
                    </div>
                  </div>
                ))}

                {/* Totals */}
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
                  {[
                    { label: 'Subtotal', value: orderDetail.subtotal },
                    { label: 'Tax', value: orderDetail.tax_amount },
                  ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>
                      <span>{r.label}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{currency}{Number(r.value).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span>Total</span><span style={{ color: 'var(--brand)' }}>{currency}{Number(orderDetail.total).toFixed(2)}</span>
                  </div>
                  {showFinancials && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, color: Number(orderDetail.gross_profit) >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                      <span>Gross profit</span><span>{currency}{Number(orderDetail.gross_profit || 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Special instructions */}
                {orderDetail.special_instructions && (
                  <div style={{ margin: '0 20px 14px', background: 'var(--yellow-bg)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--yellow)' }}>
                    ⚠ {orderDetail.special_instructions}
                  </div>
                )}

                {/* Status actions */}
                {orderDetail.status !== 'delivered' && orderDetail.status !== 'cancelled' && (
                  <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {nextStatus(orderDetail.status) && (
                      <button
                        onClick={() => updateStatus.mutate({ id: orderDetail.id, status: nextStatus(orderDetail.status) })}
                        className="btn btn-primary"
                        disabled={updateStatus.isPending}
                        style={{ justifyContent: 'center' }}>
                        Move to: {nextStatus(orderDetail.status)}
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm('Cancel this order?')) updateStatus.mutate({ id: orderDetail.id, status: 'cancelled' }); }}
                      className="btn btn-danger"
                      style={{ justifyContent: 'center', fontSize: 12 }}>
                      Cancel order
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


