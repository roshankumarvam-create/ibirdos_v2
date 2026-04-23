'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatUSD } from '@/lib/format';
import { X, Trash2, Loader } from 'lucide-react';
import FoodCostBadge from './FoodCostBadge';

interface RecipeModalProps { recipe?: any; onClose: () => void; onSaved: () => void; }

interface IngredientLine {
  ingredient_id: string; name: string; quantity: number; unit: string; unit_price: number;
}

export default function RecipeModal({ recipe, onClose, onSaved }: RecipeModalProps) {
  const [form, setForm] = useState({ name: recipe?.name||'', description: recipe?.description||'', category: recipe?.category||'', servings: recipe?.servings||1, markup_percent: recipe?.markup_percent||150 });
  const [lines, setLines] = useState<IngredientLine[]>([]);
  const [ingSearch, setIngSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: ingredients } = useQuery({ queryKey: ['ingredients'], queryFn: () => api.get('/ingredients').then(r => r.data) });

  useEffect(() => {
    if (recipe?.id) {
      api.get(`/recipes/${recipe.id}`).then(res => {
        if (res.data.ingredients) {
          setLines(res.data.ingredients.map((i: any) => ({
            ingredient_id: i.ingredient_id, name: i.ingredient_name,
            quantity: parseFloat(i.quantity), unit: i.unit,
            unit_price: parseFloat(i.current_price || i.unit_cost_snapshot || 0)
          })));
        }
      });
    }
  }, [recipe]);

  const baseCost = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const sellingPrice = baseCost * (1 + form.markup_percent / 100);
  const foodCostPct = sellingPrice > 0 ? (baseCost / sellingPrice) * 100 : 0;

  function addIngredient(ing: any) {
    if (lines.find(l => l.ingredient_id === ing.id)) return;
    setLines(prev => [...prev, { ingredient_id: ing.id, name: ing.name, quantity: 1, unit: ing.unit, unit_price: parseFloat(ing.current_price) }]);
    setIngSearch('');
  }

  function updateLine(idx: number, field: string, value: any) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Recipe name required'); return; }
    if (!lines.length) { toast.error('Add at least one ingredient'); return; }
    setSaving(true);
    try {
      const payload = { ...form, ingredients: lines.map(l => ({ ingredient_id: l.ingredient_id, quantity: l.quantity, unit: l.unit })) };
      if (recipe?.id) { await api.put(`/recipes/${recipe.id}`, payload); toast.success('Recipe updated'); }
      else { await api.post('/recipes', payload); toast.success('Recipe created'); }
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save recipe');
    } finally { setSaving(false); }
  }

  const filteredIngredients = ingredients?.filter((i: any) =>
    !ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())
  ).slice(0, 12) || [];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface-1)', borderRadius:16, border:'1px solid var(--border)', width:'100%', maxWidth:760, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }} className="animate-in">
        <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:18 }}>{recipe ? 'Edit Recipe' : 'New Recipe'}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', padding:4 }}><X size={20}/></button>
        </div>

        <div style={{ flex:1, overflow:'auto', padding:24, display:'flex', flexDirection:'column', gap:18 }}>
          {/* Basic info */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ fontSize:13, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Recipe name *</label>
              <input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Chicken Biryani" />
            </div>
            <div>
              <label style={{ fontSize:13, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Category</label>
              <input className="input" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="e.g. Main Course" />
            </div>
            <div>
              <label style={{ fontSize:13, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Servings</label>
              <input className="input" type="number" min={1} value={form.servings} onChange={e=>setForm(f=>({...f,servings:parseInt(e.target.value)||1}))} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ fontSize:13, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Description</label>
              <input className="input" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Optional description" />
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <label style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:500 }}>Ingredients</label>
              <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:'var(--font-mono)' }}>{lines.length} added</span>
            </div>
            <div style={{ position:'relative', marginBottom:12 }}>
              <input className="input" value={ingSearch} onChange={e=>setIngSearch(e.target.value)} placeholder="Search ingredient to add..." />
              {ingSearch && filteredIngredients.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:20, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, maxHeight:200, overflow:'auto', marginTop:4 }}>
                  {filteredIngredients.map((ing: any) => (
                    <button key={ing.id} onClick={() => addIngredient(ing)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'9px 14px', background:'none', border:'none', cursor:'pointer', color:'var(--text-primary)', fontSize:13, textAlign:'left' }}>
                      <span>{ing.name}</span>
                      <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>{formatUSD(ing.current_price)}/{ing.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {lines.length > 0 && (
              <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
                <table className="table" style={{ margin:0 }}>
                  <thead><tr><th>Ingredient</th><th>Quantity</th><th>Unit</th><th>Price/unit</th><th>Line cost</th><th></th></tr></thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line.ingredient_id}>
                        <td style={{ fontWeight:500, fontSize:13 }}>{line.name}</td>
                        <td>
                          <input type="number" min={0.001} step={0.1} value={line.quantity}
                            onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value)||0)}
                            style={{ width:80, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', color:'var(--text-primary)', fontSize:13, fontFamily:'var(--font-mono)' }} />
                        </td>
                        <td style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text-secondary)' }}>{line.unit}</td>
                        <td style={{ fontSize:13, fontFamily:'var(--font-mono)' }}>{formatUSD(line.unit_price)}</td>
                        <td style={{ fontSize:13, fontFamily:'var(--font-mono)', fontWeight:500, color:'var(--brand)' }}>{formatUSD(line.quantity * line.unit_price)}</td>
                        <td>
                          <button onClick={() => setLines(prev => prev.filter((_,i) => i !== idx))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red)', padding:4 }}>
                            <Trash2 size={14}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pricing summary */}
          {lines.length > 0 && (
            <div style={{ background:'var(--surface-2)', borderRadius:10, padding:20, border:'1px solid var(--border)' }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:14, fontFamily:'var(--font-display)' }}>Live pricing (USD)</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14 }}>
                <div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Base cost</div>
                  <div style={{ fontSize:18, fontFamily:'var(--font-display)', fontWeight:700 }}>{formatUSD(baseCost)}</div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Markup</div>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input type="number" min={0} max={1000} value={form.markup_percent}
                      onChange={e => setForm(f => ({...f, markup_percent: parseFloat(e.target.value)||0}))}
                      style={{ width:70, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', color:'var(--brand)', fontSize:16, fontFamily:'var(--font-display)', fontWeight:700 }} />
                    <span style={{ fontSize:16, fontFamily:'var(--font-display)', fontWeight:700, color:'var(--brand)' }}>%</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Selling price</div>
                  <div style={{ fontSize:18, fontFamily:'var(--font-display)', fontWeight:700, color:'var(--brand)' }}>{formatUSD(sellingPrice)}</div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>COGS %</div>
                  <FoodCostBadge percent={foodCostPct} size="lg" showBar />
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving || !lines.length}>
            {saving ? <Loader size={15} className="spinner"/> : null}
            {recipe ? 'Update recipe' : 'Create recipe'}
          </button>
        </div>
      </div>
    </div>
  );
}


