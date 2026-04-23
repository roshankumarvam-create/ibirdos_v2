'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function CustomerPage() {
  const router = useRouter();

  const [dishes, setDishes] = useState<any[]>([]);
  const [cart, setCart] = useState<any>({});
  const [serviceType, setServiceType] = useState('buffet');
  const [staff, setStaff] = useState(0);
  const [utensils, setUtensils] = useState(false);

  const [event, setEvent] = useState({
    location: '',
    date: '',
    time: ''
  });

  useEffect(() => {
    loadMenu();
  }, []);

  async function loadMenu() {
    try {
      const res = await api.get('/menu');
      const data = res?.data || res;
      setDishes(data);
    } catch (err) {
      console.error('MENU ERROR', err);
    }
  }

  const add = (id: string) => {
    setCart((p: any) => ({ ...p, [id]: (p[id] || 0) + 1 }));
  };

  const remove = (id: string) => {
    setCart((p: any) => ({ ...p, [id]: Math.max((p[id] || 0) - 1, 0) }));
  };

  const foodTotal = dishes.reduce(
    (sum, d) => sum + (cart[d.id] || 0) * d.price,
    0
  );

  const staffCost = staff * 25; // dynamic later
  const utensilsCost = utensils ? 50 : 0;

  const total = foodTotal + staffCost + utensilsCost;

  function goCheckout() {
    localStorage.setItem(
      'order',
      JSON.stringify({
        cart,
        dishes,
        serviceType,
        staff,
        utensils,
        event,
        total
      })
    );

    router.push('/customer/checkout');
  }

  return (
    <div style={{ background: '#0d1117', color: 'white', minHeight: '100vh', padding: 20 }}>

      <h2>🍽️ Catering Menu</h2>

      {/* MENU */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))',
        gap: 20
      }}>
        {dishes.map(d => (
          <div key={d.id} style={{
            background: '#161b22',
            borderRadius: 12,
            overflow: 'hidden'
          }}>
            <img src={d.image_url} style={{ width: '100%', height: 150, objectFit: 'cover' }} />

            <div style={{ padding: 12 }}>
              <h3>{d.name}</h3>

              <p style={{ fontSize: 12 }}>{d.portion_size} lbs</p>

              <p style={{ fontSize: 13, opacity: 0.8 }}>
                {d.description}
              </p>

              <h4>${d.price}</h4>

              <div>
                <button onClick={() => remove(d.id)}>-</button>
                <span> {cart[d.id] || 0} </span>
                <button onClick={() => add(d.id)}>+</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SERVICE */}
      <h3 style={{ marginTop: 30 }}>Service Type</h3>
      <select onChange={(e) => setServiceType(e.target.value)}>
        <option value="buffet">Buffet</option>
        <option value="plated">Plated</option>
        <option value="live">Live Counter</option>
      </select>

      {/* STAFF */}
      <h3>Staff Required ($25/hr each)</h3>
      <input type="number" value={staff} onChange={(e) => setStaff(Number(e.target.value))} />

      {/* UTENSILS */}
      <label>
        <input type="checkbox" onChange={() => setUtensils(!utensils)} />
        Add utensils ($50)
      </label>

      {/* EVENT */}
      <h3>Event Details</h3>
      <input placeholder="Location" onChange={e => setEvent({ ...event, location: e.target.value })} />
      <input type="date" onChange={e => setEvent({ ...event, date: e.target.value })} />
      <input type="time" onChange={e => setEvent({ ...event, time: e.target.value })} />

      {/* TOTAL */}
      <h2 style={{ marginTop: 20 }}>Total: ${total}</h2>

      <button onClick={goCheckout} style={{
        padding: 14,
        background: '#f29722',
        borderRadius: 8,
        marginTop: 10,
        width: '100%'
      }}>
        Continue to Checkout →
      </button>

    </div>
  );
}