# D1 Database Setup Guide

This guide will help you set up the Cloudflare D1 database for the bot's user registration and coin system.

## Prerequisites

- Wrangler CLI installed and configured
- Cloudflare account with access to D1 databases

## Step 1: Create D1 Database

1. Create a new D1 database:

```bash
wrangler d1 create bot-users-db
```

2. Note the database ID from the output. It will look something like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

## Step 2: Update Configuration

1. Update `wrangler.jsonc` with your database ID:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "bot-users-db",
    "database_id": "your-actual-database-id-here"
  }
]
```

2. Replace `your-actual-database-id-here` with the database ID from step 1.

## Step 3: Apply Database Schema

1. Apply the schema to your database:

```bash
wrangler d1 execute bot-users-db --file=./schema.sql
```

2. Verify the tables were created:

```bash
wrangler d1 execute bot-users-db --command="SELECT name FROM sqlite_master WHERE type='table';"
```

You should see:

- `users`
- `transactions`

## Step 4: Deploy

1. Deploy your worker:

```bash
wrangler deploy
```

## Database Schema

The database includes two main tables:

### Users Table

- `id`: Primary key
- `telegram_id`: Unique Telegram user ID
- `username`: Telegram username (optional)
- `first_name`: User's first name (optional)
- `last_name`: User's last name (optional)
- `coins`: Current coin balance (default: 5)
- `created_at`: Registration timestamp
- `updated_at`: Last update timestamp

### Transactions Table

- `id`: Primary key
- `user_id`: Foreign key to users table
- `action_type`: Type of action (e.g., 'registration', 'image_generation')
- `coins_change`: Change in coins (positive for addition, negative for deduction)
- `balance_before`: Balance before transaction
- `balance_after`: Balance after transaction
- `created_at`: Transaction timestamp

## Features

- **Automatic User Registration**: New users are automatically registered with 5 initial coins
- **Coin Balance Tracking**: Users can check their balance with `/balance`
- **Transaction History**: All coin transactions are logged for audit purposes
- **Balance Management**: Coins can be added or deducted for various actions

## Commands

- `/balance` - Check your current coin balance
- `/help` - Show available commands and current balance

## Development

For local development, you can use:

```bash
wrangler dev
```

This will start a local development server with the D1 database binding.
