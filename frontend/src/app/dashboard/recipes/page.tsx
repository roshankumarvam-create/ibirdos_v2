'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { formatUSD } from '@/lib/format';
import Sidebar from '@/components/shared/Sidebar';
import FoodCostBadge from '@/components/shared/FoodCostBadge';
import RecipeModal from '@/components/shared/RecipeModal';
import { Plus, Search, Pencil, Trash2, Loader, FileText } from 'lucide-react';

export default function RecipesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'list' | 'extract'>('list');
  const [showModal, setShowModal] = useState(false);
  const [editRecipe, setEditRecipe] = useState<any>(null);

  const { data: recipes, isLoading } = useQuery({
    queryKey: ['recipes', search, filter],
    queryFn: () =>
      api.get(`/recipes?search=${search}&status=${filter}`).then(r => r.data)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recipes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
    }
  });

  // ============================
  // ROLE HELPERS
  // ============================

  const canEdit = (r: any) => {
    if (user.role === 'owner') return true;
    if (user.role === 'manager') return true;
    if (user.role === 'staff' && r.created_by === user.id) return true;
    return false;
  };

  const canDelete = (r: any) => {
    if (user.role === 'owner') return true;
    if (user.role === 'manager') return true;
    if (user.role === 'staff' && r.created_by === user.id) return true;
    return false;
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />

      <main style={{ flex: 1 }}>
        <div style={{ padding: 20 }}>
          <h1>Recipes</h1>

          <button
            onClick={() => {
              setEditRecipe(null);
              setShowModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus size={14} /> New recipe
          </button>

          <div style={{ marginTop: 20 }}>
            <input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Recipe</th>
                <th>Category</th>
                <th>Cost</th>
                <th>Price</th>
                <th>COGS</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {recipes?.map((r: any) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    if (!canEdit(r)) return;
                    setEditRecipe(r);
                    setShowModal(true);
                  }}
                >
                  <td>
                    <div>{r.name}</div>

                    {/* 🔥 CREATED BY */}
                    <div style={{ fontSize: 11 }}>
                      Created by: {r.created_by_name} ({r.created_by_role})
                    </div>
                  </td>

                  <td>{r.category}</td>

                  <td>{formatUSD(r.base_cost)}</td>

                  <td>{formatUSD(r.selling_price)}</td>

                  <td>
                    {r.food_cost_percent && (
                      <FoodCostBadge percent={r.food_cost_percent} />
                    )}
                  </td>

                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      
                      {/* EDIT */}
                      {canEdit(r) && (
                        <button
                          onClick={() => {
                            setEditRecipe(r);
                            setShowModal(true);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      )}

                      {/* DELETE */}
                      {canDelete(r) && (
                        <button
                          onClick={() => {
                            if (confirm('Delete?'))
                              deleteMutation.mutate(r.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showModal && (
          <RecipeModal
            recipe={editRecipe}
            onClose={() => {
              setShowModal(false);
              setEditRecipe(null);
            }}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['recipes'] });
              setShowModal(false);
            }}
          />
        )}
      </main>
    </div>
  );
}