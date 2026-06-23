'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  TrendingUp, TrendingDown, DollarSign, Wallet, RefreshCw, X, Shield, 
  Clock, Award, Activity, BarChart2, CheckCircle2, AlertTriangle, HelpCircle, ArrowRight,
  Info
} from 'lucide-react';

// Types matching backend models
interface Commodity {
  id: number;
  name: string;
  description: string;
  image_url: string;
  category: string;
  daily_base_price: string;
  last_price: string;
  priceHistory?: { time: number; open: number; high: number; low: number; close: number }[];
}

interface Prediction {
  id: string;
  item_id: number;
  name: string;
  direction: 'UP' | 'DOWN';
  amount: string;
  start_price: string;
  end_price: string | null;
  payout_rate: string;
  duration: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'DRAW';
  created_at: string;
  expires_at: string;
  payout_amount: string | null;
}

interface Transaction {
  id: string;
  type: string;
  amount: string;
  reference_id: string;
  created_at: string;
}

const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_BASE = `${NEXT_PUBLIC_API_URL}/api`;

export default function TradingDashboard() {
  // Authentication State
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: number; email: string; role: string } | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Toast notifications state
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

  // App Core State
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  
  // Selected Item Sub-States & Betting inputs
  const [betDirection, setBetDirection] = useState<'UP' | 'DOWN'>('UP');
  const [betAmount, setBetAmount] = useState('100');
  const [betDuration, setBetDuration] = useState<number>(60); // default 1 minute (60s)

  // User Specific States
  const [wallet, setWallet] = useState({ balance: 0, locked_balance: 0 });
  const [userStats, setUserStats] = useState({
    total_predictions: 0,
    active_predictions: 0,
    won_predictions: 0,
    lost_predictions: 0,
    draw_predictions: 0,
    total_profit: 0
  });
    const [predictionsList, setPredictionsList] = useState<Prediction[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Real-time updates & Highlights
  const [tickingStates, setTickingStates] = useState<{ [id: number]: 'UP' | 'DOWN' | null }>({});
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'transactions' | 'deposits' | 'withdrawals'>('active');
  const [mobileTab, setMobileTab] = useState<'trade' | 'history' | 'wallet'>('trade');

  // Multi-Currency & Crypto States
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');
  const [exchangeRates, setExchangeRates] = useState<{ [key: string]: number }>({
    USD: 1.0,
    INR: 83.5,
    EUR: 0.92,
    GBP: 0.78,
    BTC: 0.000015,
    ETH: 0.00028,
    USDT: 1.0,
  });
  const [adminGateways, setAdminGateways] = useState<{
    upi_id: string;
    btc_address: string;
    eth_address: string;
  }>({
    upi_id: 'pay@kuberkhajana',
    btc_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    eth_address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
  });

  // Modal States
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('1000');
  const [depositMethod, setDepositMethod] = useState<'UPI' | 'BTC' | 'ETH' | 'USDT'>('UPI');
  const [depositReference, setDepositReference] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('1000');
  const [withdrawMethod, setWithdrawMethod] = useState<'UPI' | 'BANK_TRANSFER' | 'BTC' | 'ETH' | 'USDT'>('UPI');
  const [withdrawDetails, setWithdrawDetails] = useState('');

  const [depositRequestsList, setDepositRequestsList] = useState<any[]>([]);
  const [withdrawalRequestsList, setWithdrawalRequestsList] = useState<any[]>([]);

  // Conversion Helpers
  const convertVal = (usdVal: number | string) => {
    const parsed = typeof usdVal === 'string' ? parseFloat(usdVal) : usdVal;
    if (isNaN(parsed)) return 0;
    const rate = exchangeRates[selectedCurrency] || 1.0;
    return parsed * rate;
  };

  const formatCurrency = (amount: number) => {
    if (selectedCurrency === 'BTC' || selectedCurrency === 'ETH') {
      return `${selectedCurrency} ${amount.toFixed(6)}`;
    }
    const symbols: { [key: string]: string } = {
      USD: '$',
      INR: '₹',
      EUR: '€',
      GBP: '£',
      USDT: '₮',
    };
    const symbol = symbols[selectedCurrency] || '';
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Modal notification for resolved bets
  const [resolutionModal, setResolutionModal] = useState<{
    show: boolean;
    itemName: string;
    direction: 'UP' | 'DOWN';
    status: 'WON' | 'LOST' | 'DRAW';
    amount: number;
    profit: number;
    startRate: number;
    endRate: number;
  } | null>(null);

  // State to force refresh live bet lists countdown
  const [, setTickTimer] = useState(0);
  
  // WebSocket and Chart Refs
  const socketRef = useRef<Socket | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);

  // Load Initial Catalog of Commodities (Gold & Silver)
  const loadCatalog = async () => {
    try {
      const res = await fetch(`${API_BASE}/orders/catalog`);
      if (res.ok) {
        const data = await res.json();
        setCommodities(data);
        if (data.length > 0 && selectedItemId === null) {
          setSelectedItemId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading commodities:', err);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Sync token from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('trading_token');
    const savedUser = localStorage.getItem('trading_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
    setLoadingAuth(false);
  }, []);

  // Fetch Private Portfolio & History Data once authenticated
  const loadUserData = async () => {
    if (!token) return;
    try {
      // Fetch Wallet & Stats
      const portRes = await fetch(`${API_BASE}/portfolio`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (portRes.ok) {
        const portData = await portRes.json();
        setWallet(portData.wallet);
        setUserStats(portData.statistics);
      }

      // Fetch Predictions History
      const predRes = await fetch(`${API_BASE}/orders/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (predRes.ok) {
        const predData = await predRes.json();
        setPredictionsList(predData);
      }

      // Fetch Transactions
      const txRes = await fetch(`${API_BASE}/portfolio/transactions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData);
      }

      // Fetch Gateways
      const gatewaysRes = await fetch(`${API_BASE}/portfolio/gateways`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (gatewaysRes.ok) {
        const gatewaysData = await gatewaysRes.json();
        setAdminGateways(gatewaysData);
      }

      // Fetch dynamic rates
      const ratesRes = await fetch(`${API_BASE}/portfolio/rates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (ratesRes.ok) {
        const ratesData = await ratesRes.json();
        setExchangeRates(ratesData);
      }

      // Fetch user's deposit requests
      const depReqRes = await fetch(`${API_BASE}/portfolio/deposits`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (depReqRes.ok) {
        const depReqData = await depReqRes.json();
        setDepositRequestsList(depReqData);
      }

      // Fetch user's withdrawal requests
      const witReqRes = await fetch(`${API_BASE}/portfolio/withdrawals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (witReqRes.ok) {
        const witReqData = await witReqRes.json();
        setWithdrawalRequestsList(witReqData);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  };

  useEffect(() => {
    loadUserData();
  }, [token, selectedItemId]);

  // Load chart historical candles when commodity changes
  const loadChartHistory = async (id: number) => {
    try {
      const chartRes = await fetch(`${API_BASE}/market/history/${id}?resolution=1m`);
      if (chartRes.ok) {
        const chartData = await chartRes.json();
        if (candleSeriesRef.current) {
          candleSeriesRef.current.setData(chartData);
        }
      }
    } catch (err) {
      console.error('Error loading chart history:', err);
    }
  };

  useEffect(() => {
    if (selectedItemId !== null) {
      loadChartHistory(selectedItemId);
    }
  }, [selectedItemId]);

  // Interval timer to force redraw countdowns on pending bets
  useEffect(() => {
    const interval = setInterval(() => {
      setTickTimer(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Set up WebSocket client
  useEffect(() => {
    socketRef.current = io(NEXT_PUBLIC_API_URL);

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
      if (user) {
        socketRef.current?.emit('auth', user.id);
      }
    });

    // Handle global price ticks
    socketRef.current.on('tick', (data: { itemId: number; price: number; time: string }) => {
      setCommodities(prevCatalog => {
        const index = prevCatalog.findIndex(item => item.id === data.itemId);
        if (index === -1) return prevCatalog;

        const updated = [...prevCatalog];
        const oldPrice = parseFloat(updated[index].last_price);
        const direction = data.price > oldPrice ? 'UP' : data.price < oldPrice ? 'DOWN' : null;

        updated[index] = {
          ...updated[index],
          last_price: data.price.toString()
        };

        // Trigger blink highlight
        if (direction) {
          setTickingStates(prev => ({ ...prev, [data.itemId]: direction }));
          setTimeout(() => {
            setTickingStates(prev => ({ ...prev, [data.itemId]: null }));
          }, 600);
        }

        return updated;
      });
    });

    // Handle WebSocket events for selected item
    socketRef.current.on('item_tick', (tick: { time: number; open: number; high: number; low: number; close: number }) => {
      if (candleSeriesRef.current) {
        candleSeriesRef.current.update(tick);
      }
    });

    // Handle prediction resolution reports
    socketRef.current.on('prediction_resolved', (data: {
      id: string;
      status: 'WON' | 'LOST' | 'DRAW';
      payout: number;
      amount: number;
      profit: number;
      itemName: string;
      direction: 'UP' | 'DOWN';
      startRate: number;
      endRate: number;
    }) => {
      loadUserData();
      
      // Trigger Toast notification
      if (data.status === 'WON') {
        addToast(`Congratulations! You WON the ${data.itemName} bet! +$${parseFloat(data.profit.toString()).toFixed(2)}`, 'win');
      } else if (data.status === 'LOST') {
        addToast(`Prediction resolved. You LOST the ${data.itemName} bet of $${parseFloat(data.amount.toString()).toFixed(2)}.`, 'loss');
      } else if (data.status === 'DRAW') {
        addToast(`Prediction resolved as DRAW for ${data.itemName}. Bet amount refunded.`, 'info');
      }

      // Display result modal
      setResolutionModal({
        show: true,
        itemName: data.itemName,
        direction: data.direction,
        status: data.status,
        amount: data.amount,
        profit: data.profit,
        startRate: data.startRate,
        endRate: data.endRate
      });
    });

    socketRef.current.on('wallet_update', () => {
      loadUserData();
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [user]);

  // Subscribe/Unsubscribe socket rooms when selected item changes
  useEffect(() => {
    if (socketRef.current && selectedItemId !== null) {
      socketRef.current.emit('subscribe_item', selectedItemId);
      return () => {
        socketRef.current?.emit('unsubscribe_item', selectedItemId);
      };
    }
  }, [selectedItemId]);

  // Initialize TradingView Candlestick Chart (Lightweight Charts)
  useEffect(() => {
    if (typeof window === 'undefined' || !chartContainerRef.current) return;

    let chart: any = null;
    let resizeObserver: ResizeObserver | null = null;
    let active = true;

    // Dynamically load Lightweight Charts to prevent SSR issues
    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      if (!active || !chartContainerRef.current) return;

      chartContainerRef.current.innerHTML = '';

      chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 600,
        height: chartContainerRef.current.clientHeight || 300, // Dynamic height from container!
        layout: {
          background: { color: 'transparent' },
          textColor: '#9ca3af',
        },
        grid: {
          vertLines: { color: 'rgba(30, 41, 59, 0.3)' },
          horzLines: { color: 'rgba(30, 41, 59, 0.3)' },
        },
        crosshair: {
          mode: 1,
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: true,
          borderColor: '#1e293b',
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

      // Force load initial historical data
      if (selectedItemId !== null) {
        loadChartHistory(selectedItemId);
      }

      // Resize observer
      resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0 || !active) return;
        const { width, height } = entries[0].contentRect;
        if (chart) {
          chart.applyOptions({
            width: width || 600,
            height: height || 300,
          });
        }
      });
      resizeObserver.observe(chartContainerRef.current);
    });

    return () => {
      active = false;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (chart) {
        chart.remove();
      }
    };
  }, [selectedItemId, token]);

  // Authentication: Login/Register
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = isRegistering ? 'register' : 'login';
    
    const payload = isRegistering 
      ? { email: authEmail, password: authPassword, mobile: authPhone }
      : { email: authEmail, password: authPassword };

    try {
      const res = await fetch(`${API_BASE}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed');
        addToast(`Authentication failed: ${data.error || 'Unknown error'}`, 'error');
        return;
      }

      localStorage.setItem('trading_token', data.token);
      localStorage.setItem('trading_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      
      addToast(isRegistering ? 'Account registered successfully! Welcome!' : 'Logged in successfully!', 'success');
      setAuthPhone('');
      socketRef.current?.emit('auth', data.user.id);
    } catch (err) {
      setAuthError('Network error connecting to API');
      addToast('Network error connecting to API', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('trading_token');
    localStorage.removeItem('trading_user');
    setToken(null);
    setUser(null);
    setWallet({ balance: 0, locked_balance: 0 });
    setPredictionsList([]);
    setTransactions([]);
    addToast('Logged out successfully.', 'success');
  };

  // Place Prediction Bet Submission (Instant execution)
  const handlePlacePrediction = async (direction: 'UP' | 'DOWN') => {
    if (!token) {
      addToast('Please log in first.', 'warning');
      return;
    }

    const betVal = parseFloat(betAmount);
    if (isNaN(betVal) || betVal <= 0) {
      addToast('Enter a valid positive bet amount.', 'warning');
      return;
    }

    // Convert local currency to base USD
    const rate = exchangeRates[selectedCurrency] || 1.0;
    const usdAmount = parseFloat((betVal / rate).toFixed(2));

    try {
      const res = await fetch(`${API_BASE}/orders/place`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          itemId: selectedItemId,
          direction: direction,
          amount: usdAmount.toString(),
          duration: betDuration
        })
      });

      const data = await res.json();
      if (!res.ok) {
        addToast(`Error: ${data.error}`, 'error');
        return;
      }

      addToast(`Speculation of ${formatCurrency(betVal)} (${direction}) placed successfully!`, 'success');
      // Refresh local wallet and history data
      loadUserData();
    } catch (err) {
      console.error('Error placing prediction:', err);
      addToast('Failed to place prediction bet.', 'error');
    }
  };

  // Submit manual QR code deposit request
  const handleDepositRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const depAmountVal = parseFloat(depositAmount);
    if (isNaN(depAmountVal) || depAmountVal <= 0) {
      addToast('Please enter a valid deposit amount.', 'warning');
      return;
    }
    if (!depositReference.trim()) {
      addToast('Please enter your transaction reference ID.', 'warning');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/portfolio/deposit-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: depAmountVal,
          currency: selectedCurrency,
          paymentMethod: depositMethod,
          referenceId: depositReference
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast(data.message, 'success');
        setDepositModalOpen(false);
        setDepositReference('');
        loadUserData();
      } else {
        addToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Deposit request failed:', err);
      addToast('Failed to submit deposit request.', 'error');
    }
  };

  // Submit withdrawal request
  const handleWithdrawalRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const amountVal = parseFloat(withdrawAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      addToast('Please enter a valid withdrawal amount.', 'warning');
      return;
    }
    if (!withdrawDetails.trim()) {
      addToast('Please enter destination account details.', 'warning');
      return;
    }

    // Convert local currency withdrawal amount to base USD to lock in wallet
    const rate = exchangeRates[selectedCurrency] || 1.0;
    const usdAmount = parseFloat((amountVal / rate).toFixed(2));

    try {
      const res = await fetch(`${API_BASE}/portfolio/withdraw-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: amountVal,
          currency: selectedCurrency,
          paymentMethod: withdrawMethod,
          paymentDetails: withdrawDetails,
          amountInUsd: usdAmount
        })
      });

      const data = await res.json();
      if (res.ok) {
        addToast(data.message, 'success');
        setWithdrawModalOpen(false);
        setWithdrawDetails('');
        loadUserData();
      } else {
        addToast(`Error: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Withdrawal request failed:', err);
      addToast('Failed to submit withdrawal request.', 'error');
    }
  };

  // Deposit funds (demo convenience utility)
  const handleDepositDemo = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/portfolio/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: '5000' })
      });
      if (res.ok) {
        loadUserData();
      }
    } catch (err) {
      console.error('Deposit demo failed:', err);
    }
  };

  // Compute countdown times for rendering
  const getRemainingTime = (expiresAtStr: string) => {
    const expiresAt = new Date(expiresAtStr).getTime();
    const diff = expiresAt - Date.now();
    if (diff <= 0) return '0s';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const selectedItem = commodities.find(i => i.id === selectedItemId);
  const curPrice = selectedItem ? parseFloat(selectedItem.last_price) : 0;

  // Filter list splits
  const activePredictions = predictionsList.filter(p => p.status === 'PENDING');
  const resolvedPredictions = predictionsList.filter(p => p.status !== 'PENDING');

  if (loadingAuth) {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans antialiased">
        <div className="flex flex-col items-center gap-3">
          <Activity className="w-10 h-10 text-yellow-500 animate-pulse" />
          <span className="text-xs text-slate-500 font-bold uppercase tracking-widest animate-pulse">KuberKhajana</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white font-sans antialiased overflow-hidden">
      {/* Header Banner */}
      <header className="sticky top-0 z-40 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-4 py-3 md:px-6 md:py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-2 bg-gradient-to-tr from-yellow-500 to-amber-600 rounded-xl shadow-lg shadow-yellow-500/10">
            <Activity className="w-4 h-4 md:w-5 md:h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-base md:text-xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-yellow-400 bg-clip-text text-transparent">
              KuberKhajana
            </h1>
            <p className="hidden md:block text-[10px] text-slate-500 uppercase tracking-widest font-bold">Real-time Gold & Silver Predictions (Rates quoted per Troy Ounce / oz)</p>
          </div>
        </div>

        {/* Auth Panel */}
        <div className="flex items-center gap-2 md:gap-3">
          {token && user ? (
            <div className="flex items-center gap-2 md:gap-3">
              {/* Currency Selector */}
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="hidden md:block bg-slate-900 border border-slate-800 text-[11px] md:text-xs text-slate-300 py-1 px-2 md:py-1.5 md:px-3 rounded-lg md:rounded-xl font-bold focus:outline-none focus:border-yellow-500 cursor-pointer"
              >
                <option value="USD">USD ($)</option>
                <option value="INR">INR (₹)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="USDT">USDT</option>
              </select>

              {/* User Balance card */}
              <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800/80 py-1 px-3 md:py-1.5 md:px-4 rounded-lg md:rounded-xl text-xs md:text-sm">
                <div className="hidden sm:flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-slate-300 font-semibold max-w-[85px] truncate">{user.email.split('@')[0]}</span>
                </div>
                <div className="flex items-center gap-1.5 sm:border-l sm:border-slate-800 sm:pl-3">
                  <Wallet className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="text-emerald-400 font-bold">{formatCurrency(convertVal(wallet.balance))}</span>
                </div>
              </div>

              {/* Deposit/Withdraw Buttons - hidden on very small mobile, shown on tablet/desktop */}
              <button 
                onClick={() => setDepositModalOpen(true)}
                className="hidden sm:block py-1.5 px-3 text-xs bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-900/30 text-emerald-400 font-bold rounded-lg transition-all cursor-pointer"
              >
                Deposit
              </button>

              <button 
                onClick={() => setWithdrawModalOpen(true)}
                className="hidden sm:block py-1.5 px-3 text-xs bg-red-950/20 hover:bg-red-900/20 border border-red-900/20 hover:border-red-800/40 text-red-450 font-bold rounded-lg transition-all cursor-pointer shadow-sm"
              >
                Withdraw
              </button>

              {/* Mobile Actions Container */}
              <div className="flex items-center gap-1.5">
                {user.role === 'ADMIN' && (
                  <a 
                    href="/admin"
                    className="p-1.5 md:py-2 md:px-3 text-xs bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-900/30 text-indigo-400 font-bold rounded-lg transition-all"
                  >
                    <Shield className="w-3.5 h-3.5" />
                  </a>
                )}
                <button 
                  onClick={handleLogout}
                  className="hidden md:block p-1.5 md:py-2 md:px-3 text-xs font-semibold bg-red-950/20 hover:bg-red-900/20 border border-red-900/20 hover:border-red-800/40 text-red-400 rounded-lg transition-all cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* Auth Gate Panel */}
      {!token && (
        <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black overflow-y-auto">
          <div className="w-full max-w-md bg-slate-900/40 border border-slate-900/90 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-500 to-transparent"></div>
            
            <div className="text-center mb-8">
              <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
                Predict Gold & Silver Rates
              </h2>
              <p className="text-xs text-slate-400 mt-2 font-medium">
                {isRegistering ? 'Sign up to start betting on real-time rate timers' : 'Access the live binary trading platform'}
              </p>
            </div>

            {authError && (
              <div className="mb-5 p-3.5 bg-red-950/30 border border-red-900/40 text-red-400 text-xs rounded-xl text-center font-semibold">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
                <input 
                  type="email" 
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-yellow-500 text-white placeholder-slate-700 transition-all font-semibold"
                  placeholder="email@example.com"
                  required
                />
              </div>

              {isRegistering && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Mobile Number</label>
                  <input 
                    type="tel" 
                    value={authPhone}
                    onChange={(e) => setAuthPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-yellow-500 text-white placeholder-slate-700 transition-all font-semibold"
                    placeholder="+91 99999 99999"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Password</label>
                <input 
                  type="password" 
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-yellow-500 text-white placeholder-slate-700 transition-all font-semibold"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button 
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-slate-950 font-black rounded-xl shadow-lg shadow-yellow-500/10 hover:shadow-yellow-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                {isRegistering ? 'Create Account' : 'Connect to Live Terminal'}
                <ArrowRight className="w-4 h-4 text-slate-950 stroke-[3]" />
              </button>
            </form>

            <div className="mt-8 text-center border-t border-slate-950 pt-5">
              <button 
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-xs text-slate-400 hover:text-yellow-500 font-bold transition-colors cursor-pointer"
              >
                {isRegistering ? 'Already have an account? Login' : "New to the platform? Register"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Main Terminal Dashboard */}
      {token && (
        <>
          <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-4 p-2 md:p-4 max-w-[1700px] mx-auto w-full overflow-hidden lg:h-full lg:grid-rows-[1.6fr_1fr]">
          
          {/* COLUMN 1: Asset Selector List (Width: 3/12) - Hidden on Mobile, shown on Desktop */}
          <div className="hidden lg:flex lg:col-span-3 lg:row-span-2 flex-col gap-3 bg-slate-900/30 border border-slate-900/70 rounded-2xl p-4 lg:h-full overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-yellow-500" />
                Commodity Markets
              </h3>
              <button onClick={loadCatalog} className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-500 hover:text-slate-300 transition-all cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* List */}
            <div className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1">
              {commodities.map((item) => {
                const base = parseFloat(item.daily_base_price);
                const last = parseFloat(item.last_price);
                const chg = ((last - base) / base) * 100;
                const isPositive = chg >= 0;

                const tickDirection = tickingStates[item.id];
                const blinkClass = tickDirection === 'UP' 
                  ? 'bg-emerald-950/20 border-emerald-500/50 shadow shadow-emerald-950/50' 
                  : tickDirection === 'DOWN' 
                    ? 'bg-red-950/20 border-red-500/50 shadow shadow-red-950/50' 
                    : 'bg-slate-950/50 border-slate-900 hover:border-slate-800';

                return (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer border transition-all ${
                      selectedItemId === item.id 
                        ? 'bg-gradient-to-r from-slate-900/60 to-slate-900/30 border-yellow-500/40 shadow-md shadow-slate-950' 
                        : blinkClass
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 overflow-hidden border border-slate-800 flex items-center justify-center font-bold text-lg text-yellow-500 shadow-inner">
                        {item.id === 1 ? 'Au' : 'Ag'}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white tracking-wide">{item.name.split(' ')[0]}</h4>
                        <span className="text-[9px] text-slate-500 font-semibold tracking-wider">{item.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black tracking-wide text-white">
                        {formatCurrency(convertVal(last))} <span className="text-[9px] text-slate-500 font-normal">/ oz</span>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        isPositive ? 'text-emerald-400 bg-emerald-950/25 border border-emerald-900/30' : 'text-red-400 bg-red-950/25 border border-red-900/30'
                      }`}>
                        {isPositive ? '+' : ''}{chg.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* User Statistics Overview Summary Card */}
            <div className="bg-slate-950/70 border border-slate-900/80 rounded-xl p-3.5 flex flex-col gap-2.5">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-yellow-500" />
                Your Betting Stats
              </h4>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-900">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold">Total Bets</span>
                  <span className="text-xs font-black text-white">{userStats.total_predictions}</span>
                </div>
                <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-900">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold">Win / Loss</span>
                  <span className="text-xs font-black text-emerald-400">
                    {userStats.won_predictions} <span className="text-slate-500">/</span> {userStats.lost_predictions}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-xs">
                <span className="text-slate-400 font-semibold">Net Profit:</span>
                <span className={`font-black tracking-wide ${userStats.total_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {userStats.total_profit >= 0 ? '+' : ''}{formatCurrency(convertVal(userStats.total_profit))}
                </span>
              </div>
            </div>
          </div>

          {/* COLUMN 2: Candlestick Chart Area (Row 1 Middle) */}
          <div className={`col-span-12 lg:col-span-6 bg-slate-900/30 border border-slate-900/70 rounded-2xl p-3 md:p-4 flex flex-col h-[32vh] lg:h-full relative overflow-hidden ${mobileTab === 'trade' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 border-b border-slate-900/60 pb-3">
              <div className="flex items-center gap-3 justify-between sm:justify-start w-full sm:w-auto">
                {selectedItem ? (
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs md:text-sm font-black text-white tracking-wide">{selectedItem.name}</h2>
                    <span className="text-[10px] text-slate-400 font-semibold bg-slate-950 border border-slate-850 px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Clock className="w-3 h-3 text-yellow-500" />
                      1m
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Loading details...</div>
                )}

                {/* Mobile Quick Asset Selector Tab Pills */}
                <div className="flex lg:hidden items-center gap-1 bg-slate-950/80 p-0.5 border border-slate-900 rounded-lg">
                  {commodities.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedItemId(item.id)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer ${
                        selectedItemId === item.id
                          ? 'bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {item.id === 1 ? 'Gold' : 'Silver'}
                    </button>
                  ))}
                </div>
              </div>
              
              {selectedItem && (
                <div className="flex items-center gap-3 text-xs font-bold justify-between sm:justify-end w-full sm:w-auto">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold">Base: </span>
                    <span className="text-slate-350 font-semibold font-mono">{formatCurrency(convertVal(selectedItem.daily_base_price))}</span>
                  </div>
                  <div className="border-l border-slate-850 h-3"></div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[10px] uppercase font-bold">Live Spot: </span>
                    <span className="text-yellow-500 font-extrabold tracking-wide text-sm font-mono animate-pulse bg-yellow-500/5 border border-yellow-500/10 px-2 py-0.5 rounded">
                      {formatCurrency(convertVal(curPrice))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Chart container */}
            <div ref={chartContainerRef} className="w-full flex-1 min-h-0"></div>
          </div>

          {/* COLUMN 3: Prediction Console Betting Panel (Row 1-2 Right) */}
          <div className={`col-span-12 lg:col-span-3 bg-slate-900/30 border border-slate-900/70 rounded-2xl p-3 md:p-5 flex flex-col lg:h-full lg:row-span-2 overflow-y-auto lg:overflow-hidden ${mobileTab === 'trade' ? 'flex flex-1 min-h-0' : 'hidden lg:flex'}`}>
            <div className="flex flex-col gap-2.5 md:gap-4 flex-1">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 hidden md:flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                Prediction Console
              </h3>

              {selectedItem ? (
                <div className="flex flex-col gap-2 md:gap-3.5 mt-1 md:mt-2 flex-1 justify-between">
                  <div className="flex flex-col gap-2 md:gap-3.5">
                    {/* Expiry Timeframe Selection */}
                    <div>
                      <span className="block text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        1. Speculate Duration
                      </span>
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { label: '30s', val: 30 },
                          { label: '1m', val: 60 },
                          { label: '2m', val: 120 },
                          { label: '5m', val: 300 }
                        ].map((d) => (
                          <button
                            key={d.val}
                            type="button"
                            onClick={() => setBetDuration(d.val)}
                            className={`py-1.5 md:py-2 px-1 rounded-lg border font-bold text-xs transition-all cursor-pointer ${
                              betDuration === d.val
                                ? 'bg-yellow-500 text-slate-950 border-yellow-400 font-extrabold shadow-sm'
                                : 'bg-slate-950 border-slate-900 text-slate-400 hover:bg-slate-900'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Bet Amount Input with Preset Pill Buttons */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="block text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          2. Bet Amount
                        </span>
                        <span className="text-[9px] md:text-[10px] text-slate-500 font-bold">
                          Avail: {formatCurrency(convertVal(wallet.balance))}
                        </span>
                      </div>
                      <div className="relative mb-1.5">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">{selectedCurrency}</span>
                        <input
                          type="number"
                          value={betAmount}
                          onChange={(e) => setBetAmount(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-900 hover:border-slate-800 focus:border-yellow-500 focus:outline-none rounded-xl py-2 md:py-2.5 pl-12 pr-4 font-black font-mono text-white text-xs md:text-sm transition-all"
                          placeholder="Amount"
                          required
                          min="1"
                        />
                      </div>
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {['10', '50', '100', '250', '500'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setBetAmount(preset)}
                            className="py-1.5 px-3 rounded-lg bg-slate-950 border border-slate-900/60 hover:bg-slate-900 text-slate-400 hover:text-white font-extrabold text-[10px] transition-all cursor-pointer whitespace-nowrap"
                          >
                            +{preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Payout Info Summary & Instant Action CTA Placement Buttons */}
                  <div className="flex flex-col gap-2 md:gap-3 border-t border-slate-950 pt-2 md:pt-3">
                    <div className="flex items-center justify-between bg-slate-950/40 border border-slate-900/50 rounded-xl px-3 py-2 text-[9px] md:text-[10px] font-bold text-slate-400">
                      <span>Payout Rate: <span className="text-emerald-450">85% (1.85x)</span></span>
                      <span className="border-l border-slate-900 h-3"></span>
                      <span>Profit on win: <span className="text-emerald-400 font-mono">+{formatCurrency(parseFloat(betAmount || '0') * 0.85)}</span></span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlacePrediction('UP')}
                        disabled={!token || wallet.balance < (parseFloat(betAmount || '0') / (exchangeRates[selectedCurrency] || 1.0))}
                        className={`py-2.5 md:py-3.5 px-3 md:px-4 rounded-xl border font-black uppercase text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ${
                          !token || wallet.balance < (parseFloat(betAmount || '0') / (exchangeRates[selectedCurrency] || 1.0))
                            ? 'bg-emerald-500/20 border-emerald-500/25 text-emerald-500/60 cursor-not-allowed shadow-none'
                            : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 border-emerald-400 shadow-emerald-500/10'
                        }`}
                      >
                        <TrendingUp className="w-4 h-4 stroke-[3]" />
                        Up (Call)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePlacePrediction('DOWN')}
                        disabled={!token || wallet.balance < (parseFloat(betAmount || '0') / (exchangeRates[selectedCurrency] || 1.0))}
                        className={`py-2.5 md:py-3.5 px-3 md:px-4 rounded-xl border font-black uppercase text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ${
                          !token || wallet.balance < (parseFloat(betAmount || '0') / (exchangeRates[selectedCurrency] || 1.0))
                            ? 'bg-red-500/20 border-red-500/25 text-red-500/60 cursor-not-allowed shadow-none'
                            : 'bg-red-500 text-slate-950 hover:bg-red-400 border-red-400 shadow-red-500/10'
                        }`}
                      >
                        <TrendingDown className="w-4 h-4 stroke-[3]" />
                        Down (Put)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs py-8">
                  Loading prediction engine inputs...
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 4: Bottom Tabs Panel (Row 2 Middle) */}
          <div className={`col-span-12 lg:col-span-6 bg-slate-900/30 border border-slate-900/70 rounded-2xl p-4 flex flex-col lg:h-full overflow-hidden ${mobileTab === 'history' ? 'flex flex-1 h-full' : 'hidden lg:flex'}`}>
            {/* Tab Header */}
            <div className="flex items-center gap-2 border-b border-slate-900/80 pb-2 overflow-x-auto whitespace-nowrap scrollbar-none">
              <button 
                onClick={() => setActiveTab('active')}
                className={`text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'active' 
                    ? 'bg-yellow-500 text-slate-950 shadow-md shadow-yellow-500/5' 
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                Live Countdown ({activePredictions.length})
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'history' 
                    ? 'bg-yellow-500 text-slate-950 shadow-md shadow-yellow-500/5' 
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                Resolved Logs ({resolvedPredictions.length})
              </button>
              <button 
                onClick={() => setActiveTab('transactions')}
                className={`text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'transactions' 
                    ? 'bg-yellow-500 text-slate-950 shadow-md shadow-yellow-500/5' 
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                Wallet Statements
              </button>
              <button 
                onClick={() => setActiveTab('deposits')}
                className={`text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'deposits' 
                    ? 'bg-yellow-500 text-slate-950 shadow-md shadow-yellow-500/5' 
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                Deposits ({depositRequestsList.length})
              </button>
              <button 
                onClick={() => setActiveTab('withdrawals')}
                className={`text-[10px] uppercase font-bold tracking-widest px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'withdrawals' 
                    ? 'bg-yellow-500 text-slate-950 shadow-md shadow-yellow-500/5' 
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                Withdrawals ({withdrawalRequestsList.length})
              </button>
            </div>

            {/* Tab Content Body */}
            <div className="flex-1 overflow-y-auto pt-3 scrollbar-none">
              {activeTab === 'active' && (
                <div className="space-y-2">
                  {activePredictions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-xs py-8">
                      <Clock className="w-5 h-5 opacity-40 text-yellow-500" />
                      No active predictions. Speculate gold or silver above!
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500 font-bold border-b border-slate-900 pb-2">
                          <th className="pb-2">Asset</th>
                          <th className="pb-2">Direction</th>
                          <th className="pb-2">Bet Value</th>
                          <th className="pb-2">Entry Price</th>
                          <th className="pb-2">Live Price</th>
                          <th className="pb-2">Countdown</th>
                          <th className="pb-2 text-right">Potential Payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePredictions.map((p) => {
                          const rate = p.item_id === 1 ? goldItemPrice() : silverItemPrice();
                          const isWin = p.direction === 'UP' ? rate > parseFloat(p.start_price) : rate < parseFloat(p.start_price);
                          const isDraw = rate === parseFloat(p.start_price);
                          const statusColor = isDraw ? 'text-slate-400' : (isWin ? 'text-emerald-400' : 'text-red-400');

                          function goldItemPrice() {
                            const gold = commodities.find(c => c.id === 1);
                            return gold ? parseFloat(gold.last_price) : 0;
                          }
                          function silverItemPrice() {
                            const silver = commodities.find(c => c.id === 2);
                            return silver ? parseFloat(silver.last_price) : 0;
                          }

                          return (
                            <tr key={p.id} className="border-b border-slate-950/40 py-2.5 font-medium">
                              <td className="py-2.5 text-white font-bold">{p.name}</td>
                              <td className="py-2.5">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  p.direction === 'UP' 
                                    ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30' 
                                    : 'text-red-400 bg-red-950/20 border-red-900/30'
                                }`}>
                                  {p.direction === 'UP' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                  {p.direction}
                                </span>
                              </td>
                              <td className="py-2.5 font-bold text-slate-300">{formatCurrency(convertVal(p.amount))}</td>
                              <td className="py-2.5 text-slate-400">{formatCurrency(convertVal(p.start_price))}</td>
                              <td className={`py-2.5 font-extrabold font-mono ${statusColor}`}>
                                {formatCurrency(convertVal(rate))}
                              </td>
                              <td className="py-2.5 text-yellow-500 font-bold flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
                                {getRemainingTime(p.expires_at)}
                              </td>
                              <td className="py-2.5 text-right font-black text-emerald-400 font-mono">
                                {formatCurrency(convertVal(parseFloat(p.amount) * (1 + parseFloat(p.payout_rate))))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-2">
                  {resolvedPredictions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-xs py-8">
                      <Award className="w-5 h-5 opacity-40 text-yellow-500" />
                      No resolved bets in your statement logs.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500 font-bold border-b border-slate-900 pb-2">
                          <th className="pb-2">Asset</th>
                          <th className="pb-2">Direction</th>
                          <th className="pb-2">Bet Amount</th>
                          <th className="pb-2">Entry Rate</th>
                          <th className="pb-2">Exit Rate</th>
                          <th className="pb-2">Outcome</th>
                          <th className="pb-2 text-right">Profit / Loss</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resolvedPredictions.map((p) => {
                          const isWin = p.status === 'WON';
                          const isLoss = p.status === 'LOST';
                          const winProfit = parseFloat(p.amount) * parseFloat(p.payout_rate);

                          return (
                            <tr key={p.id} className="border-b border-slate-950/40 py-2 font-medium">
                              <td className="py-2 text-white font-bold">{p.name}</td>
                              <td className="py-2">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                  p.direction === 'UP' 
                                    ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30' 
                                    : 'text-red-400 bg-red-950/20 border-red-900/30'
                                }`}>
                                  {p.direction === 'UP' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                  {p.direction}
                                </span>
                              </td>
                              <td className="py-2 text-slate-300">{formatCurrency(convertVal(p.amount))}</td>
                              <td className="py-2 text-slate-400">{formatCurrency(convertVal(p.start_price))}</td>
                              <td className="py-2 text-slate-300 font-mono">{p.end_price ? formatCurrency(convertVal(p.end_price)) : '-'}</td>
                              <td className="py-2">
                                <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase border ${
                                  isWin 
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                                    : isLoss 
                                      ? 'bg-red-950 text-red-400 border-red-900' 
                                      : 'bg-slate-950 text-slate-400 border-slate-800'
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                              <td className={`py-2 text-right font-black font-mono ${isWin ? 'text-emerald-400' : (isLoss ? 'text-red-400' : 'text-slate-400')}`}>
                                {isWin ? `+${formatCurrency(convertVal(winProfit))}` : (isLoss ? `-${formatCurrency(convertVal(p.amount))}` : '$0.00')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'transactions' && (
                <div className="space-y-2">
                  {transactions.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-xs py-8">
                      <Wallet className="w-5 h-5 opacity-40 text-yellow-500" />
                      No transactions registered to your wallet yet.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500 font-bold border-b border-slate-900 pb-2">
                          <th className="pb-2">Tx ID</th>
                          <th className="pb-2">Type</th>
                          <th className="pb-2">Details / Ref</th>
                          <th className="pb-2">Timestamp</th>
                          <th className="pb-2 text-right">Ledger Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => {
                          const val = parseFloat(tx.amount);
                          const isPositive = val >= 0;

                          return (
                            <tr key={tx.id} className="border-b border-slate-950/40 py-2 font-medium">
                              <td className="py-2 text-slate-500 font-mono">{tx.id}</td>
                              <td className="py-2">
                                <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase border ${
                                  tx.type === 'DEPOSIT' || tx.type === 'PRED_WIN' || tx.type === 'MANUAL_CREDIT'
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                                    : 'bg-red-950 text-red-400 border-red-900'
                                }`}>
                                  {tx.type}
                                </span>
                              </td>
                              <td className="py-2 text-slate-400 font-semibold">{tx.reference_id}</td>
                              <td className="py-2 text-slate-500">{new Date(tx.created_at).toLocaleString()}</td>
                              <td className={`py-2 text-right font-black font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isPositive ? '+' : ''}{formatCurrency(convertVal(val))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'deposits' && (
                <div className="space-y-2">
                  {depositRequestsList.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-xs py-8">
                      <Wallet className="w-5 h-5 opacity-40 text-emerald-400" />
                      No deposit requests submitted yet.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500 font-bold border-b border-slate-900 pb-2">
                          <th className="pb-2">Request ID</th>
                          <th className="pb-2">Amount</th>
                          <th className="pb-2">Method</th>
                          <th className="pb-2">Ref ID</th>
                          <th className="pb-2">Created At</th>
                          <th className="pb-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {depositRequestsList.map((r) => {
                          const dateStr = new Date(r.created_at).toLocaleString();
                          const symbols: any = { USD: '$', INR: '₹', EUR: '€', GBP: '£', USDT: '₮' };
                          const sym = symbols[r.currency] || '';
                          const formattedAmt = r.currency === 'BTC' || r.currency === 'ETH' ? `${r.amount} ${r.currency}` : `${sym}${r.amount.toFixed(2)}`;

                          return (
                            <tr key={r.id} className="border-b border-slate-950/40 py-2 font-medium">
                              <td className="py-2 text-slate-500 font-mono">{r.id}</td>
                              <td className="py-2 text-white font-bold">{formattedAmt}</td>
                              <td className="py-2 text-slate-400">{r.payment_method}</td>
                              <td className="py-2 text-slate-400 font-mono">{r.reference_id}</td>
                              <td className="py-2 text-slate-500">{dateStr}</td>
                              <td className="py-2 text-right">
                                <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase border ${
                                  r.status === 'APPROVED' 
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                                    : r.status === 'REJECTED' 
                                      ? 'bg-red-950 text-red-400 border-red-900' 
                                      : 'bg-yellow-950 text-yellow-400 border-yellow-900'
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'withdrawals' && (
                <div className="space-y-2">
                  {withdrawalRequestsList.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500 text-xs py-8">
                      <Wallet className="w-5 h-5 opacity-40 text-red-400" />
                      No withdrawal requests submitted yet.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-slate-500 font-bold border-b border-slate-900 pb-2">
                          <th className="pb-2">Request ID</th>
                          <th className="pb-2">Amount Requested</th>
                          <th className="pb-2">Method</th>
                          <th className="pb-2">Details</th>
                          <th className="pb-2">Created At</th>
                          <th className="pb-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {withdrawalRequestsList.map((r) => {
                          const dateStr = new Date(r.created_at).toLocaleString();
                          const rate = exchangeRates[r.currency] || 1.0;
                          const amountLocal = r.amount * rate;
                          const symbols: any = { USD: '$', INR: '₹', EUR: '€', GBP: '£', USDT: '₮' };
                          const sym = symbols[r.currency] || '';
                          const formattedAmt = r.currency === 'BTC' || r.currency === 'ETH' ? `${amountLocal.toFixed(6)} ${r.currency}` : `${sym}${amountLocal.toFixed(2)}`;

                          return (
                            <tr key={r.id} className="border-b border-slate-950/40 py-2 font-medium">
                              <td className="py-2 text-slate-500 font-mono">{r.id}</td>
                              <td className="py-2 text-white font-bold">{formattedAmt}</td>
                              <td className="py-2 text-slate-400">{r.payment_method}</td>
                              <td className="py-2 text-slate-450 truncate max-w-[150px]">{r.payment_details}</td>
                              <td className="py-2 text-slate-500">{dateStr}</td>
                              <td className="py-2 text-right">
                                <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase border ${
                                  r.status === 'APPROVED' 
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                                    : r.status === 'REJECTED' 
                                      ? 'bg-red-950 text-red-400 border-red-900' 
                                      : 'bg-yellow-950 text-yellow-400 border-yellow-900'
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* MOBILE-ONLY WALLET PANEL */}
          {mobileTab === 'wallet' && (
            <div className="lg:hidden col-span-12 bg-slate-900/30 border border-slate-900/70 rounded-2xl p-4 flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-yellow-500" />
                  Account & Wallet
                </h3>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded-full">
                  Active Session
                </span>
              </div>

              {/* Balance card */}
              <div className="bg-slate-950/60 border border-slate-850 p-5 rounded-2xl flex flex-col gap-3">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">Available Balance</span>
                  <span className="text-3xl font-black text-white tracking-wide mt-1 block">
                    {formatCurrency(convertVal(wallet.balance))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <button
                    onClick={() => setDepositModalOpen(true)}
                    className="py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-center cursor-pointer transition-all shadow-md text-xs uppercase"
                  >
                    Deposit
                  </button>
                  <button
                    onClick={() => setWithdrawModalOpen(true)}
                    className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl text-center cursor-pointer transition-all border border-slate-700 text-xs uppercase"
                  >
                    Withdraw
                  </button>
                </div>
              </div>

              {/* Currency Selector */}
              <div className="bg-slate-950/30 border border-slate-900 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider">Trading Currency</span>
                  <span className="text-xs text-slate-300 font-medium mt-0.5 block">Select display currency</span>
                </div>
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-xs text-slate-300 py-2 px-4 rounded-xl font-bold focus:outline-none focus:border-yellow-500 cursor-pointer"
                >
                  <option value="USD">USD ($)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>

              {/* User Statistics Overview Summary Card */}
              <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4 flex flex-col gap-3">
                <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-yellow-500" />
                  Your Betting Stats
                </h4>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-900">
                    <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold">Total Bets</span>
                    <span className="text-xs font-black text-white">{userStats.total_predictions}</span>
                  </div>
                  <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-900">
                    <span className="block text-[8px] uppercase tracking-wider text-slate-500 font-bold">Win / Loss</span>
                    <span className="text-xs font-black text-emerald-400">
                      {userStats.won_predictions} <span className="text-slate-500">/</span> {userStats.lost_predictions}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-xs">
                  <span className="text-slate-400 font-semibold">Net Profit:</span>
                  <span className={`font-black tracking-wide ${userStats.total_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {userStats.total_profit >= 0 ? '+' : ''}{formatCurrency(convertVal(userStats.total_profit))}
                  </span>
                </div>
              </div>

              {/* Wallet Statement table */}
              <div className="bg-slate-950/30 border border-slate-900 rounded-xl p-4 flex flex-col gap-3">
                <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                  Statement History
                </h4>
                {transactions.length === 0 ? (
                  <div className="text-center text-slate-500 text-xs py-4">
                    No transactions registered.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactions.slice(0, 5).map((tx) => {
                      const val = parseFloat(tx.amount);
                      const isPositive = val >= 0;
                      return (
                        <div key={tx.id} className="flex justify-between items-center text-xs py-1 border-b border-slate-900/40">
                          <div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase mr-2 ${
                              tx.type === 'DEPOSIT' || tx.type === 'PRED_WIN' || tx.type === 'MANUAL_CREDIT'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                                : 'bg-red-950 text-red-400 border-red-900'
                            }`}>
                              {tx.type}
                            </span>
                            <span className="text-slate-400 font-mono text-[10px]">{tx.id.substring(0, 8)}</span>
                          </div>
                          <span className={`font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPositive ? '+' : ''}{formatCurrency(convertVal(val))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full py-3.5 bg-red-950/20 hover:bg-red-900/20 border border-red-900/20 text-red-400 font-bold rounded-xl text-center text-xs uppercase cursor-pointer"
              >
                Logout
              </button>
            </div>
          )}

        </div>

        {/* Mobile Bottom Navigation Bar */}
        <div className="lg:hidden bg-slate-950/95 backdrop-blur-md border-t border-slate-900 flex items-center justify-around py-3 px-4 shadow-2xl relative z-45">
          <button
            onClick={() => setMobileTab('trade')}
            className={`flex flex-col items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              mobileTab === 'trade' ? 'text-yellow-500' : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <Activity className="w-5 h-5" />
            Trade
          </button>
          <button
            onClick={() => setMobileTab('history')}
            className={`flex flex-col items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              mobileTab === 'history' ? 'text-yellow-500' : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <Clock className="w-5 h-5" />
            History
          </button>
          <button
            onClick={() => setMobileTab('wallet')}
            className={`flex flex-col items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              mobileTab === 'wallet' ? 'text-yellow-500' : 'text-slate-500 hover:text-slate-350'
            }`}
          >
            <Wallet className="w-5 h-5" />
            Wallet
          </button>
        </div>
      </>
    )}

      {/* RESOLUTION POPUP MODAL (CONGRATULATIONS / LOSS REPORT) */}
      {resolutionModal && resolutionModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative text-center overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-yellow-500 to-transparent"></div>
            
            <button 
              onClick={() => setResolutionModal(null)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-4">
              {resolutionModal.status === 'WON' ? (
                <div className="p-4 bg-emerald-950 border border-emerald-900/50 rounded-2xl text-emerald-400 shadow-lg shadow-emerald-500/10 animate-bounce">
                  <Award className="w-8 h-8 stroke-[2.5]" />
                </div>
              ) : resolutionModal.status === 'LOST' ? (
                <div className="p-4 bg-red-950 border border-red-900/50 rounded-2xl text-red-400 shadow-lg shadow-red-500/10">
                  <AlertTriangle className="w-8 h-8 stroke-[2.5]" />
                </div>
              ) : (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400">
                  <HelpCircle className="w-8 h-8" />
                </div>
              )}
            </div>

            {/* Title */}
            <h3 className="text-lg font-black tracking-tight text-white uppercase mb-1">
              {resolutionModal.status === 'WON' ? 'Bet Won!' : (resolutionModal.status === 'LOST' ? 'Bet Lost' : 'Draw')}
            </h3>
            <p className="text-xs text-slate-400 font-semibold mb-4">
              Prediction on {resolutionModal.itemName}
            </p>

            {/* Rates comparison sheet */}
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 mb-4 grid grid-cols-2 gap-4 text-left">
              <div>
                <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-500">Entry price</span>
                <span className="text-sm font-black font-mono text-white">{formatCurrency(convertVal(resolutionModal.startRate))}</span>
              </div>
              <div>
                <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-500">Exit price</span>
                <span className="text-sm font-black font-mono text-white">{formatCurrency(convertVal(resolutionModal.endRate))}</span>
              </div>
              <div className="col-span-2 border-t border-slate-900/60 pt-3 flex items-center justify-between text-xs font-bold text-slate-400">
                <span>Prediction Side:</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                  resolutionModal.direction === 'UP'
                    ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/25'
                    : 'text-red-400 bg-red-950/20 border-red-900/25'
                }`}>
                  {resolutionModal.direction}
                </span>
              </div>
            </div>

            {/* P&L details */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900/80 mb-5 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-semibold">Ledger Settlement:</span>
              <span className={`text-md font-black font-mono ${
                resolutionModal.status === 'WON' ? 'text-emerald-400' : (resolutionModal.status === 'LOST' ? 'text-red-400' : 'text-slate-400')
              }`}>
                {resolutionModal.status === 'WON' 
                  ? `+${formatCurrency(convertVal(resolutionModal.profit))}` 
                  : (resolutionModal.status === 'LOST' ? `-${formatCurrency(convertVal(resolutionModal.amount))}` : '$0.00')}
              </span>
            </div>

            <button
              onClick={() => setResolutionModal(null)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl border border-slate-800/80 hover:border-slate-700 transition-all cursor-pointer text-xs uppercase tracking-wider"
            >
              Back to Console
            </button>
          </div>
        </div>
      )}

      {/* DEPOSIT MODAL */}
      {depositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <button 
              onClick={() => setDepositModalOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-850 rounded-lg text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-black tracking-tight text-white mb-1 uppercase">Deposit Funds</h3>
            <p className="text-xs text-slate-400 mb-4">Send payment to one of our payment channels below and submit the transaction reference.</p>
            
            <form onSubmit={handleDepositRequest} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Payment Method</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['UPI', 'BTC', 'ETH', 'USDT'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setDepositMethod(method)}
                      className={`py-2 px-1 rounded-xl border text-[11px] font-black tracking-wide text-center transition-all cursor-pointer ${
                        depositMethod === method
                          ? 'bg-yellow-500 text-slate-950 border-yellow-450'
                          : 'bg-slate-950 border-slate-900 text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* QR and Payment instructions details based on method selection */}
              <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 flex flex-col items-center gap-3">
                <div className="text-[10px] font-black uppercase text-slate-500 tracking-widest text-center">
                  Scan QR code to pay
                </div>
                
                {depositMethod === 'UPI' && (
                  <>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=${adminGateways.upi_id}&pn=KuberKhajana&cu=INR`)}`}
                      alt="UPI QR Code"
                      className="w-36 h-36 border-4 border-white rounded-lg shadow"
                    />
                    <div className="text-center">
                      <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">UPI Address</span>
                      <span className="text-xs font-mono font-bold text-slate-200 select-all">{adminGateways.upi_id}</span>
                    </div>
                  </>
                )}

                {depositMethod === 'BTC' && (
                  <>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(adminGateways.btc_address)}`}
                      alt="BTC QR Code"
                      className="w-36 h-36 border-4 border-white rounded-lg shadow"
                    />
                    <div className="text-center">
                      <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">BTC Address</span>
                      <span className="text-[10px] font-mono font-bold text-slate-200 select-all break-all">{adminGateways.btc_address}</span>
                    </div>
                  </>
                )}

                {depositMethod === 'ETH' && (
                  <>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(adminGateways.eth_address)}`}
                      alt="ETH QR Code"
                      className="w-36 h-36 border-4 border-white rounded-lg shadow"
                    />
                    <div className="text-center">
                      <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">ETH Address</span>
                      <span className="text-[10px] font-mono font-bold text-slate-200 select-all break-all">{adminGateways.eth_address}</span>
                    </div>
                  </>
                )}

                {depositMethod === 'USDT' && (
                  <>
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(adminGateways.eth_address)}`}
                      alt="USDT QR Code"
                      className="w-36 h-36 border-4 border-white rounded-lg shadow"
                    />
                    <div className="text-center">
                      <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">USDT ERC-20 Address</span>
                      <span className="text-[10px] font-mono font-bold text-slate-200 select-all break-all">{adminGateways.eth_address}</span>
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Deposit Amount ({selectedCurrency})</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl py-2.5 px-3 text-xs text-white font-bold transition-all focus:outline-none focus:border-yellow-500"
                  placeholder="Amount"
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Transaction ID / Reference ID</label>
                <input
                  type="text"
                  value={depositReference}
                  onChange={(e) => setDepositReference(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl py-2.5 px-3 text-xs text-white font-bold transition-all focus:outline-none focus:border-yellow-500"
                  placeholder="Reference number"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-emerald-500/10"
              >
                Submit Deposit Request
              </button>
            </form>
          </div>
        </div>
      )}

      {/* WITHDRAWAL MODAL */}
      {withdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <button 
              onClick={() => setWithdrawModalOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-850 rounded-lg text-slate-500 hover:text-slate-300 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-black tracking-tight text-white mb-1 uppercase">Withdraw Funds</h3>
            <p className="text-xs text-slate-400 mb-4">Request a payout from your wallet. Funds will be debited upon admin approval.</p>
            
            <form onSubmit={handleWithdrawalRequest} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Payout Method</label>
                <select
                  value={withdrawMethod}
                  onChange={(e: any) => setWithdrawMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-900 focus:border-yellow-500 focus:outline-none rounded-xl py-2.5 px-3 text-xs text-white font-bold transition-all"
                >
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="BTC">Bitcoin (BTC)</option>
                  <option value="ETH">Ethereum (ETH)</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Withdrawal Amount ({selectedCurrency})</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl py-2.5 px-3 text-xs text-white font-bold transition-all focus:outline-none focus:border-yellow-500"
                  placeholder="Amount"
                  required
                  min="1"
                />
                <span className="block text-[9px] text-slate-500 mt-1 font-bold">
                  Equivalent to USD: ${(parseFloat(withdrawAmount || '0') / (exchangeRates[selectedCurrency] || 1.0)).toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Payout Destination Details</label>
                <textarea
                  value={withdrawDetails}
                  onChange={(e) => setWithdrawDetails(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl py-2.5 px-3 text-xs text-white font-bold transition-all focus:outline-none focus:border-yellow-500 h-20"
                  placeholder={
                    withdrawMethod === 'UPI' 
                      ? 'Enter UPI ID (e.g. user@bank)' 
                      : withdrawMethod === 'BANK_TRANSFER' 
                        ? 'Enter Account Number, Bank Name, IFSC code' 
                        : 'Enter Crypto Wallet Address'
                  }
                  required
                />
              </div>

              <button
                type="submit"
                disabled={wallet.balance < (parseFloat(withdrawAmount || '0') / (exchangeRates[selectedCurrency] || 1.0))}
                className={`w-full py-3 font-black rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md ${
                  wallet.balance < (parseFloat(withdrawAmount || '0') / (exchangeRates[selectedCurrency] || 1.0))
                    ? 'bg-slate-950 border border-slate-900 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-red-500 text-slate-950 hover:bg-red-400 border-red-400'
                }`}
              >
                Submit Withdrawal Request
              </button>
            </form>
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
    </div>
  );
}
