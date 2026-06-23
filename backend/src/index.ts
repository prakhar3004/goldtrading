import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { checkDbConnection } from './db';
import { connectRedis } from './redis';
import authRouter from './auth';
import portfolioRouter from './portfolio';
import ordersRouter from './orders';
import adminRouter from './admin';
import pool, { 
  items, 
  predictions, 
  candles, 
  adminConfig, 
  wallets, 
  nudges,
  reseedCandles
} from './db';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all origins for local testing and dashboard
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);

// Health Check
app.get('/api/health', async (_req, res) => {
  const dbAlive = await checkDbConnection();
  res.json({
    status: dbAlive ? 'healthy' : 'degraded',
    database: dbAlive ? 'connected' : 'disconnected',
  });
});

// Get historical candle ticks for charting
app.get('/api/market/history/:itemId', async (req, res) => {
  const itemId = parseInt(req.params.itemId);
  const resolution = (req.query.resolution as string) || '1m';

  if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid Item ID' });

  try {
    const candlesRes = await pool.query(
      `SELECT time, open, high, low, close, volume 
       FROM candles 
       WHERE item_id = $1 AND resolution = $2 
       ORDER BY time ASC LIMIT 300`,
      [itemId, resolution]
    );

    // Format for Lightweight Charts (timestamp in seconds)
    const formatted = candlesRes.rows.map((row) => ({
      time: Math.floor(new Date(row.time).getTime() / 1000),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume),
    }));

    return res.json(formatted);
  } catch (error) {
    console.error('Error fetching candles:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.io Connection Logic
const userSockets = new Map<number, string>(); // userId -> socketId

io.on('connection', (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User authenticates over websocket
  socket.on('auth', (userId: number) => {
    userSockets.set(userId, socket.id);
    console.log(`Socket mapping: User ${userId} linked to ${socket.id}`);
  });

  // User subscribes to a specific commodity room (item:1 for Gold, item:2 for Silver)
  socket.on('subscribe_item', (itemId: number) => {
    socket.join(`item:${itemId}`);
    console.log(`Socket ${socket.id} joined room item:${itemId}`);
  });

  socket.on('unsubscribe_item', (itemId: number) => {
    socket.leave(`item:${itemId}`);
    console.log(`Socket ${socket.id} left room item:${itemId}`);
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// --- Commodity Price Tick Simulation Engine & Predictions Resolver ---

// Nudges are now read directly from the shared db module to avoid circular dependencies

let latestGoldLivePrice = 4100.00;
let latestSilverLivePrice = 61.90;

const fetchSwissquotePrice = async (instrument: 'XAU/USD' | 'XAG/USD'): Promise<number | null> => {
  try {
    const response = await fetch(`https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${instrument}`);
    if (response.ok) {
      const data = await response.json() as any[];
      if (Array.isArray(data) && data.length > 0) {
        const priceObj = data[0]?.spreadProfilePrices?.find((p: any) => p.spreadProfile === 'prime' || p.spreadProfile === 'premium');
        if (priceObj && typeof priceObj.bid === 'number' && typeof priceObj.ask === 'number') {
          return parseFloat(((priceObj.bid + priceObj.ask) / 2).toFixed(2));
        }
      }
    }
  } catch (error) {
    console.error(`[Swissquote API Error] Failed to fetch live price for ${instrument}:`, error);
  }
  return null;
};

const fetchLivePrices = async () => {
  // 1. Fetch Gold (XAU/USD)
  const sqGold = await fetchSwissquotePrice('XAU/USD');
  if (sqGold !== null) {
    latestGoldLivePrice = sqGold;
  } else {
    // Fallback to Binance PAXGUSDT
    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT');
      if (response.ok) {
        const data = await response.json() as { price: string };
        const parsed = parseFloat(data.price);
        if (!isNaN(parsed) && parsed > 0) {
          latestGoldLivePrice = parsed;
        }
      }
    } catch (error) {
      console.error('[Binance API Error] Failed to fetch live gold price fallback:', error);
    }
  }

  // 2. Fetch Silver (XAG/USD)
  const sqSilver = await fetchSwissquotePrice('XAG/USD');
  if (sqSilver !== null) {
    latestSilverLivePrice = sqSilver;
  } else {
    // Fallback: derive from gold price using standard ratio (around 66.2)
    latestSilverLivePrice = parseFloat((latestGoldLivePrice / 66.2).toFixed(2));
  }
};

const startCommodityRateEngine = () => {
  console.log('Booting Commodity Rate Simulator & Prediction Resolution Engine...');

  // Start Swissquote live rate poller (every 5 seconds)
  fetchLivePrices();
  setInterval(fetchLivePrices, 5000);

  setInterval(async () => {
    const now = new Date();

    // 1. Generate new prices for Gold (XAU/USD) and Silver (XAG/USD)
    const goldItem = items.find(i => i.id === 1)!;
    const silverItem = items.find(i => i.id === 2)!;

    // GOLD PRICE GENERATION
    let newGoldPrice = goldItem.last_price;
    if (adminConfig.gold_trend === 'NEUTRAL') {
      // Track live price with small random noise (-0.25 to 0.25)
      const noise = (Math.random() - 0.5) * 0.5;
      newGoldPrice = parseFloat((latestGoldLivePrice + noise).toFixed(2));
    } else {
      // Skewed drift starting from current last_price
      let goldChange = (Math.random() - 0.5) * 1.5;
      if (adminConfig.gold_trend === 'UP') {
        goldChange = (Math.random() - 0.25) * 1.8; // Skew positive
      } else if (adminConfig.gold_trend === 'DOWN') {
        goldChange = (Math.random() - 0.75) * 1.8; // Skew negative
      }
      newGoldPrice = parseFloat((goldItem.last_price + goldChange).toFixed(2));
    }

    // Apply admin manual nudge if any
    if (nudges.goldNudge !== 0) {
      newGoldPrice += nudges.goldNudge;
      nudges.goldNudge = 0; // reset nudge
    }
    goldItem.last_price = parseFloat(newGoldPrice.toFixed(2));

    // SILVER PRICE GENERATION
    let newSilverPrice = silverItem.last_price;
    if (adminConfig.silver_trend === 'NEUTRAL') {
      const noise = (Math.random() - 0.5) * 0.04; // fluctuation of ±$0.02
      newSilverPrice = parseFloat((latestSilverLivePrice + noise).toFixed(2));
    } else {
      // Skewed drift starting from current last_price
      let silverChange = (Math.random() - 0.5) * 0.08;
      if (adminConfig.silver_trend === 'UP') {
        silverChange = (Math.random() - 0.25) * 0.1; // Skew positive
      } else if (adminConfig.silver_trend === 'DOWN') {
        silverChange = (Math.random() - 0.75) * 0.1; // Skew negative
      }
      newSilverPrice = parseFloat((silverItem.last_price + silverChange).toFixed(2));
    }

    // Apply admin manual nudge if any
    if (nudges.silverNudge !== 0) {
      newSilverPrice += nudges.silverNudge;
      nudges.silverNudge = 0; // reset nudge
    }
    silverItem.last_price = parseFloat(newSilverPrice.toFixed(2));

    // 2. Aggregate into Candle Bars (1m resolution)
    const minuteBucket = new Date();
    minuteBucket.setSeconds(0, 0);

    [goldItem, silverItem].forEach((item) => {
      const price = item.last_price;
      const cIndex = candles.findIndex(
        c => c.item_id === item.id && c.resolution === '1m' && c.time.getTime() === minuteBucket.getTime()
      );

      if (cIndex === -1) {
        candles.push({
          time: minuteBucket,
          item_id: item.id,
          resolution: '1m',
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 1,
        });
      } else {
        const c = candles[cIndex];
        c.high = Math.max(c.high, price);
        c.low = Math.min(c.low, price);
        c.close = price;
        c.volume += 1;
      }
    });

    // 3. Broadcast real-time sub-second price ticks
    // Global tick channel (for left list view)
    io.emit('tick', {
      itemId: 1,
      price: newGoldPrice,
      time: now.toISOString(),
    });
    io.emit('tick', {
      itemId: 2,
      price: newSilverPrice,
      time: now.toISOString(),
    });

    // Room tick channels (for live TradingView chart)
    const goldCandle = candles.find(
      c => c.item_id === 1 && c.resolution === '1m' && c.time.getTime() === minuteBucket.getTime()
    );
    const silverCandle = candles.find(
      c => c.item_id === 2 && c.resolution === '1m' && c.time.getTime() === minuteBucket.getTime()
    );

    if (goldCandle) {
      io.to('item:1').emit('item_tick', {
        time: Math.floor(goldCandle.time.getTime() / 1000),
        open: goldCandle.open,
        high: goldCandle.high,
        low: goldCandle.low,
        close: goldCandle.close,
      });
    }
    if (silverCandle) {
      io.to('item:2').emit('item_tick', {
        time: Math.floor(silverCandle.time.getTime() / 1000),
        open: silverCandle.open,
        high: silverCandle.high,
        low: silverCandle.low,
        close: silverCandle.close,
      });
    }

    // 4. Evaluate and Settle Expired Predictions (Bets)
    const activeBets = predictions.filter(p => p.status === 'PENDING');
    for (const bet of activeBets) {
      if (now.getTime() >= bet.expires_at.getTime()) {
        const currentRate = bet.item_id === 1 ? newGoldPrice : newSilverPrice;
        
        let finalRate = currentRate;
        const userDirection = bet.direction;
        const startRate = bet.start_price;

        let status: 'WON' | 'LOST' | 'DRAW' = 'LOST';
        let payoutAmount = 0;

        // Apply admin override status if set, otherwise apply standard market rules
        if (bet.override_status === 'FORCE_WIN') {
          status = 'WON';
          finalRate = userDirection === 'UP' ? startRate + 0.05 : startRate - 0.05;
          payoutAmount = parseFloat((bet.amount + bet.amount * bet.payout_rate).toFixed(2));
          console.log(`[Admin Override Resolved] Forced WIN on prediction ${bet.id}. exit rate: ${finalRate}`);
        } else if (bet.override_status === 'FORCE_LOSS') {
          status = 'LOST';
          finalRate = userDirection === 'UP' ? startRate - 0.05 : startRate + 0.05;
          payoutAmount = 0;
          console.log(`[Admin Override Resolved] Forced LOSS on prediction ${bet.id}. exit rate: ${finalRate}`);
        } else {
          // Check standard win status
          const standardUserWins = (userDirection === 'UP' && finalRate > startRate) || 
                                   (userDirection === 'DOWN' && finalRate < startRate);

          // Apply House Protection Mode
          if (standardUserWins && adminConfig.house_protection_win_rate < Math.random()) {
            if (userDirection === 'UP') {
              finalRate = startRate - parseFloat((Math.random() * 0.05 + 0.01).toFixed(2));
            } else {
              finalRate = startRate + parseFloat((Math.random() * 0.05 + 0.01).toFixed(2));
            }
            console.log(`[House Protection Activated] Forced user loss on bet ${bet.id}. Adjusted exit rate to ${finalRate}`);
          }

          // Evaluate final outcome
          if (finalRate === startRate) {
            status = 'DRAW';
            payoutAmount = bet.amount; // Refund
          } else if ((userDirection === 'UP' && finalRate > startRate) || 
                     (userDirection === 'DOWN' && finalRate < startRate)) {
            status = 'WON';
            payoutAmount = parseFloat((bet.amount + bet.amount * bet.payout_rate).toFixed(2)); // Payout bet + profit
          }
        }

        // Apply database updates
        await pool.query(
          "UPDATE predictions SET status = $1, end_price = $2, payout_amount = $3 WHERE id = $4",
          [status, finalRate, payoutAmount, bet.id]
        );

        // Wallet Balance Adjustments
        const wallet = wallets.find(w => w.user_id === bet.user_id)!;
        if (status === 'WON') {
          await pool.query(
            "UPDATE wallets SET balance = balance + $1, locked_balance = locked_balance - $2 WHERE user_id = $3",
            [payoutAmount, bet.amount, bet.user_id]
          );

          const profit = parseFloat((bet.amount * bet.payout_rate).toFixed(2));
          await pool.query(
            "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'PRED_WIN', $2, $3)",
            [wallet.id, profit, bet.id]
          );
        } else if (status === 'LOST') {
          await pool.query(
            "UPDATE wallets SET locked_balance = locked_balance - $1 WHERE user_id = $2",
            [bet.amount, bet.user_id]
          );
          await pool.query(
            "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'PRED_LOSS', $2, $3)",
            [wallet.id, -bet.amount, bet.id]
          );

          // Credit platform profit to Treasury (ID 1)
          const treasuryWallet = wallets.find(w => w.user_id === 1)!;
          treasuryWallet.balance = parseFloat((treasuryWallet.balance + bet.amount).toFixed(2));
          await pool.query(
            "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'PLATFORM_EARNING', $2, $3)",
            [treasuryWallet.id, bet.amount, bet.id]
          );
        } else {
          // DRAW/REFUND
          await pool.query(
            "UPDATE wallets SET balance = balance + $1, locked_balance = locked_balance - $1 WHERE user_id = $2",
            [bet.amount, bet.user_id]
          );
          await pool.query(
            "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'PRED_DRAW', $2, $3)",
            [wallet.id, 0, bet.id]
          );
        }

        // Notify client via sockets
        const userSocketId = userSockets.get(bet.user_id);
        if (userSocketId) {
          io.to(userSocketId).emit('prediction_resolved', {
            id: bet.id,
            status,
            payout: payoutAmount,
            amount: bet.amount,
            profit: status === 'WON' ? parseFloat((bet.amount * bet.payout_rate).toFixed(2)) : (status === 'LOST' ? -bet.amount : 0),
            itemName: bet.item_id === 1 ? 'Gold (XAU/USD)' : 'Silver (XAG/USD)',
            direction: bet.direction,
            startRate: bet.start_price,
            endRate: finalRate,
          });
          io.to(userSocketId).emit('wallet_update');
        }

        // Notify Admin of resolution (update active monitoring statistics)
        io.emit('admin_bet_resolved', {
          id: bet.id,
          userId: bet.user_id,
          status,
          payout: payoutAmount,
        });
      }
    }

    // Broadcast admin statistics ticker every second
    const totalVolume = predictions.reduce((acc, p) => acc + p.amount, 0);
    const resolvedBets = predictions.filter(p => p.status !== 'PENDING');
    const userWins = resolvedBets.filter(p => p.status === 'WON');
    
    // House Profit = User Losses - User Win Profits
    const houseEarnings = resolvedBets.reduce((acc, p) => {
      if (p.status === 'LOST') return acc + p.amount;
      if (p.status === 'WON') return acc - (p.payout_amount! - p.amount);
      return acc;
    }, 0);

    io.emit('admin_stats', {
      total_predictions: predictions.length,
      active_predictions: predictions.filter(p => p.status === 'PENDING').length,
      total_volume: totalVolume,
      house_earnings: houseEarnings,
      win_ratio: resolvedBets.length > 0 ? (userWins.length / resolvedBets.length) * 100 : 0,
    });

  }, 1000);
};

// Start Server Routine
const startServer = async () => {
  const dbStatus = await checkDbConnection();
  if (!dbStatus) {
    console.error('Fatal: Cannot connect to database.');
    process.exit(1);
  }

  await connectRedis();

  // Fetch live prices first to seed candles accurately on startup!
  console.log('[INFO] Fetching initial live Gold/Silver prices for seeding...');
  await fetchLivePrices();
  reseedCandles(latestGoldLivePrice, latestSilverLivePrice);

  httpServer.listen(PORT, () => {
    console.log(`Backend API serving on http://localhost:${PORT}`);
    startCommodityRateEngine();
  });
};

startServer();
