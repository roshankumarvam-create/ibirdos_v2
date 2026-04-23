'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { CheckCircle, Clock, Flame, CreditCard, Loader, AlertTriangle } from 'lucide-react';

function CogsBadge({ pct }: { pct: number }) {
  const color = pct <= 30 ? '#3fb950' : pct <= 35 ? '#e3b341' : '#f85149';
  const label = pct <= 30 ? '✓ Good' : pct <= 35 ? '~ Watch' : '! High';
  return (
    <span style={{ fontSize: 12, background: color + '18', color, padding: '2px 8px', borderRadius: 99, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
      COGS {pct.toFixed(1)}% {label}
    </span>
  );
}

export default function QuotationReviewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const [approved, setApproved] = useState(false);

  const { data: quotation, isLoading, error } = useQuery({
    queryKey: ['quotation-review', token],
    queryFn: () => api.get(`/quotations/review/${token}`).then(r => r.data),
    retry: false
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/quotations/approve/${token}`, {}),
    onSuccess: () => { setApproved(true); toast.success('Quotation approved!'); }
  });

  const payDeposit = useMutation({
    mutationFn: () => api.post(`/quotations/${quotation.id}/deposit`, {}),
    onSuccess: (res) => { window.location.href = res.data.checkout_url; }
  });

  const depositSuccess = searchParams.get('deposit') === 'success';

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader size={28} className="spinner" color="var(--brand)" />
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <AlertTriangle size={36} color="var(--red)" />
      <div style={{ fontSize: 16, color: 'var(--text-primary)' }}>Quotation not found or expired</div>
    </div>
  );

  if (!quotation) return null;

  const isApproved = approved || quotation.status === 'approved';
  const depositPaid = depositSuccess || quotation.deposit_paid;
  const overallCogs = quotation.total > 0 ? (quotation.food_cost / quotation.total * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Flame size={18} color="#0d1117" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{quotation.company_name}</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.3px', marginBottom: 6 }}>
            Your Event Quotation
          </h1>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{quotation.quotation_number}</span>
            <span style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 99, fontFamily: 'var(--font-mono)',
              background: isApproved ? 'var(--green-bg)' : 'var(--yellow-bg)',
              color: isApproved ? 'var(--green)' : 'var(--yellow)'
            }}>
              {isApproved ? '✓ Approved' : quotation.status}
            </span>
          </div>
        </div>

        {/* Deposit success banner */}
        {depositPaid && (
          <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 10, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={20} color="var(--green)" />
            <span style={{ fontSize: 14, color: 'var(--green)' }}>Deposit received — you're confirmed! We'll be in touch soon.</span>
          </div>
        )}

        {/* Event details */}
        {(quotation.event_date || quotation.event_location) && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {quotation.event_date && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>EVENT DATE</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{new Date(quotation.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
              )}
              {quotation.headcount > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>GUESTS</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{quotation.headcount} people</div>
                </div>
              )}
              {quotation.event_location && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>LOCATION</div>
                  <div style={{ fontSize: 14 }}>{quotation.event_location}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Menu items */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>Menu & Pricing</span></div>
          <table className="table">
            <thead><tr><th>Item</th><th>Qty</th><th>Portion</th><th style={{ textAlign: 'right' }}>Price</th></tr></thead>
            <tbody>
              {quotation.items?.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{item.description}</div>}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{item.quantity}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{item.portion_size_oz ? `${item.portion_size_oz} oz` : '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>${Number(item.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            {[
              { label: 'Food & Menu', value: quotation.food_cost },
              { label: 'Labor', value: quotation.labor_cost },
              { label: 'Overhead & Admin', value: quotation.overhead_amount },
              { label: `Tax (${quotation.tax_rate}%)`, value: quotation.tax_amount }
            ].filter(r => parseFloat(r.value) > 0).map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                <span>{row.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>${Number(row.value).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              <span>Total</span>
              <span style={{ color: 'var(--brand)' }}>${Number(quotation.total).toFixed(2)}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <CogsBadge pct={overallCogs} />
            </div>
          </div>
        </div>

        {/* Notes */}
        {quotation.notes && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>Notes from {quotation.company_name}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>{quotation.notes}</div>
            </div>
          </div>
        )}

        {/* Valid until */}
        {quotation.valid_until && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 20, justifyContent: 'center' }}>
            <Clock size={14} /> Valid until {new Date(quotation.valid_until).toLocaleDateString()}
          </div>
        )}

        {/* CTA buttons */}
        {!isApproved && !depositPaid && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => approve.mutate()} className="btn btn-primary" disabled={approve.isPending} style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 16 }}>
              {approve.isPending ? 'Approving...' : '✓ Approve this quotation'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              By approving, you confirm the event details and pricing above
            </p>
          </div>
        )}

        {isApproved && !depositPaid && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '16px', textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>Deposit required to confirm booking</div>
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--brand)' }}>
                ${Number(quotation.deposit_amount).toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {quotation.deposit_percent}% deposit of ${Number(quotation.total).toFixed(2)} total
              </div>
            </div>
            <button onClick={() => payDeposit.mutate()} className="btn btn-primary" disabled={payDeposit.isPending} style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }}>
              <CreditCard size={16} /> {payDeposit.isPending ? 'Redirecting to payment...' : 'Pay deposit & confirm booking'}
            </button>
          </div>
        )}

        {depositPaid && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle size={48} color="var(--green)" style={{ margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'var(--font-display)', marginBottom: 6 }}>Booking confirmed!</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>We look forward to serving you. We'll reach out shortly with final details.</div>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          Questions? Contact {quotation.company_phone || quotation.company_name}
        </p>
      </div>
    </div>
  );
}


