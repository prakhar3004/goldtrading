import { Router, Response } from 'express';
import pool, { items, adminConfig } from './db';
import { authMiddleware, AuthenticatedRequest } from './auth';

const router = Router();

// Helper to convert decimal fields securely
const parseNum = (val: any): number => {
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
};

// 1. Get Commodities Catalog (Gold & Silver)
router.get('/catalog', async (_req, res: Response) => {
  try {
    const catalogRes = await pool.query(
      'SELECT id, name, description, image_url, category, daily_base_price, last_price, total_supply, remaining_supply, is_active FROM items ORDER BY id ASC'
    );
    return res.json(catalogRes.rows);
  } catch (error) {
    console.error('Failed to load commodities catalog:', error);
    return res.status(500).json({ error: 'Failed to load commodities catalog' });
  }
});

// 2. Place a Prediction Bet (UP / DOWN)
router.post('/place', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { itemId, direction, amount, duration } = req.body;

  const commodityId = parseInt(itemId);
  const betAmount = parseFloat(amount);
  const expiryDuration = parseInt(duration);

  // Validation checks
  if (isNaN(commodityId) || (commodityId !== 1 && commodityId !== 2)) {
    return res.status(400).json({ error: 'Invalid commodity selected. Choose Gold or Silver.' });
  }
  if (!['UP', 'DOWN'].includes(direction)) {
    return res.status(400).json({ error: 'Invalid prediction direction. Must be UP or DOWN.' });
  }
  if (isNaN(betAmount) || betAmount <= 0) {
    return res.status(400).json({ error: 'Bet amount must be a positive number.' });
  }
  const minBet = adminConfig.min_bet_amount || 1.00;
  const maxBet = adminConfig.max_bet_amount || 10000.00;
  if (betAmount < minBet) {
    return res.status(400).json({ error: `Bet amount must be at least $${minBet.toFixed(2)}.` });
  }
  if (betAmount > maxBet) {
    return res.status(400).json({ error: `Bet amount cannot exceed $${maxBet.toFixed(2)}.` });
  }
  if (isNaN(expiryDuration) || ![30, 60, 120, 300].includes(expiryDuration)) {
    return res.status(400).json({ error: 'Invalid duration. Select 30s, 1m, 2m, or 5m.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch current price of the selected commodity
    const item = items.find(i => i.id === commodityId);
    if (!item || !item.is_active) {
      client.release();
      return res.status(400).json({ error: 'Selected asset is currently suspended from trading.' });
    }
    const startPrice = item.last_price;

    // 2. Check and lock wallet balance
    const walletRes = await client.query(
      'SELECT id, balance, locked_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const wallet = walletRes.rows[0];
    if (!wallet || parseNum(wallet.balance) < betAmount) {
      client.release();
      return res.status(400).json({ 
        error: `Insufficient balance. Required: $${betAmount.toFixed(2)}, Available: $${parseNum(wallet.balance).toFixed(2)}` 
      });
    }

    // Lock prediction amount in wallet balance
    await client.query(
      'UPDATE wallets SET balance = balance - $1, locked_balance = locked_balance + $1 WHERE id = $2',
      [betAmount, wallet.id]
    );

    // 3. Create prediction entry
    const expiresAt = new Date(Date.now() + expiryDuration * 1000);
    const payoutRate = adminConfig.payout_rate; // Current platform default payout multiplier

    const predictionDbRes = await client.query(
      `INSERT INTO predictions (user_id, item_id, direction, amount, start_price, payout_rate, duration, expires_at, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING') RETURNING id, status, created_at`,
      [userId, commodityId, direction, betAmount, startPrice, payoutRate, expiryDuration, expiresAt]
    );

    const betId = predictionDbRes.rows[0].id;

    // Log double-entry transaction record
    await client.query(
      "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'PRED_PLACE', $2, $3)",
      [wallet.id, -betAmount, betId]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Prediction bet placed successfully!',
      id: betId,
      status: predictionDbRes.rows[0].status,
      expires_at: expiresAt,
      start_price: startPrice,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Prediction placement failed:', error);
    return res.status(500).json({ error: 'Internal server error while placing prediction bet' });
  } finally {
    client.release();
  }
});

// 3. Fetch user prediction history
router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const historyRes = await pool.query(
      `SELECT p.id, p.item_id, i.name, p.direction, p.amount, p.start_price, p.end_price, 
              p.payout_rate, p.duration, p.status, p.created_at, p.expires_at, p.payout_amount
       FROM predictions p
       JOIN items i ON p.item_id = i.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );
    return res.json(historyRes.rows);
  } catch (error) {
    console.error('Error fetching prediction history:', error);
    return res.status(500).json({ error: 'Failed to fetch prediction history' });
  }
});

export default router;
