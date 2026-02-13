-- Database Performance Indexes
-- Run this after initial database setup

-- Transactions table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_from_address ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_to_address ON transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);

-- Composite index for common queries (wallet + status)
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_status 
  ON transactions(from_address, status);

-- Composite index for recent transactions per wallet
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_recent 
  ON transactions(from_address, created_at DESC);

-- Transaction Limits Tracking Table
CREATE TABLE IF NOT EXISTS transaction_limits (
  wallet_address VARCHAR(42) PRIMARY KEY,
  daily_volume_usd DECIMAL(12, 2) DEFAULT 0,
  daily_tx_count INTEGER DEFAULT 0,
  daily_volume_ngn DECIMAL(15, 2) DEFAULT 0,
  daily_volume_kes DECIMAL(15, 2) DEFAULT 0,
  last_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick lookups and resets
CREATE INDEX IF NOT EXISTS idx_limits_last_reset ON transaction_limits(last_reset);

-- Function to reset daily limits (call via cron job)
CREATE OR REPLACE FUNCTION reset_daily_limits()
RETURNS void AS $$
BEGIN
  UPDATE transaction_limits
  SET 
    daily_volume_usd = 0,
    daily_tx_count = 0,
    daily_volume_ngn = 0,
    daily_volume_kes = 0,
    last_reset = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE last_reset < CURRENT_TIMESTAMP - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Performance improvements
ANALYZE transactions;
ANALYZE transaction_limits;
