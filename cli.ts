import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
// Fallback to .env if .env.local doesn't exist or doesn't have the key
if (!process.env.HELIUS_API_KEY) {
  dotenv.config();
}

import { HeliusService } from './lib/helius';
import { TransactionParser } from './lib/transactionParser';
import { formatTime, formatTokenAmount, formatSolAmount, shortenAddress } from './lib/utils';

const apiKey = process.env.HELIUS_API_KEY;

if (!apiKey) {
  console.error('❌ Error: HELIUS_API_KEY not found in .env file');
  process.exit(1);
}

const tokenAddress = process.argv[2];

if (!tokenAddress) {
  console.error('❌ Error: Please provide a token address');
  console.log('Usage: npm run cli <token_address>');
  process.exit(1);
}

const helius = new HeliusService(apiKey);
const parser = TransactionParser;

console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Token Monitor CLI...');
console.log(`Target Token: ${tokenAddress}`);
console.log('Waiting for transactions...\n');

// Header
console.log(
  '%s %s %s %s %s %s',
  'TIME'.padEnd(10),
  'TYPE'.padEnd(6),
  'SOL AMOUNT'.padEnd(12),
  'TOKEN AMOUNT'.padEnd(15),
  'MAKER'.padEnd(15),
  'DEX'
);
console.log('-'.repeat(80));

let lastSignature: string | undefined;

async function poll() {
  try {
    const response = await helius.getTransactionHistory(tokenAddress, {
      until: lastSignature,
      limit: 10
    });

    if (response && response.length > 0) {
      // Update last signature to the most recent one
      lastSignature = response[0].signature;

      // Process transactions (reverse to show oldest first in this batch, so they appear in order)
      const newTxs = response.reverse();

      for (const tx of newTxs) {
        const parsed = parser.parse(tx, tokenAddress);
        if (parsed) {
          const time = formatTime(parsed.blockTime);
          const typeColor = parsed.type === 'BUY' ? '\x1b[32m' : '\x1b[31m'; // Green or Red
          const resetColor = '\x1b[0m';
          const type = `${typeColor}${parsed.type}${resetColor}`;
          const sol = formatSolAmount(parsed.solAmount).padEnd(12);
          const tokens = formatTokenAmount(parsed.tokenAmount).padEnd(15);
          const maker = shortenAddress(parsed.wallet).padEnd(15);
          const dex = parsed.dex;

          console.log(
            '%s %s %s %s %s %s',
            time.padEnd(10),
            type.padEnd(15), // Extra padding for color codes
            sol,
            tokens,
            maker,
            dex
          );
        }
      }
    }
  } catch (error) {
    // Silent error in loop to avoid spam
  }

  setTimeout(poll, 3000);
}

// Start polling
poll();
