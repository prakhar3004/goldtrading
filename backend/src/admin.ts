import { Router, Request, Response, NextFunction } from 'express';
import pool, { 
  adminConfig, 
  nudges, 
  predictions, 
  users, 
  depositRequests,
  withdrawalRequests,
  adminGateways,
  exchangeRates
} from './db';
import { authMiddleware, AuthenticatedRequest } from './auth';

const router = Router();

// Middleware to protect routes - ensure user is ADMIN
export const adminMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    return;
  }
  next();
};

// 1. Get Administrative Overview Analytics
router.get('/overview', authMiddleware, adminMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // A. Treasury Earnings (balance in treasury wallet)
    const treasuryRes = await pool.query(
      "SELECT balance FROM wallets w JOIN users u ON w.user_id = u.id WHERE u.role = 'TREASURY'"
    );
    const treasuryBalance = treasuryRes.rows[0] ? parseFloat(treasuryRes.rows[0].balance) : 100000.00;

    // B. Total active predictions
    const activeBetsCount = predictions.filter(p => p.status === 'PENDING').length;

    // C. Total registered users (excluding treasury)
    const usersCount = users.filter(u => u.role === 'USER').length;

    // D. Cumulative stats from predictions list
    const totalPredictions = predictions.length;
    const totalVolume = predictions.reduce((acc, p) => acc + p.amount, 0);

    const resolvedBets = predictions.filter(p => p.status !== 'PENDING');
    const userWinsCount = resolvedBets.filter(p => p.status === 'WON').length;
    
    // House Profit = User Losses - User Win Profits
    const houseEarnings = resolvedBets.reduce((acc, p) => {
      if (p.status === 'LOST') return acc + p.amount;
      if (p.status === 'WON') return acc - (p.payout_amount! - p.amount);
      return acc;
    }, 0);

    return res.json({
      treasury_earnings: treasuryBalance,
      active_listings: 2, // Gold and Silver
      active_bets_count: activeBetsCount,
      total_bets_count: totalPredictions,
      total_volume: parseFloat(totalVolume.toFixed(2)),
      house_net_earnings: parseFloat(houseEarnings.toFixed(2)),
      total_registered_users: usersCount,
      user_win_count: userWinsCount,
      win_ratio: resolvedBets.length > 0 ? parseFloat(((userWinsCount / resolvedBets.length) * 100).toFixed(1)) : 0.0,
    });
  } catch (error) {
    console.error('Overview analytics failed:', error);
    return res.status(500).json({ error: 'Failed to retrieve administrative analytics' });
  }
});

// 2. Fetch all active/pending prediction bets
router.get('/predictions/active', authMiddleware, adminMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const liveBets = predictions
      .filter(p => p.status === 'PENDING')
      .map(p => {
        const u = users.find(usr => usr.id === p.user_id);
        return {
          id: p.id,
          user_id: p.user_id,
          user_email: u ? u.email : '',
          item_id: p.item_id,
          item_name: p.item_id === 1 ? 'Gold (XAU/USD)' : 'Silver (XAG/USD)',
          direction: p.direction,
          amount: p.amount,
          start_price: p.start_price,
          expires_at: p.expires_at,
          status: p.status,
          override_status: p.override_status,
        };
      })
      .sort((a, b) => b.expires_at.getTime() - a.expires_at.getTime());
    return res.json(liveBets);
  } catch (error) {
    console.error('Load active predictions failed:', error);
    return res.status(500).json({ error: 'Failed to load active predictions' });
  }
});

// 3. Fetch all predictions (active and resolved)
router.get('/predictions/all', authMiddleware, adminMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const allBets = predictions
      .map(p => {
        const u = users.find(usr => usr.id === p.user_id);
        return {
          id: p.id,
          user_id: p.user_id,
          user_email: u ? u.email : '',
          item_id: p.item_id,
          item_name: p.item_id === 1 ? 'Gold (XAU/USD)' : 'Silver (XAG/USD)',
          direction: p.direction,
          amount: p.amount,
          start_price: p.start_price,
          end_price: p.end_price,
          expires_at: p.expires_at,
          status: p.status,
          payout_amount: p.payout_amount,
          created_at: p.created_at,
        };
      })
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return res.json(allBets);
  } catch (error) {
    console.error('Load all predictions failed:', error);
    return res.status(500).json({ error: 'Failed to load prediction logs' });
  }
});

// 4. GET platform settings / configuration
router.get('/config', authMiddleware, adminMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json(adminConfig);
});

// 5. UPDATE platform settings / configuration
router.post('/config', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { goldTrend, silverTrend, payoutRate, houseProtectionWinRate } = req.body;

  if (goldTrend && !['UP', 'DOWN', 'NEUTRAL'].includes(goldTrend)) {
    return res.status(400).json({ error: 'Invalid gold trend. Must be UP, DOWN, or NEUTRAL.' });
  }
  if (silverTrend && !['UP', 'DOWN', 'NEUTRAL'].includes(silverTrend)) {
    return res.status(400).json({ error: 'Invalid silver trend. Must be UP, DOWN, or NEUTRAL.' });
  }

  const rate = parseFloat(payoutRate);
  if (!isNaN(rate) && (rate < 0.1 || rate > 2.0)) {
    return res.status(400).json({ error: 'Payout rate must be between 0.10 and 2.00 (10% to 200%).' });
  }

  const protectionRate = parseFloat(houseProtectionWinRate);
  if (!isNaN(protectionRate) && (protectionRate < 0 || protectionRate > 1.0)) {
    return res.status(400).json({ error: 'House protection win rate limit must be between 0.0 and 1.0.' });
  }

  try {
    await pool.query(
      'UPDATE admin_config SET gold_trend = $1, silver_trend = $2, payout_rate = $3, house_protection_win_rate = $4',
      [
        goldTrend || adminConfig.gold_trend,
        silverTrend || adminConfig.silver_trend,
        !isNaN(rate) ? rate : adminConfig.payout_rate,
        !isNaN(protectionRate) ? protectionRate : adminConfig.house_protection_win_rate
      ]
    );

    return res.json({
      message: 'Platform configuration updated successfully!',
      config: adminConfig,
    });
  } catch (error) {
    console.error('Update platform config failed:', error);
    return res.status(500).json({ error: 'Failed to update configuration settings' });
  }
});

// 6. Force-nudge price tick (Upward or Downward price spike)
router.post('/force-nudge', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { itemId, amount } = req.body;

  const commodityId = parseInt(itemId);
  const nudgeAmt = parseFloat(amount);

  if (isNaN(commodityId) || (commodityId !== 1 && commodityId !== 2)) {
    return res.status(400).json({ error: 'Invalid commodity selected. Choose Gold (1) or Silver (2).' });
  }
  if (isNaN(nudgeAmt)) {
    return res.status(400).json({ error: 'Nudge amount must be a number.' });
  }

  if (commodityId === 1) {
    nudges.goldNudge += nudgeAmt;
  } else {
    nudges.silverNudge += nudgeAmt;
  }

  return res.json({
    message: `Price nudge of ${nudgeAmt > 0 ? '+' : ''}${nudgeAmt} injected successfully!`,
    commodity: commodityId === 1 ? 'Gold' : 'Silver',
  });
});

// 7. Get User List for Management
router.get('/users', authMiddleware, adminMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const listRes = await pool.query('SELECT id, email, role, created_at FROM users');
    return res.json(listRes.rows);
  } catch (error) {
    console.error('List users failed:', error);
    return res.status(500).json({ error: 'Failed to load user list' });
  }
});

// 8. Adjust User Balance manually
router.post('/users/:id/balance', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const { amount, action } = req.body; // action: 'ADD' or 'SUBTRACT'

  const changeAmt = parseFloat(amount);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid User ID' });
  if (isNaN(changeAmt) || changeAmt <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const walletRes = await client.query('SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    if (walletRes.rows.length === 0) {
      return res.status(404).json({ error: 'User wallet not found' });
    }

    const wallet = walletRes.rows[0];
    const currentBalance = parseFloat(wallet.balance);
    let newBalance = currentBalance;

    if (action === 'ADD') {
      newBalance = parseFloat((currentBalance + changeAmt).toFixed(2));
      await client.query(
        "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'MANUAL_CREDIT', $2, 'ADMIN_MANUAL_ADJUSTMENT')",
        [wallet.id, changeAmt]
      );
    } else {
      if (currentBalance < changeAmt) {
        return res.status(400).json({ error: 'User balance is less than subtraction amount' });
      }
      newBalance = parseFloat((currentBalance - changeAmt).toFixed(2));
      await client.query(
        "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'MANUAL_DEBIT', $2, 'ADMIN_MANUAL_ADJUSTMENT')",
        [wallet.id, -changeAmt]
      );
    }

    await client.query('UPDATE wallets SET balance = $1 WHERE id = $2', [newBalance, wallet.id]);
    await client.query('COMMIT');
    return res.json({ message: 'Balance adjusted successfully', newBalance });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Balance adjust failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// 9. Get Admin Payment Gateways
router.get('/gateways', authMiddleware, adminMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json(adminGateways);
});

// 10. Update Admin Payment Gateways
router.post('/gateways', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const { upiId, btcAddress, ethAddress } = req.body;
  try {
    await pool.query(
      'UPDATE admin_gateways SET upi_id = $1, btc_address = $2, eth_address = $3',
      [upiId, btcAddress, ethAddress]
    );
    return res.json({ message: 'Payment gateway addresses updated successfully', gateways: adminGateways });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update gateways' });
  }
});

// 11. Get Pending Deposit Requests
router.get('/deposits/pending', authMiddleware, adminMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const listRes = await pool.query('SELECT * FROM deposit_requests ORDER BY created_at DESC');
    return res.json(listRes.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load deposit requests' });
  }
});

// 12. Resolve Pending Deposit Request (Approve / Reject)
router.post('/deposits/:id/resolve', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const reqId = req.params.id;
  const { action } = req.body; // 'APPROVE' or 'REJECT'

  const depositReq = depositRequests.find(r => r.id === reqId);
  if (!depositReq) return res.status(404).json({ error: 'Deposit request not found' });
  if (depositReq.status !== 'PENDING') return res.status(400).json({ error: 'Request already resolved' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (action === 'APPROVE') {
      // Convert user's currency amount to base USD
      const rate = exchangeRates[depositReq.currency] || 1.0;
      const usdAmount = parseFloat((depositReq.amount / rate).toFixed(2));

      // Fetch wallet
      const walletRes = await client.query('SELECT id, balance FROM wallets WHERE user_id = $1 FOR UPDATE', [depositReq.user_id]);
      if (walletRes.rows.length === 0) {
        return res.status(404).json({ error: 'User wallet not found' });
      }
      const wallet = walletRes.rows[0];

      // Add to balance
      await client.query('UPDATE wallets SET balance = balance + $1 WHERE id = $2', [usdAmount, wallet.id]);
      
      // Log transaction
      await client.query(
        "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'DEPOSIT', $2, $3)",
        [wallet.id, usdAmount, reqId]
      );
      
      // Update request status
      await pool.query('UPDATE deposit_requests SET status = $1 WHERE id = $2', ['APPROVED', reqId]);
    } else {
      await pool.query('UPDATE deposit_requests SET status = $1 WHERE id = $2', ['REJECTED', reqId]);
    }
    await client.query('COMMIT');
    return res.json({ message: `Deposit request ${action.toLowerCase()}d successfully` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Resolve deposit failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// 13. Get Pending Withdrawal Requests
router.get('/withdrawals/pending', authMiddleware, adminMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const listRes = await pool.query('SELECT * FROM withdrawal_requests ORDER BY created_at DESC');
    return res.json(listRes.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load withdrawal requests' });
  }
});

// 14. Resolve Pending Withdrawal Request (Approve / Reject)
router.post('/withdrawals/:id/resolve', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const reqId = req.params.id;
  const { action } = req.body; // 'APPROVE' or 'REJECT'

  const withdrawReq = withdrawalRequests.find(r => r.id === reqId);
  if (!withdrawReq) return res.status(404).json({ error: 'Withdrawal request not found' });
  if (withdrawReq.status !== 'PENDING') return res.status(400).json({ error: 'Request already resolved' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const walletRes = await client.query('SELECT id, balance, locked_balance FROM wallets WHERE user_id = $1 FOR UPDATE', [withdrawReq.user_id]);
    if (walletRes.rows.length === 0) {
      return res.status(404).json({ error: 'User wallet not found' });
    }
    const wallet = walletRes.rows[0];
    const usdAmount = withdrawReq.amount; // Store amount is already in USD

    if (action === 'APPROVE') {
      // Permanently debit locked balance
      await client.query('UPDATE wallets SET locked_balance = locked_balance - $1 WHERE id = $2', [usdAmount, wallet.id]);
      
      // Log transaction
      await client.query(
        "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'WITHDRAW', $2, $3)",
        [wallet.id, -usdAmount, reqId]
      );

      await pool.query('UPDATE withdrawal_requests SET status = $1 WHERE id = $2', ['APPROVED', reqId]);
    } else {
      // Refund locked balance back to balance
      await client.query('UPDATE wallets SET balance = balance + $1, locked_balance = locked_balance - $1 WHERE id = $2', [usdAmount, wallet.id]);
      
      await pool.query('UPDATE withdrawal_requests SET status = $1 WHERE id = $2', ['REJECTED', reqId]);
    }
    await client.query('COMMIT');
    return res.json({ message: `Withdrawal request ${action.toLowerCase()}d successfully` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Resolve withdrawal failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// 15. Set Active Bet manual override outcome (FORCE_WIN / FORCE_LOSS)
router.post('/predictions/:id/override', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
  const betId = req.params.id;
  const { outcome } = req.body; // 'FORCE_WIN' or 'FORCE_LOSS' or null/neutral

  if (outcome && !['FORCE_WIN', 'FORCE_LOSS'].includes(outcome)) {
    return res.status(400).json({ error: 'Invalid override outcome. Choose FORCE_WIN, FORCE_LOSS, or empty.' });
  }

  try {
    await pool.query('UPDATE predictions SET override_status = $1 WHERE id = $2', [outcome || null, betId]);
    return res.json({ message: `Manual outcome override set to ${outcome || 'NEUTRAL'} for bet ${betId}` });
  } catch (error) {
    console.error('Bet override failed:', error);
    return res.status(500).json({ error: 'Failed to set override' });
  }
});

export default router;
