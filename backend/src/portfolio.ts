import { Router, Response } from 'express';
import pool, { predictions, adminGateways, exchangeRates, adminConfig } from './db';
import { authMiddleware, AuthenticatedRequest } from './auth';

const router = Router();

// Get Portfolio & Wallet statistics
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Get Wallet Balance
    const walletRes = await pool.query(
      'SELECT id, balance, locked_balance FROM wallets WHERE user_id = $1',
      [userId]
    );
    const wallet = walletRes.rows[0] || { balance: 0, locked_balance: 0 };

    // 2. Aggregate user prediction stats from memory list
    const userBets = predictions.filter(p => p.user_id === userId);
    const totalPredictions = userBets.length;
    const activePredictions = userBets.filter(p => p.status === 'PENDING').length;
    const wonPredictions = userBets.filter(p => p.status === 'WON').length;
    const lostPredictions = userBets.filter(p => p.status === 'LOST').length;
    const drawPredictions = userBets.filter(p => p.status === 'DRAW').length;

    // Calculate net profits
    const totalProfit = userBets.reduce((acc, p) => {
      if (p.status === 'WON') {
        const profit = p.amount * p.payout_rate;
        return acc + profit;
      }
      if (p.status === 'LOST') {
        return acc - p.amount;
      }
      return acc;
    }, 0);

    return res.json({
      wallet: {
        balance: parseFloat(wallet.balance),
        locked_balance: parseFloat(wallet.locked_balance),
      },
      statistics: {
        total_predictions: totalPredictions,
        active_predictions: activePredictions,
        won_predictions: wonPredictions,
        lost_predictions: lostPredictions,
        draw_predictions: drawPredictions,
        total_profit: parseFloat(totalProfit.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('Error fetching portfolio statistics:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Deposit Demo cash utility
router.post('/deposit', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const { amount } = req.body;
  const depAmount = parseFloat(amount);

  if (isNaN(depAmount) || depAmount <= 0) {
    return res.status(400).json({ error: 'Invalid deposit amount' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row lock user's wallet
    const walletRes = await client.query(
      'SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (walletRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const wallet = walletRes.rows[0];
    const newBalance = parseFloat((parseFloat(wallet.balance) + depAmount).toFixed(2));

    await client.query(
      'UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newBalance, wallet.id]
    );

    await client.query(
      "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'DEPOSIT', $2, 'MANUAL_DEPOSIT')",
      [wallet.id, depAmount]
    );

    await client.query('COMMIT');
    return res.json({ message: 'Deposit successful', new_balance: newBalance });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Deposit transaction failed:', error);
    return res.status(500).json({ error: 'Deposit failed due to internal error' });
  } finally {
    client.release();
  }
});

// Get user transaction history log
router.get('/transactions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const txRes = await pool.query(
      `SELECT t.id, t.type, t.amount, t.reference_id, t.created_at
       FROM transactions t
       JOIN wallets w ON t.wallet_id = w.id
       WHERE w.user_id = $1
       ORDER BY t.created_at DESC`,
      [userId]
    );
    return res.json(txRes.rows);
  } catch (error) {
    console.error('Transactions load failed:', error);
    return res.status(500).json({ error: 'Failed to load transaction history' });
  }
});

// Submit a manual deposit request via QR code
router.post('/deposit-request', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const userEmail = req.user?.email;
  const { amount, currency, paymentMethod, referenceId } = req.body;

  const depAmount = parseFloat(amount);
  if (isNaN(depAmount) || depAmount <= 0) {
    return res.status(400).json({ error: 'Invalid deposit amount' });
  }
  const rate = exchangeRates[currency] || 1.0;
  const usdAmount = depAmount / rate;
  const minDep = adminConfig.min_deposit_amount || 5.00;
  if (usdAmount < minDep) {
    return res.status(400).json({ error: `Minimum deposit amount is $${minDep.toFixed(2)} USD.` });
  }

  try {
    const requestId = `dep-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await pool.query(
      'INSERT INTO deposit_requests (id, user_id, user_email, amount, currency, payment_method, reference_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, \'PENDING\')',
      [requestId, userId, userEmail, depAmount, currency, paymentMethod, referenceId]
    );
    return res.json({ message: 'Deposit request submitted successfully for approval', requestId });
  } catch (error) {
    console.error('Deposit request failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit a withdrawal request
router.post('/withdraw-request', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const userEmail = req.user?.email;
  const { amount, currency, paymentMethod, paymentDetails, amountInUsd } = req.body;

  const witAmount = parseFloat(amount);
  const usdAmount = parseFloat(amountInUsd);
  if (isNaN(witAmount) || witAmount <= 0 || isNaN(usdAmount) || usdAmount <= 0) {
    return res.status(400).json({ error: 'Invalid withdrawal amount' });
  }
  const minWith = adminConfig.min_withdrawal_amount || 10.00;
  if (usdAmount < minWith) {
    return res.status(400).json({ error: `Minimum withdrawal amount is $${minWith.toFixed(2)} USD.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check balance
    const walletRes = await client.query(
      'SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    if (walletRes.rows.length === 0) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const wallet = walletRes.rows[0];
    const balance = parseFloat(wallet.balance);

    if (balance < usdAmount) {
      return res.status(400).json({ error: 'Insufficient funds for withdrawal' });
    }

    // Lock balance
    await client.query(
      'UPDATE wallets SET balance = balance - $1, locked_balance = locked_balance + $1 WHERE id = $2',
      [usdAmount, wallet.id]
    );

    const requestId = `wit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.query(
      'INSERT INTO withdrawal_requests (id, user_id, user_email, amount, currency, payment_method, payment_details, status) VALUES ($1, $2, $3, $4, $5, $6, $7, \'PENDING\')',
      [requestId, userId, userEmail, usdAmount, currency, paymentMethod, paymentDetails]
    );

    await client.query('COMMIT');
    return res.json({ message: 'Withdrawal request submitted successfully', requestId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Withdrawal transaction failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get user's deposit requests
router.get('/deposits', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    const listRes = await pool.query('SELECT * FROM deposit_requests WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.json(listRes.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's withdrawal requests
router.get('/withdrawals', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    const listRes = await pool.query('SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return res.json(listRes.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET active admin gateways (for QR code deposits)
router.get('/gateways', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json(adminGateways);
});

// GET dynamic currency exchange rates
router.get('/rates', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json(exchangeRates);
});

export default router;
