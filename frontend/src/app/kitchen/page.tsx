'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Sidebar from '@/components/shared/Sidebar';
import { CheckSquare, Square, ChefHat, AlertTriangle, Loader } from 'lucide-react';

export default function KitchenPage() {
  const queryClient = useQueryClient();

  const [activeList, setActiveList] = useState<string | null>(null);
  const [wasteForm, setWasteForm] = useState({
    show: false,
    quantity: '',
    unit: 'kg',
    reason: ''
  });

  // 🔥 FETCH PREP LISTS
  const { data: queue, isLoading } = useQuery({
    queryKey: ['kitchen-queue'],
    queryFn: () => api.get('/kitchen/queue').then(r => r.data),
    refetchInterval: 30000
  });

  // 🔥 FETCH PREP DETAILS
  const { data: prepDetail } = useQuery({
    queryKey: ['prep-detail', activeList],
    queryFn: () => api.get(`/kitchen/prep/${activeList}`).then(r => r.data),
    enabled: !!activeList
  });

  // 🔥 TOGGLE ITEM
  const toggleItem = useMutation({
    mutationFn: ({ listId, itemId, done }: any) =>
      api.put(`/kitchen/prep/${listId}/items/${itemId}`, { is_completed: done }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prep-detail', activeList] });
    }
  });

  // 🔥 LOG WASTE
  const logWaste = useMutation({
    mutationFn: (data: any) => api.post('/kitchen/waste', data),
    onSuccess: () => {
      toast.success('Waste logged');
      setWasteForm({ show: false, quantity: '', unit: 'kg', reason: '' });
    }
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0d1117' }}>
      <Sidebar />

      <main style={{ flex: 1, padding: 20, color: 'white' }}>
        {/* HEADER */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22 }}>👨‍🍳 Kitchen Dashboard</h1>
          <p style={{ opacity: 0.6 }}>Live prep + order flow</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>

          {/* LEFT: PREP LIST */}
          <div>
            <h3 style={{ marginBottom: 10 }}>Prep Lists</h3>

            {isLoading && <Loader className="spinner" />}

            {queue?.map((list: any) => (
              <div
                key={list.id}
                onClick={() => setActiveList(list.id)}
                style={{
                  padding: 12,
                  marginBottom: 10,
                  border: '1px solid #30363d',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: activeList === list.id ? '#161b22' : '#0d1117'
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {list.title || list.order_number || 'Prep List'}
                </div>

                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {list.completed_items}/{list.total_items} items
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT: DETAILS */}
          <div>
            {!activeList && (
              <div style={{ textAlign: 'center', marginTop: 100 }}>
                <ChefHat size={40} />
                <p>Select a prep list</p>
              </div>
            )}

            {prepDetail && (
              <div style={{
                border: '1px solid #30363d',
                borderRadius: 10,
                overflow: 'hidden'
              }}>
                <div style={{ padding: 15, borderBottom: '1px solid #30363d' }}>
                  <h3>{prepDetail.title}</h3>
                </div>

                {prepDetail.items?.map((item: any) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: 12,
                      borderBottom: '1px solid #222'
                    }}
                  >
                    <button
                      onClick={() =>
                        toggleItem.mutate({
                          listId: activeList,
                          itemId: item.id,
                          done: !item.is_completed
                        })
                      }
                      style={{ background: 'none', border: 'none', color: 'white' }}
                    >
                      {item.is_completed ? <CheckSquare /> : <Square />}
                    </button>

                    <div style={{ marginLeft: 10, flex: 1 }}>
                      <div>{item.ingredient_name}</div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>
                        {item.required_quantity} {item.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 🔥 WASTE BUTTON */}
        <button
          onClick={() => setWasteForm(f => ({ ...f, show: true }))}
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            background: '#f29722',
            color: '#000',
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer'
          }}
        >
          ⚠ Log Waste
        </button>

        {/* 🔥 WASTE MODAL */}
        {wasteForm.show && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <div style={{
              background: '#161b22',
              padding: 20,
              borderRadius: 10,
              width: 300
            }}>
              <h3>Log Waste</h3>

              <input
                placeholder="Quantity"
                className="input"
                value={wasteForm.quantity}
                onChange={e => setWasteForm(f => ({ ...f, quantity: e.target.value }))}
              />

              <input
                placeholder="Reason"
                className="input"
                value={wasteForm.reason}
                onChange={e => setWasteForm(f => ({ ...f, reason: e.target.value }))}
              />

              <button
                onClick={() =>
                  logWaste.mutate({
                    quantity: wasteForm.quantity,
                    unit: wasteForm.unit,
                    reason: wasteForm.reason
                  })
                }
                style={{ marginTop: 10 }}
              >
                Submit
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}