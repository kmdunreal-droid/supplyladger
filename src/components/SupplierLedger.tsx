import React, { useState, useEffect } from 'react';
import { Plus, MoveDownLeft, MoveUpRight, Trash2, AlignJustify, Search, ChevronLeft, ChevronRight, Edit2, Users, UserPlus, ChevronDown, Check, LogOut, Calculator, BookOpen, Settings2, X, PieChart, FileText, Calendar, BarChart2, FileBarChart, AlertCircle, List, Download, Lock } from 'lucide-react';
import { Transaction, Delivery, PurchasePayment, ItemCategory, DeliveryItem, Supplier, Formula } from '../types';
import { 
  getTransactions, 
  addTransaction, 
  deleteTransaction, 
  updateTransaction, 
  getLedgerBalance, 
  getTodayDate, 
  getCategories, 
  addCategory,
  deleteCategory,
  getSuppliersSync,
  getSuppliers,
  addSupplier,
  deleteSupplier,
  getCurrentSupplierId,
  setCurrentSupplierId,
  updateSupplier,
  getFormulasByCategory,
  getFormulas,
  getSystemUsers,
  saveSystemUsers,
  syncTransactionsWithCloud
} from '../utils/storage';
import FormulaManager from './FormulaManager';
import { SupabaseStatus } from './SupabaseStatus';

const getCategoryColor = (category: string) => {
  const norm = category.toLowerCase();
  if (norm.includes('tikka')) return 'bg-red-100 text-red-700 border-red-200';
  if (norm.includes('boneless')) return 'bg-orange-100 text-orange-700 border-orange-200';
  if (norm.includes('leg') || norm.includes('drumstick')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (norm.includes('wing')) return 'bg-sky-100 text-sky-700 border-sky-200';
  if (norm.includes('thigh')) return 'bg-violet-100 text-violet-700 border-violet-200';
  if (norm.includes('whole') || norm === 'chicken') return 'bg-amber-100 text-amber-700 border-amber-200';
  if (norm.includes('liver') || norm.includes('gizzard') || norm.includes('heart')) return 'bg-rose-100 text-rose-700 border-rose-200';
  if (norm.includes('keema') || norm.includes('mince')) return 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200';
  if (norm.includes('chest') || norm.includes('breast')) return 'bg-cyan-100 text-cyan-700 border-cyan-200';
  if (norm.includes('new')) return 'bg-indigo-100 text-indigo-700 border-indigo-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const parseLocalDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export default function SupplierLedger({ viewMode = 'admin', onLogout }: { viewMode?: 'admin' | 'supplier', onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState<'ledger' | 'reports' | 'settings'>('ledger');
  const [categories, setCategories] = useState<string[]>(getCategories());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deleteConfirmData, setDeleteConfirmData] = useState<{ 
    type: 'category'|'supplier'|'transaction'|'remove_item', 
    id: string, 
    message?: string,
    index?: number
  } | null>(null);

  const refreshCategories = () => setCategories(getCategories());
  const [newCatName, setNewCatName] = useState('');
  const [reportData, setReportData] = useState<{title: string, items: any[], totalCashPaid: number, grandTotalBill: number} | null>(null);

  const handleAddCat = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCatName.trim()) {
      addCategory(newCatName);
      setNewCatName('');
      refreshCategories();
    }
  };

  const handleDelCat = (cat: string) => {
    setDeleteConfirmData({ type: 'category', id: cat });
  };
  const [currentSupplierId, setCurSupplierId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState<number>(0);
  
  // Views
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showSupplierSelector, setShowSupplierSelector] = useState(false);

  // New Supplier form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newSupplierCategories, setNewSupplierCategories] = useState<string[]>([]);

  // Delivery Form State
  const [delDate, setDelDate] = useState(getTodayDate());
  const [daySP, setDaySP] = useState('');
  const [delItems, setDelItems] = useState<(Omit<DeliveryItem, 'id' | 'total'> & { formulaId?: string; formulaValues?: Record<string, string> })[]>([]);

  const calculateAutoRate = (formulaId: string, values: Record<string, string>, baseRate: string) => {
    const formulas = getFormulas();
    const formula = formulas.find((f: any) => f.id === formulaId);
    if (!formula) return '';
    try {
      let resultStr = formula.expression;
      formula.variables.forEach((v: any) => {
        const val = v.name === 'sp' ? baseRate : (values[v.name] || '');
        const numericVal = parseFloat(val);
        // If a variable is missing or not a number, the whole calculation might be invalid or should use 0
        // But for "red" feedback, we might want to know if it's valid
        resultStr = resultStr.replace(new RegExp(`\\b${v.name}\\b`, 'g'), (isNaN(numericVal) ? '0' : numericVal).toString());
      });

      // Handle implicit multiplication: 4(4) -> 4*(4), (1)(1) -> (1)*(1)
      resultStr = resultStr.replace(/(\d)(\()/g, '$1*$2');
      resultStr = resultStr.replace(/(\))(\()/g, '$1*$2');
      resultStr = resultStr.replace(/(\))(\d)/g, '$1*$2');

      const sanitized = resultStr.replace(/[^0-9+\-*/(). ]/g, '');
      const finalRate = eval(sanitized);
      if (isNaN(finalRate) || !isFinite(finalRate)) return NaN;
      return Number(finalRate.toFixed(2));
    } catch {
      return NaN;
    }
  };

  // Payment Form State
  const [payDate, setPayDate] = useState(getTodayDate());
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');

  // Editing State
  const [editingId, setEditingId] = useState<string | null>(null);

  // Calendar & View State
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [viewPeriod, setViewPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  
  // Storage initialized in App.tsx or on first load
  const [searchQuery, setSearchQuery] = useState('');

  const handlePrevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));

  const getDaysInMonth = (year: number, month: number) => {
    const date = new Date(year, month, 1);
    const days = [];
    const startDay = date.getDay(); // 0 is Sunday
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const monthDays = getDaysInMonth(calendarMonth.getFullYear(), calendarMonth.getMonth());
  const activeDates = new Set(transactions.map(t => t.date));

  const refreshData = async (sid: string | null = currentSupplierId) => {
    // 1. Immediately show local data
    const localTxs = getTransactions(sid);
    setTransactions(localTxs);
    setBalance(getLedgerBalance(sid));

    try {
      const supplierList = await getSuppliers();
      setSuppliers(supplierList);
    } catch (error) {
      console.error('Error loading suppliers:', error);
      setSuppliers(getSuppliersSync());
    }

    // 2. Fetch from cloud asynchronously
    if (sid) {
      try {
        const cloudTxs = await syncTransactionsWithCloud(sid);
        setTransactions(cloudTxs);
        setBalance(getLedgerBalance(sid));
      } catch (err) {
        console.error('Async cloud sync error:', err);
      }
    }
  };

  useEffect(() => {
    const sid = getCurrentSupplierId();
    setCurSupplierId(sid);
    refreshData(sid);
  }, []);

  const handleSelectSupplier = (id: string) => {
    setCurrentSupplierId(id);
    setCurSupplierId(id);
    setShowSupplierSelector(false);
    void refreshData(id);
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim()) return;
    const newSup = await addSupplier(newUserName.trim(), newUserPassword.trim(), newSupplierCategories);
    if (newSup) {
      handleSelectSupplier(newSup.id);
      setNewUserName('');
      setNewUserPassword('');
      setNewSupplierCategories([]);
    }
  };

  const handleDeleteSupplier = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmData({ type: 'supplier', id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmData) return;
    const { type, id } = deleteConfirmData;
    if (type === 'supplier') {
      await deleteSupplier(id);
      const sid = getCurrentSupplierId();
      setCurSupplierId(sid);
      refreshData(sid);
    } else if (type === 'transaction') {
      await deleteTransaction(id, currentSupplierId);
      refreshData();
    } else if (type === 'category') {
      deleteCategory(id);
      refreshCategories();
    } else if (type === 'remove_item' && deleteConfirmData.index !== undefined) {
      setDelItems(delItems.filter((_, i) => i !== deleteConfirmData.index));
    }
    setDeleteConfirmData(null);
  };

  const handleCategoryAdd = (cat: string) => {
    const formulas = getFormulas();
    const catFormulas = formulas.filter((f: any) => f.category === cat);
    let formulaId = '';
    let rate: number | string = '';
    
    if (catFormulas.length > 0) {
      formulaId = catFormulas[0].id;
      const nr = calculateAutoRate(formulaId, {}, daySP);
      if (nr !== '') rate = Number(nr);
    }
    
    setDelItems([{ category: cat, weight: '', rate: rate as number, formulaId, formulaValues: {} }, ...delItems]);
    setTimeout(() => {
      document.getElementById('weight-input-0')?.focus();
    }, 50);
  };

  const generateReport = (type: 'daily' | 'weekly' | 'monthly') => {
    const now = new Date();
    let filteredTransactions = transactions;
    let title = "";

    if (type === 'daily') {
      const today = getTodayDate();
      filteredTransactions = transactions.filter(tx => tx.date === today);
      title = "Today's Full Report";
    } else if (type === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      filteredTransactions = transactions.filter(tx => new Date(tx.date) >= weekAgo);
      title = "Last 7 Days Report";
    } else if (type === 'monthly') {
      const monthAgo = new Date();
      monthAgo.setMonth(now.getMonth() - 1);
      filteredTransactions = transactions.filter(tx => new Date(tx.date) >= monthAgo);
      title = "Last 30 Days Report";
    }

    const report: Record<string, { weight: number, total: number }> = {};
    let totalCashPaid = 0;

    filteredTransactions.forEach(tx => {
      if (tx.type === 'delivery') {
        tx.items.forEach(item => {
          if (!report[item.category]) {
            report[item.category] = { weight: 0, total: 0 };
          }
          report[item.category].weight += Number(item.weight) || 0;
          report[item.category].total += Number(item.total) || 0;
        });
      } else {
        totalCashPaid += tx.amount;
      }
    });

    const reportArray = Object.entries(report).map(([cat, vals]) => ({
      category: cat,
      ...vals
    }));

    setReportData({
      title,
      items: reportArray,
      totalCashPaid,
      grandTotalBill: reportArray.reduce((sum, item) => sum + item.total, 0)
    });
  };

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;

    const headers = ["Date", "Type", "Details", "Debit (Arrival Bill)", "Credit (Payment)", "Balance"];
    const rows: string[][] = [];
    
    let runningBalance = 0;
    const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

    sorted.forEach(tx => {
      const date = tx.date;
      const type = tx.type === 'delivery' ? 'Arrival' : 'Payment';
      let details = "";
      let debit = 0;
      let credit = 0;

      if (tx.type === 'delivery') {
        details = tx.items.map(i => `${i.category}: ${i.weight}kg @ ${i.rate}`).join(" | ");
        debit = tx.totalBill;
        runningBalance += debit;
      } else {
        details = tx.note || "Payment";
        credit = tx.amount;
        runningBalance -= credit;
      }

      rows.push([
        date,
        type,
        `"${details.replace(/"/g, '""')}"`, // Escape quotes and wrap
        debit.toFixed(2),
        credit.toFixed(2),
        runningBalance.toFixed(2)
      ]);
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = `${currentSupplier?.name || 'Ledger'}_${viewPeriod}_${selectedDate}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleDeliveryForm = () => {
    if (!showDeliveryForm) {
      setDelItems([]);
      setEditingId(null);
      setDelDate(selectedDate);
    }
    setShowDeliveryForm(!showDeliveryForm);
    setShowPaymentForm(false);
  };

  const handleTogglePaymentForm = () => {
    if (!showPaymentForm) {
      setPayAmount('');
      setPayNote('');
      setEditingId(null);
      setPayDate(selectedDate);
    }
    setShowPaymentForm(!showPaymentForm);
    setShowDeliveryForm(false);
  };

  const handleAddDeliveryItem = () => {
    const availableCategories = currentSupplier?.categories && currentSupplier.categories.length > 0 
      ? categories.filter(c => currentSupplier.categories?.includes(c)) 
      : categories;
    const defaultCat = availableCategories[0] || '';
    let defaultFormulaId = '';
    let defaultRate: string | number = '';
    
    if (defaultCat) {
       const formulas = getFormulas();
       const catFormulas = formulas.filter((f: any) => f.category === defaultCat);
       if (catFormulas.length > 0) {
         defaultFormulaId = catFormulas[0].id;
         const nr = calculateAutoRate(defaultFormulaId, {}, daySP);
         if (nr !== '' && !isNaN(Number(nr))) defaultRate = Number(nr);
       }
    }
    
    setDelItems([...delItems, { category: defaultCat, weight: '', rate: defaultRate as number, formulaId: defaultFormulaId, formulaValues: {} }]);
  };

  const handleUpdateDeliveryItem = (index: number, field: keyof Omit<DeliveryItem, 'id' | 'total'>, value: string | number) => {
    const updated = [...delItems];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'category') {
       const category = String(value);
       const formulas = getFormulas();
       const catFormulas = formulas.filter((f: any) => f.category === category);
       if (catFormulas.length > 0) {
         updated[index].formulaId = catFormulas[0].id;
         updated[index].formulaValues = {};
         const rate = calculateAutoRate(catFormulas[0].id, {}, daySP);
         if (rate !== '') updated[index].rate = Number(rate);
       } else {
         updated[index].formulaId = '';
         updated[index].formulaValues = {};
       }
       
       // Focus weight after category change
       setTimeout(() => {
         document.getElementById(`weight-input-${index}`)?.focus();
       }, 50);
    }
    
    setDelItems(updated);
  };

  const handleFormulaChange = (index: number, formulaId: string) => {
    const updated = [...delItems];
    if (formulaId) {
      updated[index] = { ...updated[index], formulaId, formulaValues: {} };
      const rate = calculateAutoRate(formulaId, {}, daySP);
      if (rate !== '') updated[index].rate = Number(rate);
      
      // Auto focus first variable
      const formulas = getFormulas();
      const f = formulas.find(f => f.id === formulaId);
      if (f) {
        const firstVar = f.variables.find(v => v.name !== 'sp');
        if (firstVar) {
          setTimeout(() => {
            document.getElementById(`formula-var-${index}-${firstVar.name}`)?.focus();
          }, 100);
        }
      }
    } else {
      updated[index] = { ...updated[index], formulaId: '', formulaValues: {} };
      // Focus rate if manual is selected
      setTimeout(() => {
        document.getElementById(`rate-input-${index}`)?.focus();
      }, 50);
    }
    setDelItems(updated);
  };
  
  const handleFormulaValChange = (index: number, vName: string, val: string) => {
    const updated = [...delItems];
    const vals = { ...updated[index].formulaValues, [vName]: val };
    updated[index] = { ...updated[index], formulaValues: vals };
    
    if (updated[index].formulaId) {
      const rate = calculateAutoRate(updated[index].formulaId!, vals, daySP);
      updated[index].rate = rate as number;
    }
    setDelItems(updated);
  };

  const handleRemoveDeliveryItem = (index: number) => {
    const item = delItems[index];
    if (item.category || item.weight) {
      setDeleteConfirmData({
        type: 'remove_item',
        id: 'item',
        index,
        message: 'Remove this item from the list?'
      });
      return;
    }
    setDelItems(delItems.filter((_, i) => i !== index));
  };

  const handleSubmitDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = delItems.filter(i => Number(i.weight) > 0 && Number(i.rate) > 0).map((i, idx) => {
      if (typeof i.category === 'string' && i.category.trim()) {
        addCategory(i.category.trim());
      }
      return {
        id: (i as any).id || `di-${Date.now()}-${idx}`,
        category: (typeof i.category === 'string' ? i.category.trim() : 'Unknown Category') || 'Unknown Category',
        weight: Number(i.weight),
        rate: Number(i.rate),
        total: Number(i.weight) * Number(i.rate)
      };
    });

    if (validItems.length === 0) return alert('Please enter at least one valid item with a weight and rate.');

    const totalBill = validItems.reduce((acc, i) => acc + i.total, 0);

    if (editingId) {
      const updatedDelivery: Delivery = {
        id: editingId,
        type: 'delivery',
        date: delDate,
        items: validItems,
        totalBill,
        createdAt: transactions.find(t => t.id === editingId)?.createdAt || Date.now()
      };
      await updateTransaction(updatedDelivery, currentSupplierId);
    } else {
      const newDelivery: Delivery = {
        id: `del-${Date.now()}`,
        type: 'delivery',
        date: delDate,
        items: validItems,
        totalBill,
        createdAt: Date.now()
      };
      await addTransaction(newDelivery, currentSupplierId);
    }

    setShowDeliveryForm(false);
    setDelItems([]);
    setEditingId(null);
    refreshData();
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(payAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return alert('Enter valid amount');

    if (editingId) {
      const updatedPayment: PurchasePayment = {
        id: editingId,
        type: 'payment',
        date: payDate,
        amount: parsedAmount,
        note: payNote.trim(),
        createdAt: transactions.find(t => t.id === editingId)?.createdAt || Date.now()
      };
      await updateTransaction(updatedPayment, currentSupplierId);
    } else {
      const newPayment: PurchasePayment = {
        id: `pay-${Date.now()}`,
        type: 'payment',
        date: payDate,
        amount: parsedAmount,
        note: payNote.trim(),
        createdAt: Date.now()
      };
      await addTransaction(newPayment, currentSupplierId);
    }

    setShowPaymentForm(false);
    setPayAmount('');
    setPayNote('');
    setEditingId(null);
    refreshData();
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmData({ type: 'transaction', id });
  };

  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    if (tx.type === 'delivery') {
      setDelDate(tx.date);
      setDelItems(tx.items.map(i => ({ category: i.category, weight: i.weight.toString(), rate: i.rate as any, id: i.id })));
      setShowDeliveryForm(true);
      setShowPaymentForm(false);
      // Scroll to form
      setTimeout(() => {
        const el = document.getElementById('delivery-form-top');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else {
      setPayDate(tx.date);
      setPayAmount(tx.amount.toString());
      setPayNote(tx.note || '');
      setActiveTab('reports');
      setShowPaymentForm(true);
      setShowDeliveryForm(false);
      // Scroll to form
      setTimeout(() => {
        const el = document.getElementById('payment-form-top');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const filteredTransactions = transactions
    .filter(t => {
      if (viewPeriod === 'daily') {
        return t.date === selectedDate;
      }
      
      const txDate = parseLocalDate(t.date);
      const selDate = parseLocalDate(selectedDate);
      
      if (viewPeriod === 'weekly') {
        // Start of week (Sunday)
        const start = new Date(selDate);
        start.setDate(selDate.getDate() - selDate.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        
        txDate.setHours(0,0,0,0);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);
        
        return txDate >= start && txDate <= end;
      } else if (viewPeriod === 'monthly') {
        return txDate.getMonth() === selDate.getMonth() && 
               txDate.getFullYear() === selDate.getFullYear();
      }
      return true;
    })
    .filter(t => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if (t.type === 'delivery') {
        return t.items.some(item => item.category.toLowerCase().includes(q));
      } else {
        return t.note?.toLowerCase().includes(q) || t.amount.toString().includes(q);
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const getCategoryRates = (category: string) => {
    const rates = new Set<number>();
    suppliers.forEach(s => {
      const txs = getTransactions(s.id);
      txs.forEach(tx => {
        if (tx.type === 'delivery') {
          tx.items.forEach(item => {
            if (item.category === category && item.rate > 0) {
              rates.add(item.rate);
            }
          });
        }
      });
    });
    return Array.from(rates).sort((a, b) => b - a);
  };

  const currentSupplier = suppliers.find(s => s.id === currentSupplierId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-fuchsia-50/50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-indigo-900 text-white rounded-b-[2.5rem] px-6 pt-12 pb-8 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-fuchsia-500 rounded-full mix-blend-screen filter blur-[80px] opacity-40 animate-pulse hidden md:block"></div>
        <div className="absolute -bottom-24 -left-20 w-96 h-96 bg-indigo-500 rounded-full mix-blend-screen filter blur-[80px] opacity-40 animate-pulse hidden md:block"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        
        <div className="max-w-7xl mx-auto relative z-20 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <h1 className="text-xl md:text-2xl tracking-tight font-black flex items-center gap-2">
                <span className="text-indigo-300">Supplier:</span>
                <span>{currentSupplier?.name || 'Select Supplier'}</span>
              </h1>
              {viewMode === 'admin' && (
                <button 
                  onClick={() => {
                    const nextState = !showSupplierSelector;
                    setShowSupplierSelector(nextState);
                    if (nextState) {
                      void refreshData(currentSupplierId);
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-indigo-300 hover:text-white transition-colors mt-1 group"
                >
                  <Users size={12} className="group-hover:scale-110 transition-transform" />
                  <span>Switch Supplier</span>
                  <ChevronDown size={12} className={`transition-transform duration-300 ${showSupplierSelector ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {showSupplierSelector && viewMode === 'admin' && (
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 p-4"
              onClick={() => setShowSupplierSelector(false)}
            >
              <div
                className="w-full max-w-md rounded-[2rem] bg-white shadow-2xl border border-slate-200 p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.25em] text-indigo-600">Select Supplier</p>
                    <p className="text-xs text-slate-500 mt-1">Choose a supplier account to open its ledger.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSupplierSelector(false)}
                    className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto grid grid-cols-1 gap-2">
                  {suppliers.map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectSupplier(s.id)}
                      className={`flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all border ${
                        currentSupplierId === s.id 
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' 
                          : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:border-indigo-200 hover:text-indigo-600'
                      }`}
                    >
                      <span>{s.name}</span>
                      {currentSupplierId === s.id && <Check size={16} className="shrink-0" />}
                    </button>
                  ))}
                  {suppliers.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-6 text-center text-sm font-semibold text-slate-400">
                      No suppliers found. Create one in Settings.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-4">
            <div className="bg-white/20 backdrop-blur-xl border border-white/20 p-3 sm:p-4 rounded-3xl min-w-[200px] shadow-lg relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100 block mb-1 opacity-90">
                {balance > 0 ? 'You Owe Supplier' : balance < 0 ? 'Supplier Owes You' : 'Account Settled'}
              </span>
              <div className={`text-2xl sm:text-3xl font-black tracking-tighter drop-shadow-sm ${balance > 0 ? 'text-pink-300' : balance < 0 ? 'text-emerald-300' : 'text-white'}`}>
                Rs. {Math.abs(balance).toLocaleString()}
              </div>
            </div>

            {onLogout && (
              <button 
                onClick={onLogout}
                className="flex items-center gap-2 transition-all rounded-full px-4 py-2 text-sm font-bold border border-white/20 bg-white/10 hover:bg-red-500 hover:text-white hover:border-red-500 shadow-lg backdrop-blur-sm"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Exit</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8 space-y-6">
        {activeTab === 'reports' && (
          <div className="bg-white/80 backdrop-blur-xl border border-emerald-100 rounded-3xl p-6 md:p-12 shadow-sm space-y-6">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 flex-shrink-0 relative overflow-hidden group">
                <div className="absolute inset-0 bg-emerald-100/50 scale-0 group-hover:scale-100 transition-transform rounded-full"></div>
                <MoveUpRight size={32} className="text-emerald-500 relative z-10" />
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Record Payment Given</h2>
              <p className="text-slate-500 font-medium max-w-md mx-auto">Enter the payment details handed over to the salesperson or supplier.</p>
            </div>

            <div className="max-w-xl mx-auto">
              <form onSubmit={handleSubmitPayment} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Payment Date</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required className="w-full text-sm px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-semibold" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Amount Given</label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-slate-400 font-bold">Rs.</span>
                    <input type="number" placeholder="0.00" value={payAmount} onChange={e => setPayAmount(e.target.value)} required className="w-full text-lg pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-mono font-bold" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Notes / Salesperson Details (Optional)</label>
                  <input type="text" placeholder="e.g. Handed to Ali" value={payNote} onChange={e => setPayNote(e.target.value)} className="w-full text-sm px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-semibold" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="submit" 
                    className={`flex-1 py-4 rounded-xl font-black shadow-lg hover:shadow-xl transition-all text-white uppercase tracking-wider ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {editingId ? 'Update Payment' : 'Record Final Payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'settings' && viewMode === 'admin' && (
          <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl p-4 md:p-6 shadow-sm space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 flex-shrink-0 relative overflow-hidden group">
                <div className="absolute inset-0 bg-slate-200/50 scale-0 group-hover:scale-100 transition-transform rounded-full"></div>
                <Settings2 size={28} className="text-slate-500 relative z-10" />
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-1">System Settings</h2>
              <p className="text-[11px] text-slate-500 font-medium max-w-md mx-auto">Manage your global categories, preferences, and configurations.</p>
              <SupabaseStatus />
            </div>

            <div className="max-w-2xl mx-auto bg-cyan-50/50 rounded-2xl border border-cyan-100 p-4">
              <h3 className="text-sm font-bold text-cyan-800 mb-2 flex items-center">
                <Calculator size={16} className="mr-2 text-cyan-500" /> Formula Management
              </h3>
              <p className="text-[10px] text-cyan-600 mb-2 italic">Configure dynamic price calculations for your categories.</p>
              <div className="bg-white rounded-xl border border-cyan-200 overflow-hidden shadow-sm">
                <FormulaManager />
              </div>
            </div>

            <div className="max-w-2xl mx-auto bg-amber-50/50 rounded-2xl border border-amber-100 p-4">
              <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center">
                <AlignJustify size={16} className="mr-2 text-amber-500" /> Category Management
              </h3>
              
              <form onSubmit={handleAddCat} className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="New Item Category (e.g. Broast)"
                  className="flex-1 text-xs px-3 py-2 bg-white border border-amber-200 rounded-xl focus:border-amber-500 outline-none font-semibold"
                  required
                />
                <button type="submit" className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm">
                  Add
                </button>
              </form>

              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-2">
                {categories.map(cat => (
                  <div key={cat} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
                    <span className="font-bold text-slate-700 text-xs flex items-center">
                      <span className={`w-2 h-2 rounded-full mr-2 ${getCategoryColor(cat).split(' ')[0]}`}></span>
                      {cat}
                    </span>
                    <button 
                      onClick={() => handleDelCat(cat)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Category"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-slate-500 text-[10px] text-center py-2">No categories added yet.</p>
                )}
              </div>
            </div>

            <div className="max-w-2xl mx-auto bg-indigo-50/50 rounded-2xl border border-indigo-200 p-5 shadow-sm">
              <h3 className="text-sm font-black text-indigo-900 mb-2 flex items-center">
                <UserPlus size={16} className="mr-2 text-indigo-600" /> Create New Supplier Account
              </h3>
              <p className="text-[10px] text-indigo-600 mb-4">Add a new supplier to the system with custom permissions.</p>
              
              <form onSubmit={handleCreateSupplier} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-indigo-400 uppercase ml-1">Supplier Name</label>
                    <input 
                      type="text" 
                      value={newUserName}
                      onChange={e => setNewUserName(e.target.value)}
                      placeholder="e.g. Farhan Poultry"
                      className="w-full text-sm px-4 py-3 bg-white border border-indigo-100 rounded-xl focus:border-indigo-500 outline-none transition-all font-semibold"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-indigo-400 uppercase ml-1">Portal Password</label>
                    <input 
                      type="password" 
                      value={newUserPassword}
                      onChange={e => setNewUserPassword(e.target.value)}
                      placeholder="Set secret key"
                      className="w-full text-sm px-4 py-3 bg-white border border-indigo-100 rounded-xl focus:border-indigo-500 outline-none transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-400 uppercase ml-1">Assigned Item Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          if (newSupplierCategories.includes(cat)) {
                            setNewSupplierCategories(newSupplierCategories.filter(c => c !== cat));
                          } else {
                            setNewSupplierCategories([...newSupplierCategories, cat]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${
                          newSupplierCategories.includes(cat)
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                            : 'bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">
                   Create Account
                </button>
              </form>
            </div>

            <div className="max-w-2xl mx-auto bg-slate-50/80 rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center">
                <Users size={16} className="mr-2 text-slate-500" /> Supplier Accounts
              </h3>
              <p className="text-[10px] text-slate-500 mb-4 italic">Assign categories and manage access for your suppliers.</p>
              
              <div className="space-y-3">
                {getSuppliersSync().map(sup => (
                  <div key={sup.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:border-indigo-100 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-sm font-black text-slate-800">{sup.name}</h4>
                        <p className="text-[10px] text-slate-400 font-medium">Account ID: {sup.id}</p>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => {
                            const newPass = prompt(`Enter new password for ${sup.name}:`, sup.password || '');
                            if (newPass !== null) {
                              updateSupplier({ ...sup, password: newPass });
                              setSuppliers(getSuppliersSync());
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Change Password"
                        >
                          <Settings2 size={14} />
                        </button>
                        <button 
                          onClick={(e) => handleDeleteSupplier(sup.id, e as any)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Account"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Assigned Categories:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {categories.map(cat => (
                          <button
                            key={cat}
                            onClick={() => {
                              const currentCats = sup.categories || [];
                              const newCats = currentCats.includes(cat)
                                ? currentCats.filter(c => c !== cat)
                                : [...currentCats, cat];
                              updateSupplier({ ...sup, categories: newCats });
                              setSuppliers(getSuppliersSync());
                            }}
                            className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all ${
                              (sup.categories || []).includes(cat)
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-indigo-200 hover:text-indigo-600'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      {(!sup.categories || sup.categories.length === 0) && (
                        <p className="text-[10px] text-amber-500 font-bold italic">No categories assigned yet.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>



            <div className="max-w-2xl mx-auto bg-violet-50 rounded-2xl border border-violet-100 p-6 shadow-sm">
              <h3 className="text-lg font-black text-violet-900 mb-4 flex items-center">
                <FileBarChart size={18} className="mr-2 text-violet-500" /> Professional Financial Reports
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button 
                  onClick={() => generateReport('daily')}
                  className="flex flex-col items-center gap-2 p-4 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl transition-all group"
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                    <Calendar size={20} className="text-indigo-500" />
                  </div>
                  <span className="text-sm font-bold text-slate-700">Full Day Report</span>
                </button>
                <button 
                  onClick={() => generateReport('weekly')}
                  className="flex flex-col items-center gap-2 p-4 bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 rounded-2xl transition-all group"
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                    <BarChart2 size={20} className="text-emerald-500" />
                  </div>
                  <span className="text-sm font-bold text-slate-700">Weekly Summary</span>
                </button>
                <button 
                  onClick={() => generateReport('monthly')}
                  className="flex flex-col items-center gap-2 p-4 bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 rounded-2xl transition-all group"
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                    <PieChart size={20} className="text-amber-500" />
                  </div>
                  <span className="text-sm font-bold text-slate-700">Monthly Stats</span>
                </button>
                <button 
                  onClick={handleExportCSV}
                  className="flex flex-col items-center gap-2 p-4 bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 rounded-2xl transition-all group"
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm group-hover:scale-110 transition-transform">
                    <Download size={20} className="text-emerald-500" />
                  </div>
                  <span className="text-sm font-bold text-slate-700">Export CSV</span>
                </button>
              </div>
            </div>

            <div className="max-w-2xl mx-auto bg-rose-50 border border-rose-100 rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-black text-rose-900 mb-3 flex items-center">
                <Lock size={16} className="mr-2 text-rose-600" /> Admin Access Settings
              </h3>
              <p className="text-[10px] text-rose-600 mb-4 italic">Update your system access credentials. securely on this device.</p>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-rose-400 uppercase ml-1">Admin Username</label>
                    <input 
                      type="text" 
                      defaultValue={getSystemUsers().find(u => u.role === 'admin')?.username || 'km'}
                      onBlur={(e) => {
                        const users = getSystemUsers();
                        const adminIndex = users.findIndex(u => u.role === 'admin');
                        if (adminIndex !== -1) {
                          users[adminIndex].username = e.target.value;
                          saveSystemUsers(users);
                        }
                      }}
                      className="w-full text-sm px-4 py-3 bg-white border border-rose-100 rounded-xl focus:border-rose-500 outline-none transition-all font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-rose-400 uppercase ml-1">Admin Password</label>
                    <input 
                      type="password" 
                      defaultValue={getSystemUsers().find(u => u.role === 'admin')?.password || '111222'}
                      onBlur={(e) => {
                        const users = getSystemUsers();
                        const adminIndex = users.findIndex(u => u.role === 'admin');
                        if (adminIndex !== -1) {
                          users[adminIndex].password = e.target.value;
                          saveSystemUsers(users);
                        }
                      }}
                      className="w-full text-sm px-4 py-3 bg-white border border-rose-100 rounded-xl focus:border-rose-500 outline-none transition-all font-semibold"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ledger' && (
          <>
            {/* Quick Stats & Actions */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <button 
            onClick={handleToggleDeliveryForm}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] flex flex-col items-center justify-center group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">New Arrival</span>
          </button>
          <div className="bg-white border border-slate-100 p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 sm:mb-1">Total Bill ({viewPeriod})</span>
            <span className="text-sm sm:text-xl font-black text-indigo-600">
              Rs. {filteredTransactions.reduce((acc, t) => acc + (t.type === 'delivery' ? t.totalBill : 0), 0).toLocaleString()}
            </span>
          </div>
          <div className="bg-white border border-slate-100 p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm flex flex-col items-center justify-center text-center">
            <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 sm:mb-1">Total Payment ({viewPeriod})</span>
            <span className="text-sm sm:text-xl font-black text-emerald-600">
              Rs. {filteredTransactions.reduce((acc, t) => acc + (t.type === 'payment' ? t.amount : 0), 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Date Selection & View Period Toggle */}
        <div className="bg-white/70 backdrop-blur-md border border-white/50 rounded-[2rem] p-4 flex flex-col md:flex-row items-center gap-4 shadow-xl shadow-indigo-100/20">
          <div className="flex bg-slate-100 p-1 rounded-2xl w-full md:w-auto">
            {(['daily', 'weekly', 'monthly'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setViewPeriod(period)}
                className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  viewPeriod === period 
                    ? 'bg-white text-indigo-600 shadow-md scale-[1.02]' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          <div className="h-8 w-[1px] bg-slate-200 hidden md:block"></div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button onClick={() => {
              const d = new Date(selectedDate);
              if (viewPeriod === 'daily') d.setDate(d.getDate() - 1);
              else if (viewPeriod === 'weekly') d.setDate(d.getDate() - 7);
              else if (viewPeriod === 'monthly') d.setMonth(d.getMonth() - 1);
              setSelectedDate(d.toISOString().split('T')[0]);
            }} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => setShowCalendar(!showCalendar)}
              className="flex-1 md:flex-none flex items-center justify-center gap-3 px-6 py-2.5 bg-white border border-slate-200 rounded-2xl hover:border-indigo-500 transition-all group"
            >
              <Calendar size={18} className="text-indigo-500 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-black text-slate-700">
                {viewPeriod === 'daily' ? new Date(selectedDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' }) : 
                 viewPeriod === 'weekly' ? `Week of ${new Date(selectedDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}` :
                 new Date(selectedDate).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })}
              </span>
            </button>
            <button onClick={() => {
              const d = new Date(selectedDate);
              if (viewPeriod === 'daily') d.setDate(d.getDate() + 1);
              else if (viewPeriod === 'weekly') d.setDate(d.getDate() + 7);
              else if (viewPeriod === 'monthly') d.setMonth(d.getMonth() + 1);
              setSelectedDate(d.toISOString().split('T')[0]);
            }} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>


        </div>

        {/* Form area: Add Delivery */}
        {showDeliveryForm && (
          <div id="delivery-form-top" className={`bg-white border rounded-3xl p-6 shadow-xl animate-in slide-in-from-top-4 fade-in duration-200 ${editingId ? 'border-amber-200 ring-2 ring-amber-500/10' : 'border-indigo-100'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-800 flex items-center">
                <MoveDownLeft size={18} className={`mr-2 ${editingId ? 'text-amber-500' : 'text-indigo-500'}`}/> 
                {editingId ? 'Edit Stock Arrival' : 'Stock Arrival Form'}
              </h3>
              {editingId && (
                <span className="px-3 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-full animate-pulse">
                  Editing Record
                </span>
              )}
            </div>
            <form onSubmit={handleSubmitDelivery} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Arrival Date</label>
                  <input type="date" value={delDate} onChange={e => setDelDate(e.target.value)} required className="w-full text-sm px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-semibold" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-indigo-500 mb-1">Day SP (Kulia Rs.)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-xs text-indigo-400 font-bold font-mono">Rs.</span>
                    <input 
                      type="number" 
                      step="0.01" 
                      placeholder="e.g. 250" 
                      value={daySP} 
                      onChange={e => {
                        const val = e.target.value;
                        setDaySP(val);
                        const updated = delItems.map(item => {
                          if (item.formulaId) {
                            const nr = calculateAutoRate(item.formulaId, item.formulaValues || {}, val);
                            if (nr !== '') return { ...item, rate: Number(nr) };
                          }
                          return item;
                        });
                        setDelItems(updated);
                      }}
                      className="w-full pl-10 pr-4 py-3 bg-indigo-50/50 border border-indigo-100 rounded-xl focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-bold text-indigo-700" 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] uppercase font-bold text-slate-500">Add Item by Category</label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(currentSupplier?.categories && currentSupplier.categories.length > 0 ? categories.filter(c => currentSupplier.categories?.includes(c)) : categories).map(cat => (
                    <button 
                      key={cat} 
                      type="button" 
                      onClick={() => handleCategoryAdd(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all hover:opacity-80 active:scale-95 ${getCategoryColor(cat)}`}
                    >
                      + {cat}
                    </button>
                  ))}
                </div>

                {delItems.length > 0 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
                    <label className="block text-[10px] uppercase font-bold text-slate-500">Items Supplied</label>
                  </div>
                )}
                {delItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-3 bg-white/80 backdrop-blur-md p-4 rounded-3xl border border-indigo-50 shadow-sm relative animate-in slide-in-from-top-2 fade-in duration-300">
                    <div className="flex flex-col flex-1 gap-2">
                       <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1 flex gap-2 items-center">
                           <div className="relative flex-1">
                             <select 
                               value={item.category} 
                               onChange={e => handleUpdateDeliveryItem(idx, 'category', e.target.value)} 
                               className={`w-full text-sm px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold transition-all appearance-none ${item.category ? getCategoryColor(item.category) : ''}`} 
                               required
                             >
                               <option value="" disabled>Select Item Type</option>
                               {(() => {
                                 let opts = currentSupplier?.categories && currentSupplier.categories.length > 0
                                   ? categories.filter(c => currentSupplier.categories?.includes(c))
                                   : categories;
                                 if (item.category && !opts.includes(item.category)) {
                                   opts = [...opts, item.category];
                                 }
                                 return opts;
                               })().map(opt => (
                                 <option key={opt} value={opt} className="font-bold text-slate-800">{opt}</option>
                               ))}
                             </select>
                             <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
                           </div>
                           <button type="button" onClick={() => handleRemoveDeliveryItem(idx)} title="Remove Item" className="p-2 text-rose-400 hover:text-white bg-white hover:bg-rose-500 rounded-xl border border-rose-100 transition-colors shrink-0 shadow-sm">
                             <X size={18} strokeWidth={3} />
                           </button>
                         </div>
                         <div className="w-full sm:w-28">
                           <input 
                             id={`weight-input-${idx}`}
                             type="number" 
                             step="0.01" 
                             min="0" 
                             placeholder="KG weight" 
                             value={item.weight || ''} 
                             onChange={e => handleUpdateDeliveryItem(idx, 'weight', e.target.value)} 
                             className="w-full text-sm px-4 py-2.5 bg-indigo-50/50 border border-indigo-100 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none font-mono font-black transition-all" 
                             required 
                           />
                         </div>
                        <div className="w-full sm:flex-1 flex flex-row gap-2">
                           <div className="relative w-full max-w-[130px]">
                             <select
                               value={item.formulaId || ''}
                               onChange={(e) => handleFormulaChange(idx, e.target.value)}
                               className="w-full px-3 pr-8 py-2.5 bg-emerald-50/50 border border-emerald-100 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none text-[11px] font-black text-emerald-700 transition-all appearance-none"
                             >
                               <option value="">{viewMode === 'admin' ? 'Manual Rate' : 'Fix Rate'}</option>
                               {getFormulasByCategory(item.category).map(f => (
                                 <option key={f.id} value={f.id}>{f.name}</option>
                               ))}
                             </select>
                             <ChevronDown size={12} className="absolute right-2 top-3.5 text-emerald-500/50 pointer-events-none" />
                           </div>
                          <div className="relative flex-1 flex gap-1.5">
                             {viewMode === 'supplier' && !item.formulaId && getCategoryRates(item.category).length > 0 && (
                               <div className="relative w-20 shrink-0">
                                 <select
                                   value={getCategoryRates(item.category).includes(item.rate) ? item.rate : ''}
                                   onChange={e => handleUpdateDeliveryItem(idx, 'rate', e.target.value)}
                                   className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-[10px] font-bold appearance-none transition-all text-slate-600"
                                 >
                                   <option value="">Rates</option>
                                   {getCategoryRates(item.category).map(r => (
                                     <option key={r} value={r}>{r}</option>
                                   ))}
                                 </select>
                                 <ChevronDown size={10} className="absolute right-1.5 top-3.5 text-slate-400 pointer-events-none" />
                               </div>
                             )}
                              <div className="relative flex-1">
                               <span className="absolute left-2 top-3 text-[9px] text-slate-400 font-bold tracking-tight">Rs.</span>
                               <input 
                                 id={`rate-input-${idx}`}
                                 type="number" 
                                 step="0.01" 
                                 min="0" 
                                 placeholder={item.formulaId ? "Auto" : "Rate"} 
                                 value={item.rate !== '' && item.rate !== undefined && !isNaN(Number(item.rate)) ? item.rate : ''} 
                                 onChange={e => handleUpdateDeliveryItem(idx, 'rate', e.target.value)} 
                                 readOnly={!!item.formulaId}
                                 className={`w-full pl-6 pr-1 py-2.5 border rounded-xl outline-none font-mono text-sm font-black transition-all ${
                                   item.formulaId 
                                     ? isNaN(Number(item.rate))
                                       ? 'bg-rose-50 border-rose-300 text-rose-600'
                                       : 'bg-slate-100 border-slate-200 text-emerald-600 cursor-not-allowed opacity-80' 
                                     : 'bg-white border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'
                                 }`} 
                                 required 
                               />
                             </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Formula Variables Inputs */}
                      {item.formulaId && (
                        <div className="flex flex-wrap gap-2 px-1 pb-1">
                          {(() => {
                            const f = getFormulas().find(f => f.id === item.formulaId);
                            if (!f) return null;
                            return f.variables
                              .filter(v => v.name !== 'sp')
                              .map(v => (
                                <div key={v.name} className="flex-1 min-w-[100px]">
                                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-0.5 ml-1">{v.label}</label>
                                  <input 
                                    id={`formula-var-${idx}-${v.name}`}
                                    type="number" 
                                    step="0.01"
                                    value={item.formulaValues?.[v.name] || ''} 
                                    onChange={e => handleFormulaValChange(idx, v.name, e.target.value)}
                                    placeholder="Value"
                                    className="w-full text-[11px] px-3 py-1.5 bg-white border border-slate-100 rounded-lg focus:border-indigo-500 outline-none font-bold transition-all"
                                  />
                                </div>
                              ));
                          })()}
                        </div>
                      )}
                      
                      {(() => {
                        const total = (Number(item.weight) || 0) * (Number(item.rate) || 0);

                        return (
                          <div className="flex flex-col gap-2 w-full">
                            {total > 0 && (
                              <div className="text-right text-sm font-black text-slate-600 px-2 uppercase tracking-wide">
                                Total: <span className="text-indigo-600">Rs. {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={handleAddDeliveryItem} className="w-full py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold flex justify-center items-center text-xs uppercase tracking-wider transition-colors mt-2">
                  <Plus size={14} className="mr-1"/> Add Item
                </button>
              </div>

              {/* Total preview calculation */}
              <div className="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center mt-6">
                <span className="text-xs uppercase font-bold tracking-widest text-slate-400">Total Delivery Bill</span>
                <span className="text-2xl font-black tracking-tighter">
                  Rs. {delItems.reduce((acc, i) => acc + (Number(i.weight) * Number(i.rate) || 0), 0).toLocaleString()}
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDeliveryForm(false)} className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-slate-600 transition-all">Cancel</button>
                <button 
                  type="submit" 
                  className={`flex-1 py-3 rounded-xl font-bold shadow-md hover:shadow-lg transition-all text-white ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                >
                  {editingId ? 'Update Stock Arrival' : 'Save Stock Arrival'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Form area: Add Payment */}
        {showPaymentForm && (
          <div id="payment-form-top" className={`bg-white border rounded-3xl p-6 shadow-xl animate-in slide-in-from-top-4 fade-in duration-200 ${editingId ? 'border-amber-200 ring-2 ring-amber-500/10' : 'border-emerald-100'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-800 flex items-center">
                <MoveUpRight size={18} className={`mr-2 ${editingId ? 'text-amber-500' : 'text-emerald-500'}`}/> 
                {editingId ? 'Edit Payment Record' : 'Record Payment Given'}
              </h3>
              {editingId && (
                <span className="px-3 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-full animate-pulse">
                  Editing Payment
                </span>
              )}
            </div>
            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Payment Date</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required className="w-full text-sm px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-semibold" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Amount Given</label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-slate-400 font-bold">Rs.</span>
                  <input type="number" placeholder="0.00" value={payAmount} onChange={e => setPayAmount(e.target.value)} required className="w-full text-lg pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-mono font-bold" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Notes / Salesperson Details (Optional)</label>
                <input type="text" placeholder="e.g. Handed to Ali" value={payNote} onChange={e => setPayNote(e.target.value)} className="w-full text-sm px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none transition-all font-semibold" />
              </div>
               <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowPaymentForm(false)} className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-slate-600 transition-all">Cancel</button>
                <button 
                  type="submit" 
                  className={`flex-1 py-3 rounded-xl font-bold shadow-md hover:shadow-lg transition-all text-white ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {editingId ? 'Update Payment' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Ledger History Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 relative z-0">
          
          {/* Left Column: Calendar (Minimalist) */}
          <div className={`lg:col-span-1 space-y-4 ${showCalendar ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 overflow-hidden sticky top-8">
              <div className="flex items-center justify-between mb-6">
                <button type="button" onClick={handlePrevMonth} className="p-1.5 hover:bg-slate-50 rounded-full text-slate-400 transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <div className="text-center">
                  <span className="block text-sm font-black text-slate-800 uppercase tracking-tight">
                    {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <button type="button" onClick={handleNextMonth} className="p-1.5 hover:bg-slate-50 rounded-full text-slate-400 transition-colors">
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-slate-400 mb-2">
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="py-1">{d}</div>)}
              </div>
              
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((d, i) => {
                  if (!d) return <div key={`empty-${i}`} className="p-2" />;
                  
                  const dateStr = [
                    d.getFullYear(),
                    String(d.getMonth() + 1).padStart(2, '0'),
                    String(d.getDate()).padStart(2, '0')
                  ].join('-');
                  
                  const isSelected = dateStr === selectedDate;
                  const hasData = activeDates.has(dateStr);
                  const isToday = dateStr === getTodayDate();
                  
                  return (
                    <button 
                      key={i} 
                      type="button"
                      onClick={() => setSelectedDate(dateStr)}
                      className={`
                        aspect-square p-1 rounded-xl flex flex-col items-center justify-center relative transition-all
                        ${isSelected ? 'bg-slate-900 text-white shadow-md scale-105' : 'hover:bg-slate-50 text-slate-700'}
                        ${isToday && !isSelected ? 'text-indigo-600 font-bold bg-indigo-50/50' : ''}
                      `}
                    >
                      <span className="text-[11px] font-bold">{d.getDate()}</span>
                      {hasData && (
                        <div className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${isSelected ? 'bg-indigo-400' : 'bg-emerald-500'}`} />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Minimal Legend */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-4 text-[9px] uppercase font-black tracking-widest text-slate-400">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span>Activity</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                  <span>Selected</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Transactions History */}
          <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">

          
            <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
              {filteredTransactions.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-slate-400 font-medium">No ledger entries found.</p>
                </div>
              ) : (
                (() => {
                  // Group transactions by date
                  const grouped = filteredTransactions.reduce((acc, tx) => {
                    const d = tx.date;
                    if (!acc[d]) acc[d] = [];
                    acc[d].push(tx);
                    return acc;
                  }, {} as Record<string, typeof filteredTransactions>);

                  // Sort dates descending
                  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

                  return sortedDates.map(date => (
                    <div key={date} className="border-b border-slate-100 last:border-0">
                      {viewPeriod !== 'daily' && (
                        <div className="bg-slate-50/80 px-6 py-2 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {new Date(date).toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                          <div className="flex gap-4">
                             <span className="text-[10px] font-bold text-indigo-500">
                               Bill: Rs. {grouped[date].reduce((s, t) => s + (t.type === 'delivery' ? t.totalBill : 0), 0).toLocaleString()}
                             </span>
                             <span className="text-[10px] font-bold text-emerald-500">
                               Pay: Rs. {grouped[date].reduce((s, t) => s + (t.type === 'payment' ? t.amount : 0), 0).toLocaleString()}
                             </span>
                          </div>
                        </div>
                      )}
                      <div className="divide-y divide-slate-50">
                        {grouped[date].map(tx => (
                          <div key={tx.id} className="p-4 sm:p-6 hover:bg-slate-50/50 transition-colors group flex flex-col sm:flex-row sm:items-start gap-4">
                            {/* Left Icon & Info */}
                            <div className="flex items-center sm:items-start gap-4 sm:w-48 shrink-0">
                              <div className={`p-3 rounded-2xl ${tx.type === 'delivery' ? 'bg-indigo-50 text-indigo-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                {tx.type === 'delivery' ? <MoveDownLeft size={20} /> : <MoveUpRight size={20} />}
                              </div>
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                                  {tx.type === 'delivery' ? 'Stock Bill' : 'Payment Sent'}
                                </span>
                                <span className="text-xs font-bold text-slate-800 font-mono">
                                  {viewPeriod === 'daily' 
                                    ? new Date(tx.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                                    : 'Transaction Entry'
                                  }
                                </span>
                              </div>
                            </div>

                            {/* Center Context Data */}
                            <div className="flex-1 min-w-0">
                              {tx.type === 'delivery' && (
                                <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                                  <table className="w-full text-xs text-left">
                                     <thead>
                                       <tr className="text-[9px] uppercase tracking-wider text-slate-400">
                                         <th className="pb-1">Category</th>
                                         <th className="pb-1 text-right">KG</th>
                                         <th className="pb-1 text-right">Rate</th>
                                         <th className="pb-1 text-right">Subtotal</th>
                                       </tr>
                                     </thead>
                                     <tbody className="divide-y divide-slate-100/50 font-medium font-mono text-slate-600">
                                       {tx.items.map(item => (
                                         <tr key={item.id}>
                                           <td className="py-2 pr-2 min-w-24">
                                             <span className={`inline-block px-2 py-0.5 border rounded-md text-[10px] font-black uppercase tracking-wider ${getCategoryColor(item.category)}`}>
                                               {item.category}
                                             </span>
                                           </td>
                                           <td className="py-2 text-right text-slate-700">{item.weight}</td>
                                           <td className="py-2 text-right text-slate-400">@{item.rate}</td>
                                           <td className="py-2 text-right text-slate-800 font-bold">Rs.{item.total.toLocaleString()}</td>
                                         </tr>
                                       ))}
                                     </tbody>
                                  </table>
                                </div>
                              )}

                              {tx.type === 'payment' && (
                                <div className="flex flex-col gap-2">
                                  <div className="text-xl font-black text-emerald-600 font-mono">
                                    Rs. {tx.amount.toLocaleString()}
                                  </div>
                                  {tx.note && (
                                    <div className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                                      "{tx.note}"
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Right Impact Value */}
                            <div className="flex items-center justify-between sm:w-48 shrink-0 sm:justify-end gap-3 mt-2 sm:mt-0">
                              <div className="text-right">
                                <span className={`text-[10px] font-black uppercase tracking-widest block mb-0.5 ${tx.type === 'delivery' ? 'text-indigo-400' : 'text-emerald-400'}`}>
                                  {tx.type === 'delivery' ? 'Bill Amount' : 'Cash Paid'}
                                </span>
                                <span className={`text-lg font-black tracking-tighter ${tx.type === 'delivery' ? 'text-indigo-600' : 'text-emerald-600'}`}>
                                  Rs. {(tx.type === 'delivery' ? tx.totalBill : tx.amount).toLocaleString()}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 transition-all">
                                <button 
                                  onClick={() => handleEdit(tx)} 
                                  className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-100 hover:border-indigo-200 shadow-sm"
                                  title="Edit record"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDelete(tx.id)} 
                                  className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-100 hover:border-rose-200 shadow-sm"
                                  title="Delete record"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Bottom Nav (Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-indigo-950/90 backdrop-blur-2xl border-t border-indigo-800/50 shadow-[0_-15px_40px_-10px_rgba(0,0,0,0.5)] px-2 py-2 pb-6 sm:pb-3 sm:px-6 md:hidden">
        <div className="flex max-w-md mx-auto relative rounded-2xl overflow-hidden bg-indigo-900/30 p-1 gap-1 border border-indigo-800/20">
          <div className={`absolute top-1 left-1 bottom-1 rounded-xl transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            viewMode === 'admin' ? 'w-[calc(33.33%-0.25rem)]' : 'w-[calc(50%-0.25rem)]'
          } ${
            activeTab === 'reports' ? (viewMode === 'admin' ? 'translate-x-[100%]' : 'translate-x-[100%]') : 
            activeTab === 'settings' ? 'translate-x-[200%]' : 
            'translate-x-0'
          } ${
            activeTab === 'settings' ? 'bg-slate-700 shadow-lg shadow-slate-500/30' : 
            activeTab === 'reports' ? 'bg-indigo-500 shadow-lg shadow-indigo-500/30' : 
            'bg-indigo-600 shadow-lg shadow-indigo-500/40'
          }`}></div>
          
          <button
            onClick={() => setActiveTab('ledger')}
            className={`relative z-10 flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-bold transition-all duration-300 ${
              activeTab === 'ledger' 
                ? 'text-white' 
                : 'text-indigo-300 hover:text-white'
            }`}
          >
            <span className="truncate w-full text-center">Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`relative z-10 flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-bold transition-all duration-300 ${
              activeTab === 'reports' 
                ? 'text-white' 
                : 'text-indigo-300 hover:text-white'
            }`}
          >
            <span className="truncate w-full text-center">Payment</span>
          </button>

          {viewMode === 'admin' && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`relative z-10 flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-bold transition-all duration-300 ${
                activeTab === 'settings' 
                  ? 'text-white' 
                  : 'text-indigo-300 hover:text-white'
              }`}
            >
              <span className="truncate w-full text-center">Settings</span>
            </button>
          )}
        </div>
      </div>


      {/* Desktop Footer (hidden on mobile) */}
      <div className="hidden md:block fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-3 duration-500">
        <div className="flex gap-2 p-2 bg-indigo-950/90 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-indigo-900/50 border border-indigo-800/50 max-w-fit">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center px-8 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'ledger' 
                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/40' 
                : 'text-indigo-300 hover:text-white hover:bg-indigo-900/50'
            }`}
          >
            <span>Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center px-8 py-3 rounded-2xl text-sm font-bold transition-all ${
              activeTab === 'reports' 
                ? 'bg-indigo-500 text-white shadow-xl shadow-indigo-500/40' 
                : 'text-indigo-300 hover:text-white hover:bg-indigo-900/50'
            }`}
          >
            <span>Record Payment</span>
          </button>
          {viewMode === 'admin' && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center px-8 py-3 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'settings' 
                  ? 'bg-slate-700 text-white shadow-xl shadow-slate-700/40' 
                  : 'text-indigo-300 hover:text-white hover:bg-indigo-900/50'
              }`}
            >
              <span>Settings</span>
            </button>
          )}
        </div>
      </div>


      {reportData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[101] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
             <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                   <h3 className="text-xl font-black text-slate-800">{reportData.title}</h3>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Aggregated Summary</p>
                </div>
                <button onClick={() => setReportData(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 outline-none">
                   <X size={24} />
                </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Total Bill</span>
                      <span className="text-xl font-black text-indigo-600 font-mono">Rs. {reportData.grandTotalBill.toLocaleString()}</span>
                   </div>
                   <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1">Cash Paid</span>
                      <span className="text-xl font-black text-emerald-600 font-mono">Rs. {reportData.totalCashPaid.toLocaleString()}</span>
                   </div>
                </div>

                <div className="space-y-3">
                   <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Category Breakdown</h4>
                   {reportData.items.map(item => (
                      <div key={item.category} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                         <div>
                            <span className={`inline-block px-2 py-0.5 border rounded-md text-[10px] font-black uppercase tracking-wider mb-1 ${getCategoryColor(item.category)}`}>
                               {item.category}
                            </span>
                            <div className="text-sm font-black text-slate-700">{item.weight.toLocaleString()} KG</div>
                         </div>
                         <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 mb-0.5">Subtotal</div>
                            <div className="text-base font-black text-slate-800 font-mono">Rs. {item.total.toLocaleString()}</div>
                         </div>
                      </div>
                   ))}
                   {reportData.items.length === 0 && (
                      <div className="text-center py-8 text-slate-400 font-bold italic">No delivery records found for this period.</div>
                   )}
                </div>
             </div>

             <div className="p-6 bg-slate-50 border-t border-slate-100">
                <button onClick={() => setReportData(null)} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black shadow-lg shadow-slate-200 active:scale-95 transition-transform">
                   CLOSE REPORT
                </button>
             </div>
          </div>
        </div>
      )}

      {deleteConfirmData && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500"></div>
            
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4 border border-rose-100">
                <AlertCircle size={32} className="text-rose-500" />
              </div>
              
              <h3 className="text-2xl font-black text-slate-800 mb-2">Are you sure?</h3>
              <p className="text-slate-500 text-sm mb-8 font-medium leading-relaxed">
                {deleteConfirmData.message || `You are about to delete this ${deleteConfirmData.type}. This action is permanent and cannot be reversed.`}
              </p>
              
              <div className="flex flex-col w-full gap-3">
                <button 
                  onClick={confirmDelete} 
                  className="w-full py-4 bg-rose-500 text-white hover:bg-rose-600 rounded-2xl font-black shadow-lg shadow-rose-200 active:scale-95 transition-all text-sm uppercase tracking-widest"
                >
                  Confirm Delete
                </button>
                <button 
                  onClick={() => setDeleteConfirmData(null)} 
                  className="w-full py-4 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-2xl font-black active:scale-95 transition-all text-sm uppercase tracking-widest"
                >
                  Keep it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
