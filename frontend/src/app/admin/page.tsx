'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Shield, DollarSign, Activity, Users, Percent, Sliders, RefreshCw, 
  ArrowLeft, Flame, Lock, CheckCircle2, TrendingUp, TrendingDown, Clock,
  X, CreditCard, Wallet, Landmark, Info, AlertTriangle, Award
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
  is_banned?: boolean;
  mobile?: string;
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
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Toast notification state
  interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info' | 'win' | 'loss';
  }
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

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
  const [savingConfig, setSavingConfig] = useState(false);

  // Price Manipulation States
  const [goldPriceType, setGoldPriceType] = useState<'LIVE' | 'MANUAL'>('LIVE');
  const [goldManualPrice, setGoldManualPrice] = useState('2400.00');
  const [goldPriceOffset, setGoldPriceOffset] = useState('0.00');
  const [silverPriceType, setSilverPriceType] = useState<'LIVE' | 'MANUAL'>('LIVE');
  const [silverManualPrice, setSilverManualPrice] = useState('30.00');
  const [silverPriceOffset, setSilverPriceOffset] = useState('0.00');
  const [liveGoldPrice, setLiveGoldPrice] = useState<number>(2400.00);
  const [liveSilverPrice, setLiveSilverPrice] = useState<number>(30.00);


  // Platform Limits
  const [minBetAmount, setMinBetAmount] = useState('1.00');
  const [maxBetAmount, setMaxBetAmount] = useState('10000.00');
  const [minDepositAmount, setMinDepositAmount] = useState('5.00');
  const [minWithdrawalAmount, setMinWithdrawalAmount] = useState('10.00');

  // Bets tracking state
  const [activeBets, setActiveBets] = useState<LiveBet[]>([]);
  const [betLogs, setBetLogs] = useState<ResolvedBet[]>([]);

  // Main navigation tab
  const [activeTab, setActiveTab] = useState<'telemetry' | 'users' | 'deposits' | 'withdrawals' | 'gateways' | 'transactions'>('telemetry');
  
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

  // Tab states - Transactions Audit Ledger
  const [transactionsList, setTransactionsList] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

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
    setLoadingAuth(false);
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
        setGoldPriceType(configData.gold_price_type || 'LIVE');
        setGoldManualPrice((configData.gold_manual_price ?? 2400.00).toString());
        setGoldPriceOffset((configData.gold_price_offset ?? 0.00).toString());
        setSilverPriceType(configData.silver_price_type || 'LIVE');
        setSilverManualPrice((configData.silver_manual_price ?? 30.00).toString());
        setSilverPriceOffset((configData.silver_price_offset ?? 0.00).toString());
        setMinBetAmount((configData.min_bet_amount ?? 1.00).toString());
        setMaxBetAmount((configData.max_bet_amount ?? 10000.00).toString());
        setMinDepositAmount((configData.min_deposit_amount ?? 5.00).toString());
        setMinWithdrawalAmount((configData.min_withdrawal_amount ?? 10.00).toString());
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

  const loadTransactions = async () => {
    if (!token) return;
    setLoadingTransactions(true);
    try {
      const res = await fetch(`${API_BASE}/admin/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransactionsList(data);
      }
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoadingTransactions(false);
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
    } else if (activeTab === 'transactions') {
      loadTransactions();
    }
  }, [activeTab, isAdmin]);

  // Load data for selected user inspection
  useEffect(() => {
    if (selectedUser && token) {
      loadTransactions();
      loadAdminData();
    }
  }, [selectedUser, token]);

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

    // Listen for live gold and silver price ticks
    socketRef.current.on('tick', (data: { itemId: number; price: number }) => {
      if (data.itemId === 1) {
        setLiveGoldPrice(data.price);
      } else if (data.itemId === 2) {
        setLiveSilverPrice(data.price);
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
    setSavingConfig(true);

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
          houseProtectionWinRate: houseProtection,
          goldPriceType,
          goldManualPrice: parseFloat(goldManualPrice),
          goldPriceOffset: parseFloat(goldPriceOffset),
          silverPriceType,
          silverManualPrice: parseFloat(silverManualPrice),
          silverPriceOffset: parseFloat(silverPriceOffset),
          minBetAmount: parseFloat(minBetAmount),
          maxBetAmount: parseFloat(maxBetAmount),
          minDepositAmount: parseFloat(minDepositAmount),
          minWithdrawalAmount: parseFloat(minWithdrawalAmount)
        })
      });

      const data = await res.json();
      if (res.ok) {
        setConfigMessage('Settings saved successfully!');
        addToast('Settings saved successfully!', 'success');
        loadAdminData();
      } else {
        setConfigMessage(`Error: ${data.error}`);
        addToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      setConfigMessage('Failed to connect to administrative API.');
      addToast('Failed to save settings.', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  // Helper to dynamically update a specific field and synchronize with backend config
  const updateConfigField = async (updates: {
    goldTrend?: 'UP' | 'DOWN' | 'NEUTRAL';
    silverTrend?: 'UP' | 'DOWN' | 'NEUTRAL';
    payoutRate?: string;
    houseProtection?: string;
    goldPriceType?: 'LIVE' | 'MANUAL';
    goldManualPrice?: string;
    goldPriceOffset?: string;
    silverPriceType?: 'LIVE' | 'MANUAL';
    silverManualPrice?: string;
    silverPriceOffset?: string;
    minBetAmount?: string;
    maxBetAmount?: string;
    minDepositAmount?: string;
    minWithdrawalAmount?: string;
  }) => {
    if (!token) return;

    let nextGoldTrend = updates.goldTrend !== undefined ? updates.goldTrend : goldTrend;
    let nextSilverTrend = updates.silverTrend !== undefined ? updates.silverTrend : silverTrend;
    let nextPayoutRate = updates.payoutRate !== undefined ? updates.payoutRate : payoutRate;
    let nextHouseProtection = updates.houseProtection !== undefined ? updates.houseProtection : houseProtection;
    let nextGoldPriceType = updates.goldPriceType !== undefined ? updates.goldPriceType : goldPriceType;
    let nextGoldManualPrice = updates.goldManualPrice !== undefined ? updates.goldManualPrice : goldManualPrice;
    let nextGoldPriceOffset = updates.goldPriceOffset !== undefined ? updates.goldPriceOffset : goldPriceOffset;
    let nextSilverPriceType = updates.silverPriceType !== undefined ? updates.silverPriceType : silverPriceType;
    let nextSilverManualPrice = updates.silverManualPrice !== undefined ? updates.silverManualPrice : silverManualPrice;
    let nextSilverPriceOffset = updates.silverPriceOffset !== undefined ? updates.silverPriceOffset : silverPriceOffset;
    let nextMinBetAmount = updates.minBetAmount !== undefined ? updates.minBetAmount : minBetAmount;
    let nextMaxBetAmount = updates.maxBetAmount !== undefined ? updates.maxBetAmount : maxBetAmount;
    let nextMinDepositAmount = updates.minDepositAmount !== undefined ? updates.minDepositAmount : minDepositAmount;
    let nextMinWithdrawalAmount = updates.minWithdrawalAmount !== undefined ? updates.minWithdrawalAmount : minWithdrawalAmount;

    // Apply state updates locally first
    if (updates.goldTrend !== undefined) setGoldTrend(updates.goldTrend);
    if (updates.silverTrend !== undefined) setSilverTrend(updates.silverTrend);
    if (updates.payoutRate !== undefined) setPayoutRate(updates.payoutRate);
    if (updates.houseProtection !== undefined) setHouseProtection(updates.houseProtection);
    if (updates.goldPriceType !== undefined) setGoldPriceType(updates.goldPriceType);
    if (updates.goldManualPrice !== undefined) setGoldManualPrice(updates.goldManualPrice);
    if (updates.goldPriceOffset !== undefined) setGoldPriceOffset(updates.goldPriceOffset);
    if (updates.silverPriceType !== undefined) setSilverPriceType(updates.silverPriceType);
    if (updates.silverManualPrice !== undefined) setSilverManualPrice(updates.silverManualPrice);
    if (updates.silverPriceOffset !== undefined) setSilverPriceOffset(updates.silverPriceOffset);
    if (updates.minBetAmount !== undefined) setMinBetAmount(updates.minBetAmount);
    if (updates.maxBetAmount !== undefined) setMaxBetAmount(updates.maxBetAmount);
    if (updates.minDepositAmount !== undefined) setMinDepositAmount(updates.minDepositAmount);
    if (updates.minWithdrawalAmount !== undefined) setMinWithdrawalAmount(updates.minWithdrawalAmount);

    try {
      const res = await fetch(`${API_BASE}/admin/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          goldTrend: nextGoldTrend,
          silverTrend: nextSilverTrend,
          payoutRate: parseFloat(nextPayoutRate),
          houseProtectionWinRate: parseFloat(nextHouseProtection),
          goldPriceType: nextGoldPriceType,
          goldManualPrice: parseFloat(nextGoldManualPrice),
          goldPriceOffset: parseFloat(nextGoldPriceOffset),
          silverPriceType: nextSilverPriceType,
          silverManualPrice: parseFloat(nextSilverManualPrice),
          silverPriceOffset: parseFloat(nextSilverPriceOffset),
          minBetAmount: parseFloat(nextMinBetAmount),
          maxBetAmount: parseFloat(updates.maxBetAmount !== undefined ? updates.maxBetAmount : maxBetAmount),
          minDepositAmount: parseFloat(nextMinDepositAmount),
          minWithdrawalAmount: parseFloat(nextMinWithdrawalAmount)
        })
      });

      if (res.ok) {
        addToast('Settings auto-applied to rate engine.', 'success');
      } else {
        const data = await res.json();
        addToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      addToast('Failed to apply configuration.', 'error');
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
        addToast(msg.message, 'success');
      }
    } catch (err) {
      console.error('Nudge inject failed:', err);
      addToast('Failed to nudge rate.', 'error');
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
        addToast(data.message, 'success');
        loadAdminData(); // Refresh active bets list
      } else {
        const data = await res.json();
        addToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      addToast('Failed to set outcome override.', 'error');
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
        addToast(`Balance adjusted successfully! New balance: $${data.newBalance}`, 'success');
        setAdjustAmount('');
        setSelectedUser(prev => prev ? { ...prev, balance: data.newBalance.toString() } : null);
        loadUsers();
      } else {
        addToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      addToast('Failed to adjust balance.', 'error');
    }
  };

  // Toggle Ban / Unban User Account
  const handleToggleBan = async (userToToggle: UserManage) => {
    if (!token) return;
    const actionName = userToToggle.is_banned ? 'unban' : 'ban';
    setConfirmModal({
      show: true,
      title: `${userToToggle.is_banned ? 'Unban' : 'Ban'} User`,
      message: `Are you sure you want to ${actionName} this user account (${userToToggle.email})?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/admin/users/${userToToggle.id}/ban`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ banned: !userToToggle.is_banned })
          });
          const data = await res.json();
          if (res.ok) {
            addToast(data.message || `User account successfully ${userToToggle.is_banned ? 'unbanned' : 'banned'}.`, 'success');
            setSelectedUser(prev => prev ? { ...prev, is_banned: !userToToggle.is_banned } : null);
            loadUsers();
          } else {
            addToast(`Error: ${data.error}`, 'error');
          }
        } catch (err) {
          addToast('Failed to update ban status.', 'error');
        }
      }
    });
  };

  // Permanently Delete User Account
  const handleDeleteUser = async (userToDelete: UserManage) => {
    if (!token) return;
    setConfirmModal({
      show: true,
      title: "Delete Account",
      message: `WARNING: Are you sure you want to PERMANENTLY delete user ${userToDelete.email}? This will delete all predictions, transactions, and requests associated with this account. This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/admin/users/${userToDelete.id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          const data = await res.json();
          if (res.ok) {
            addToast(data.message || 'User account and associated data successfully deleted.', 'success');
            setSelectedUser(null);
            loadUsers();
          } else {
            addToast(`Error: ${data.error}`, 'error');
          }
        } catch (err) {
          addToast('Failed to delete user.', 'error');
        }
      }
    });
  };


  // Resolve Deposit Request
  const handleResolveDeposit = async (id: string, action: 'APPROVE' | 'REJECT') => {
    if (!token) return;
    setConfirmModal({
      show: true,
      title: `${action === 'APPROVE' ? 'Approve' : 'Reject'} Deposit`,
      message: `Are you sure you want to ${action.toLowerCase()} this deposit request?`,
      onConfirm: async () => {
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
            addToast(data.message, 'success');
            loadDeposits();
          } else {
            addToast(`Error: ${data.error}`, 'error');
          }
        } catch (err) {
          addToast('Failed to resolve deposit request.', 'error');
        }
      }
    });
  };

  // Resolve Withdrawal Request
  const handleResolveWithdrawal = async (id: string, action: 'APPROVE' | 'REJECT') => {
    if (!token) return;
    setConfirmModal({
      show: true,
      title: `${action === 'APPROVE' ? 'Approve' : 'Reject'} Withdrawal`,
      message: `Are you sure you want to ${action.toLowerCase()} this withdrawal request?`,
      onConfirm: async () => {
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
            addToast(data.message, 'success');
            loadWithdrawals();
          } else {
            addToast(`Error: ${data.error}`, 'error');
          }
        } catch (err) {
          addToast('Failed to resolve withdrawal request.', 'error');
        }
      }
    });
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
        addToast('Payment gateway addresses updated successfully!', 'success');
      } else {
        setGatewayMsg(`Error: ${data.error}`);
        addToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      setGatewayMsg('Failed to update gateways configuration.');
      addToast('Failed to update gateways configuration.', 'error');
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

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans antialiased">
        <div className="flex flex-col items-center gap-3">
          <Activity className="w-10 h-10 text-indigo-500 animate-pulse" />
          <span className="text-xs text-slate-500 font-bold uppercase tracking-widest animate-pulse">KuberKhajana Admin</span>
        </div>
      </div>
    );
  }

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
      <header className="sticky top-0 z-40 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-4 py-3 md:px-6 md:py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-2 bg-gradient-to-tr from-indigo-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/10">
            <Shield className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base md:text-xl font-black tracking-tight text-white">
              KuberKhajana <span className="bg-gradient-to-r from-indigo-400 to-indigo-500 bg-clip-text text-transparent">Admin</span>
            </h1>
            <p className="hidden sm:block text-[10px] text-slate-500 uppercase tracking-widest font-bold">Control Console & Telemetry</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <a 
            href="/"
            className="py-2 px-3 md:py-2.5 md:px-4 text-xs bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Trading Console</span>
          </a>
          <span className="hidden sm:inline text-slate-800">|</span>
          <button 
            onClick={() => {
              if (activeTab === 'telemetry') loadAdminData();
              else if (activeTab === 'users') loadUsers();
              else if (activeTab === 'deposits') loadDeposits();
              else if (activeTab === 'withdrawals') loadWithdrawals();
              else if (activeTab === 'gateways') loadGateways();
              else if (activeTab === 'transactions') loadTransactions();
            }}
            className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Refresh statistics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout Grid */}
      <main className="flex-1 flex flex-col gap-4 md:gap-5 p-3 md:p-5 max-w-[1700px] mx-auto w-full">
        
        {/* ROW 1: KPI Statistics Metrics Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          
          {/* Platform Revenue Card */}
          <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl p-3.5 md:p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.02] text-yellow-500">
              <DollarSign className="w-24 h-24 stroke-[3]" />
            </div>
            <div className="space-y-0.5 md:space-y-1">
              <span className="block text-[8px] md:text-[9px] font-black uppercase text-slate-500 tracking-wider">House Net Earnings</span>
              <h3 className={`text-base md:text-2xl font-black font-mono tracking-tight ${stats.house_net_earnings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.house_net_earnings >= 0 ? '+' : ''}${stats.house_net_earnings.toFixed(2)}
              </h3>
              <p className="text-[8px] md:text-[10px] text-slate-500 font-bold">Accumulated from loss bets</p>
            </div>
            <div className="p-2 md:p-3 bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 rounded-xl">
              <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
            </div>
          </div>

          {/* Cumulative Bet Volume Card */}
          <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl p-3.5 md:p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
            <div className="space-y-0.5 md:space-y-1">
              <span className="block text-[8px] md:text-[9px] font-black uppercase text-slate-500 tracking-wider">Total Volume Bet</span>
              <h3 className="text-base md:text-2xl font-black font-mono text-white tracking-tight">
                ${stats.total_volume.toFixed(2)}
              </h3>
              <p className="text-[8px] md:text-[10px] text-slate-500 font-bold">{stats.total_bets_count} total predictions</p>
            </div>
            <div className="p-2 md:p-3 bg-yellow-950/20 border border-yellow-900/30 text-yellow-500 rounded-xl">
              <Activity className="w-4 h-4 md:w-5 md:h-5" />
            </div>
          </div>

          {/* Active Bets Ticker Card */}
          <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl p-3.5 md:p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
            <div className="space-y-0.5 md:space-y-1">
              <span className="block text-[8px] md:text-[9px] font-black uppercase text-slate-500 tracking-wider">Active Pending Bets</span>
              <h3 className="text-base md:text-2xl font-black font-mono text-yellow-500 tracking-tight animate-pulse">
                {stats.active_bets_count}
              </h3>
              <p className="text-[8px] md:text-[10px] text-slate-500 font-bold">Locked in active timers</p>
            </div>
            <div className="p-2 md:p-3 bg-indigo-950/25 border border-indigo-900/30 text-indigo-400 rounded-xl">
              <Clock className="w-4 h-4 md:w-5 md:h-5" />
            </div>
          </div>

          {/* User win ratios Card */}
          <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl p-3.5 md:p-5 flex items-center justify-between shadow-sm relative overflow-hidden">
            <div className="space-y-0.5 md:space-y-1">
              <span className="block text-[8px] md:text-[9px] font-black uppercase text-slate-500 tracking-wider">Avg User Win Rate</span>
              <h3 className="text-base md:text-2xl font-black font-mono text-white tracking-tight">
                {stats.win_ratio.toFixed(1)}%
              </h3>
              <p className="text-[8px] md:text-[10px] text-slate-500 font-bold">{stats.total_registered_users} active traders</p>
            </div>
            <div className="p-2 md:p-3 bg-slate-950 border border-slate-800 text-slate-400 rounded-xl">
              <Percent className="w-4 h-4 md:w-5 md:h-5" />
            </div>
          </div>
        </section>

        {/* Tab switcher Navigation */}
        <section className="flex border-b border-slate-900/80 pb-1.5 overflow-x-auto gap-2 scrollbar-none whitespace-nowrap">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`flex items-center gap-2 px-3.5 py-2.5 md:px-5 md:py-3 rounded-xl text-[10px] md:text-xs uppercase font-black tracking-wider transition-all cursor-pointer whitespace-nowrap ${
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
            className={`flex items-center gap-2 px-3.5 py-2.5 md:px-5 md:py-3 rounded-xl text-[10px] md:text-xs uppercase font-black tracking-wider transition-all cursor-pointer whitespace-nowrap ${
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
            className={`flex items-center gap-2 px-3.5 py-2.5 md:px-5 md:py-3 rounded-xl text-[10px] md:text-xs uppercase font-black tracking-wider transition-all cursor-pointer relative whitespace-nowrap ${
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
            className={`flex items-center gap-2 px-3.5 py-2.5 md:px-5 md:py-3 rounded-xl text-[10px] md:text-xs uppercase font-black tracking-wider transition-all cursor-pointer relative whitespace-nowrap ${
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
            className={`flex items-center gap-2 px-3.5 py-2.5 md:px-5 md:py-3 rounded-xl text-[10px] md:text-xs uppercase font-black tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'gateways'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Payment Setup
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex items-center gap-2 px-3.5 py-2.5 md:px-5 md:py-3 rounded-xl text-[10px] md:text-xs uppercase font-black tracking-wider transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'transactions'
                ? 'bg-indigo-600 text-white shadow shadow-indigo-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Clock className="w-4 h-4" />
            Audit Ledger
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
                    {/* Payout Configs */}
                    <div className="border-b border-slate-900/60 pb-3">
                      <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-3">1. Payout & Risk Control</h4>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
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
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
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
                        </div>
                      </div>
                    </div>

                    {/* Platform Limits */}
                    <div className="border-b border-slate-900/60 pb-3">
                      <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-3">2. Transaction & Bet Limits</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[8px] font-bold uppercase text-slate-500 tracking-wider mb-1">Min Bet ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={minBetAmount}
                            onChange={(e) => setMinBetAmount(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-2 text-[11px] text-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-bold uppercase text-slate-500 tracking-wider mb-1">Max Bet ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={maxBetAmount}
                            onChange={(e) => setMaxBetAmount(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-2 text-[11px] text-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-bold uppercase text-slate-500 tracking-wider mb-1">Min Deposit ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={minDepositAmount}
                            onChange={(e) => setMinDepositAmount(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-2 text-[11px] text-white font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-bold uppercase text-slate-500 tracking-wider mb-1">Min Withdraw ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={minWithdrawalAmount}
                            onChange={(e) => setMinWithdrawalAmount(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-lg py-1.5 px-2 text-[11px] text-white font-mono font-bold"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingConfig}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 hover:border-indigo-400 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-indigo-600/5"
                    >
                      {savingConfig ? 'Saving Settings...' : 'Save General Limits'}
                    </button>
                  </form>
                </div>

                {/* Redesigned Real-time Gold Console */}
                <div className="border border-yellow-500/20 bg-slate-900/30 rounded-2xl p-4 md:p-5 flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase text-yellow-500 tracking-widest flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-yellow-500" />
                      Gold Rate manipulation
                    </h4>
                    <span className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${goldPriceType === 'LIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase">{goldPriceType === 'LIVE' ? 'Live API' : 'Manual'}</span>
                    </span>
                  </div>

                  {/* Feed type selection */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateConfigField({ goldPriceType: 'LIVE' })}
                      className={`py-1.5 px-2 rounded-xl text-[9px] font-black uppercase border transition-all cursor-pointer ${
                        goldPriceType === 'LIVE'
                          ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                          : 'bg-slate-950 border-slate-900 text-slate-500'
                      }`}
                    >
                      Live API Feed
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConfigField({ goldPriceType: 'MANUAL' })}
                      className={`py-1.5 px-2 rounded-xl text-[9px] font-black uppercase border transition-all cursor-pointer ${
                        goldPriceType === 'MANUAL'
                          ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                          : 'bg-slate-950 border-slate-900 text-slate-500'
                      }`}
                    >
                      Manual Base
                    </button>
                  </div>

                  {/* Display Base price */}
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                    <span>Base Price (Live/Manual):</span>
                    {goldPriceType === 'LIVE' ? (
                      <span className="font-mono text-white font-bold">${liveGoldPrice.toFixed(2)}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={goldManualPrice}
                        onChange={(e) => setGoldManualPrice(e.target.value)}
                        onBlur={() => updateConfigField({ goldManualPrice })}
                        onKeyDown={(e) => e.key === 'Enter' && updateConfigField({ goldManualPrice })}
                        className="w-24 bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-lg py-1 px-2 text-[11px] text-white font-mono font-bold text-right"
                      />
                    )}
                  </div>

                  {/* Adjust Offset */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Live Price Offset:</span>
                      <span className={`font-mono font-black ${parseFloat(goldPriceOffset) > 0 ? 'text-emerald-400' : parseFloat(goldPriceOffset) < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        ${parseFloat(goldPriceOffset) >= 0 ? '+' : ''}{parseFloat(goldPriceOffset).toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-6 gap-1">
                      <button type="button" onClick={() => updateConfigField({ goldPriceOffset: (parseFloat(goldPriceOffset) - 5).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-red-950 hover:border-red-900/30 text-red-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">-5</button>
                      <button type="button" onClick={() => updateConfigField({ goldPriceOffset: (parseFloat(goldPriceOffset) - 1).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-red-950 hover:border-red-900/30 text-red-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">-1</button>
                      <button type="button" onClick={() => updateConfigField({ goldPriceOffset: (parseFloat(goldPriceOffset) - 0.1).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-red-950 hover:border-red-900/30 text-red-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">-0.1</button>
                      <button type="button" onClick={() => updateConfigField({ goldPriceOffset: (parseFloat(goldPriceOffset) + 0.1).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-emerald-950 hover:border-emerald-900/30 text-emerald-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">+0.1</button>
                      <button type="button" onClick={() => updateConfigField({ goldPriceOffset: (parseFloat(goldPriceOffset) + 1).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-emerald-950 hover:border-emerald-900/30 text-emerald-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">+1</button>
                      <button type="button" onClick={() => updateConfigField({ goldPriceOffset: (parseFloat(goldPriceOffset) + 5).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-emerald-950 hover:border-emerald-900/30 text-emerald-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">+5</button>
                    </div>
                  </div>

                  {/* Trend Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-bold uppercase text-slate-500 tracking-wider">Target Trend Bias</label>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => updateConfigField({ goldTrend: 'UP' })}
                        className={`py-1 rounded-lg text-[9px] font-bold uppercase border transition-all cursor-pointer ${
                          goldTrend === 'UP' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40' : 'bg-slate-950 border-slate-900 text-slate-500'
                        }`}
                      >
                        Bullish
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfigField({ goldTrend: 'NEUTRAL' })}
                        className={`py-1 rounded-lg text-[9px] font-bold uppercase border transition-all cursor-pointer ${
                          goldTrend === 'NEUTRAL' ? 'bg-slate-900 text-slate-300 border-slate-800' : 'bg-slate-950 border-slate-900 text-slate-500'
                        }`}
                      >
                        Neutral
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfigField({ goldTrend: 'DOWN' })}
                        className={`py-1 rounded-lg text-[9px] font-bold uppercase border transition-all cursor-pointer ${
                          goldTrend === 'DOWN' ? 'bg-red-950/40 text-red-400 border-red-900/40' : 'bg-slate-950 border-slate-900 text-slate-500'
                        }`}
                      >
                        Bearish
                      </button>
                    </div>
                  </div>

                  {/* Force Price Spike Nudges */}
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-bold uppercase text-slate-500 tracking-wider font-semibold">Instant Price Shock (Nudge)</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => handleForceNudge(1, 5.00)} className="py-1.5 bg-emerald-950/10 hover:bg-emerald-950/30 border border-emerald-900/20 text-emerald-400 rounded-lg text-[9px] font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1">
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                        Spike Up (+$5)
                      </button>
                      <button type="button" onClick={() => handleForceNudge(1, -5.00)} className="py-1.5 bg-red-950/10 hover:bg-red-950/30 border border-red-900/20 text-red-400 rounded-lg text-[9px] font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1">
                        <TrendingDown className="w-3 h-3 text-red-400" />
                        Spike Down (-$5)
                      </button>
                    </div>
                  </div>

                  {/* Resulting preview price */}
                  <div className="mt-1 bg-slate-950 border border-slate-900 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Calculated Client Gold Rate</span>
                    <span className="text-base font-black font-mono tracking-wider text-yellow-500">
                      ${((goldPriceType === 'MANUAL' ? parseFloat(goldManualPrice) : liveGoldPrice) + parseFloat(goldPriceOffset)).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Redesigned Real-time Silver Console */}
                <div className="border border-slate-500/20 bg-slate-900/30 rounded-2xl p-4 md:p-5 flex flex-col gap-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase text-slate-300 tracking-widest flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-300" />
                      Silver Rate manipulation
                    </h4>
                    <span className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${silverPriceType === 'LIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase">{silverPriceType === 'LIVE' ? 'Live API' : 'Manual'}</span>
                    </span>
                  </div>

                  {/* Feed type selection */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateConfigField({ silverPriceType: 'LIVE' })}
                      className={`py-1.5 px-2 rounded-xl text-[9px] font-black uppercase border transition-all cursor-pointer ${
                        silverPriceType === 'LIVE'
                          ? 'bg-slate-300/10 text-slate-300 border-slate-300/30'
                          : 'bg-slate-950 border-slate-900 text-slate-500'
                      }`}
                    >
                      Live API Feed
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConfigField({ silverPriceType: 'MANUAL' })}
                      className={`py-1.5 px-2 rounded-xl text-[9px] font-black uppercase border transition-all cursor-pointer ${
                        silverPriceType === 'MANUAL'
                          ? 'bg-slate-300/10 text-slate-300 border-slate-300/30'
                          : 'bg-slate-950 border-slate-900 text-slate-500'
                      }`}
                    >
                      Manual Base
                    </button>
                  </div>

                  {/* Display Base price */}
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                    <span>Base Price (Live/Manual):</span>
                    {silverPriceType === 'LIVE' ? (
                      <span className="font-mono text-white font-bold">${liveSilverPrice.toFixed(2)}</span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        value={silverManualPrice}
                        onChange={(e) => setSilverManualPrice(e.target.value)}
                        onBlur={() => updateConfigField({ silverManualPrice })}
                        onKeyDown={(e) => e.key === 'Enter' && updateConfigField({ silverManualPrice })}
                        className="w-24 bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-lg py-1 px-2 text-[11px] text-white font-mono font-bold text-right"
                      />
                    )}
                  </div>

                  {/* Adjust Offset */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>Live Price Offset:</span>
                      <span className={`font-mono font-black ${parseFloat(silverPriceOffset) > 0 ? 'text-emerald-400' : parseFloat(silverPriceOffset) < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        ${parseFloat(silverPriceOffset) >= 0 ? '+' : ''}{parseFloat(silverPriceOffset).toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-6 gap-1">
                      <button type="button" onClick={() => updateConfigField({ silverPriceOffset: (parseFloat(silverPriceOffset) - 0.5).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-red-950 hover:border-red-900/30 text-red-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">-0.5</button>
                      <button type="button" onClick={() => updateConfigField({ silverPriceOffset: (parseFloat(silverPriceOffset) - 0.1).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-red-950 hover:border-red-900/30 text-red-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">-0.1</button>
                      <button type="button" onClick={() => updateConfigField({ silverPriceOffset: (parseFloat(silverPriceOffset) - 0.02).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-red-950 hover:border-red-900/30 text-red-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">-0.02</button>
                      <button type="button" onClick={() => updateConfigField({ silverPriceOffset: (parseFloat(silverPriceOffset) + 0.02).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-emerald-950 hover:border-emerald-900/30 text-emerald-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">+0.02</button>
                      <button type="button" onClick={() => updateConfigField({ silverPriceOffset: (parseFloat(silverPriceOffset) + 0.1).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-emerald-950 hover:border-emerald-900/30 text-emerald-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">+0.1</button>
                      <button type="button" onClick={() => updateConfigField({ silverPriceOffset: (parseFloat(silverPriceOffset) + 0.5).toFixed(2) })} className="py-1.5 bg-slate-950 hover:bg-slate-900 border border-emerald-950 hover:border-emerald-900/30 text-emerald-400 rounded-lg text-[9px] font-black cursor-pointer transition-all">+0.5</button>
                    </div>
                  </div>

                  {/* Trend Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-bold uppercase text-slate-500 tracking-wider">Target Trend Bias</label>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => updateConfigField({ silverTrend: 'UP' })}
                        className={`py-1 rounded-lg text-[9px] font-bold uppercase border transition-all cursor-pointer ${
                          silverTrend === 'UP' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40' : 'bg-slate-950 border-slate-900 text-slate-500'
                        }`}
                      >
                        Bullish
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfigField({ silverTrend: 'NEUTRAL' })}
                        className={`py-1 rounded-lg text-[9px] font-bold uppercase border transition-all cursor-pointer ${
                          silverTrend === 'NEUTRAL' ? 'bg-slate-900 text-slate-300 border-slate-800' : 'bg-slate-950 border-slate-900 text-slate-500'
                        }`}
                      >
                        Neutral
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfigField({ silverTrend: 'DOWN' })}
                        className={`py-1 rounded-lg text-[9px] font-bold uppercase border transition-all cursor-pointer ${
                          silverTrend === 'DOWN' ? 'bg-red-950/40 text-red-400 border-red-900/40' : 'bg-slate-950 border-slate-900 text-slate-500'
                        }`}
                      >
                        Bearish
                      </button>
                    </div>
                  </div>

                  {/* Force Price Spike Nudges */}
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-bold uppercase text-slate-500 tracking-wider font-semibold">Instant Price Shock (Nudge)</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" onClick={() => handleForceNudge(2, 0.50)} className="py-1.5 bg-emerald-950/10 hover:bg-emerald-950/30 border border-emerald-900/20 text-emerald-400 rounded-lg text-[9px] font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1">
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                        Spike Up (+$.5)
                      </button>
                      <button type="button" onClick={() => handleForceNudge(2, -0.50)} className="py-1.5 bg-red-950/10 hover:bg-red-950/30 border border-red-900/20 text-red-400 rounded-lg text-[9px] font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1">
                        <TrendingDown className="w-3 h-3 text-red-400" />
                        Spike Down (-$.5)
                      </button>
                    </div>
                  </div>

                  {/* Resulting preview price */}
                  <div className="mt-1 bg-slate-950 border border-slate-900 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Calculated Client Silver Rate</span>
                    <span className="text-base font-black font-mono tracking-wider text-slate-300">
                      ${((silverPriceType === 'MANUAL' ? parseFloat(silverManualPrice) : liveSilverPrice) + parseFloat(silverPriceOffset)).toFixed(2)}
                    </span>
                  </div>
                </div>

              </div>

              {/* Right Column Monitoring */}
              <div className="col-span-12 lg:col-span-8 bg-slate-900/30 border border-slate-900/70 rounded-2xl p-4 md:p-5 flex flex-col h-[55vh] lg:h-[580px] overflow-hidden">
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
                          <table className="w-full text-left text-xs min-w-[850px]">
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
                          <table className="w-full text-left text-xs min-w-[850px]">
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
                  <table className="w-full text-left text-xs border-collapse min-w-[850px]">
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
                          <td className="py-3.5 text-white font-bold">
                            <div className="flex items-center gap-2">
                              <div>
                                <div>{u.email}</div>
                                {u.mobile && <div className="text-[10px] text-slate-500 font-semibold mt-0.5">{u.mobile}</div>}
                              </div>
                              {u.is_banned && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-red-950 text-red-400 border border-red-900/30">
                                  Banned
                                </span>
                              )}
                            </div>
                          </td>
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
                            <div className="flex justify-end items-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedUser(u);
                                  setAdjustAmount('');
                                  setAdjustAction('ADD');
                                }}
                                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 hover:border-indigo-400 text-white font-black rounded-lg text-[10px] uppercase tracking-wide cursor-pointer transition-all shadow-sm shadow-indigo-600/10"
                              >
                                Inspect User
                              </button>
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
                  <table className="w-full text-left text-xs border-collapse min-w-[850px]">
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
                  <table className="w-full text-left text-xs border-collapse min-w-[900px]">
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

          {/* TAB 6: AUDIT LEDGER */}
          {activeTab === 'transactions' && (
            <div className="bg-slate-900/30 border border-slate-900/70 rounded-2xl p-6">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-900">
                <div>
                  <h3 className="text-sm font-black uppercase text-white flex items-center gap-2">
                    <Clock className="w-4.5 h-4.5 text-indigo-400" />
                    Transaction Audit Ledger
                  </h3>
                  <p className="text-[10px] text-slate-500 font-semibold mt-1">
                    Complete platform-wide transaction trail of deposits, withdrawals, predictions, and balance adjustments.
                  </p>
                </div>
                <button
                  onClick={loadTransactions}
                  disabled={loadingTransactions}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl text-slate-400 hover:text-white font-bold text-xs uppercase flex items-center gap-2 cursor-pointer transition-all disabled:opacity-55"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTransactions ? 'animate-spin' : ''}`} />
                  Sync Ledger
                </button>
              </div>

              {loadingTransactions ? (
                <div className="py-24 text-center text-slate-500 font-bold text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  Loading transactions trail...
                </div>
              ) : transactionsList.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs font-semibold">
                  No transaction records found in ledger registry.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[850px]">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-900/80 pb-2">
                        <th className="pb-3 pl-2">Transaction ID</th>
                        <th className="pb-3">User Email</th>
                        <th className="pb-3">Type</th>
                        <th className="pb-3">Amount</th>
                        <th className="pb-3">Reference ID / Source</th>
                        <th className="pb-3 pr-2 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactionsList.map((t) => {
                        let typeColor = 'text-slate-400 bg-slate-950 border-slate-850';
                        let amountColor = 'text-white';
                        let prefix = '';

                        if (t.type === 'DEPOSIT' || t.type === 'MANUAL_CREDIT' || t.type === 'PRED_WIN') {
                          typeColor = 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30';
                          amountColor = 'text-emerald-400 font-black';
                          prefix = '+';
                        } else if (t.type === 'WITHDRAW' || t.type === 'MANUAL_DEBIT' || t.type === 'PRED_LOSS') {
                          typeColor = 'bg-red-950/20 text-red-400 border-red-900/30';
                          amountColor = 'text-red-400 font-black';
                          prefix = ''; // negative sign is in the amount
                        } else if (t.type === 'PLATFORM_EARNING') {
                          typeColor = 'bg-yellow-950/20 text-yellow-500 border-yellow-900/30';
                          amountColor = 'text-yellow-500 font-black';
                          prefix = '+';
                        }

                        return (
                          <tr key={t.id} className="border-b border-slate-950/40 hover:bg-slate-900/10 transition-colors font-semibold">
                            <td className="py-3.5 pl-2 text-slate-500 font-mono text-[10px] select-all select-text cursor-text" title={t.id}>{t.id.substring(0, 15)}...</td>
                            <td className="py-3.5 text-white font-bold">{t.user_email || 'System Account'}</td>
                            <td className="py-3.5">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${typeColor}`}>
                                {t.type}
                              </span>
                            </td>
                            <td className={`py-3.5 font-mono text-sm ${amountColor}`}>
                              {prefix}${parseFloat(t.amount).toFixed(2)}
                            </td>
                            <td className="py-3.5 text-slate-400 font-mono select-all select-text cursor-text text-[10px]" title={t.reference_id}>{t.reference_id}</td>
                            <td className="py-3.5 pr-2 text-right text-slate-500 font-normal">{new Date(t.created_at).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </section>
      </main>

      {/* User Inspection & Management Center */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 md:p-4 overflow-y-auto">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl p-4 md:p-6 shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden animate-scale-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-950 border border-indigo-900/40 rounded-xl text-indigo-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase text-white tracking-wide">
                    User Management Center
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold">
                    Inspect profile details, wallet ledger state, bet sheets, and apply administrative overrides.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Sub-body grid */}
            <div className="flex-1 grid grid-cols-12 gap-5 overflow-y-auto pr-1">
              
              {/* LEFT COLUMN: Controls & Profile (Width: 5/12) */}
              <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
                
                {/* Profile Card */}
                <div className="bg-slate-950/40 border border-slate-950 rounded-2xl p-4 flex flex-col gap-3">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Traders Credentials</span>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-slate-900 pb-1.5 text-xs">
                      <span className="text-slate-400 font-semibold">User ID:</span>
                      <span className="font-bold text-slate-200">#{selectedUser.id}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1.5 text-xs">
                      <span className="text-slate-400 font-semibold">Email address:</span>
                      <span className="font-bold text-white select-all">{selectedUser.email}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1.5 text-xs">
                      <span className="text-slate-400 font-semibold">Mobile number:</span>
                      <span className="font-bold text-slate-200">{selectedUser.mobile || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1.5 text-xs">
                      <span className="text-slate-400 font-semibold">System Role:</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-slate-900 border border-slate-850 text-slate-400">
                        {selectedUser.role}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1.5 text-xs">
                      <span className="text-slate-400 font-semibold">Registration Date:</span>
                      <span className="font-bold text-slate-400">{new Date(selectedUser.created_at).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-semibold">Banned Status:</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                        selectedUser.is_banned
                          ? 'bg-red-950 text-red-400 border-red-900'
                          : 'bg-emerald-950 text-emerald-400 border-emerald-900'
                      }`}>
                        {selectedUser.is_banned ? 'Banned' : 'Active'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Adjust balance form */}
                <div className="bg-slate-950/40 border border-slate-950 rounded-2xl p-4">
                  <span className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-3">Adjust Wallet balance</span>
                  
                  {userMsg && (
                    <div className="p-2.5 bg-indigo-950/40 border border-indigo-900/30 text-indigo-300 text-[11px] rounded-lg text-center font-bold mb-3">
                      {userMsg}
                    </div>
                  )}

                  <form onSubmit={handleAdjustBalance} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustAction('ADD')}
                        className={`py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all cursor-pointer ${
                          adjustAction === 'ADD'
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-slate-950 border-slate-850 text-slate-450 hover:bg-slate-900'
                        }`}
                      >
                        Credit (+)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjustAction('SUBTRACT')}
                        className={`py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all cursor-pointer ${
                          adjustAction === 'SUBTRACT'
                            ? 'bg-red-600 text-white border-red-500'
                            : 'bg-slate-950 border-slate-850 text-slate-450 hover:bg-slate-900'
                        }`}
                      >
                        Debit (-)
                      </button>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-500 font-mono font-bold">$</div>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        required
                        placeholder="Adjustment Amount (USD)"
                        className="w-full bg-slate-950 border border-slate-900 focus:border-indigo-500 focus:outline-none rounded-xl py-2 pl-6 pr-2 text-xs text-white font-mono font-bold transition-all"
                      />
                    </div>

                    <div className="flex gap-2 text-[9px] text-slate-500 font-bold justify-between">
                      <span>Available Balance: ${parseFloat(selectedUser.balance || '0').toFixed(2)}</span>
                      <span>Locked Balance: ${parseFloat(selectedUser.locked_balance || '0').toFixed(2)}</span>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 hover:border-indigo-400 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow"
                    >
                      Apply Balance Adjustment
                    </button>
                  </form>
                </div>

                {/* Account operations controls (Ban/Unban/Delete) */}
                {selectedUser.role !== 'ADMIN' && selectedUser.role !== 'TREASURY' && (
                  <div className="bg-slate-950/40 border border-slate-950 rounded-2xl p-4 flex flex-col gap-2.5">
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Destructive Actions</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleToggleBan(selectedUser)}
                        className={`py-2 border font-black rounded-xl text-[10px] uppercase tracking-wide cursor-pointer transition-all ${
                          selectedUser.is_banned
                            ? 'bg-emerald-950/30 border-emerald-900/30 text-emerald-400 hover:bg-emerald-950'
                            : 'bg-amber-950/30 border-amber-900/30 text-amber-500 hover:bg-amber-950'
                        }`}
                      >
                        {selectedUser.is_banned ? 'Unban Account' : 'Ban Account'}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(selectedUser)}
                        className="py-2 bg-red-950/30 border border-red-900/30 text-red-400 hover:bg-red-950 font-black rounded-xl text-[10px] uppercase tracking-wide cursor-pointer transition-all"
                      >
                        Delete User
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: User logs & telemetry tabs (Width: 7/12) */}
              <div className="col-span-12 lg:col-span-7 flex flex-col gap-4 max-h-[60vh] lg:max-h-full overflow-hidden">
                
                {/* Active predictions tab */}
                <div className="bg-slate-950/40 border border-slate-950 rounded-2xl p-4 flex flex-col max-h-[220px] overflow-hidden">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">
                    Active Predictions ({activeBets.filter(b => b.user_id === selectedUser.id).length})
                  </span>
                  <div className="flex-1 overflow-y-auto">
                    {activeBets.filter(b => b.user_id === selectedUser.id).length === 0 ? (
                      <div className="text-[10px] text-slate-500 font-bold text-center py-6">
                        No active prediction contracts.
                      </div>
                    ) : (
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="text-slate-500 font-bold border-b border-slate-900 pb-1">
                            <th className="pb-1">Asset</th>
                            <th className="pb-1">Direction</th>
                            <th className="pb-1">Amount</th>
                            <th className="pb-1">Entry</th>
                            <th className="pb-1 text-right">Overrides</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeBets.filter(b => b.user_id === selectedUser.id).map(b => (
                            <tr key={b.id} className="border-b border-slate-950/40 py-1 font-semibold">
                              <td className="py-1.5 text-white font-bold">{b.item_name.split(' ')[0]}</td>
                              <td className="py-1.5">
                                <span className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-black border ${
                                  b.direction === 'UP'
                                    ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30'
                                    : 'text-red-400 bg-red-950/20 border-red-900/30'
                                }`}>
                                  {b.direction}
                                </span>
                              </td>
                              <td className="py-1.5 text-white font-bold">${parseFloat(b.amount).toFixed(2)}</td>
                              <td className="py-1.5 text-slate-400 font-mono">${parseFloat(b.start_price).toFixed(2)}</td>
                              <td className="py-1.5 text-right">
                                <div className="inline-flex gap-1 justify-end">
                                  <button
                                    onClick={() => handleBetOverride(b.id, 'FORCE_WIN')}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-black border transition-all cursor-pointer ${
                                      b.override_status === 'FORCE_WIN'
                                        ? 'bg-emerald-600 border-emerald-500 text-white'
                                        : 'bg-slate-950 border-slate-800 text-emerald-400'
                                    }`}
                                  >
                                    Win
                                  </button>
                                  <button
                                    onClick={() => handleBetOverride(b.id, 'FORCE_LOSS')}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-black border transition-all cursor-pointer ${
                                      b.override_status === 'FORCE_LOSS'
                                        ? 'bg-red-600 border-red-500 text-white'
                                        : 'bg-slate-950 border-slate-800 text-red-400'
                                    }`}
                                  >
                                    Loss
                                  </button>
                                  {b.override_status && (
                                    <button
                                      onClick={() => handleBetOverride(b.id, null)}
                                      className="px-1 bg-slate-900 text-slate-505 rounded text-[8px] font-bold border border-slate-800"
                                      title="Reset Override"
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
                    )}
                  </div>
                </div>

                {/* Resolved predictions log tab */}
                <div className="bg-slate-950/40 border border-slate-950 rounded-2xl p-4 flex flex-col max-h-[220px] overflow-hidden">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">
                    Resolved Predictions ({betLogs.filter(b => b.user_id === selectedUser.id).length})
                  </span>
                  <div className="flex-1 overflow-y-auto">
                    {betLogs.filter(b => b.user_id === selectedUser.id).length === 0 ? (
                      <div className="text-[10px] text-slate-500 font-bold text-center py-6">
                        No prediction logs.
                      </div>
                    ) : (
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="text-slate-500 font-bold border-b border-slate-900 pb-1">
                            <th className="pb-1">Asset</th>
                            <th className="pb-1">Bet Size</th>
                            <th className="pb-1">Direction</th>
                            <th className="pb-1">Exit Detail</th>
                            <th className="pb-1">Result</th>
                            <th className="pb-1 text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {betLogs.filter(b => b.user_id === selectedUser.id).slice(0, 50).map(b => {
                            const isWin = b.status === 'WON';
                            const isLoss = b.status === 'LOST';
                            const profit = b.payout_amount ? parseFloat(b.payout_amount) - parseFloat(b.amount) : 0;
                            return (
                              <tr key={b.id} className="border-b border-slate-950/40 py-1 font-semibold">
                                <td className="py-1.5 text-white font-bold">{b.item_name.split(' ')[0]}</td>
                                <td className="py-1.5 text-slate-300 font-bold">${parseFloat(b.amount).toFixed(2)}</td>
                                <td className="py-1.5 text-slate-400">{b.direction}</td>
                                <td className="py-1.5 text-slate-450 font-mono text-[10px]">${parseFloat(b.start_price).toFixed(2)} &rarr; ${b.end_price ? parseFloat(b.end_price).toFixed(2) : '-'}</td>
                                <td className="py-1.5">
                                  <span className={`px-1 py-0.2 rounded font-black text-[8px] uppercase border ${
                                    isWin 
                                      ? 'bg-emerald-950 text-emerald-400 border-emerald-900/30' 
                                      : isLoss 
                                        ? 'bg-red-950 text-red-400 border-red-900/30' 
                                        : 'bg-slate-950 text-slate-400 border-slate-850'
                                  }`}>
                                    {b.status}
                                  </span>
                                </td>
                                <td className={`py-1.5 text-right font-black font-mono ${isWin ? 'text-emerald-400' : (isLoss ? 'text-red-400' : 'text-slate-400')}`}>
                                  {isWin ? `+$${profit.toFixed(2)}` : (isLoss ? `-$${parseFloat(b.amount).toFixed(2)}` : '$0.00')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Wallet transactions history list tab */}
                <div className="bg-slate-950/40 border border-slate-950 rounded-2xl p-4 flex flex-col flex-1 overflow-hidden min-h-[200px]">
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-2">
                    Wallet Transaction Ledger ({transactionsList.filter(t => t.user_id === selectedUser.id).length})
                  </span>
                  <div className="flex-1 overflow-y-auto">
                    {transactionsList.filter(t => t.user_id === selectedUser.id).length === 0 ? (
                      <div className="text-[10px] text-slate-500 font-bold text-center py-8">
                        No transactions registered for user.
                      </div>
                    ) : (
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="text-slate-500 font-bold border-b border-slate-900 pb-1">
                            <th className="pb-1">Type</th>
                            <th className="pb-1">Amount</th>
                            <th className="pb-1">Reference</th>
                            <th className="pb-1 text-right">Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactionsList.filter(t => t.user_id === selectedUser.id).map(t => {
                            const isCredit = t.type === 'DEPOSIT' || t.type === 'MANUAL_CRED' || t.type === 'PRED_WIN' || t.type === 'MANUAL_CREDIT';
                            const isDebit = t.type === 'WITHDRAW' || t.type === 'MANUAL_DEB' || t.type === 'PRED_LOSS' || t.type === 'MANUAL_DEBIT';
                            return (
                              <tr key={t.id} className="border-b border-slate-950/40 py-1 font-semibold">
                                <td className="py-1.5">
                                  <span className={`px-1 rounded text-[8px] font-black uppercase border ${
                                    isCredit
                                      ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30'
                                      : isDebit
                                        ? 'bg-red-950/20 text-red-400 border-red-900/30'
                                        : 'bg-slate-950 text-slate-400 border-slate-850'
                                  }`}>
                                    {t.type}
                                  </span>
                                </td>
                                <td className={`py-1.5 font-bold font-mono ${isCredit ? 'text-emerald-400' : (isDebit ? 'text-red-400' : 'text-slate-400')}`}>
                                  {isCredit ? '+' : ''}${parseFloat(t.amount).toFixed(2)}
                                </td>
                                <td className="py-1.5 text-slate-500 font-mono text-[9px] select-all select-text cursor-text">{t.reference_id}</td>
                                <td className="py-1.5 text-right text-slate-500 font-normal">{new Date(t.created_at).toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}
      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          let bgClass = 'bg-slate-900/90 border-slate-800 text-slate-100';
          let borderClass = 'border-l-4 border-l-indigo-500';
          let icon = <Info className="w-4 h-4 text-indigo-400" />;

          if (t.type === 'success') {
            borderClass = 'border-l-4 border-l-emerald-500';
            icon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
          } else if (t.type === 'error') {
            borderClass = 'border-l-4 border-l-red-500';
            icon = <AlertTriangle className="w-4 h-4 text-red-400" />;
          } else if (t.type === 'warning') {
            borderClass = 'border-l-4 border-l-amber-500';
            icon = <AlertTriangle className="w-4 h-4 text-amber-400" />;
          } else if (t.type === 'win') {
            bgClass = 'bg-gradient-to-r from-emerald-950/80 to-slate-900/90 border-emerald-900/40 text-emerald-100';
            borderClass = 'border-l-4 border-l-yellow-500';
            icon = <Award className="w-5 h-5 text-yellow-400 animate-bounce" />;
          } else if (t.type === 'loss') {
            bgClass = 'bg-gradient-to-r from-red-950/40 to-slate-900/90 border-red-900/30 text-slate-350';
            borderClass = 'border-l-4 border-l-red-500';
            icon = <X className="w-4 h-4 text-red-500" />;
          }

          return (
            <div
              key={t.id}
              className={`flex items-start justify-between gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-y-0 opacity-100 animate-slide-in pointer-events-auto ${bgClass} ${borderClass}`}
            >
              <div className="flex gap-2.5 items-start">
                <div className="mt-0.5">{icon}</div>
                <p className="text-xs font-bold leading-relaxed">{t.message}</p>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-slate-500 hover:text-slate-300 p-0.5 hover:bg-slate-800/50 rounded cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-center overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent"></div>
            
            <button 
              onClick={() => setConfirmModal(null)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex justify-center mb-4">
              <div className="p-4 bg-indigo-950 border border-indigo-900/50 rounded-2xl text-indigo-400">
                <Shield className="w-8 h-8 stroke-[2.5]" />
              </div>
            </div>

            <h3 className="text-lg font-black tracking-tight text-white uppercase mb-2">
              {confirmModal.title}
            </h3>
            
            <p className="text-xs text-slate-400 font-semibold mb-6 leading-relaxed px-2">
              {confirmModal.message}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-3 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-slate-400 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 hover:border-indigo-400 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
