import { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

console.log('[INFO] Database running in Commodity Rate Prediction (Binary Options) simulation mode.');

// Interfaces for our simulated database tables
export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  role: 'USER' | 'ADMIN' | 'TREASURY';
  created_at: Date;
  is_banned: boolean;
  mobile?: string;
}

export interface WalletRow {
  id: number;
  user_id: number;
  balance: number;
  locked_balance: number;
}

export interface ItemRow {
  id: number;
  name: string;
  description: string;
  image_url: string;
  category: string;
  daily_base_price: number;
  last_price: number;
  total_supply: number;
  remaining_supply: number;
  is_active: boolean;
}

export interface CandleRow {
  time: Date;
  item_id: number;
  resolution: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PredictionRow {
  id: string;
  user_id: number;
  item_id: number;
  direction: 'UP' | 'DOWN';
  amount: number;
  start_price: number;
  end_price: number | null;
  payout_rate: number;
  duration: number; // in seconds
  status: 'PENDING' | 'WON' | 'LOST' | 'DRAW';
  created_at: Date;
  expires_at: Date;
  payout_amount: number | null;
  override_status?: 'FORCE_WIN' | 'FORCE_LOSS' | null;
}

export interface TransactionRow {
  id: string;
  wallet_id: number;
  type: string;
  amount: number;
  reference_id: string;
  created_at: Date;
}

export interface AdminConfig {
  gold_trend: 'UP' | 'DOWN' | 'NEUTRAL';
  silver_trend: 'UP' | 'DOWN' | 'NEUTRAL';
  payout_rate: number; // e.g. 0.85 (85% profit on win)
  house_protection_win_rate: number; // e.g. 0.45 (limit user win rate to 45% using defensive ticks)
  gold_price_type: 'LIVE' | 'MANUAL';
  gold_manual_price: number;
  gold_price_offset: number;
  silver_price_type: 'LIVE' | 'MANUAL';
  silver_manual_price: number;
  silver_price_offset: number;
  min_bet_amount: number;
  max_bet_amount: number;
  min_deposit_amount: number;
  min_withdrawal_amount: number;
}

export interface AdminGateway {
  upi_id: string;
  btc_address: string;
  eth_address: string;
}

export interface DepositRequest {
  id: string;
  user_id: number;
  user_email: string;
  amount: number; // In user's selected currency
  currency: string;
  payment_method: 'UPI' | 'BTC' | 'ETH' | 'USDT';
  reference_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: Date;
}

export interface WithdrawalRequest {
  id: string;
  user_id: number;
  user_email: string;
  amount: number; // In user's selected currency
  currency: string;
  payment_method: 'UPI' | 'BANK_TRANSFER' | 'BTC' | 'ETH' | 'USDT';
  payment_details: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: Date;
}

// In-Memory Database Storage Lists (exported for background resolution loop)
export const users: UserRow[] = [];
export const wallets: WalletRow[] = [];
export const items: ItemRow[] = [];
export const candles: CandleRow[] = [];
export const predictions: PredictionRow[] = [];
export const transactions: TransactionRow[] = [];
export const depositRequests: DepositRequest[] = [];
export const withdrawalRequests: WithdrawalRequest[] = [];

export const adminGateways: AdminGateway = {
  upi_id: 'pay@kuberkhajana',
  btc_address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  eth_address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
};

export const exchangeRates: { [key: string]: number } = {
  USD: 1.0,
  INR: 83.5,
  EUR: 0.92,
  GBP: 0.78,
  BTC: 0.000015,
  ETH: 0.00028,
  USDT: 1.0,
};

// Global Admin Configuration
export const adminConfig: AdminConfig = {
  gold_trend: 'NEUTRAL',
  silver_trend: 'NEUTRAL',
  payout_rate: 0.85,
  house_protection_win_rate: 0.45,
  gold_price_type: 'LIVE',
  gold_manual_price: 2400.00,
  gold_price_offset: 0.00,
  silver_price_type: 'LIVE',
  silver_manual_price: 30.00,
  silver_price_offset: 0.00,
  min_bet_amount: 1.00,
  max_bet_amount: 10000.00,
  min_deposit_amount: 5.00,
  min_withdrawal_amount: 10.00,
};

// Global Nudges for manual trend controls (avoids circular dependency)
export const nudges = {
  goldNudge: 0,
  silverNudge: 0,
};

// Seed script to initialize the mock data
const initializeMockData = () => {
  const passwordHash = bcrypt.hashSync('password123', 10);

  // 1. Seed System Roles
  // Treasury (ID 1): Collects fees or platform balances
  users.push({ id: 1, email: 'treasury@trading.com', password_hash: passwordHash, role: 'TREASURY', created_at: new Date(), is_banned: false, mobile: 'System' });
  wallets.push({ id: 1, user_id: 1, balance: 100000.00, locked_balance: 0.00 });

  // Admin User (ID 2)
  users.push({ id: 2, email: 'admin@trading.com', password_hash: passwordHash, role: 'ADMIN', created_at: new Date(), is_banned: false, mobile: 'System' });
  wallets.push({ id: 2, user_id: 2, balance: 0.00, locked_balance: 0.00 });

  // 2. Seed Gold and Silver items
  // Gold (ID 1)
  items.push({
    id: 1,
    name: 'Gold (XAU/USD)',
    description: 'Gold spot rate prediction trading contracts. Speculate on real-time price movement over countdown timers.',
    image_url: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=400&q=80',
    category: 'Commodities',
    daily_base_price: 2350.00,
    last_price: 2350.00,
    total_supply: 0,
    remaining_supply: 0,
    is_active: true,
  });

  // Silver (ID 2)
  items.push({
    id: 2,
    name: 'Silver (XAG/USD)',
    description: 'Silver spot rate prediction trading contracts. Speculate on real-time price movement over countdown timers.',
    image_url: 'https://images.unsplash.com/photo-1618042164219-62c820f10723?w=400&q=80',
    category: 'Commodities',
    daily_base_price: 29.50,
    last_price: 29.50,
    total_supply: 0,
    remaining_supply: 0,
    is_active: true,
  });

  // 3. Seed historical candles (300 minutes of price history) for both Gold and Silver
  const now = new Date();
  
  // Gold Seeding
  let goldLastPrice = 2350.00;
  for (let c = 300; c >= 0; c--) {
    const time = new Date(now.getTime() - c * 60000);
    time.setSeconds(0, 0);

    const open = goldLastPrice;
    const drift = (Math.random() - 0.5) * 5.0; // Random walk drift
    const close = parseFloat((open + drift).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * 2.0).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * 2.0).toFixed(2));
    const volume = Math.floor(Math.random() * 100) + 50;

    candles.push({ time, item_id: 1, resolution: '1m', open, high, low, close, volume });
    goldLastPrice = close;
  }
  items[0].last_price = goldLastPrice;

  // Silver Seeding
  let silverLastPrice = 29.50;
  for (let c = 300; c >= 0; c--) {
    const time = new Date(now.getTime() - c * 60000);
    time.setSeconds(0, 0);

    const open = silverLastPrice;
    const drift = (Math.random() - 0.5) * 0.15; // Random walk drift
    const close = parseFloat((open + drift).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * 0.05).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * 0.05).toFixed(2));
    const volume = Math.floor(Math.random() * 500) + 100;

    candles.push({ time, item_id: 2, resolution: '1m', open, high, low, close, volume });
    silverLastPrice = close;
  }
  items[1].last_price = silverLastPrice;

  console.log(`[INFO] Seeded Gold/Silver commodities and ${candles.length} historical candles in memory.`);
};

// Reseed candles based on live gold and silver prices to prevent chart jump lines
export const reseedCandles = (goldStartPrice: number, silverStartPrice: number) => {
  // Clear existing candles
  candles.length = 0;

  const now = new Date();

  // Gold Seeding
  let goldLastPrice = goldStartPrice;
  const tempGoldCandles = [];
  for (let c = 0; c <= 300; c++) {
    const time = new Date(now.getTime() - c * 60000);
    time.setSeconds(0, 0);

    const close = goldLastPrice;
    const drift = (Math.random() - 0.5) * 1.5; // smaller drift for realistic candles
    const open = parseFloat((close - drift).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * 0.5).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * 0.5).toFixed(2));
    const volume = Math.floor(Math.random() * 100) + 50;

    tempGoldCandles.push({ time, item_id: 1, resolution: '1m', open, high, low, close, volume });
    goldLastPrice = open;
  }
  candles.push(...tempGoldCandles.reverse());
  
  // Update Gold item base and last prices
  if (items[0]) {
    items[0].daily_base_price = goldStartPrice;
    items[0].last_price = goldStartPrice;
  }

  // Silver Seeding
  let silverLastPrice = silverStartPrice;
  const tempSilverCandles = [];
  for (let c = 0; c <= 300; c++) {
    const time = new Date(now.getTime() - c * 60000);
    time.setSeconds(0, 0);

    const close = silverLastPrice;
    const drift = (Math.random() - 0.5) * 0.04;
    const open = parseFloat((close - drift).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * 0.02).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * 0.02).toFixed(2));
    const volume = Math.floor(Math.random() * 500) + 100;

    tempSilverCandles.push({ time, item_id: 2, resolution: '1m', open, high, low, close, volume });
    silverLastPrice = open;
  }
  candles.push(...tempSilverCandles.reverse());
  
  // Update Silver item base and last prices
  if (items[1]) {
    items[1].daily_base_price = silverStartPrice;
    items[1].last_price = silverStartPrice;
  }

  console.log(`[INFO] Reseeded Gold/Silver candles ending at Gold: $${goldStartPrice}, Silver: $${silverStartPrice}`);
};

// Seeding automatically on module import
initializeMockData();

// Mock Query Processor implementing SQL string parsing logic
export const query = async (text: string, params?: any[]): Promise<{ rows: any[] }> => {
  const cleanSql = text.replace(/\s+/g, ' ').trim();

  // Transaction control bypass
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(cleanSql)) {
    return { rows: [] };
  }

  // --- USER AUTHENTICATION QUERIES ---

  // Check email
  if (cleanSql.startsWith('SELECT id FROM users WHERE email = $1')) {
    const email = params?.[0];
    const user = users.find(u => u.email === email);
    return { rows: user ? [{ id: user.id }] : [] };
  }

  // Login
  if (cleanSql.startsWith('SELECT * FROM users WHERE email = $1')) {
    const email = params?.[0];
    const user = users.find(u => u.email === email);
    return { rows: user ? [user] : [] };
  }

  // Register
  if (cleanSql.startsWith("INSERT INTO users (email, password_hash, role, mobile) VALUES ($1, $2, 'USER', $3)")) {
    const email = params?.[0];
    const hash = params?.[1];
    const mobile = params?.[2];
    const newUser: UserRow = { id: users.length + 1, email, password_hash: hash, role: 'USER', created_at: new Date(), is_banned: false, mobile };
    users.push(newUser);
    return { rows: [newUser] };
  }

  // --- CATALOG & CHART TICK TIME SERIES ---

  // Load items catalog
  if (cleanSql.startsWith('SELECT id, name, description, image_url, category, daily_base_price, last_price, total_supply, remaining_supply, is_active FROM items')) {
    return { rows: items };
  }

  // Fetch single item
  if (cleanSql.includes('FROM items WHERE id = $1')) {
    const itemId = params?.[0];
    const item = items.find(i => i.id === itemId);
    return { rows: item ? [item] : [] };
  }

  // Fetch candle historical bars
  if (cleanSql.startsWith('SELECT time, open, high, low, close, volume FROM candles WHERE item_id = $1 AND resolution = $2 ORDER BY time ASC LIMIT 300')) {
    const itemId = params?.[0];
    const res = params?.[1];
    const result = candles
      .filter(c => c.item_id === itemId && c.resolution === res)
      .slice(-300);
    return { rows: result };
  }

  // --- WALLET & TRANSACTION HISTORY ---

  // Fetch wallet for update row lock
  if (cleanSql.includes('FROM wallets WHERE user_id = $1') && cleanSql.includes('FOR UPDATE')) {
    const userId = params?.[0];
    const wallet = wallets.find(w => w.user_id === userId);
    return { rows: wallet ? [wallet] : [] };
  }

  // Fetch user wallet
  if (cleanSql.includes('FROM wallets WHERE user_id = $1')) {
    const userId = params?.[0];
    const wallet = wallets.find(w => w.user_id === userId);
    return { rows: wallet ? [wallet] : [] };
  }

  // Insert wallet
  if (cleanSql.startsWith('INSERT INTO wallets (user_id, balance) VALUES ($1, $2)')) {
    const userId = params?.[0];
    const balance = params?.[1] || 0.00;
    const newWallet: WalletRow = { id: wallets.length + 1, user_id: userId, balance, locked_balance: 0.00 };
    wallets.push(newWallet);
    return { rows: [newWallet] };
  }

  // Update wallet balance directly
  if (cleanSql.startsWith('UPDATE wallets SET balance = $1') && cleanSql.includes('WHERE id = $2')) {
    const balance = params?.[0];
    const id = params?.[1];
    const wallet = wallets.find(w => w.id === id);
    if (wallet) {
      wallet.balance = parseFloat(balance);
    }
    return { rows: [] };
  }

  // Lock balance on placing bet
  if (cleanSql.startsWith('UPDATE wallets SET balance = balance - $1, locked_balance = locked_balance + $1 WHERE id = $2')) {
    const amount = params?.[0];
    const id = params?.[1];
    const wallet = wallets.find(w => w.id === id);
    if (wallet) {
      wallet.balance = parseFloat((wallet.balance - amount).toFixed(2));
      wallet.locked_balance = parseFloat((wallet.locked_balance + amount).toFixed(2));
    }
    return { rows: [] };
  }

  // Process manual deposits
  if (cleanSql.startsWith('UPDATE wallets SET balance = balance + $1 WHERE id = $2')) {
    const amount = params?.[0];
    const id = params?.[1];
    const wallet = wallets.find(w => w.id === id);
    if (wallet) {
      wallet.balance = parseFloat((wallet.balance + amount).toFixed(2));
    }
    return { rows: [] };
  }

  // Insert transaction double entry ledger logs
  if (cleanSql.startsWith('INSERT INTO transactions (wallet_id, type, amount, reference_id)')) {
    const walletId = params?.[0];
    const type = params?.[1];
    const amount = params?.[2];
    const refId = params?.[3];

    const newTx: TransactionRow = {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      wallet_id: walletId,
      type: type || 'DEPOSIT',
      amount: parseFloat(amount) || 0.00,
      reference_id: refId || '',
      created_at: new Date(),
    };
    transactions.push(newTx);
    return { rows: [newTx] };
  }

  // Fetch transaction records
  if (cleanSql.startsWith('SELECT t.id, t.type, t.amount, t.reference_id, t.created_at FROM transactions t')) {
    const userId = params?.[0];
    const wallet = wallets.find(w => w.user_id === userId);
    if (!wallet) return { rows: [] };
    const txList = transactions
      .filter(t => t.wallet_id === wallet.id)
      .map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount.toString(),
        reference_id: tx.reference_id,
        created_at: tx.created_at,
      }));
    return { rows: txList };
  }

  // --- PREDICTION BET ENGINE QUERIES ---

  // Insert Bet (Create prediction)
  if (cleanSql.startsWith('INSERT INTO predictions')) {
    // Expected fields: user_id, item_id, direction, amount, start_price, payout_rate, duration, expires_at, status
    const userId = params?.[0];
    const itemId = params?.[1];
    const direction = params?.[2];
    const amount = params?.[3];
    const startPrice = params?.[4];
    const payoutRate = params?.[5];
    const duration = params?.[6];
    const expiresAt = params?.[7];

    const newBet: PredictionRow = {
      id: `bet-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      user_id: userId,
      item_id: itemId,
      direction,
      amount: parseFloat(amount),
      start_price: parseFloat(startPrice),
      end_price: null,
      payout_rate: parseFloat(payoutRate),
      duration: parseInt(duration),
      status: 'PENDING',
      created_at: new Date(),
      expires_at: new Date(expiresAt),
      payout_amount: null,
    };
    predictions.push(newBet);
    return { rows: [newBet] };
  }

  // Get user prediction history
  if (cleanSql.startsWith('SELECT p.id, p.item_id, i.name, p.direction, p.amount, p.start_price, p.end_price, p.payout_rate, p.duration, p.status, p.created_at, p.expires_at, p.payout_amount FROM predictions p')) {
    const userId = params?.[0];
    const history = predictions
      .filter(p => p.user_id === userId)
      .map(p => {
        const item = items.find(i => i.id === p.item_id)!;
        return {
          id: p.id,
          item_id: p.item_id,
          name: item.name,
          direction: p.direction,
          amount: p.amount.toString(),
          start_price: p.start_price.toString(),
          end_price: p.end_price ? p.end_price.toString() : null,
          payout_rate: p.payout_rate.toString(),
          duration: p.duration,
          status: p.status,
          created_at: p.created_at,
          expires_at: p.expires_at,
          payout_amount: p.payout_amount ? p.payout_amount.toString() : null,
        };
      })
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return { rows: history };
  }

  // Resolve prediction updates in memory
  if (cleanSql.startsWith('UPDATE predictions SET status = $1, end_price = $2, payout_amount = $3 WHERE id = $4')) {
    const status = params?.[0];
    const endPrice = params?.[1];
    const payoutAmount = params?.[2];
    const id = params?.[3];
    const bet = predictions.find(p => p.id === id);
    if (bet) {
      bet.status = status;
      bet.end_price = endPrice !== null ? parseFloat(endPrice) : null;
      bet.payout_amount = payoutAmount !== null ? parseFloat(payoutAmount) : null;
    }
    return { rows: [] };
  }

  // Settle wallet balances based on prediction resolution
  // 1. Settle WIN: refund bet + payout profit, subtract from locked balance
  if (cleanSql.startsWith('UPDATE wallets SET balance = balance + $1, locked_balance = locked_balance - $2 WHERE user_id = $3')) {
    const payoutAmount = params?.[0]; // bet + profit
    const lockedAmount = params?.[1]; // original bet
    const userId = params?.[2];
    const wallet = wallets.find(w => w.user_id === userId);
    if (wallet) {
      wallet.balance = parseFloat((wallet.balance + payoutAmount).toFixed(2));
      wallet.locked_balance = parseFloat((wallet.locked_balance - lockedAmount).toFixed(2));
    }
    return { rows: [] };
  }

  // 2. Settle LOSS: deduct from locked balance only
  if (cleanSql.startsWith('UPDATE wallets SET locked_balance = locked_balance - $1 WHERE user_id = $2')) {
    const amount = params?.[0];
    const userId = params?.[1];
    const wallet = wallets.find(w => w.user_id === userId);
    if (wallet) {
      wallet.locked_balance = parseFloat((wallet.locked_balance - amount).toFixed(2));
    }
    return { rows: [] };
  }

  // 3. Settle DRAW/REFUND: refund original bet, subtract from locked balance
  if (cleanSql.startsWith('UPDATE wallets SET balance = balance + $1, locked_balance = locked_balance - $1 WHERE user_id = $2')) {
    const amount = params?.[0];
    const userId = params?.[1];
    const wallet = wallets.find(w => w.user_id === userId);
    if (wallet) {
      wallet.balance = parseFloat((wallet.balance + amount).toFixed(2));
      wallet.locked_balance = parseFloat((wallet.locked_balance - amount).toFixed(2));
    }
    return { rows: [] };
  }

  // --- ADMINISTRATIVE INTERPOLATIONS ---

  // Admin overview analytics
  if (cleanSql.includes("role = 'TREASURY'") && cleanSql.includes('wallets')) {
    // Treasury balance
    const treasury = wallets.find(w => w.user_id === 1);
    const balance = treasury ? treasury.balance : 0;
    return { rows: [{ balance: balance.toString() }] };
  }

  if (cleanSql === 'SELECT COUNT(*) FROM items WHERE is_active = TRUE') {
    // Always returns 2 active items (Gold & Silver)
    return { rows: [{ count: '2' }] };
  }

  if (cleanSql.startsWith('SELECT COUNT(*) FROM predictions')) {
    // Count active predictions
    if (cleanSql.includes("status = 'PENDING'")) {
      const activeCount = predictions.filter(p => p.status === 'PENDING').length;
      return { rows: [{ count: activeCount.toString() }] };
    }
    // Count resolved predictions
    const totalCount = predictions.length;
    return { rows: [{ count: totalCount.toString() }] };
  }

  if (cleanSql === "SELECT COUNT(*) FROM users WHERE role = 'USER'") {
    const totalUsers = users.filter(u => u.role === 'USER').length;
    return { rows: [{ count: totalUsers.toString() }] };
  }

  // Get active predictions for admin
  if (cleanSql.startsWith('SELECT p.id, p.user_id, u.email as user_email, p.item_id, i.name as item_name, p.direction, p.amount, p.start_price, p.expires_at, p.status FROM predictions p')) {
    const liveBets = predictions.map(p => {
      const u = users.find(usr => usr.id === p.user_id);
      const i = items.find(itm => itm.id === p.item_id);
      return {
        id: p.id,
        user_id: p.user_id,
        user_email: u ? u.email : '',
        item_id: p.item_id,
        item_name: i ? i.name : '',
        direction: p.direction,
        amount: p.amount.toString(),
        start_price: p.start_price.toString(),
        expires_at: p.expires_at,
        status: p.status,
      };
    });
    return { rows: liveBets };
  }

  // --- MULTI-CURRENCY, GATEWAYS, DEPOSITS, WITHDRAWALS & USER MANAGEMENT INTERCEPTORS ---

  // Fetch all users with balance
  if (cleanSql.startsWith('SELECT id, email, role, created_at FROM users')) {
    const list = users.map(u => {
      const w = wallets.find(wl => wl.user_id === u.id) || { balance: 0, locked_balance: 0 };
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        created_at: u.created_at,
        is_banned: u.is_banned,
        mobile: u.mobile,
        balance: w.balance.toString(),
        locked_balance: w.locked_balance.toString()
      };
    });
    return { rows: list };
  }

  // Fetch admin gateways
  if (cleanSql.includes('FROM admin_gateways')) {
    return { rows: [adminGateways] };
  }

  // Update admin gateways
  if (cleanSql.startsWith('UPDATE admin_gateways SET upi_id = $1')) {
    adminGateways.upi_id = params?.[0];
    adminGateways.btc_address = params?.[1];
    adminGateways.eth_address = params?.[2];
    return { rows: [] };
  }

  // Insert deposit request
  if (cleanSql.startsWith('INSERT INTO deposit_requests')) {
    const newReq: DepositRequest = {
      id: params?.[0],
      user_id: params?.[1],
      user_email: params?.[2],
      amount: parseFloat(params?.[3]),
      currency: params?.[4],
      payment_method: params?.[5],
      reference_id: params?.[6],
      status: 'PENDING',
      created_at: new Date(),
    };
    depositRequests.push(newReq);
    return { rows: [newReq] };
  }

  // Fetch deposit requests
  if (cleanSql.includes('FROM deposit_requests')) {
    // If it filters by user_id
    if (cleanSql.includes('user_id = $1')) {
      const userId = params?.[0];
      const list = depositRequests.filter(r => r.user_id === userId);
      return { rows: list };
    }
    return { rows: depositRequests };
  }

  // Update deposit request status
  if (cleanSql.startsWith('UPDATE deposit_requests SET status = $1 WHERE id = $2')) {
    const status = params?.[0];
    const id = params?.[1];
    const req = depositRequests.find(r => r.id === id);
    if (req) {
      req.status = status;
    }
    return { rows: [] };
  }

  // Insert withdrawal request
  if (cleanSql.startsWith('INSERT INTO withdrawal_requests')) {
    const newReq: WithdrawalRequest = {
      id: params?.[0],
      user_id: params?.[1],
      user_email: params?.[2],
      amount: parseFloat(params?.[3]),
      currency: params?.[4],
      payment_method: params?.[5],
      payment_details: params?.[6],
      status: 'PENDING',
      created_at: new Date(),
    };
    withdrawalRequests.push(newReq);
    return { rows: [newReq] };
  }

  // Fetch withdrawal requests
  if (cleanSql.includes('FROM withdrawal_requests')) {
    // If it filters by user_id
    if (cleanSql.includes('user_id = $1')) {
      const userId = params?.[0];
      const list = withdrawalRequests.filter(r => r.user_id === userId);
      return { rows: list };
    }
    return { rows: withdrawalRequests };
  }

  // Update withdrawal request status
  if (cleanSql.startsWith('UPDATE withdrawal_requests SET status = $1 WHERE id = $2')) {
    const status = params?.[0];
    const id = params?.[1];
    const req = withdrawalRequests.find(r => r.id === id);
    if (req) {
      req.status = status;
    }
    return { rows: [] };
  }

  // Update prediction override status
  if (cleanSql.startsWith('UPDATE predictions SET override_status = $1 WHERE id = $2')) {
    const overrideStatus = params?.[0];
    const id = params?.[1];
    const bet = predictions.find(p => p.id === id);
    if (bet) {
      bet.override_status = overrideStatus;
    }
    return { rows: [] };
  }

  // Fetch admin configs (simulated)
  if (cleanSql.startsWith('SELECT * FROM admin_config')) {
    return { rows: [adminConfig] };
  }

  // Update admin configs (simulated)
  if (cleanSql.startsWith('UPDATE admin_config')) {
    if (params && params.length >= 14) {
      adminConfig.gold_trend = params[0];
      adminConfig.silver_trend = params[1];
      adminConfig.payout_rate = parseFloat(params[2]);
      adminConfig.house_protection_win_rate = parseFloat(params[3]);
      adminConfig.gold_price_type = params[4];
      adminConfig.gold_manual_price = parseFloat(params[5]);
      adminConfig.gold_price_offset = parseFloat(params[6]);
      adminConfig.silver_price_type = params[7];
      adminConfig.silver_manual_price = parseFloat(params[8]);
      adminConfig.silver_price_offset = parseFloat(params[9]);
      adminConfig.min_bet_amount = parseFloat(params[10]);
      adminConfig.max_bet_amount = parseFloat(params[11]);
      adminConfig.min_deposit_amount = parseFloat(params[12]);
      adminConfig.min_withdrawal_amount = parseFloat(params[13]);
    } else if (params && params.length >= 10) {
      adminConfig.gold_trend = params[0];
      adminConfig.silver_trend = params[1];
      adminConfig.payout_rate = parseFloat(params[2]);
      adminConfig.house_protection_win_rate = parseFloat(params[3]);
      adminConfig.gold_price_type = params[4];
      adminConfig.gold_manual_price = parseFloat(params[5]);
      adminConfig.gold_price_offset = parseFloat(params[6]);
      adminConfig.silver_price_type = params[7];
      adminConfig.silver_manual_price = parseFloat(params[8]);
      adminConfig.silver_price_offset = parseFloat(params[9]);
    } else if (params && params.length >= 4) {
      adminConfig.gold_trend = params[0];
      adminConfig.silver_trend = params[1];
      adminConfig.payout_rate = parseFloat(params[2]);
      adminConfig.house_protection_win_rate = parseFloat(params[3]);
    }
    return { rows: [] };
  }

  console.log(`[SQL Sim Warning] Query fell through parsing interceptor: "${cleanSql}"`);
  return { rows: [] };
};

// Client connections mocking
class MockClient {
  async query(text: string, params?: any[]) {
    return query(text, params);
  }
  release() {}
}

export const getClient = async (): Promise<PoolClient> => {
  return new MockClient() as unknown as PoolClient;
};

export const checkDbConnection = async (): Promise<boolean> => {
  return true;
};

const pool = {
  query,
  connect: getClient,
};

export default pool;
