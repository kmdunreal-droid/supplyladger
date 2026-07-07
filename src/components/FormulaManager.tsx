import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Settings2, Calculator, Save, X, AlertCircle } from 'lucide-react';
import { Formula } from '../types';
import { getFormulas, saveFormulas, deleteFormula, addFormula, getCategories } from '../utils/storage';

export default function FormulaManager() {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [expression, setExpression] = useState('sp + (v1 * v2)');
  const [variables, setVariables] = useState<{ name: string; label: string }[]>([
    { name: 'sp', label: 'SP' },
    { name: 'v1', label: 'Number 1' },
    { name: 'v2', label: 'Number 2' }
  ]);

  const isValidFormula = (expr: string) => {
    if (!expr.trim()) return true;
    try {
      let testStr = expr;
      variables.forEach(v => {
        testStr = testStr.replace(new RegExp(`\\b${v.name}\\b`, 'g'), '1');
      });
      
      // Handle implicit multiplication: 4(4) -> 4*(4), (1)(1) -> (1)*(1)
      testStr = testStr.replace(/(\d)(\()/g, '$1*$2');
      testStr = testStr.replace(/(\))(\()/g, '$1*$2');
      testStr = testStr.replace(/(\))(\d)/g, '$1*$2');

      const sanitized = testStr.replace(/[^0-9+\-*/(). ]/g, '');
      // Check if there are characters other than math symbols/numbers after variable replacement
      if (testStr.replace(/\s/g, '').length !== sanitized.replace(/\s/g, '').length) return false;
      // Test eval
      const result = eval(sanitized);
      return typeof result === 'number' && !isNaN(result) && isFinite(result);
    } catch {
      return false;
    }
  };

  const isExprValid = isValidFormula(expression);
  const deleteTargetFormula = formulas.find(f => f.id === deleteConfirmId);

  useEffect(() => {
    setFormulas(getFormulas());
  }, []);

  const handleAddVariable = () => {
    const nextId = variables.length + 1;
    setVariables([...variables, { name: `v${nextId}`, label: `Variable ${nextId}` }]);
  };

  const handleRemoveVariable = (index: number) => {
    if (variables[index].name === 'sp') return; // Keep sp
    setVariables(variables.filter((_, i) => i !== index));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !category) return;

    if (editingId) {
      const updated: Formula = { id: editingId, name, category, expression, variables };
      const all = getFormulas().map(f => f.id === editingId ? updated : f);
      saveFormulas(all);
      setEditingId(null);
    } else {
      addFormula({ name, category, expression, variables });
    }

    setFormulas(getFormulas());
    resetForm();
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setName('');
    setCategory('');
    setExpression('sp + (v1 * v2)');
    setVariables([
      { name: 'sp', label: 'SP' },
      { name: 'v1', label: 'Number 1' },
      { name: 'v2', label: 'Number 2' }
    ]);
  };

  const handleEdit = (f: Formula) => {
    setEditingId(f.id);
    setName(f.name);
    setCategory(f.category);
    setExpression(f.expression);
    setVariables(f.variables);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteFormula(deleteConfirmId);
      setFormulas(getFormulas());
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Rate Methods (Kulia)</h2>
          <p className="text-slate-500 text-sm">Define custom calculation formulas for chicken rates</p>
        </div>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-md"
          >
            <Plus size={18} />
            <span>New Method</span>
          </button>
        )}
      </div>

      {(isAdding || editingId) && (
        <div className="bg-white border border-indigo-100 rounded-3xl p-6 shadow-xl animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black text-slate-800 flex items-center">
              <Settings2 size={18} className="mr-2 text-indigo-500"/> 
              {editingId ? 'Edit Method' : 'Create New Method'}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Method Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Standard Multiplier"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-semibold text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 outline-none font-semibold text-sm appearance-none"
                  required
                >
                  <option value="" disabled>Select Category</option>
                  {getCategories().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-500 uppercase">Input Fields (Labeling)</label>
                <button type="button" onClick={handleAddVariable} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">+ Add Field</button>
              </div>
              <div className="space-y-2">
                {variables.map((v, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <div className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-1 rounded w-16 text-center shrink-0">
                      [{v.name}]
                    </div>
                    <input 
                      type="text" 
                      value={v.label}
                      onChange={e => {
                        const next = [...variables];
                        next[idx].label = e.target.value;
                        setVariables(next);
                      }}
                      placeholder="Display Label"
                      className="flex-1 bg-transparent border-none outline-none text-sm font-semibold text-slate-700"
                    />
                    {v.name !== 'sp' && (
                      <button type="button" onClick={() => handleRemoveVariable(idx)} className="p-1 text-red-300 hover:text-red-500"><Trash2 size={14}/></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Formula Logic (Kulia)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {variables.map(v => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('formula-expression-input') as HTMLInputElement;
                      if (input) {
                        const start = input.selectionStart || 0;
                        const end = input.selectionEnd || 0;
                        const val = input.value;
                        const newVal = val.substring(0, start) + v.name + val.substring(end);
                        setExpression(newVal);
                        setTimeout(() => {
                          input.focus();
                          input.setSelectionRange(start + v.name.length, start + v.name.length);
                        }, 0);
                      } else {
                        setExpression(prev => prev + v.name);
                      }
                    }}
                    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-[10px] font-black transition-all border border-indigo-100 hover:border-indigo-200"
                  >
                    +{v.name}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Calculator size={16} className={`absolute left-3 top-3 ${isExprValid ? 'text-slate-400' : 'text-rose-400'}`} />
                <input 
                  id="formula-expression-input"
                  type="text" 
                  value={expression}
                  onChange={e => setExpression(e.target.value)}
                  placeholder="sp + (v1 * v2)"
                  className={`w-full pl-10 pr-4 py-3 bg-slate-900 font-mono text-sm rounded-xl focus:ring-2 outline-none transition-all ${
                    isExprValid 
                      ? 'text-emerald-400 focus:ring-indigo-500 border-transparent' 
                      : 'text-rose-400 focus:ring-rose-500 border border-rose-500/50'
                  }`}
                  required
                />
              </div>
              {!isExprValid && (
                <p className="mt-1.5 text-[10px] text-rose-500 font-bold flex items-center gap-1">
                  <X size={10} strokeWidth={3} /> Invalid formula syntax or unknown codes.
                </p>
              )}
              <p className="mt-2 text-[10px] text-slate-400 font-medium leading-relaxed italic">
                Use codes like <span className="font-bold text-slate-600">[sp]</span> and <span className="font-bold text-slate-600">[v1]</span> in your math. 
                Example: <code className="bg-slate-100 p-0.5 rounded">sp + (v1 * v2)</code>
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={resetForm} className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-slate-600 transition-all">Cancel</button>
              <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all">
                {editingId ? 'Update Method' : 'Create Method'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {formulas.length === 0 && !isAdding && (
          <div className="md:col-span-2 py-12 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <Calculator size={40} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 font-medium italic">No calculation methods defined yet.</p>
          </div>
        )}
        {formulas.map(f => (
          <div 
            key={f.id} 
            className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden relative select-none"
          >
            <div className="opacity-100">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">{f.category}</span>
                  <h4 className="text-lg font-black text-slate-800 mt-1">{f.name}</h4>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleEdit(f)}
                    className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"
                    title="Edit Formula"
                  >
                    <Settings2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(f.id)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                    title="Delete Formula"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="w-full max-w-sm rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                  <AlertCircle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">Delete formula?</h3>
                  <p className="text-[11px] text-slate-500">This action cannot be undone.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {deleteTargetFormula?.name || 'This formula'} will be removed from the list.
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-xl bg-rose-500 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-rose-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
