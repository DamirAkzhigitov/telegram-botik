-- Script to fix existing users with 0 coins
-- Run this with: wrangler d1 execute bot-users-db --file=./scripts/fix-existing-users.sql

-- Show users that will be fixed
SELECT telegram_id, username, coins, created_at 
FROM users 
WHERE coins = 0;

-- Update all users with 0 coins to have 5 coins
UPDATE users 
SET coins = 5, updated_at = CURRENT_TIMESTAMP 
WHERE coins = 0;

-- Insert transaction records for the fix
INSERT INTO transactions (user_id, action_type, coins_change, balance_before, balance_after)
SELECT id, 'balance_fix', 5, 0, 5
FROM users 
WHERE coins = 5 AND updated_at = CURRENT_TIMESTAMP;

-- Verify the fix
SELECT 
  COUNT(*) as total_users,
  SUM(CASE WHEN coins = 0 THEN 1 ELSE 0 END) as users_with_zero,
  SUM(CASE WHEN coins = 5 THEN 1 ELSE 0 END) as users_with_five,
  SUM(CASE WHEN coins != 0 AND coins != 5 THEN 1 ELSE 0 END) as users_with_other
FROM users; 