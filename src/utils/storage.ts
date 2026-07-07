import { Transaction, Delivery, DeliveryItem, PurchasePayment, Supplier, Formula } from '../types';
import { supabase } from '../lib/supabase';

const SUPPLIERS_KEY = 'chicken_suppliers_list';
const CURRENT_SUPPLIER_KEY = 'chicken_current_supplier_id';
const CATEGORIES_KEY = 'chicken_supplier_categories_v2';
const FORMULAS_KEY = 'chicken_rate_formulas';
const SYSTEM_USERS_KEY = 'chicken_system_users';
const SUPABASE_IDENTITY_KEY = 'chicken_supabase_identity';

const getSupabaseSession = async () => {
  if (!supabase) return null;
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Supabase auth session error:', error);
    return null;
  }
  return session;
};

const getSupabaseIdentity = async (): Promise<{ uid: string; email: string } | null> => {
  if (!supabase) return null;

  const session = await getSupabaseSession();
  const authenticatedUser = session?.user;
  if (authenticatedUser?.id) {
    return {
      uid: authenticatedUser.id,
      email: authenticatedUser.email || 'user@local.app'
    };
  }

  let identity = localStorage.getItem(SUPABASE_IDENTITY_KEY);
  if (!identity) {
    identity = `guest-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(SUPABASE_IDENTITY_KEY, identity);
  }

  return {
    uid: identity,
    email: `${identity}@local.app`
  };
};

const ensureDatabaseUserId = async (): Promise<number | null> => {
  if (!supabase) return null;
  const identity = await getSupabaseIdentity();
  if (!identity) return null;

  const { data: existingUser, error: lookupError } = await supabase
    .from('users')
    .select('id')
    .eq('uid', identity.uid)
    .maybeSingle();

  if (lookupError) {
    console.error('Supabase user lookup error:', lookupError);
    return null;
  }

  if (existingUser?.id) {
    return existingUser.id;
  }

  const { data: insertedUser, error: insertError } = await supabase
    .from('users')
    .insert({ uid: identity.uid, email: identity.email })
    .select('id')
    .single();

  if (insertError) {
    console.error('Supabase user creation error:', insertError);
    return null;
  }

  return insertedUser.id;
};

const mapSupplierRow = (row: any): Supplier => ({
  id: String(row.external_id),
  name: row.name,
  password: row.password || '',
  categories: Array.isArray(row.categories) ? row.categories : [],
  createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
});

// Supplier Management
export const getSuppliersSync = (): Supplier[] => {
  try {
    const data = localStorage.getItem(SUPPLIERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const getSuppliers = async (): Promise<Supplier[]> => {
  if (!supabase) return getSuppliersSync();
  const userId = await ensureDatabaseUserId();
  if (!userId) return getSuppliersSync();

  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching suppliers from Supabase:', error);
      return getSuppliersSync();
    }

    const result: Supplier[] = (data || []).map(mapSupplierRow);
    if (result.length > 0) {
      localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(result));
      return result;
    }
    // Cloud empty, fall back to local data
    return getSuppliersSync();
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return getSuppliersSync();
  }
};

export const saveSuppliers = async (suppliers: Supplier[]) => {
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers));

  if (!supabase) return;
  const userId = await ensureDatabaseUserId();
  if (!userId) return;

  try {
    const rows = suppliers.map(s => ({
      external_id: s.id,
      user_id: userId,
      name: s.name,
      password: s.password,
      categories: s.categories
    }));

    const { error } = await supabase
      .from('suppliers')
      .upsert(rows, { onConflict: 'external_id' });

    if (error) {
      console.error('Error saving suppliers to Supabase:', error);
    }
  } catch (error) {
    console.error('Error saving suppliers:', error);
  }
};

export const addSupplier = async (name: string, password?: string, categories?: string[]): Promise<Supplier | null> => {
  const newSupplierData: Supplier = {
    id: `sup-${Date.now()}`,
    name,
    password: password || '',
    categories: categories || [],
    createdAt: Date.now()
  };

  if (!supabase) {
    const suppliers = getSuppliersSync();
    suppliers.push(newSupplierData);
    localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers));
    return newSupplierData;
  }

  const session = await getSupabaseSession();
  if (!session?.user) {
    console.error('User not authenticated');
    return null;
  }

  await saveSuppliers([newSupplierData]);
  return newSupplierData;
};

export const updateSupplier = async (updated: Supplier) => {
  const suppliers = await getSuppliers();
  const index = suppliers.findIndex(s => s.id === updated.id);
  if (index !== -1) {
    suppliers[index] = updated;
    await saveSuppliers(suppliers);
  }
};

export const deleteSupplier = async (id: string) => {
  const suppliers = await getSuppliers();
  const remaining = suppliers.filter(s => s.id !== id);

  if (supabase) {
    const userId = await ensureDatabaseUserId();
    if (userId) {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('external_id', id)
        .eq('user_id', userId);
      if (error) {
        console.error('Error deleting supplier from Supabase:', error);
      }
    }
  }

  await saveSuppliers(remaining);
  localStorage.removeItem(`chicken_txs_${id}`);
  if (getCurrentSupplierId() === id) {
    if (remaining.length > 0) {
      setCurrentSupplierId(remaining[0].id);
    } else {
      localStorage.removeItem(CURRENT_SUPPLIER_KEY);
    }
  }
};

export const getCurrentSupplierId = (): string | null => {
  return localStorage.getItem(CURRENT_SUPPLIER_KEY);
};

export const setCurrentSupplierId = (id: string) => {
  localStorage.setItem(CURRENT_SUPPLIER_KEY, id);
};

const getSupplierDatabaseRecord = async (externalId: string) => {
  if (!supabase) return null;
  const userId = await ensureDatabaseUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('suppliers')
    .select('id')
    .eq('external_id', externalId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error looking up supplier:', error);
    return null;
  }

  return data;
};

const mapTransactionRow = (row: any, items: any[] = []): Transaction => {
  if (row.type === 'delivery') {
    const transactionItems = items
      .filter(item => item.transaction_id === row.id)
      .map((item: any) => ({
        id: String(item.id),
        category: item.category,
        weight: parseFloat(item.weight || '0'),
        rate: parseFloat(item.rate || '0'),
        total: parseFloat(item.total || '0')
      }));

    return {
      id: String(row.external_id),
      type: 'delivery',
      date: row.date,
      totalBill: parseFloat(row.total_bill || '0'),
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      items: transactionItems
    };
  }

  return {
    id: String(row.external_id),
    type: 'payment',
    date: row.date,
    amount: parseFloat(row.amount || '0'),
    note: row.note || '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
  };
};

// Transaction Management (Scoped to Supplier)
export const getTransactions = (supplierId: string | null = getCurrentSupplierId()): Transaction[] => {
  if (!supplierId) return [];
  try {
    const data = localStorage.getItem(`chicken_txs_${supplierId}`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const syncTransactionsWithCloud = async (supplierId: string | null = getCurrentSupplierId()): Promise<Transaction[]> => {
  if (!supplierId) return [];
  if (!supabase) return getTransactions(supplierId);

  const supplierRecord = await getSupplierDatabaseRecord(supplierId);
  if (!supplierRecord) return getTransactions(supplierId);

  try {
    const { data: transactionsData, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('supplier_id', supplierRecord.id);

    if (txError) {
      console.error('Error fetching transactions from Supabase:', txError);
      return getTransactions(supplierId);
    }

    const txIds = (transactionsData || []).map((row: any) => row.id);
    let itemsData: any[] = [];

    if (txIds.length) {
      const { data: fetchedItems, error: itemError } = await supabase
        .from('delivery_items')
        .select('*')
        .in('transaction_id', txIds);
      if (itemError) {
        console.error('Error fetching delivery items from Supabase:', itemError);
      } else {
        itemsData = fetchedItems || [];
      }
    }

    const result: Transaction[] = (transactionsData || []).map((t: any) => mapTransactionRow(t, itemsData));
    if (result.length > 0) {
      localStorage.setItem(`chicken_txs_${supplierId}`, JSON.stringify(result));
      return result;
    }
    // Cloud empty, keep local data
    return getTransactions(supplierId);
  } catch (error) {
    console.error('Error syncing transactions from cloud:', error);
    return getTransactions(supplierId);
  }
};

const saveTransactionItems = async (transactionId: number, items: DeliveryItem[]) => {
  if (!supabase) return;
  const { error: deleteError } = await supabase
    .from('delivery_items')
    .delete()
    .eq('transaction_id', transactionId);

  if (deleteError) {
    console.error('Error clearing existing delivery items:', deleteError);
  }

  if (items.length === 0) return;

  const insertRows = items.map(item => ({
    transaction_id: transactionId,
    category: item.category,
    weight: item.weight.toString(),
    rate: item.rate.toString(),
    total: item.total.toString()
  }));

  const { error: insertError } = await supabase
    .from('delivery_items')
    .insert(insertRows);

  if (insertError) {
    console.error('Error saving delivery items to Supabase:', insertError);
  }
};

export const saveTransactions = async (txs: Transaction[], supplierId: string | null = getCurrentSupplierId()) => {
  if (!supplierId) return;
  localStorage.setItem(`chicken_txs_${supplierId}`, JSON.stringify(txs));

  if (!supabase) return;
  const supplierRecord = await getSupplierDatabaseRecord(supplierId);
  if (!supplierRecord) return;

  try {
    const { data: existing, error: existingError } = await supabase
      .from('transactions')
      .select('id, external_id')
      .eq('supplier_id', supplierRecord.id);

    if (existingError) {
      console.error('Error reading existing transactions from Supabase:', existingError);
    } else {
      const deletedIds = (existing || [])
        .filter((row: any) => !txs.some(tx => tx.id === row.external_id))
        .map((row: any) => row.id);

      if (deletedIds.length) {
        await supabase.from('delivery_items').delete().in('transaction_id', deletedIds);
        const { error: deleteTxError } = await supabase.from('transactions').delete().in('id', deletedIds);
        if (deleteTxError) {
          console.error('Error deleting stale transactions from Supabase:', deleteTxError);
        }
      }
    }

    for (const tx of txs) {
      const { data: insertedTx, error: txError } = await supabase
        .from('transactions')
        .upsert({
          external_id: tx.id,
          supplier_id: supplierRecord.id,
          type: tx.type,
          date: tx.date,
          amount: tx.type === 'payment' ? tx.amount : null,
          total_bill: tx.type === 'delivery' ? tx.totalBill : null,
          note: tx.type === 'payment' ? tx.note : null
        }, { onConflict: 'external_id' })
        .select('id')
        .single();

      if (txError) {
        console.error('Error saving transaction to Supabase:', txError);
        continue;
      }

      if (tx.type === 'delivery' && tx.items?.length && insertedTx?.id) {
        await saveTransactionItems(insertedTx.id, tx.items);
      }
    }
  } catch (error) {
    console.error('Error saving transactions to Supabase:', error);
  }
};

export const addTransaction = async (tx: Transaction, supplierId: string | null = getCurrentSupplierId()) => {
  const txs = getTransactions(supplierId);
  txs.push(tx);
  await saveTransactions(txs, supplierId);
};

export const deleteTransaction = async (id: string, supplierId: string | null = getCurrentSupplierId()) => {
  const txs = getTransactions(supplierId);
  const filtered = txs.filter(t => t.id !== id);
  await saveTransactions(filtered, supplierId);

  if (supabase && supplierId) {
    const supplierRecord = await getSupplierDatabaseRecord(supplierId);
    if (supplierRecord) {
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('id')
        .eq('external_id', id)
        .eq('supplier_id', supplierRecord.id)
        .maybeSingle();
      if (txError) {
        console.error('Error finding transaction to delete in Supabase:', txError);
      } else if (txData?.id) {
        await supabase.from('delivery_items').delete().eq('transaction_id', txData.id);
        const { error: deleteError } = await supabase.from('transactions').delete().eq('id', txData.id);
        if (deleteError) {
          console.error('Error deleting transaction from Supabase:', deleteError);
        }
      }
    }
  }
};

export const updateTransaction = async (updatedTx: Transaction, supplierId: string | null = getCurrentSupplierId()) => {
  const txs = getTransactions(supplierId);
  const index = txs.findIndex(t => t.id === updatedTx.id);
  if (index !== -1) {
    txs[index] = updatedTx;
    await saveTransactions(txs, supplierId);
  }
};

export const getLedgerBalance = (supplierId: string | null = getCurrentSupplierId()): number => {
  const txs = getTransactions(supplierId);
  let owed = 0;
  for (const t of txs) {
    if (t.type === 'delivery') {
      owed += t.totalBill;
    } else if (t.type === 'payment') {
      owed -= t.amount;
    }
  }
  return owed;
};

// Category Management (Shared across suppliers for convenience)
export const getCategories = (): string[] => {
  const defaults = ['Chicken', 'Wings', 'Leg piece', 'Boneless', 'Thigh', 'Chicken tikka', 'New category', 'Whole'];
  try {
    const data = localStorage.getItem(CATEGORIES_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(defaults));
    return defaults;
  } catch {
    return defaults;
  }
};

export const saveCategories = (cats: string[]) => {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
};

export const addCategory = (cat: string) => {
  const c = cat.trim();
  if (!c) return;
  const cats = getCategories();
  if (!cats.includes(c)) {
    cats.push(c);
    saveCategories(cats);
  }
};

export const deleteCategory = (cat: string) => {
  const cats = getCategories();
  const filtered = cats.filter(c => c !== cat);
  saveCategories(filtered);
};

// Formula Management
export const getFormulas = (): Formula[] => {
  try {
    const data = localStorage.getItem(FORMULAS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveFormulas = async (formulas: Formula[]) => {
  localStorage.setItem(FORMULAS_KEY, JSON.stringify(formulas));

  if (!supabase) return;
  const userId = await ensureDatabaseUserId();
  if (!userId) return;

  try {
    const rows = formulas.map(f => ({
      external_id: f.id,
      user_id: userId,
      name: f.name,
      category: f.category,
      expression: f.expression,
      variables: f.variables
    }));

    const { error } = await supabase
      .from('formulas')
      .upsert(rows, { onConflict: 'external_id' });

    if (error) {
      console.error('Error saving formulas to Supabase:', error);
    }
  } catch (error) {
    console.error('Error saving formulas:', error);
  }
};

export const addFormula = (formula: Omit<Formula, 'id'>): Formula => {
  const formulas = getFormulas();
  const newFormula: Formula = {
    ...formula,
    id: `formula-${Date.now()}`
  };
  formulas.push(newFormula);
  saveFormulas(formulas);
  return newFormula;
};

export const deleteFormula = (id: string) => {
  const formulas = getFormulas();
  const filtered = formulas.filter(f => f.id !== id);
  saveFormulas(filtered);
};

export const updateFormula = (updated: Formula) => {
  const formulas = getFormulas();
  const index = formulas.findIndex(f => f.id === updated.id);
  if (index !== -1) {
    formulas[index] = updated;
    saveFormulas(formulas);
  }
};

export const getFormulasByCategory = (category: string): Formula[] => {
  return getFormulas().filter(f => f.category === category);
};

// System User Management
export const getSystemUsers = (): any[] => {
  try {
    const data = localStorage.getItem(SYSTEM_USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveSystemUsers = (users: any[]) => {
  localStorage.setItem(SYSTEM_USERS_KEY, JSON.stringify(users));
};

export const addSystemUser = (username: string, password: string, role: string = 'admin') => {
  const users = getSystemUsers();
  const newUser = { username, password, role, createdAt: Date.now() };
  users.push(newUser);
  saveSystemUsers(users);
  return newUser;
};

// Helper to get today's date in YYYY-MM-DD
export const getTodayDate = () => new Date().toISOString().split('T')[0];

// Seeding logic
export const initializeStorage = async () => {
  const suppliers = await getSuppliers();
  if (suppliers.length === 0) {
    const firstSupplier: Supplier = {
      id: `sup-${Date.now()}`,
      name: 'Default Supplier',
      password: '',
      categories: [],
      createdAt: Date.now()
    };
    localStorage.setItem(SUPPLIERS_KEY, JSON.stringify([firstSupplier]));
    setCurrentSupplierId(firstSupplier.id);
    
    // Move existing standalone transactions if they exist (Migration)
    const oldKey = 'chicken_supplier_ledger';
    const oldData = localStorage.getItem(oldKey);
    if (oldData) {
      localStorage.setItem(`chicken_txs_${firstSupplier.id}`, oldData);
      localStorage.removeItem(oldKey);
    }
  }

  // Add default category if none exists
  const categories = getCategories();
  if (categories.length === 0) {
    saveCategories(['Chicken', 'Feed']);
  }

  // Add default formulas if none exist
  const formulas = getFormulas();
  if (formulas.length === 0) {
    addFormula({
      name: 'Standard Rate',
      category: 'Chicken',
      expression: 'sp + v1',
      variables: [
        { name: 'sp', label: 'Base Rate' },
        { name: 'v1', label: 'Market Extra' }
      ]
    });
    addFormula({
      name: 'Broiler Commission',
      category: 'Chicken',
      expression: 'sp - v1',
      variables: [
        { name: 'sp', label: 'Market Rate' },
        { name: 'v1', label: 'Commission' }
      ]
    });
    addFormula({
      name: 'Multi-Variable Rate',
      category: 'Chicken',
      expression: 'sp + (v1 * v2)',
      variables: [
        { name: 'sp', label: 'Base' },
        { name: 'v1', label: 'Factor A' },
        { name: 'v2', label: 'Factor B' }
      ]
    });
    addFormula({
      name: 'Feed Total',
      category: 'Feed',
      expression: 'v1 * v2',
      variables: [
        { name: 'v1', label: 'Bags' },
        { name: 'v2', label: 'Rate per Bag' }
      ]
    });
  }

  // Add default system users if none exist
  const systemUsers = getSystemUsers();
  if (systemUsers.length === 0) {
    addSystemUser('km', '111222', 'admin');
    addSystemUser('sameer', '11111', 'supplier');
  }
};
