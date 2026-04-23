'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { ShoppingCart, Plus, Minus, Trash2, Flame, CheckCircle } from 'lucide-react';

interface CartItem { recipe_id: string; name: string; price: number; quantity: number; }

export default function MenuPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { user } = useAuthStore();
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [instructions, setInstructions] = useState('');

  const { data: menu, isLoading } = useQuery({
    queryKey: ['menu', slug],
    queryFn: () => api.get(`/menu/${slug}`).then(r => r.data)
  });

  const placeOrder = useMutation({
    mutationFn: () => api.post(`/menu/${slug}/order`, {
      items: cart.map(i => ({ recipe_id: i.recipe_id, quantity: i.quantity })),
      special_instructions: instructions
    }),
    onSuccess: () => {
      setOrderPlaced(true);
      setCart([]);
      setShowCart(false);
    },
    onError: (err: any) => {
      if (err?.response?.status === 401) {
        toast.error('Please sign in to place an order');
        router.push(`/auth/login?redirect=/restaurant/${slug}/menu`);
      } else {
        toast.error(err?.response?.data?.error || 'Order failed');
      }
    }
  });

  function addToCart(recipe: any) {
    setCart(prev => {
      const existing = prev.find(i => i.recipe_id === recipe.id);
      if (existing) return prev.map(i => i.recipe_id === recipe.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { recipe_id: recipe.id, name: recipe.name, price: parseFloat(recipe.selling_price), quantity: 1 }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => {
      const updated = prev.map(i => i.recipe_id === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0);
      return updated;
    });
  }

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 28, height: 28, border: '2px solid var(--surface-3)', borderTopColor: 'var(--brand)', borderRadius: '50%' }} />
    </div>
  );

  if (!menu) return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 18, marginBottom: 8 }}>Restaurant not found</div>
        <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>Check the link and try again</div>
      </div>
    </div>
  );

  if (orderPlaced) return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <CheckCircle size={56} color="var(--green)" />
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28 }}>Order placed!</h1>
      <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>The kitchen has been notified</p>
      <button onClick={() => setOrderPlaced(false)} className="btn btn-primary">Order more</button>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)' }}>
      {/* Restaurant header */}
      <div style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', padding: '20px 24px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Flame size={20} color="#0d1117" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{menu.restaurant.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{menu.recipe_count} items</div>
            </div>
          </div>
          <button onClick={() => setShowCart(true)} className="btn btn-primary" style={{ position: 'relative' }}>
            <ShoppingCart size={16} /> Cart
            {cartCount > 0 && (
              <span style={{ background: '#0d1117', color: 'var(--brand)', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '1px 6px', borderRadius: 99, minWidth: 18, textAlign: 'center' }}>{cartCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Menu */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
        {Object.entries(menu.categories || {}).map(([category, items]: [string, any]) => (
          <div key={category} style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              {category}
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {items.map((recipe: any) => {
                const cartItem = cart.find(i => i.recipe_id === recipe.id);
                return (
                  <div key={recipe.id} style={{
                    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12,
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    opacity: recipe.is_available ? 1 : 0.5
                  }}>
                    {recipe.image_url && <img src={recipe.image_url} alt={recipe.name} style={{ width: '100%', height: 160, objectFit: 'cover' }} />}
                    <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{recipe.name}</div>
                      {recipe.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, marginBottom: 12, lineHeight: 1.5 }}>{recipe.description}</div>}
                      {recipe.allergens?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                          {recipe.allergens.map((a: string) => (
                            <span key={a} style={{ fontSize: 10, background: 'var(--yellow-bg)', color: 'var(--yellow)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>{a}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--brand)' }}>
                          {"$"}{Number(recipe.selling_price).toFixed(0)}
                        </span>
                        {!recipe.is_available ? (
                          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Unavailable</span>
                        ) : cartItem ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => updateQty(recipe.id, -1)} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-3)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
                              <Minus size={14} />
                            </button>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{cartItem.quantity}</span>
                            <button onClick={() => updateQty(recipe.id, 1)} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d1117' }}>
                              <Plus size={14} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(recipe)} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: 13 }}>
                            <Plus size={14} /> Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Cart drawer */}
      {showCart && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }}>
          <div onClick={() => setShowCart(false)} style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ width: 380, background: 'var(--surface-1)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Your order</h2>
              <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 20 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              {cart.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32, fontSize: 14 }}>Cart is empty</div>}
              {cart.map(item => (
                <div key={item.recipe_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>
                      {"$"}{item.price.toFixed(0)} × {item.quantity} = {"$"}{(item.price * item.quantity).toFixed(0)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => updateQty(item.recipe_id, -1)} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
                      <Minus size={12} />
                    </button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, minWidth: 18, textAlign: 'center', fontSize: 14 }}>{item.quantity}</span>
                    <button onClick={() => updateQty(item.recipe_id, 1)} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--brand)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d1117' }}>
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {cart.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Special instructions</label>
                  <textarea className="input" rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Allergies, preferences..." style={{ resize: 'none' }} />
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 15 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--brand)', fontSize: 20 }}>{"$"}{cartTotal.toFixed(0)}</span>
                </div>
                <button
                  onClick={() => placeOrder.mutate()}
                  className="btn btn-primary"
                  disabled={placeOrder.isPending}
                  style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }}>
                  {placeOrder.isPending ? 'Placing order...' : `Place order · ${"$"}${cartTotal.toFixed(0)}`}
                </button>
                {!user && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8, fontFamily: 'var(--font-mono)' }}>You'll need to sign in to complete your order</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


