'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import Sidebar from '@/components/shared/Sidebar';
import { Upload, FileText, CheckCircle, AlertTriangle, Clock, Loader, ChevronRight } from 'lucide-react';

export default function InvoicesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [supplier, setSupplier] = useState('');
  const [uploading, setUploading] = useState(false);
  const [reviewInvoice, setReviewInvoice] = useState<any>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get('/invoices').then(r => r.data)
  });

  const { data: invoiceDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['invoice-detail', reviewInvoice?.id],
    queryFn: () => api.get(`/invoices/${reviewInvoice.id}`).then(r => r.data),
    enabled: !!reviewInvoice?.id,
    refetchInterval: reviewInvoice?.parse_status === 'processing' ? 3000 : false
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (!supplier.trim()) { toast.error('Enter supplier name first'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('supplier', supplier);
      const res = await api.post('/invoices/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Invoice uploaded — AI is parsing it now');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setReviewInvoice({ id: res.data.invoice_id, parse_status: 'processing' });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [supplier]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] }, maxFiles: 1
  });

  const confirmItems = useMutation({
    mutationFn: ({ id, items }: any) => api.post(`/invoices/${id}/confirm-items`, { items }),
    onSuccess: () => {
      toast.success('Prices updated — all affected recipes recalculated');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setReviewInvoice(null);
    }
  });

  const detail = invoiceDetail;
  const currency = user?.currency || '₹';

  const statusIcon = (status: string) => {
    if (status === 'done') return <CheckCircle size={14} color="var(--green)" />;
    if (status === 'processing') return <Loader size={14} className="spinner" color="var(--brand)" />;
    if (status === 'failed') return <AlertTriangle size={14} color="var(--red)" />;
    return <Clock size={14} color="var(--text-tertiary)" />;
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Invoices</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            Upload supplier invoices → AI extracts prices → recipes auto-update
          </p>
        </div>

        <div style={{ padding: '24px 28px', display: 'grid', gridTemplateColumns: reviewInvoice ? '1fr 480px' : '1fr', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Upload area */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>Upload supplier invoice</span>
              </div>
              <div className="card-body">
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Supplier name</label>
                  <input className="input" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Sysco, US Foods, local vendor..." style={{ maxWidth: 300 }} />
                </div>
                <div {...getRootProps()} style={{
                  border: `2px dashed ${isDragActive ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 12, padding: '36px 24px', textAlign: 'center', cursor: 'pointer',
                  background: isDragActive ? 'var(--brand-glow)' : 'var(--surface-2)',
                  transition: 'all 0.15s'
                }}>
                  <input {...getInputProps()} />
                  {uploading ? (
                    <div><Loader size={28} className="spinner" color="var(--brand)" style={{ margin: '0 auto 12px' }} /><div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Uploading...</div></div>
                  ) : (
                    <>
                      <Upload size={28} style={{ margin: '0 auto 12px', display: 'block', color: isDragActive ? 'var(--brand)' : 'var(--text-tertiary)' }} />
                      <div style={{ fontSize: 15, fontWeight: 500, color: isDragActive ? 'var(--brand)' : 'var(--text-primary)', marginBottom: 6 }}>
                        {isDragActive ? 'Drop invoice here' : 'Drop invoice PDF or image'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        PDF, JPG, PNG — max 15MB · AI extracts all line items automatically
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Invoice history */}
            <div className="card">
              <div className="card-header">
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>Invoice history</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Alerts</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}><Loader className="spinner" size={18} color="var(--brand)" /></td></tr>}
                  {invoices?.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontSize: 13 }}>No invoices yet</td></tr>}
                  {invoices?.map((inv: any) => (
                    <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setReviewInvoice(inv)}>
                      <td style={{ fontWeight: 500 }}>{inv.supplier}</td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{inv.invoice_date || new Date(inv.created_at).toLocaleDateString()}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{inv.item_count || '—'}</td>
                      <td>
                        {inv.price_alerts > 0 ? <span className="badge badge-red" style={{ fontSize: 11 }}>⚡ {inv.price_alerts} alerts</span> : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          {statusIcon(inv.parse_status)}
                          <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{inv.parse_status}</span>
                          {inv.parse_confidence && <span style={{ color: 'var(--text-tertiary)' }}>({inv.parse_confidence}%)</span>}
                        </div>
                      </td>
                      <td><ChevronRight size={16} color="var(--text-tertiary)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Review panel */}
          {reviewInvoice && (
            <div className="card" style={{ position: 'sticky', top: 80, maxHeight: 'calc(100vh - 100px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>{detail?.supplier || reviewInvoice.supplier}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {detail?.parse_status === 'processing' ? 'AI is parsing...' : `${detail?.items?.length || 0} items extracted`}
                  </div>
                </div>
                <button onClick={() => setReviewInvoice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
              </div>

              {detail?.parse_status === 'processing' || loadingDetail ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
                  <Loader size={32} className="spinner" color="var(--brand)" />
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                    AI is reading the invoice<br />This takes 10–30 seconds
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    {detail?.items?.map((item: any, idx: number) => (
                      <div key={item.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{item.matched_name || item.raw_name}</div>
                          {item.alert_triggered && (
                            <span className="badge badge-red" style={{ fontSize: 10, flexShrink: 0 }}>
                              {item.price_change_percent > 0 ? '▲' : '▼'} {Math.abs(item.price_change_percent).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 14, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          <span>{item.quantity} {item.unit}</span>
                          <span style={{ color: item.alert_triggered ? (item.price_change_percent > 0 ? 'var(--red)' : 'var(--green)') : 'var(--brand)' }}>
                            {currency}{item.unit_price}/{item.unit}
                          </span>
                          {item.previous_unit_price && <span>prev: {currency}{item.previous_unit_price}</span>}
                          <span>{currency}{item.total_price}</span>
                        </div>
                        {!item.matched_name && <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>⚠ No match found — prices won't auto-update</div>}
                      </div>
                    ))}
                  </div>
                  {detail?.items?.length > 0 && (
                    <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
                        Confirming will update ingredient prices and recalculate all affected recipes
                      </div>
                      <button
                        onClick={() => confirmItems.mutate({
                          id: reviewInvoice.id,
                          items: detail.items.map((i: any) => ({ ...i, confirm: !!i.ingredient_id }))
                        })}
                        className="btn btn-primary"
                        disabled={confirmItems.isPending}
                        style={{ width: '100%', justifyContent: 'center' }}>
                        {confirmItems.isPending ? 'Updating prices...' : `Confirm & update ${detail.items.filter((i: any) => i.ingredient_id).length} ingredient prices`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}


