/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useCallback } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import { getFirestore, collection, query, where, onSnapshot } from "firebase/firestore";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { LogIn, LogOut, Plus, X, Activity, List, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import firebaseConfig from "../firebase-applet-config.json";
import { getUserSettings, updateUserSettings, saveTransaction } from "@/lib/firebase_service";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const provider = new GoogleAuthProvider();

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  
  const [settings, setSettings] = useState<{accounts: string[], categories: string[], incomeCategories: string[]}>({accounts: [], categories: [], incomeCategories: []});
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  
  // Transaction Form State
  const [txType, setTxType] = useState("expense");
  const [txAmount, setTxAmount] = useState("");
  const [txAccount, setTxAccount] = useState("");
  const [txToAccount, setTxToAccount] = useState("");
  const [txCategory, setTxCategory] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const syncTelegram = async (manual = false) => {
    if (!user) return;
    try {
      console.log("Syncing Telegram for user:", user.uid);
      const res = await fetch('/api/telegram/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Telegram sync API error:", res.status, text.substring(0, 100));
        return;
      }
      const data = await res.json();
      console.log("Telegram sync response:", data);
      if (data.ok && data.count > 0) {
        showToast(`✅ ${data.count} mensajes nuevos procesados.`);
        fetchReport();
      }
    } catch (e) {
      console.error("Telegram sync fetch error:", e);
    }
  };

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    try {
      const s = await getUserSettings(user.uid);
      setSettings(s as any);
      if (s.accounts?.length > 0) setTxAccount(s.accounts[0]);
      if (s.categories?.length > 0) setTxCategory(s.categories[0]);
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  const fetchReport = useCallback(async () => {
    if (!user) return;
    try {
      const url = `/api/dashboard?userId=${user.uid}&month=${month}&year=${year}`;
      console.log("Fetching report from:", url);
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        console.error("Dashboard API error:", res.status, text.substring(0, 100));
        return;
      }
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [user, month, year]);

  useEffect(() => {
    console.log("Setting up onAuthStateChanged listener");
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("Auth state changed:", u ? u.uid : "null");
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      void fetchReport();
      void fetchSettings();
      
      const q = query(collection(db, "transactions"), where("userId", "==", user.uid));
      const unsubscribe = onSnapshot(q, () => {
        void fetchReport();
      });

      const syncInterval = setInterval(() => {
        syncTelegram(false);
      }, 5000);

      return () => {
        unsubscribe();
        clearInterval(syncInterval);
      };
    }
  }, [user, fetchReport, fetchSettings]);

  const login = () => signInWithPopup(auth, provider);
  const logout = () => auth.signOut();

  const copyUserId = () => {
    if (user) {
      navigator.clipboard.writeText(`/start ${user.uid}`);
      showToast("Comando copiado. Pégalo en Telegram.");
    }
  };
  const handleSaveTransaction = async (e: any) => {
    e.preventDefault();
    if (!user) return;
    
    const data: any = {
      userId: user.uid,
      type: txType,
      amount: parseFloat(txAmount),
      account: txAccount,
      date: new Date(txDate).toISOString(),
      description: txDescription
    };

    if (txType === "expense" || txType === "income") {
      data.category = txCategory;
    } else if (txType === "transfer") {
      data.toAccount = txToAccount;
    }

    try {
      await saveTransaction(data);
      setIsTxModalOpen(false);
      setTxAmount("");
      setTxDescription("");
      fetchReport();
      showToast("Transacción guardada");
    } catch (err) {
      showToast("Error al guardar");
    }
  };

  const [newAccount, setNewAccount] = useState("");
  const [activeTab, setActiveTab] = useState<'movements' | 'settings'>('movements');
  const [newCategory, setNewCategory] = useState("");
  const [newIncomeCategory, setNewIncomeCategory] = useState("");

  const handleAddAccount = async () => {
    if (!newAccount.trim() || !user) return;
    const updated = { ...settings, accounts: [...settings.accounts, newAccount.trim()] };
    setSettings(updated);
    setNewAccount("");
    await updateUserSettings(user.uid, updated);
  };

  const handleRemoveAccount = async (acc: string) => {
    if (!user) return;
    const updated = { ...settings, accounts: settings.accounts.filter(a => a !== acc) };
    setSettings(updated);
    await updateUserSettings(user.uid, updated);
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim() || !user) return;
    const updated = { ...settings, categories: [...settings.categories, newCategory.trim()] };
    setSettings(updated);
    setNewCategory("");
    await updateUserSettings(user.uid, updated);
  };

  const handleRemoveCategory = async (cat: string) => {
    if (!user) return;
    const updated = { ...settings, categories: settings.categories.filter(c => c !== cat) };
    setSettings(updated);
    await updateUserSettings(user.uid, updated);
  };

  const handleAddIncomeCategory = async () => {
    if (!newIncomeCategory.trim() || !user) return;
    const updated = { ...settings, incomeCategories: [...settings.incomeCategories, newIncomeCategory.trim()] };
    setSettings(updated);
    setNewIncomeCategory("");
    await updateUserSettings(user.uid, updated);
  };

  const handleRemoveIncomeCategory = async (cat: string) => {
    if (!user) return;
    const updated = { ...settings, incomeCategories: settings.incomeCategories.filter(c => c !== cat) };
    setSettings(updated);
    await updateUserSettings(user.uid, updated);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-[2rem] shadow-xl shadow-indigo-100/50 text-center max-w-md w-full border border-slate-100"
        >
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Wallet size={32} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">Finanzas Bot</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">Tu asistente financiero personal. Inicia sesión para gestionar tus gastos desde Telegram o la web.</p>
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white py-4 px-4 rounded-2xl font-semibold transition-all active:scale-[0.98] shadow-md shadow-indigo-200"
          >
            <LogIn size={20} />
            Continuar con Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (user.email !== 'vinicio.velasteguis@gmail.com') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-[2rem] shadow-xl text-center max-w-md w-full border border-slate-100">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-3">Acceso Denegado</h1>
          <p className="text-slate-500 mb-6">Esta aplicación es de uso personal.</p>
          <button onClick={login} className="bg-indigo-600 text-white py-3 px-6 rounded-2xl font-semibold">Iniciar sesión</button>
        </div>
      </div>
    );
  }

  const expenseData = report && report.expensesByCategory ? Object.entries(report.expensesByCategory).map(([name, value]) => ({ name, value })) : [];
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f43f5e'];

  const checkBalances = () => {
    if (report && report.balancesByAccount) {
      const balances = Object.entries(report.balancesByAccount).map(([acc, bal]) => `${acc}: $${(bal as number).toFixed(2)}`).join('\n');
      showToast(`Balances:\n${balances}`);
    } else {
      showToast("No se pudieron obtener los balances.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28 font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="bg-slate-50 pt-14 pb-6 px-6 sticky top-0 z-10">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <h1 className="text-2xl font-extrabold text-slate-900">Finanzas</h1>
          <div className="flex gap-2">
            <button onClick={checkBalances} className="p-2 text-indigo-600 hover:text-indigo-800"><Wallet size={20} /></button>
          </div>
        </div>
      </header>

      <main className="px-5 mt-6 max-w-md mx-auto">
        {/* Tabs */}
        <div className="bg-slate-100 p-1 rounded-2xl flex mb-6">
          <button onClick={() => setActiveTab('movements')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'movements' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Movimientos</button>
          <button onClick={() => setActiveTab('settings')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${activeTab === 'settings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Configuración</button>
        </div>

        {report ? (
          <div className="space-y-6">
            {activeTab === 'movements' ? (
              <>
                {/* Pie Chart & Balance */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 relative">
                  <div className="h-64 flex items-center justify-center relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseData}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                        >
                          {expenseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-slate-500 text-xs font-bold uppercase">Saldo</p>
                      <h2 className="text-3xl font-extrabold text-slate-900">${report.balance.toFixed(2)}</h2>
                      <p className="text-emerald-600 text-sm font-bold">+${report.totalIncome.toFixed(2)}</p>
                      <p className="text-rose-600 text-sm font-bold">-${report.totalExpense.toFixed(2)}</p>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {expenseData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-2 text-xs text-slate-600">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="truncate">{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Balances */}
                <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wider">
                    <Wallet size={18} className="text-indigo-500" />
                    Saldos por Cuenta
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(report.balancesByAccount || {}).map(([acc, bal]) => (
                      <div key={acc} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                        <span className="text-sm font-semibold text-slate-700">{acc}</span>
                        <span className="text-sm font-bold text-slate-900">${(bal as number).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* +/- Buttons */}
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => {setTxType('expense'); setIsTxModalOpen(true);}} className="bg-rose-50 text-rose-600 py-4 rounded-full font-bold text-xl shadow-sm hover:bg-rose-100 transition-all">-</button>
                  <button onClick={() => {setTxType('income'); setIsTxModalOpen(true);}} className="bg-emerald-50 text-emerald-600 py-4 rounded-full font-bold text-xl shadow-sm hover:bg-emerald-100 transition-all">+</button>
                </div>
                
                {/* Transaction List */}
                <div className="bg-white p-2 rounded-[2rem] shadow-sm border border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 m-4 flex items-center gap-2 uppercase tracking-wider">
                    <List size={18} className="text-indigo-500" />
                    Movimientos
                  </h3>
                  {report.transactions && report.transactions.length > 0 ? (
                    <div className="divide-y divide-slate-50">
                      {report.transactions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors rounded-2xl">
                          <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-2xl ${
                              t.type === 'income' ? 'bg-emerald-50 text-emerald-600' :
                              t.type === 'expense' ? 'bg-rose-50 text-rose-600' :
                              'bg-indigo-50 text-indigo-600'
                            }`}>
                              {t.type === 'income' ? <TrendingUp size={20} /> : t.type === 'expense' ? <TrendingDown size={20} /> : <Activity size={20} />}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm mb-0.5">{t.description || t.category || 'Transferencia'}</p>
                              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{t.account} • {new Date(t.date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className={`font-extrabold text-base ${
                            t.type === 'income' ? 'text-emerald-600' :
                            t.type === 'expense' ? 'text-slate-900' :
                            'text-slate-600'
                          }`}>
                            {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}${t.amount.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <List size={24} className="text-slate-300" />
                      </div>
                      <p className="text-sm font-medium">No hay transacciones</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2 uppercase tracking-wider">
                  Configuración
                </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Cuentas</label>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newAccount} onChange={e => setNewAccount(e.target.value)} className="flex-1 border border-slate-200 rounded-xl p-2 text-sm" placeholder="Nueva cuenta" />
                    <button onClick={handleAddAccount} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold">+</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {settings.accounts.map(a => (
                      <span key={a} className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                        {a}
                        <button onClick={() => handleRemoveAccount(a)} className="text-slate-400 hover:text-rose-500"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Categorías Gasto</label>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)} className="flex-1 border border-slate-200 rounded-xl p-2 text-sm" placeholder="Nueva categoría" />
                    <button onClick={handleAddCategory} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold">+</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {settings.categories.map(c => (
                      <span key={c} className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                        {c}
                        <button onClick={() => handleRemoveCategory(c)} className="text-slate-400 hover:text-rose-500"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Categorías Ingreso</label>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newIncomeCategory} onChange={e => setNewIncomeCategory(e.target.value)} className="flex-1 border border-slate-200 rounded-xl p-2 text-sm" placeholder="Nueva categoría" />
                    <button onClick={handleAddIncomeCategory} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold">+</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {settings.incomeCategories.map(c => (
                      <span key={c} className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs flex items-center gap-1">
                        {c}
                        <button onClick={() => handleRemoveIncomeCategory(c)} className="text-slate-400 hover:text-rose-500"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                </div>
                
                <div className="pt-6 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Configuración del Bot</label>
                  <div className="space-y-3">
                    <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-indigo-600 text-white rounded-lg">
                          <Activity size={16} />
                        </div>
                        <span className="font-bold text-slate-900 text-sm">Telegram Bot</span>
                      </div>
                      <p className="text-xs text-slate-600 mb-3">Envía este comando al bot para vincular tu cuenta:</p>
                      <button onClick={copyUserId} className="w-full bg-white border border-indigo-200 text-indigo-600 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2">
                        <List size={14} />
                        Copiar Comando
                      </button>
                    </div>
                    
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 opacity-60">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-slate-400 text-white rounded-lg">
                          <Activity size={16} />
                        </div>
                        <span className="font-bold text-slate-900 text-sm">Instagram Bot (Próximamente)</span>
                      </div>
                      <p className="text-[10px] text-slate-500">La integración con Instagram está en desarrollo.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <button onClick={logout} className="w-full flex items-center justify-center gap-2 bg-rose-50 text-rose-600 py-3 rounded-2xl font-bold hover:bg-rose-100 transition-all">
                    <LogOut size={18} />
                    Cerrar Sesión
                  </button>
                </div>
              </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 bg-white rounded-[2rem] shadow-sm border border-slate-100">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}
      </main>
      
      {/* Transaction Modal */}
      <AnimatePresence>
        {isTxModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2rem] p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-extrabold text-slate-900">Nueva Transacción</h2>
                <button onClick={() => setIsTxModalOpen(false)} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleSaveTransaction} className="space-y-5">
                <div className="bg-slate-50 p-1 rounded-2xl flex">
                  {(['expense', 'income', 'transfer'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setTxType(type);
                        if (type === 'income' && settings.incomeCategories?.length > 0) setTxCategory(settings.incomeCategories[0]);
                        else if (type === 'expense' && settings.categories?.length > 0) setTxCategory(settings.categories[0]);
                      }}
                      className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                        txType === type 
                          ? 'bg-white text-slate-900 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {type === 'expense' ? 'Gasto' : type === 'income' ? 'Ingreso' : 'Traspaso'}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Monto ($)</label>
                  <input type="number" step="0.01" required value={txAmount} onChange={e => setTxAmount(e.target.value)} className="w-full border border-slate-200 rounded-2xl p-4 bg-white text-lg font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="0.00" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{txType === 'transfer' ? 'Origen' : 'Cuenta'}</label>
                    <select required value={txAccount} onChange={e => setTxAccount(e.target.value)} className="w-full border border-slate-200 rounded-2xl p-3.5 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none appearance-none">
                      <option value="">Seleccionar</option>
                      {settings.accounts.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  
                  {txType === 'transfer' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Destino</label>
                      <select required value={txToAccount} onChange={e => setTxToAccount(e.target.value)} className="w-full border border-slate-200 rounded-2xl p-3.5 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none appearance-none">
                        <option value="">Seleccionar</option>
                        {settings.accounts.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Categoría</label>
                      <select required value={txCategory} onChange={e => setTxCategory(e.target.value)} className="w-full border border-slate-200 rounded-2xl p-3.5 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none appearance-none">
                        <option value="">Seleccionar</option>
                        {txType === 'income' 
                          ? settings.incomeCategories.map(c => <option key={c} value={c}>{c}</option>)
                          : settings.categories.map(c => <option key={c} value={c}>{c}</option>)
                        }
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Fecha</label>
                  <input type="date" required value={txDate} onChange={e => setTxDate(e.target.value)} className="w-full border border-slate-200 rounded-2xl p-3.5 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Descripción (Opcional)</label>
                  <input type="text" value={txDescription} onChange={e => setTxDescription(e.target.value)} className="w-full border border-slate-200 rounded-2xl p-3.5 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ej. Almuerzo" />
                </div>

                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] shadow-md shadow-indigo-200 mt-2">
                  Guardar Transacción
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3.5 rounded-full shadow-2xl z-[60] flex items-center gap-3 font-medium text-sm whitespace-nowrap"
          >
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button (FAB) */}
      <AnimatePresence>
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          onClick={() => setIsTxModalOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl shadow-indigo-200 flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all z-40"
        >
          <Plus size={28} />
        </motion.button>
      </AnimatePresence>
    </div>
  );
}
