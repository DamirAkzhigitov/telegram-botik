-- Script to check database state
-- Run this with: wrangler d1 execute bot-users-db --file=./scripts/check-db.sql

-- Check users table structure
SELECT sql FROM sqlite_master WHERE type='table' AND name='users';

-- Check all users and their balances
SELECT telegram_id, username, coins, created_at 
FROM users 
ORDER BY coins ASC, created_at DESC;

-- Count users by coin balance
SELECT 
  COUNT(*) as total_users,
  SUM(CASE WHEN coins = 0 THEN 1 ELSE 0 END) as users_with_zero,
  SUM(CASE WHEN coins = 5 THEN 1 ELSE 0 END) as users_with_five,
  SUM(CASE WHEN coins != 0 AND coins != 5 THEN 1 ELSE 0 END) as users_with_other
FROM users;

-- Show users with 0 coins
SELECT telegram_id, username, coins, created_at 
FROM users 
WHERE coins = 0;

-- Show recent transactions
SELECT t.*, u.telegram_id, u.username 
FROM transactions t 
JOIN users u ON t.user_id = u.id 
ORDER BY t.created_at DESC 
LIMIT 10; 