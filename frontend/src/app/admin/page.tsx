'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Shield, DollarSign, Activity, Users, Percent, Sliders, RefreshCw, 
  ArrowLeft, Flame, Lock, CheckCircle2, TrendingUp, TrendingDown, Clock,
  X, CreditCard, Wallet, Landmark
} from 'lucide-react';

interface LiveBet {
  id: string;
  user_id: number;
  user_email: string;
  item_id: number;
  item_name: string;
  direction: 'UP' | 'DOWN';
  amount: string;
  start_price: string;
  expires_at: string;
  status: string;
  override_status?: 'FORCE_WIN' | 'FORCE_LOSS' | null;
}

interface ResolvedBet {
  id: string;
  user_id: number;
  user_email: string;
  item_id: number;
  item_name: string;
  direction: 'UP' | 'DOWN';
  amount: string;
  start_price: string;
  end_price: string | null;
  expires_at: string;
  status: string;
  payout_amount: string | null;
  created_at: string;
}

interface UserManage {
  id: number;
  email: string;
  role: string;
  created_at: string;
  balance: string;
  locked_balance: string;
}

interface DepositRequest {
  id: string;
  user_id: number;
  user_email: string;
  amount: number;
  currency: string;
  payment_method: 'UPI' | 'BTC' | 'ETH' | 'USDT';
  reference_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

interface WithdrawalRequest {
  id: string;
  user_id: number;
  user_email: string;
  amount: number;
  currency: string;
  payment_method: 'UPI' | 'BANK_TRANSFER' | 'BTC' | 'ETH' | 'USDT';
  payment_details: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_BASE = `${NEXT_PUBLIC_API_URL}/api`;

export default function AdminDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: number; email: string; role: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Stats Metrics
  const [stats, setStats] = useState({
    treasury_earnings: 100000.0,
    active_bets_count: 0,
    total_bets_count: 0,
    total_volume: 0.0,
    house_net_earnings: 0.0,
    total_registered_users: 0,
    win_ratio: 0.0,
  });

  // Settings / Config state
  const [goldTrend, setGoldTrend] = useState<'UP' | 'DOWN' | 'NEUTRAL'>('NEUTRAL');
  const [silverTrend, setSilverTrend] = useState<'UP' | 'DOWN' | 'NEUTRAL'>('NEUTRAL');
  const [payoutRate, setPayoutRate] = useState('0.85');
  const [houseProtection, setHouseProtection] = useState('0.45');
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Bets tracking state
  const [activeBets, setActiveBets] = useState<LiveBet[]>([]);
  const [betLogs, setBetLogs] = useState<ResolvedBet[]>([]);

  // Main navigation tab
  const [activeTab, setActiveTab] = useState<'telemetry' | 'users' | 'deposits' | 'withdrawals' | 'gateways'>('telemetry');
  
  // Tab states - Users
  const [usersList, setUsersList] = useState<UserManage[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserManage | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustAction, setAdjustAction] = useState<'ADD' | 'SUBTRACT'>('ADD');
  const [userMsg, setUserMsg] = useState<string | null>(null);

  // Tab states - Deposits & Withdrawals
  const [depositsList, setDepositsList] = useState<DepositRequest[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);
  const [withdrawalsList, setWithdrawalsList] = useState<WithdrawalRequest[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);

  // Tab states - Gateways
  const [upiId, setUpiId] = useState('pay@kuberkhajana');
  const [btcAddress, setBtcAddress] = useState('');
  const [ethAddress, setEthAddress] = useState('');
  const [gatewayMsg, setGatewayMsg] = useState<string | null>(null);

  // UI sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'live' | 'resolved'>('live');
  const socketRef = useRef<Socket | null>(null);

  // Sync token from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('trading_token');
    const savedUser = localStorage.getItem('trading_user');
    if (savedToken && savedUser) {
      const u = JSON.parse(savedUser);
      setToken(savedToken);
      setUser(u);
      if (u.role === 'ADMIN') {
        setIsAdmin(true);
      }
    }
  }, []);

  // Fetch initial Admin Overview & configs
  const loadAdminData = async () => {
    if (!token) return;
    try {
      // 1. Get stats overview
      const overviewRes = await fetch(`${API_BASE}/admin/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (overviewRes.ok) {
        const overviewData = await overviewRes.json();
        setStats(overviewData);
      }

      // 2. Get active configs
      const configRes = await fetch(`${API_BASE}/admin/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (configRes.ok) {
        const configData = await configRes.json();
        setGoldTrend(configData.gold_trend);
        setSilverTrend(configData.silver_trend);
        setPayoutRate(configData.payout_rate.toString());
        setHouseProtection(configData.house_protection_win_rate.toString());
      }

      // 3. Get Live bets
      const activeRes = await fetch(`${API_BASE}/admin/predictions/active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        setActiveBets(activeData);
      }

      // 4. Get All logs
      const allRes = await fetch(`${API_BASE}/admin/predictions/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (allRes.ok) {
        const allData = await allRes.json();
        setBetLogs(allData);
      }
    } catch (err) {
      console.error('Failed to load administrative data:', err);
    }
  };

  const loadUsers = async () => {
    if (!token) return;
    setLoadingUsers(true);
    setUserMsg(null);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadDeposits = async () => {
    if (!token) return;
    setLoadingDeposits(true);
    try {
      const res = await fetch(`${API_BASE}/admin/deposits/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepositsList(data);
      }
    } catch (err) {
      console.error('Failed to load deposits:', err);
    } finally {
      setLoadingDeposits(false);
    }
  };

  const loadWithdrawals = async () => {
    if (!token) return;
    setLoadingWithdrawals(true);
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals/pending`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWithdrawalsList(data);
      }
    } catch (err) {
      console.error('Failed to load withdrawals:', err);
    } finally {
      setLoadingWithdrawals(false);
    }
  };

  const loadGateways = async () => {
    if (!token) return;
    setGatewayMsg(null);
    try {
      const res = await fetch(`${API_BASE}/admin/gateways`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUpiId(data.upi_id || '');
        setBtcAddress(data.btc_address || '');
        setEthAddress(data.eth_address || '');
      }
    } catch (err) {
      console.error('Failed to load gateways:', err);
    }
  };

  // Tab switching side effects
  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === 'telemetry') {
      loadAdminData();
    } else if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'deposits') {
      loadDeposits();
    } else if (activeTab === 'withdrawals') {
      loadWithdrawals();
    } else if (activeTab === 'gateways') {
      loadGateways();
    }
  }, [activeTab, isAdmin]);

  // Setup WebSocket connection for live dashboard telemetry
  useEffect(() => {
    if (!isAdmin) return;

    socketRef.current = io(NEXT_PUBLIC_API_URL);

    // Listen for live admin metric ticks
    socketRef.current.on('admin_stats', (liveStats: any) => {
      setStats(prev => ({
        ...prev,
        active_bets_count: liveStats.active_predictions,
        total_bets_count: liveStats.total_predictions,
        total_volume: liveStats.total_volume,
        house_net_earnings: liveStats.house_earnings,
        win_ratio: liveStats.win_ratio,
      }));
    });

    // Listen for bet resolution ticks to automatically trigger data refresh
    socketRef.current.on('admin_bet_resolved', () => {
      if (activeTab === 'telemetry') {
        loadAdminData();
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [isAdmin, activeTab]);

  // Handle configuration updates
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setConfigMessage(null);

    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          goldTrend,
          silverTrend,
          payoutRate,
          houseProtectionWinRate: houseProtection
        })
      });

      const data = await res.json();
      if (res.ok) {
        setConfigMessage('Settings saved successfully!');
        loadAdminData();
      } else {
        setConfigMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setConfigMessage('Failed to connect to administrative API.');
    }
  };

  // Handle manual rate nudges (Spikes/Dips)
  const handleForceNudge = async (itemId: number, amount: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/admin/force-nudge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ itemId, amount })
      });
      if (res.ok) {
        const msg = await res.json();
        alert(msg.message);
      }
    } catch (err) {
      console.error('Nudge inject failed:', err);
    }
  };

  // Force Win / Loss outcome override
  const handleBetOverride = async (betId: string, outcome: 'FORCE_WIN' | 'FORCE_LOSS' | null) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/admin/predictions/${betId}/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ outcome })
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        loadAdminData(); // Refresh active bets list
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to set outcome override.');
    }
  };

  // Adjust User Balance manually
  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedUser) return;
    setUserMsg(null);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${selectedUser.id}/balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: parseFloat(adjustAmount),
          action: adjustAction
        })
      });
      const data = await res.json();
      if (res.ok) {
        setUserMsg(`Balance adjusted successfully! New balance: $${data.newBalance}`);
        setAdjustAmount('');
        loadUsers();
        setTimeout(() => {
          setSelectedUser(null);
          setUserMsg(null);
        }, 1500);
      } else {
        setUserMsg(`Error: ${data.error}`);
      }
    } catch (err) {
      setUserMsg('Failed to adjust balance.');
    }
  };

  // Resolve Deposit Request
  const handleResolveDeposit = async (id: string, action: 'APPROVE' | 'REJECT') => {
    if (!token) return;
    if (!confirm(`Are you sure you want to ${action.toLowerCase()} this deposit request?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/deposits/${id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        loadDeposits();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to resolve deposit request.');
    }
  };

  // Resolve Withdrawal Request
  const handleResolveWithdrawal = async (id: string, action: 'APPROVE' | 'REJECT') => {
    if (!token) return;
    if (!confirm(`Are you sure you want to ${action.toLowerCase()} this withdrawal request?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals/${id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        loadWithdrawals();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to resolve withdrawal request.');
    }
  };

  // Save Gateway Address configuration
  const handleSaveGateways = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setGatewayMsg(null);
    try {
      const res = await fetch(`${API_BASE}/admin/gateways`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          upiId,
          btcAddress,
          ethAddress
        })
      });
      const data = await res.json();
      if (res.ok) {
        setGatewayMsg('Payment gateway addresses updated successfully!');
      } else {
        setGatewayMsg(`Error: ${data.error}`);
      }
    } catch (err) {
      setGatewayMsg('Failed to update gateways configuration.');
    }
  };

  // Remaining timer helper
  const getRemainingTime = (expiresAtStr: string) => {
    const expiresAt = new Date(expiresAtStr).getTime();
    const diff = expiresAt - Date.now();
    if (diff <= 0) return 'Resolving...';
    const seconds = Math.floor(diff / 1000);
    return `${seconds}s`;
  };

  if (!token || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6">
        <div className="text-center space-y-4 max-w-sm">
          <Lock className="w-12 h-12 text-red-500 mx-auto stroke-[2.5]" />
          <h2 className="text-xl font-black text-white uppercase tracking-wider">Access Restricted</h2>
          <p className="text-xs font-semibold">
            This module requires administrative security privileges. Please log in with an administrator account to continue.
          </p>
          <a 
            href="/"
            className="inline-flex items-center gap-2 py-3 px-6 bg-slate-900 border border-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wider hover:bg-slate-850 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Trading Console
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white font-sans antialiased">
      {/* Top Banner Header */}
      <header className="sticky top-0 z-40 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-indigo-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/10">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">
              KuberKhajana <span className="bg-gradient-to-r from-indigo-400 to-indigo-500 bg-clip-text text-transparent">Admin</span>
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Control Console & Telemetry</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a 
            href="/"
            className="py-2.5 px-4 text-xs bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            Trading Console
          </a>
          <span className="text-slate-800">|</span>
          <button 
            onClick={() => {
              if (activeTab === 'telemetry') loadAdminData();
              else if (activeTab === 'users') loadUsers();
              else if (activeTab === 'deposits') loadDeposits();
              else if (activeTab === 'withdrawals') loadWithdrawals();
              else if (activeTab === 'gateways') loadGateways();
            }}
            className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Refresh statistics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="flex-1 flex flex-col gap-5 p-5 max-w-[1700px] mx-auto w-full">
        
        {/* ROW 1: KPI Statistics Metrics Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Platform Revenue Card */}
          <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.02] text-yellow-500">
              <DollarSign className="w-24 h-24 stroke-[3]" />
            </div>
            <div className="space-y-1">
              <span className="block text-[9px] font-black uppercase text-slate-500 tracking-wider">House Net Earnings</span>
              <h3 className={`text-2xl font-black font-mono tracking-tight ${stats.house_net_earnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.house_net_earnings >= 0 ? '+' : ''}${stats.house_net_earnings.toFixed(2)}
              </h3>
              <p className="text-[10px] text-slate-500 font-bold">Accumulated from loss bets</p>
            </div>
            <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          {/* Cumulative Bet Volume Card */}
          <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
            <div className="space-y-1">
              <span className="block text-[9px] font-black uppercase text-slate-500 tracking-wider">Total Volume Bet</span>
              <h3 className="text-2xl font-black font-mono text-white tracking-tight">
                ${stats.total_volume.toFixed(2)}
              </h3>
              <p className="text-[10px] text-slate-500 font-bold">{stats.total_bets_count} total predictions placed</p>
            </div>
            <div className="p-3 bg-yellow-950/20 border border-yellow-900/30 text-yellow-500 rounded-xl">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          {/* Active Bets Ticker Card */}
          <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
            <div className="space-y-1">
              <span className="block text-[9px] font-black uppercase text-slate-500 tracking-wider">Active Pending Bets</span>
              <h3 className="text-2xl font-black font-mono text-yellow-500 tracking-tight animate-pulse">
                {stats.active_bets_count}
              </h3>
              <p className="text-[10px] text-slate-500 font-bold">Currently locked in timers</p>
            </div>
            <div className="p-3 bg-indigo-950/25 border border-indigo-900/30 text-indigo-400 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* User win ratios Card */}
          <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
            <div className="space-y-1">
              <span className="block text-[9px] font-black uppercase text-slate-500 tracking-wider">Average User Win Rate</span>
              <h3 className="text-2xl font-black font-mono text-white tracking-tight">
                {stats.win_ratio.toFixed(1)}%
              </h3>
              <p className="text-[10px] text-slate-500 font-bold">{stats.total_registered_users} active traders registered</p>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 text-slate-400 rounded-xl">
              <Percent className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Tab switcher Navigation */}
        <section className="flex border-b border-slate-900/80 pb-1.5 overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-black tracking-wider transition-all cursor-pointer ${
              activeTab === 'telemetry'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Activity className="w-4 h-4" />
            Telemetry & Live Engine
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-black tracking-wider transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Users className="w-4 h-4" />
            User Control
          </button>
          <button
            onClick={() => setActiveTab('deposits')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-black tracking-wider transition-all cursor-pointer relative ${
              activeTab === 'deposits'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Wallet className="w-4 h-4" />
            Deposit Requests
            {depositsList.filter(d => d.status === 'PENDING').length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-black tracking-wider transition-all cursor-pointer relative ${
              activeTab === 'withdrawals'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Landmark className="w-4 h-4" />
            Withdrawal Requests
            {withdrawalsList.filter(w => w.status === 'PENDING').length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('gateways')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs uppercase font-black tracking-wider transition-all cursor-pointer ${
              activeTab === 'gateways'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Payment Setup
          </button>
        </section>

        {/* Tab Body Render */}
        <section className="flex-1">
          
          {/* TAB 1: TELEMETRY & LIVE ENGINE */}
          {activeTab === 'telemetry' && (
            <div className="grid grid-cols-12 gap-5">
              {/* Left Column Controls */}
              <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
                {/* Platform Config Form */}
                <div className="bg-slate-900/30 border border-slate-900/70 rounded-2xl p-5 flex flex-col gap-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    Platform Controls
                  </h3>

                  {configMessage && (
                    <div className="p-3 bg-indigo-950/40 border border-indigo-900/30 text-indigo-300 text-xs rounded-xl text-center font-bold">
                      {configMessage}
                    </div>
                  )}

                  <form onSubmit={handleSaveConfig} className="space-y-4">
                    <div>
                      <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">Gold (XAU/USD) Trend skew</label>
                      <select 
                        value={goldTrend}
                        onChange={(e: any) => setGoldTrend(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-xl py-2.5 px-3 text-xs text-white font-bold transition-all"
                      >
                        <option value="NEUTRAL">NEUTRAL (Random Walk)</option>
                        <option value="UP">BULLISH (Upward Drift)</option>
                        <option value="DOWN">BEARISH (Downward Drift)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">Silver (XAG/USD) Trend skew</label>
                      <select 
                        value={silverTrend}
                        onChange={(e: any) => setSilverTrend(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-xl py-2.5 px-3 text-xs text-white font-bold transition-all"
                      >
                        <option value="NEUTRAL">NEUTRAL (Random Walk)</option>
                        <option value="UP">BULLISH (Upward Drift)</option>
                        <option value="DOWN">BEARISH (Downward Drift)</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Default Payout Multiplier</label>
                        <span className="text-xs text-yellow-500 font-extrabold font-mono">{(parseFloat(payoutRate) * 100).toFixed(0)}%</span>
                      </div>
                      <input 
                        type="range"
                        min="0.50"
                        max="1.50"
                        step="0.05"
                        value={payoutRate}
                        onChange={(e) => setPayoutRate(e.target.value)}
                        className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <span className="block text-[8px] text-slate-600 mt-1 font-semibold">User receives: bet + multiplier (e.g. $100 &rarr; $185 on 85%)</span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">House Protection Threshold</label>
                        <span className="text-xs text-indigo-400 font-extrabold font-mono">{(parseFloat(houseProtection) * 100).toFixed(0)}%</span>
                      </div>
                      <input 
                        type="range"
                        min="0.00"
                        max="1.00"
                        step="0.05"
                        value={houseProtection}
                        onChange={(e) => setHouseProtection(e.target.value)}
                        className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <span className="block text-[8px] text-slate-600 mt-1 font-semibold">Max target user win-rate. Lower threshold = more aggressive house defense.</span>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 hover:border-indigo-400 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-indigo-600/5"
                    >
                      Save Configurations
                    </button>
                  </form>
                </div>

                {/* Price manipulation nudges card */}
                <div className="bg-slate-900/30 border border-slate-900/70 rounded-2xl p-5 flex flex-col gap-3.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-red-500" />
                    Manual Price Nudge
                  </h3>
                  <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                    Instantly inject an upward or downward price shock. The background simulator aggregates the nudge in the next 1-second price calculation.
                  </p>

                  <div className="space-y-3 pt-1">
                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Gold Price (Au)</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button onClick={() => handleForceNudge(1, 5.00)} className="py-2 bg-slate-950 border border-emerald-950 hover:bg-emerald-950/20 text-emerald-400 hover:border-emerald-800/40 rounded-xl font-bold text-xs cursor-pointer transition-all">+$5</button>
                        <button onClick={() => handleForceNudge(1, 1.00)} className="py-2 bg-slate-950 border border-emerald-950 hover:bg-emerald-950/20 text-emerald-400 hover:border-emerald-800/40 rounded-xl font-bold text-xs cursor-pointer transition-all">+$1</button>
                        <button onClick={() => handleForceNudge(1, -1.00)} className="py-2 bg-slate-950 border border-red-950 hover:bg-red-950/20 text-red-400 hover:border-red-800/40 rounded-xl font-bold text-xs cursor-pointer transition-all">-$1</button>
                        <button onClick={() => handleForceNudge(1, -5.00)} className="py-2 bg-slate-950 border border-red-950 hover:bg-red-950/20 text-red-400 hover:border-red-800/40 rounded-xl font-bold text-xs cursor-pointer transition-all">-$5</button>
                      </div>
                    </div>

                    <div>
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Silver Price (Ag)</span>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button onClick={() => handleForceNudge(2, 0.50)} className="py-2 bg-slate-950 border border-emerald-950 hover:bg-emerald-950/20 text-emerald-400 hover:border-emerald-800/40 rounded-xl font-bold text-xs cursor-pointer transition-all">+$0.5</button>
                        <button onClick={() => handleForceNudge(2, 0.10)} className="py-2 bg-slate-950 border border-emerald-950 hover:bg-emerald-950/20 text-emerald-400 hover:border-emerald-800/40 rounded-xl font-bold text-xs cursor-pointer transition-all">+$0.1</button>
                        <button onClick={() => handleForceNudge(2, -0.10)} className="py-2 bg-slate-950 border border-red-950 hover:bg-red-950/20 text-red-400 hover:border-red-800/40 rounded-xl font-bold text-xs cursor-pointer transition-all">-$0.1</button>
                        <button onClick={() => handleForceNudge(2, -0.50)} className="py-2 bg-slate-950 border border-red-950 hover:bg-red-950/20 text-red-400 hover:border-red-800/40 rounded-xl font-bold text-xs cursor-pointer transition-all">-$0.5</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column Monitoring */}
              <div className="col-span-12 lg:col-span-8 bg-slate-900/30 border border-slate-900/70 rounded-2xl p-5 flex flex-col h-[70vh] lg:h-[auto] overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-900/80 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setActiveSubTab('live')}
                      className={`text-[10px] uppercase font-black tracking-widest px-4 py-2 rounded-xl transition-all cursor-pointer ${
                        activeSubTab === 'live'
                          ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30'
                          : 'text-slate-400 hover:bg-slate-950'
                      }`}
                    >
                      Active Bets Monitor ({activeBets.length})
                    </button>
                    <button 
                      onClick={() => setActiveSubTab('resolved')}
                      className={`text-[10px] uppercase font-black tracking-widest px-4 py-2 rounded-xl transition-all cursor-pointer ${
                        activeSubTab === 'resolved'
                          ? 'bg-indigo-600 text-white shadow shadow-indigo-600/30'
                          : 'text-slate-400 hover:bg-slate-950'
                      }`}
                    >
                      Historical Logs ({betLogs.length})
                    </button>
                  </div>
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Live feeds</span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {activeSubTab === 'live' && (
                    <div className="space-y-2">
                      {activeBets.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-xs py-16">
                          <Clock className="w-6 h-6 opacity-30 text-indigo-400" />
                          No live prediction bets active currently.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-slate-500 font-bold border-b border-slate-900 pb-2">
                                <th className="pb-2">User Email</th>
                                <th className="pb-2">Asset</th>
                                <th className="pb-2">Direction</th>
                                <th className="pb-2">Amount</th>
                                <th className="pb-2">Entry Rate</th>
                                <th className="pb-2">Expires At</th>
                                <th className="pb-2 text-center">Override Outcome</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeBets.map((b) => (
                                <tr key={b.id} className="border-b border-slate-950/40 py-2.5 font-semibold">
                                  <td className="py-2.5 text-slate-300">{b.user_email}</td>
                                  <td className="py-2.5 text-white font-bold">{b.item_name}</td>
                                  <td className="py-2.5">
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black border ${
                                      b.direction === 'UP'
                                        ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30'
                                        : 'text-red-400 bg-red-950/20 border-red-900/30'
                                    }`}>
                                      {b.direction === 'UP' ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                                      {b.direction}
                                    </span>
                                  </td>
                                  <td className="py-2.5 text-white font-black">${parseFloat(b.amount).toFixed(2)}</td>
                                  <td className="py-2.5 text-slate-400 font-mono">${parseFloat(b.start_price).toFixed(2)}</td>
                                  <td className="py-2.5 text-slate-500">{new Date(b.expires_at).toLocaleTimeString()} ({getRemainingTime(b.expires_at)})</td>
                                  <td className="py-2.5 text-center">
                                    <div className="inline-flex gap-1.5 justify-center">
                                      <button
                                        onClick={() => handleBetOverride(b.id, 'FORCE_WIN')}
                                        className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all cursor-pointer ${
                                          b.override_status === 'FORCE_WIN'
                                            ? 'bg-emerald-600 border-emerald-500 text-white animate-pulse'
                                            : 'bg-slate-950 border-slate-800 text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-800'
                                        }`}
                                      >
                                        Force Win
                                      </button>
                                      <button
                                        onClick={() => handleBetOverride(b.id, 'FORCE_LOSS')}
                                        className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all cursor-pointer ${
                                          b.override_status === 'FORCE_LOSS'
                                            ? 'bg-red-600 border-red-500 text-white animate-pulse'
                                            : 'bg-slate-950 border-slate-800 text-red-400 hover:bg-red-950/30 hover:border-red-800'
                                        }`}
                                      >
                                        Force Loss
                                      </button>
                                      {b.override_status && (
                                        <button
                                          onClick={() => handleBetOverride(b.id, null)}
                                          className="px-2 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-[9px] font-bold cursor-pointer"
                                          title="Remove Override"
                                        >
                                          Reset
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {activeSubTab === 'resolved' && (
                    <div className="space-y-2">
                      {betLogs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-xs py-16">
                          <Shield className="w-6 h-6 opacity-30 text-indigo-400" />
                          No resolved bets found in system statement registers.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-slate-500 font-bold border-b border-slate-900 pb-2">
                                <th className="pb-2">User Email</th>
                                <th className="pb-2">Asset</th>
                                <th className="pb-2">Direction</th>
                                <th className="pb-2">Bet Amount</th>
                                <th className="pb-2">Entry Rate</th>
                                <th className="pb-2">Exit Rate</th>
                                <th className="pb-2">Status</th>
                                <th className="pb-2 text-right">Payout profit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {betLogs.map((b) => {
                                const isWin = b.status === 'WON';
                                const isLoss = b.status === 'LOST';
                                const profit = b.payout_amount ? parseFloat(b.payout_amount) - parseFloat(b.amount) : 0;

                                return (
                                  <tr key={b.id} className="border-b border-slate-950/40 py-2 font-semibold">
                                    <td className="py-2 text-slate-400">{b.user_email}</td>
                                    <td className="py-2 text-white font-bold">{b.item_name}</td>
                                    <td className="py-2">
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black border ${
                                        b.direction === 'UP'
                                          ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30'
                                          : 'text-red-400 bg-red-950/20 border-red-900/30'
                                      }`}>
                                        {b.direction === 'UP' ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                                        {b.direction}
                                      </span>
                                    </td>
                                    <td className="py-2 text-slate-300 font-bold">${parseFloat(b.amount).toFixed(2)}</td>
                                    <td className="py-2 text-slate-500 font-mono">${parseFloat(b.start_price).toFixed(2)}</td>
                                    <td className="py-2 text-slate-300 font-mono">${b.end_price ? parseFloat(b.end_price).toFixed(2) : '-'}</td>
                                    <td className="py-2">
                                      <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase border ${
                                        isWin 
                                          ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                                          : isLoss 
                                            ? 'bg-red-950 text-red-400 border-red-900' 
                                            : 'bg-slate-950 text-slate-400 border-slate-850'
                                      }`}>
                                        {b.status}
                                      </span>
                                    </td>
                                    <td className={`py-2 text-right font-black font-mono ${isWin ? 'text-emerald-400' : (isLoss ? 'text-red-400' : 'text-slate-400')}`}>
                                      {isWin ? `+$${profit.toFixed(2)}` : (isLoss ? `-$${parseFloat(b.amount).toFixed(2)}` : '$0.00')}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USER CONTROL */}
          {activeTab === 'users' && (
            <div className="bg-slate-900/30 border border-slate-900/70 rounded-2xl p-6">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-900">
                <div>
                  <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                    <Users className="w-4.5 h-4.5 text-indigo-400" />
                    User Directory & Wallets
                  </h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1">Manage registered client trading accounts and adjust user ledger balances manually.</p>
                </div>
                <button
                  onClick={loadUsers}
                  disabled={loadingUsers}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl text-slate-400 hover:text-white font-bold text-xs uppercase flex items-center gap-2 cursor-pointer transition-all disabled:opacity-55"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                  Sync users
                </button>
              </div>

              {loadingUsers ? (
                <div className="py-24 text-center text-slate-500 font-bold text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  Synching user directory...
                </div>
              ) : usersList.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs font-semibold">
                  No accounts found in user registries.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-900/80 pb-2">
                        <th className="pb-3 pl-2">ID</th>
                        <th className="pb-3">Account Email</th>
                        <th className="pb-3">System Role</th>
                        <th className="pb-3">Wallet Balance</th>
                        <th className="pb-3">Locked in Bets</th>
                        <th className="pb-3">Registered Date</th>
                        <th className="pb-3 pr-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((u) => (
                        <tr key={u.id} className="border-b border-slate-950/40 hover:bg-slate-900/10 transition-colors font-semibold">
                          <td className="py-3.5 pl-2 text-slate-500">#{u.id}</td>
                          <td className="py-3.5 text-white font-bold">{u.email}</td>
                          <td className="py-3.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                              u.role === 'ADMIN' 
                                ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/30' 
                                : u.role === 'TREASURY' 
                                  ? 'bg-yellow-950/40 text-yellow-500 border-yellow-900/30' 
                                  : 'bg-slate-950 text-slate-400 border-slate-850'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3.5 font-bold font-mono text-emerald-400">
                            ${parseFloat(u.balance || '0.00').toFixed(2)}
                          </td>
                          <td className="py-3.5 font-bold font-mono text-slate-400">
                            ${parseFloat(u.locked_balance || '0.00').toFixed(2)}
                          </td>
                          <td className="py-3.5 text-slate-500 font-normal">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="py-3.5 pr-2 text-right">
                            {u.role !== 'TREASURY' && (
                              <button
                                onClick={() => {
                                  setSelectedUser(u);
                                  setAdjustAmount('');
                                  setAdjustAction('ADD');
                                }}
                                className="px-3 py-1.5 bg-slate-950 hover:bg-indigo-950 border border-slate-850 hover:border-indigo-900 text-indigo-400 font-black rounded-lg text-[10px] uppercase tracking-wide cursor-pointer transition-all hover:text-indigo-300"
                              >
                                Adjust Balance
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DEPOSIT REQUESTS */}
          {activeTab === 'deposits' && (
            <div className="bg-slate-900/30 border border-slate-900/70 rounded-2xl p-6">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-900">
                <div>
                  <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                    <Wallet className="w-4.5 h-4.5 text-indigo-400" />
                    Deposit Request Ledgers
                  </h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1">Review QR deposit transaction proofs. Confirming automatically credits USD equivalent to the user wallet.</p>
                </div>
                <button
                  onClick={loadDeposits}
                  disabled={loadingDeposits}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl text-slate-400 hover:text-white font-bold text-xs uppercase flex items-center gap-2 cursor-pointer transition-all disabled:opacity-55"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDeposits ? 'animate-spin' : ''}`} />
                  Sync Deposits
                </button>
              </div>

              {loadingDeposits ? (
                <div className="py-24 text-center text-slate-500 font-bold text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  Loading deposit request registers...
                </div>
              ) : depositsList.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs font-semibold">
                  No deposit requests active or recorded.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-900/80 pb-2">
                        <th className="pb-3 pl-2">Request ID</th>
                        <th className="pb-3">User Email</th>
                        <th className="pb-3">Amount</th>
                        <th className="pb-3">Method</th>
                        <th className="pb-3">Reference / Tx ID</th>
                        <th className="pb-3">Submitted</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3 pr-2 text-right">Approvals</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depositsList.map((d) => {
                        const isPending = d.status === 'PENDING';
                        return (
                          <tr key={d.id} className="border-b border-slate-950/40 hover:bg-slate-900/10 transition-colors font-semibold">
                            <td className="py-3.5 pl-2 text-slate-500 font-mono">#{d.id.substring(0, 8)}...</td>
                            <td className="py-3.5 text-white font-bold">{d.user_email}</td>
                            <td className="py-3.5 font-bold font-mono text-emerald-400">
                              {d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {d.currency}
                            </td>
                            <td className="py-3.5">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-950 border border-slate-850 text-slate-400">
                                {d.payment_method}
                              </span>
                            </td>
                            <td className="py-3.5 text-slate-300 font-mono select-all select-text cursor-text" title="Double click to copy reference ID">{d.reference_id}</td>
                            <td className="py-3.5 text-slate-500 font-normal">{new Date(d.created_at).toLocaleString()}</td>
                            <td className="py-3.5">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                                d.status === 'APPROVED'
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-900'
                                  : d.status === 'REJECTED'
                                    ? 'bg-red-950 text-red-400 border-red-900'
                                    : 'bg-yellow-950/30 text-yellow-500 border-yellow-900/30'
                              }`}>
                                {d.status}
                              </span>
                            </td>
                            <td className="py-3.5 pr-2 text-right">
                              {isPending ? (
                                <div className="inline-flex gap-1.5 justify-end">
                                  <button
                                    onClick={() => handleResolveDeposit(d.id, 'APPROVE')}
                                    className="px-2.5 py-1.5 bg-emerald-950 border border-emerald-900 hover:bg-emerald-900/30 text-emerald-400 rounded-lg text-[9px] font-black uppercase cursor-pointer transition-all"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleResolveDeposit(d.id, 'REJECT')}
                                    className="px-2.5 py-1.5 bg-red-950 border border-red-900 hover:bg-red-900/30 text-red-400 rounded-lg text-[9px] font-black uppercase cursor-pointer transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-600 font-bold italic">Resolved</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: WITHDRAWAL REQUESTS */}
          {activeTab === 'withdrawals' && (
            <div className="bg-slate-900/30 border border-slate-900/70 rounded-2xl p-6">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-900">
                <div>
                  <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                    <Landmark className="w-4.5 h-4.5 text-indigo-400" />
                    Withdrawal Settlement Ledgers
                  </h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1">Review withdrawal requests. Balance is locked during pending state. Approving debits and discharges the funds.</p>
                </div>
                <button
                  onClick={loadWithdrawals}
                  disabled={loadingWithdrawals}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl text-slate-400 hover:text-white font-bold text-xs uppercase flex items-center gap-2 cursor-pointer transition-all disabled:opacity-55"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingWithdrawals ? 'animate-spin' : ''}`} />
                  Sync Withdrawals
                </button>
              </div>

              {loadingWithdrawals ? (
                <div className="py-24 text-center text-slate-500 font-bold text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  Loading withdrawal request registers...
                </div>
              ) : withdrawalsList.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs font-semibold">
                  No withdrawal requests active or recorded.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-900/80 pb-2">
                        <th className="pb-3 pl-2">Request ID</th>
                        <th className="pb-3">User Email</th>
                        <th className="pb-3">Amount</th>
                        <th className="pb-3">Method</th>
                        <th className="pb-3">Destination Details</th>
                        <th className="pb-3">Submitted</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3 pr-2 text-right">Settle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawalsList.map((w) => {
                        const isPending = w.status === 'PENDING';
                        return (
                          <tr key={w.id} className="border-b border-slate-950/40 hover:bg-slate-900/10 transition-colors font-semibold">
                            <td className="py-3.5 pl-2 text-slate-500 font-mono">#{w.id.substring(0, 8)}...</td>
                            <td className="py-3.5 text-white font-bold">{w.user_email}</td>
                            <td className="py-3.5 font-bold font-mono text-red-400">
                              {w.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {w.currency}
                            </td>
                            <td className="py-3.5">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-950 border border-slate-850 text-slate-400">
                                {w.payment_method}
                              </span>
                            </td>
                            <td className="py-3.5 text-slate-300 font-mono select-all select-text cursor-text" title="Double click to copy destination address">{w.payment_details}</td>
                            <td className="py-3.5 text-slate-500 font-normal">{new Date(w.created_at).toLocaleString()}</td>
                            <td className="py-3.5">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                                w.status === 'APPROVED'
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-900'
                                  : w.status === 'REJECTED'
                                    ? 'bg-red-950 text-red-400 border-red-900'
                                    : 'bg-yellow-950/30 text-yellow-500 border-yellow-900/30'
                              }`}>
                                {w.status}
                              </span>
                            </td>
                            <td className="py-3.5 pr-2 text-right">
                              {isPending ? (
                                <div className="inline-flex gap-1.5 justify-end">
                                  <button
                                    onClick={() => handleResolveWithdrawal(w.id, 'APPROVE')}
                                    className="px-2.5 py-1.5 bg-emerald-950 border border-emerald-900 hover:bg-emerald-900/30 text-emerald-400 rounded-lg text-[9px] font-black uppercase cursor-pointer transition-all"
                                  >
                                    Approve Pay
                                  </button>
                                  <button
                                    onClick={() => handleResolveWithdrawal(w.id, 'REJECT')}
                                    className="px-2.5 py-1.5 bg-red-950 border border-red-900 hover:bg-red-900/30 text-red-400 rounded-lg text-[9px] font-black uppercase cursor-pointer transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-600 font-bold italic">Resolved</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: GATEWAY SETUP */}
          {activeTab === 'gateways' && (
            <div className="bg-slate-900/30 border border-slate-900/70 rounded-2xl p-6 max-w-xl">
              <h3 className="text-sm font-black uppercase text-white flex items-center gap-2 mb-2">
                <CreditCard className="w-4.5 h-4.5 text-indigo-400" />
                Payment Gateway Configurations
              </h3>
              <p className="text-[10px] text-slate-500 font-semibold mb-6">Set the global deposit routing addresses for clients. These values are used to construct user-facing QR codes and crypto payment addresses.</p>

              {gatewayMsg && (
                <div className="p-3 bg-indigo-950/40 border border-indigo-900/30 text-indigo-300 text-xs rounded-xl text-center font-bold mb-5">
                  {gatewayMsg}
                </div>
              )}

              <form onSubmit={handleSaveGateways} className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">Admin UPI Identifier</label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    required
                    placeholder="e.g. merchant@upi"
                    className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-xl py-2.5 px-3 text-xs text-white font-mono font-bold transition-all"
                  />
                  <span className="block text-[8px] text-slate-600 mt-1 font-semibold">Used for generating UPI QR codes dynamically in INR mode.</span>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">Bitcoin (BTC) Destination Address</label>
                  <input
                    type="text"
                    value={btcAddress}
                    onChange={(e) => setBtcAddress(e.target.value)}
                    required
                    placeholder="e.g. 1A1zP1eP5QGefi2DMPT..."
                    className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-xl py-2.5 px-3 text-xs text-white font-mono font-bold transition-all"
                  />
                  <span className="block text-[8px] text-slate-600 mt-1 font-semibold">Admin BTC public wallet key.</span>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">Ethereum / USDT (ERC-20/TRC-20) Destination Address</label>
                  <input
                    type="text"
                    value={ethAddress}
                    onChange={(e) => setEthAddress(e.target.value)}
                    required
                    placeholder="e.g. 0x71C7656EC7ab88b09..."
                    className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-xl py-2.5 px-3 text-xs text-white font-mono font-bold transition-all"
                  />
                  <span className="block text-[8px] text-slate-600 mt-1 font-semibold">Admin ETH/USDT address.</span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 hover:border-indigo-400 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-indigo-600/5"
                >
                  Save Gateway Addresses
                </button>
              </form>
            </div>
          )}

        </section>
      </main>

      {/* Adjust User Balance Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 p-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-black uppercase text-white flex items-center gap-2 mb-2">
              <Sliders className="w-4.5 h-4.5 text-indigo-400" />
              Adjust Account balance
            </h3>
            <p className="text-[10px] text-slate-500 font-semibold mb-6">Modify user wallet balance for: <span className="text-indigo-400">{selectedUser.email}</span></p>

            {userMsg && (
              <div className="p-3 bg-indigo-950/40 border border-indigo-900/30 text-indigo-300 text-xs rounded-xl text-center font-bold mb-4">
                {userMsg}
              </div>
            )}

            <form onSubmit={handleAdjustBalance} className="space-y-4">
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">Select Operation Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustAction('ADD')}
                    className={`py-2 px-3 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer ${
                      adjustAction === 'ADD'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow shadow-emerald-600/10'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    Credit (ADD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustAction('SUBTRACT')}
                    className={`py-2 px-3 rounded-xl text-xs font-black uppercase border transition-all cursor-pointer ${
                      adjustAction === 'SUBTRACT'
                        ? 'bg-red-600 text-white border-red-500 shadow shadow-red-600/10'
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    Debit (SUBTRACT)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">Adjustment Amount (in USD)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-mono font-bold">$</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    required
                    placeholder="e.g. 500.00"
                    className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-xl py-2.5 pl-7 pr-3 text-xs text-white font-mono font-bold transition-all"
                  />
                </div>
                <span className="block text-[8px] text-slate-600 mt-1 font-semibold">Currently client balance: ${parseFloat(selectedUser.balance || '0').toFixed(2)} USD</span>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="flex-1 py-2.5 bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-400 font-bold rounded-xl text-xs uppercase transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 hover:border-indigo-400 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
