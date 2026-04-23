'use client';

import { useEffect, useState } from 'react';

export default function CheckoutPage() {

  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    const data = localStorage.getItem('order');
    if (data) setOrder(JSON.parse(data));
  }, []);

  if (!order) return <div style={{ color: 'white' }}>Loading...</div>;

  const { dishes, cart, staff, utensils, total, event } = order;

  const selected = dishes.filter((d:any)=> cart[d.id] > 0);

  return (
    <div style={{
      background:'#0d1117',
      color:'white',
      minHeight:'100vh',
      padding:30
    }}>

      <h1>🧾 Order Summary</h1>

      {/* ITEMS */}
      {selected.map((d:any)=>(
        <div key={d.id}>
          {d.name} x {cart[d.id]} = ${d.price * cart[d.id]}
        </div>
      ))}

      <hr />

      <p>Staff Cost: ${staff * 25}</p>
      <p>Utensils: ${utensils ? 50 : 0}</p>

      <h2>Total: ${total}</h2>

      {/* EVENT */}
      <h3>Event</h3>
      <p>{event.location}</p>
      <p>{event.date} - {event.time}</p>

      {/* PAYMENT */}
      <h3>Payment</h3>

      <button style={{
        width:'100%',
        padding:14,
        background:'#f29722',
        borderRadius:8,
        marginTop:10
      }}>
        Pay 30% Advance
      </button>

      <button style={{
        width:'100%',
        padding:14,
        background:'#22c55e',
        borderRadius:8,
        marginTop:10
      }}>
        Pay Full Amount
      </button>

    </div>
  );
}