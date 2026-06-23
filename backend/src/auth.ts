import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool, { users } from './db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'trading_platform_super_secret_jwt_key_10293847';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
  };
}

// Middleware to protect routes
export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
    const userObj = users.find(u => u.id === decoded.id);
    if (userObj && userObj.is_banned) {
      res.status(403).json({ error: 'Access denied. Account is banned.' });
      return;
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Register Route
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, mobile } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (!mobile) {
    return res.status(400).json({ error: 'Mobile number is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user exists
    const checkUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length > 0) {
      client.release();
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const userInsert = await client.query(
      "INSERT INTO users (email, password_hash, role, mobile) VALUES ($1, $2, 'USER', $3) RETURNING id, email, role, mobile",
      [email, passwordHash, mobile]
    );
    const user = userInsert.rows[0];

    // Create wallet with default deposit of $50.00 for initial trading
    const initialBalance = 50.00;
    const walletInsert = await client.query(
      'INSERT INTO wallets (user_id, balance) VALUES ($1, $2) RETURNING id',
      [user.id, initialBalance]
    );

    // Record the deposit transaction
    await client.query(
      "INSERT INTO transactions (wallet_id, type, amount, reference_id) VALUES ($1, 'DEPOSIT', $2, 'INITIAL_SIGNUP_BONUS')",
      [walletInsert.rows[0].id, initialBalance]
    );

    await client.query('COMMIT');

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    return res.status(201).json({ user, token });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration failed:', error);
    return res.status(500).json({ error: 'Internal server error during registration' });
  } finally {
    client.release();
  }
});

// Login Route
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been banned by an administrator.' });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

export default router;
