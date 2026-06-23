import bcrypt from 'bcryptjs';
import pool from './db';

const createSchema = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable UUID extension if available
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'USER', -- 'USER', 'ADMIN', 'TREASURY'
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Wallets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(15, 2) DEFAULT 0.00 CHECK (balance >= 0),
        locked_balance DECIMAL(15, 2) DEFAULT 0.00 CHECK (locked_balance >= 0),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Items table (Exactly 100 Unique Collectibles)
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id INT PRIMARY KEY, -- Static ID from 1 to 100
        name VARCHAR(255) NOT NULL,
        description TEXT,
        image_url VARCHAR(500),
        category VARCHAR(100) NOT NULL,
        daily_base_price DECIMAL(15, 2) NOT NULL,
        last_price DECIMAL(15, 2) NOT NULL,
        total_supply INT NOT NULL DEFAULT 1,
        remaining_supply INT NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Positions table (Inventory owned by users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        item_id INT REFERENCES items(id) ON DELETE CASCADE,
        quantity INT DEFAULT 0 CHECK (quantity >= 0),
        locked_quantity INT DEFAULT 0 CHECK (locked_quantity >= 0),
        average_price DECIMAL(15, 2) DEFAULT 0.00,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, item_id)
      )
    `);

    // Create Orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        item_id INT REFERENCES items(id) ON DELETE CASCADE,
        side VARCHAR(10) NOT NULL, -- 'BUY', 'SELL'
        type VARCHAR(10) NOT NULL, -- 'LIMIT', 'MARKET'
        price DECIMAL(15, 2) NOT NULL,
        quantity INT NOT NULL,
        filled_quantity INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'PENDING', -- 'PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED'
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Trades table
    await client.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id INT REFERENCES items(id) ON DELETE CASCADE,
        buyer_id INT REFERENCES users(id) ON DELETE CASCADE,
        seller_id INT REFERENCES users(id) ON DELETE CASCADE,
        price DECIMAL(15, 2) NOT NULL,
        quantity INT NOT NULL,
        buyer_fee DECIMAL(15, 2) NOT NULL,
        seller_fee DECIMAL(15, 2) NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Transactions ledger table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id INT REFERENCES wallets(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL, -- 'DEPOSIT', 'WITHDRAW', 'TRADE_BUY', 'TRADE_SELL', 'FEE_EARNING'
        amount DECIMAL(15, 2) NOT NULL,
        reference_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Deliveries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        item_id INT REFERENCES items(id) ON DELETE CASCADE,
        quantity INT NOT NULL,
        shipping_address TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'SHIPPED', 'DELIVERED'
        tracking_code VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Candles table (Standard table creation first)
    await client.query(`
      CREATE TABLE IF NOT EXISTS candles (
        time TIMESTAMPTZ NOT NULL,
        item_id INT REFERENCES items(id) ON DELETE CASCADE,
        resolution VARCHAR(10) NOT NULL, -- '1m', '5m', '1h', '1d'
        open DECIMAL(15, 2) NOT NULL,
        high DECIMAL(15, 2) NOT NULL,
        low DECIMAL(15, 2) NOT NULL,
        close DECIMAL(15, 2) NOT NULL,
        volume INT NOT NULL
      )
    `);

    await client.query('COMMIT');
    console.log('Schema tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Schema creation failed, rolled back.', error);
    throw error;
  } finally {
    client.release();
  }

  // Create TimescaleDB hypertable dynamically if timescale extension is enabled
  try {
    await pool.query("SELECT create_hypertable('candles', 'time', if_not_exists => TRUE)");
    console.log('TimescaleDB hypertable configured successfully');
  } catch (err) {
    console.log('TimescaleDB extension not active. Falling back to standard indexes for historical candles.');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_candles_time_item ON candles (item_id, resolution, time DESC)');
  }
};

const seedData = async () => {
  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Seed Users and Wallets
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Treasury Account
    const treasuryRes = await client.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ('treasury@trading.com', $1, 'TREASURY') 
       ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
      [passwordHash]
    );
    const treasuryId = treasuryRes.rows[0].id;
    await client.query(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING`,
      [treasuryId]
    );

    // Create Test Buyer
    const buyerRes = await client.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ('buyer@trading.com', $1, 'USER') 
       ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
      [passwordHash]
    );
    const buyerId = buyerRes.rows[0].id;
    await client.query(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, 10000.00) ON CONFLICT (user_id) DO UPDATE SET balance = 10000.00`,
      [buyerId]
    );

    // Create Test Seller
    const sellerRes = await client.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ('seller@trading.com', $1, 'USER') 
       ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
      [passwordHash]
    );
    const sellerId = sellerRes.rows[0].id;
    await client.query(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, 10000.00) ON CONFLICT (user_id) DO UPDATE SET balance = 10000.00`,
      [sellerId]
    );

    // Create Test Admin
    const adminRes = await client.query(
      `INSERT INTO users (email, password_hash, role) 
       VALUES ('admin@trading.com', $1, 'ADMIN') 
       ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
      [passwordHash]
    );
    const adminId = adminRes.rows[0].id;
    await client.query(
      `INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING`,
      [adminId]
    );

    console.log('Users, admin, and wallets seeded');

    // 2. Seed exactly 100 Collectibles
    const categories = [
      { name: 'Unique Wall Painting', items: 20, supply: 1, basePriceRange: [100, 1000] },
      { name: 'Rare Showpiece', items: 20, supply: 5, basePriceRange: [50, 500] },
      { name: 'Historical Coin', items: 20, supply: 250, basePriceRange: [10, 150] },
      { name: 'Premium Watch', items: 20, supply: 10, basePriceRange: [300, 2000] },
      { name: 'Ancient Artifact', items: 20, supply: 2, basePriceRange: [500, 5000] },
    ];

    let currentId = 1;
    for (const cat of categories) {
      for (let i = 1; i <= cat.items; i++) {
        const name = `${cat.name} #${i}`;
        const description = `A highly coveted, collectible ${cat.name.toLowerCase()} for collectors and premium traders. Seeded item #${currentId}.`;
        const image_url = `https://picsum.photos/seed/collectible${currentId}/400/300`;
        const basePrice = Math.floor(
          Math.random() * (cat.basePriceRange[1] - cat.basePriceRange[0] + 1) + cat.basePriceRange[0]
        );

        await client.query(
          `INSERT INTO items (id, name, description, image_url, category, daily_base_price, last_price, total_supply, remaining_supply) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET 
             name = EXCLUDED.name, 
             description = EXCLUDED.description,
             daily_base_price = EXCLUDED.daily_base_price,
             last_price = EXCLUDED.last_price,
             total_supply = EXCLUDED.total_supply,
             remaining_supply = EXCLUDED.remaining_supply`,
          [currentId, name, description, image_url, cat.name, basePrice, basePrice, cat.supply, cat.supply]
        );

        // Also give the seller inventory for these items so they can sell them to the buyer
        if (cat.supply > 1) {
          // Give half the supply to the test seller
          const sellerQty = Math.floor(cat.supply / 2);
          await client.query(
            `INSERT INTO positions (user_id, item_id, quantity, average_price)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
            [sellerId, currentId, sellerQty, basePrice]
          );
        } else {
          // It's a 1-of-1 painting. Give it to the seller so it can be listed and sold.
          await client.query(
            `INSERT INTO positions (user_id, item_id, quantity, average_price)
             VALUES ($1, $2, 1, $3)
             ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = 1`,
            [sellerId, currentId, basePrice]
          );
        }

        currentId++;
      }
    }
    console.log('100 collectibles and test positions seeded');

    await client.query('COMMIT');
    console.log('Seeding finished successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding transaction failed, rolled back.', err);
    throw err;
  } finally {
    client.release();
  }
};

const run = async () => {
  try {
    await createSchema();
    await seedData();
    console.log('Database initialization complete!');
    process.exit(0);
  } catch (err) {
    console.error('Database setup failed', err);
    process.exit(1);
  }
};

run();
