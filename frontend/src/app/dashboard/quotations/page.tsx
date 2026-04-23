'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatUSD, formatDate } from '@/lib/format';
import Sidebar from '@/components/shared/Sidebar';
import { Plus, Send, Copy, ExternalLink, Loader, FileCheck, CheckCircle, X } from 'lucide-react';

const STATUS_COLORS: Record<string,string> = {
  draft:'badge-gray', sent:'badge-blue', viewed:'badge-blue',
  approved:'badge-green', rejected:'badge-red', expired:'badge-gray', invoiced:'badge-green'
};

export default function QuotationsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const { data: quotations, isLoading } = useQuery({
    queryKey: ['quotations'],
    queryFn: () => api.get('/quotations').then(r => r.data)
  });

  const { data: recipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => api.get('/recipes').then(r => r.data)
  });

  const sendQuotation = useMutation({
    mutationFn: (id: string) => api.put(`/quotations/${id}/send`, {}),
    onSuccess: (res) => {
      toast.success('Quotation sent');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (res.data?.review_url) {
        const url = `${window.location.origin}/quotation/${res.data.token}`;
        navigator.clipboard.writeText(url).catch(() => {});
        toast.success('Client link copied to clipboard', { icon: '🔗' });
      }
    }
  });

  function copyLink(token: string) {
    const url = `${window.location.origin}/quotation/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Client link copied');
  }

  const totalApproved = quotations?.filter((q:any) => q.status === 'approved').reduce((s:number,q:any) => s + Number(q.total), 0) || 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surface-0)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 28px', background: 'var(--surface-1)', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Quotations</h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              Client approves online → deposit paid via Stripe → booking confirmed
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary"><Plus size={15} /> New quotation</button>
        </div>

        <div style={{ padding: '20px 28px', display: 'grid', gridTemplateColumns: selected ? '1fr 420px' : '1fr', gap: 20 }}>
          <div>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Total', value: quotations?.length || 0 },
                { label: 'Pending', value: quotations?.filter((q:any) => ['sent','viewed'].includes(q.status)).length || 0, color: 'var(--blue)' },
                { label: 'Approved', value: quotations?.filter((q:any) => q.status === 'approved').length || 0, color: 'var(--green)' },
                { label: 'Approved revenue', value: formatUSD(totalApproved), color: 'var(--brand)' },
              ].map(k => (
                <div key={k.label} className="stat-card">
                  <div className="stat-label">{k.label}</div>
                  <div className="stat-value" style={{ color: (k as any).color || 'var(--text-primary)', fontSize: 18 }}>{k.value}</div>
                </div>
              ))}
            </div>

            <div className="card">
              {isLoading && <div style={{ padding: 40, textAlign: 'center' }}><Loader className="spinner" size={18} color="var(--brand)" /></div>}
              <table className="table">
                <thead><tr><th>#</th><th>Client</th><th>Event date</th><th>Total (USD)</th><th>Deposit</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {quotations?.map((q: any) => (
                    <tr key={q.id} onClick={() => setSelected(q)} style={{ cursor:'pointer', background: selected?.id===q.id ? 'var(--surface-2)' : 'transparent' }}>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--brand)', fontWeight:600 }}>{q.quotation_number}</td>
                      <td style={{ fontSize:13 }}>{q.client_name || '—'}</td>
                      <td style={{ fontSize:12, color:'var(--text-secondary)' }}>{q.event_date ? formatDate(q.event_date) : '—'}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:13, fontWeight:600, color:'var(--brand)' }}>{formatUSD(q.total)}</td>
                      <td>
                        {q.deposit_paid
                          ? <span className="badge badge-green" style={{ fontSize:10 }}>✓ Paid</span>
                          : <span style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text-secondary)' }}>{formatUSD(q.deposit_amount)}</span>}
                      </td>
                      <td><span className={`badge ${STATUS_COLORS[q.status]||'badge-gray'}`} style={{ fontSize:10 }}>{q.status}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:4 }}>
                          {q.status === 'draft' && (
                            <button onClick={() => sendQuotation.mutate(q.id)} className="btn btn-ghost" style={{ padding:'5px 8px' }} title="Send"><Send size={12}/></button>
                          )}
                          {q.client_approval_token && (
                            <button onClick={() => copyLink(q.client_approval_token)} className="btn btn-ghost" style={{ padding:'5px 8px' }} title="Copy link"><Copy size={12}/></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && !quotations?.length && (
                    <tr><td colSpan={7} style={{ textAlign:'center', padding:'48px', color:'var(--text-tertiary)', fontSize:13 }}>
                      No quotations yet
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="card" style={{ position:'sticky', top:80, maxHeight:'calc(100vh - 100px)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
              <div className="card-header">
                <div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:15, fontWeight:600 }}>{selected.quotation_number}</div>
                  <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>{selected.client_name || 'No client name'} · {selected.client_email}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)' }}><X size={16}/></button>
              </div>
              <div style={{ flex:1, overflow:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
                {/* P&L breakdown */}
                <div style={{ background:'var(--surface-2)', borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:10, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.05em' }}>USD Breakdown</div>
                  {[
                    { label:'Food cost', value: selected.food_cost },
                    { label:'Labor', value: selected.labor_cost },
                    { label:'Overhead', value: selected.overhead_amount },
                    { label:`Tax (${selected.tax_rate}%)`, value: selected.tax_amount },
                  ].filter(r => parseFloat(r.value) > 0).map(row => (
                    <div key={row.label} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0', color:'var(--text-secondary)', borderBottom:'1px solid var(--border)' }}>
                      <span>{row.label}</span>
                      <span style={{ fontFamily:'var(--font-mono)' }}>{formatUSD(row.value)}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:700, fontFamily:'var(--font-display)', paddingTop:10, marginTop:4 }}>
                    <span>Total</span>
                    <span style={{ color:'var(--brand)' }}>{formatUSD(selected.total)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginTop:6, fontFamily:'var(--font-mono)', color:'var(--text-tertiary)' }}>
                    <span>COGS</span>
                    <span style={{ color: (selected.food_cost/selected.total*100) <= 30 ? 'var(--green)' : (selected.food_cost/selected.total*100) <= 35 ? 'var(--yellow)' : 'var(--red)' }}>
                      {selected.total > 0 ? (selected.food_cost/selected.total*100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>

                {/* Client link */}
                {selected.client_approval_token && (
                  <div style={{ background:'var(--surface-2)', borderRadius:10, padding:'12px 16px' }}>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:8, fontFamily:'var(--font-mono)' }}>CLIENT REVIEW LINK</div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => copyLink(selected.client_approval_token)} className="btn btn-ghost" style={{ fontSize:12, flex:1, justifyContent:'center' }}>
                        <Copy size={12}/> Copy link
                      </button>
                      <a href={`/quotation/${selected.client_approval_token}`} target="_blank" rel="noreferrer">
                        <button className="btn btn-ghost" style={{ fontSize:12 }}><ExternalLink size={12}/></button>
                      </a>
                    </div>
                  </div>
                )}

                {/* Pipeline steps */}
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {[
                    { label:'Sent to client', done: ['sent','viewed','approved','invoiced'].includes(selected.status) },
                    { label:'Client viewed', done: ['viewed','approved','invoiced'].includes(selected.status) },
                    { label:'Client approved', done: selected.approved_by_client },
                    { label:'Deposit paid', done: selected.deposit_paid },
                  ].map(step => (
                    <div key={step.label} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13 }}>
                      <div style={{ width:20, height:20, borderRadius:'50%', background: step.done ? 'var(--green)' : 'var(--surface-3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {step.done && <span style={{ fontSize:10, color:'var(--surface-0)' }}>✓</span>}
                      </div>
                      <span style={{ color: step.done ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{step.label}</span>
                    </div>
                  ))}
                </div>

                {selected.status === 'draft' && (
                  <button onClick={() => sendQuotation.mutate(selected.id)} className="btn btn-primary" disabled={sendQuotation.isPending} style={{ justifyContent:'center' }}>
                    <Send size={14}/> {sendQuotation.isPending ? 'Sending...' : 'Send to client'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <QuotationCreateModal
          recipes={recipes || []}
          onClose={() => setShowCreate(false)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey:['quotations'] }); setShowCreate(false); }}
        />
      )}
    </div>
  );
}

function QuotationCreateModal({ recipes, onClose, onSaved }: any) {
  const [form, setForm] = useState({ client_name:'', client_email:'', client_phone:'', event_date:'', event_location:'', headcount:'', notes:'', deposit_percent:'50', overhead_pct:'15', labor_pct:'25', tax_rate:'0' });
  const [items, setItems] = useState<any[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);

  function addItem(recipe: any) {
    if (items.find(i => i.recipe_id === recipe.id)) return;
    setItems(prev => [...prev, { recipe_id: recipe.id, name: recipe.name, quantity: parseInt(form.headcount)||1, unit_price: recipe.selling_price, portion_size_oz: null }]);
  }

  async function calculatePreview() {
    if (!items.length) { toast.error('Add at least one item'); return; }
    setCalculating(true);
    try {
      const res = await api.post('/quotations/calculate', {
        items, headcount: parseInt(form.headcount)||1,
        overhead_pct: parseFloat(form.overhead_pct), labor_pct: parseFloat(form.labor_pct), tax_rate: parseFloat(form.tax_rate)
      });
      setPreview(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Calculation failed');
    } finally { setCalculating(false); }
  }

  async function handleSave() {
    if (!items.length || !form.client_name) { toast.error('Client name and items required'); return; }
    setSaving(true);
    try {
      await api.post('/quotations', {
        ...form, items,
        headcount: parseInt(form.headcount)||0,
        overhead_pct: parseFloat(form.overhead_pct),
        labor_pct: parseFloat(form.labor_pct),
        tax_rate: parseFloat(form.tax_rate),
        deposit_percent: parseFloat(form.deposit_percent)
      });
      toast.success('Quotation created');
      onSaved();
    } catch (err: any) { toast.error(err?.response?.data?.error||'Failed'); } finally { setSaving(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div className="card animate-in" style={{ width:'100%', maxWidth:720, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div className="card-header">
          <span style={{ fontFamily:'var(--font-display)', fontSize:17 }}>New Quotation</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)' }}><X size={18}/></button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:24, display:'flex', flexDirection:'column', gap:16 }}>
          {/* Client info */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[['client_name','Client name *','e.g. Café 71'],['client_email','Email','client@email.com'],['client_phone','Phone',''],['event_date','Event date',''],['event_location','Venue',''],['headcount','Guest count','0']].map(([key,label,placeholder]) => (
              <div key={key} style={{ gridColumn:['client_name','event_location'].includes(key)?'1/-1':'auto' }}>
                <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:5 }}>{label}</label>
                <input className="input" type={key==='event_date'?'datetime-local':'text'} value={(form as any)[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))} placeholder={placeholder} />
              </div>
            ))}
          </div>
          {/* Rates */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            {[['overhead_pct','Overhead %'],['labor_pct','Labor %'],['tax_rate','Tax %'],['deposit_percent','Deposit %']].map(([key,label]) => (
              <div key={key}>
                <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:5 }}>{label}</label>
                <input className="input" type="number" min={0} max={100} value={(form as any)[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} />
              </div>
            ))}
          </div>
          {/* Menu items */}
          <div>
            <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:8 }}>Add menu items</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
              {recipes.filter((r:any) => !items.find((i:any)=>i.recipe_id===r.id)).slice(0,20).map((r:any) => (
                <button key={r.id} onClick={() => addItem(r)} style={{ fontSize:12, padding:'4px 12px', borderRadius:99, background:'var(--surface-3)', border:'none', cursor:'pointer', color:'var(--text-secondary)' }}>
                  + {r.name} ({formatUSD(r.selling_price)})
                </button>
              ))}
            </div>
            {items.map((item,idx) => (
              <div key={idx} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <span style={{ flex:1, fontSize:13 }}>{item.name}</span>
                <input type="number" min={1} value={item.quantity} onChange={e=>setItems(prev=>prev.map((it,i)=>i===idx?{...it,quantity:parseInt(e.target.value)||1}:it))}
                  style={{ width:70, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', color:'var(--text-primary)', fontSize:12 }} />
                <span style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--brand)', minWidth:70 }}>{formatUSD(item.unit_price)}</span>
                <button onClick={() => setItems(prev=>prev.filter((_,i)=>i!==idx))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:4 }}>✕</button>
              </div>
            ))}
          </div>
          {/* Live pricing preview */}
          {preview && (
            <div style={{ background:'var(--surface-2)', borderRadius:10, padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              {[
                { label:'Food', value: formatUSD(preview.food_cost) },
                { label:'Labor', value: formatUSD(preview.labor_cost) },
                { label:'Total', value: formatUSD(preview.total), color:'var(--brand)' },
                { label:'COGS', value: `${preview.overall_cogs_pct}%`, color: parseFloat(preview.overall_cogs_pct)<=30?'var(--green)':parseFloat(preview.overall_cogs_pct)<=35?'var(--yellow)':'var(--red)' }
              ].map(k=>(
                <div key={k.label} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:18, fontFamily:'var(--font-display)', fontWeight:700, color:(k as any).color||'var(--text-primary)' }}>{k.value}</div>
                  <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:'var(--font-mono)' }}>{k.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={calculatePreview} className="btn btn-ghost" disabled={!items.length||calculating}>
            {calculating?<Loader size={13} className="spinner"/>:null} Preview pricing
          </button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving||!items.length}>
            {saving?<Loader size={13} className="spinner"/>:<FileCheck size={14}/>} Create quotation
          </button>
        </div>
      </div>
    </div>
  );
}


