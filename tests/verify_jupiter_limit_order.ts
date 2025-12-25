import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TransactionParser } from '../lib/transactionParser';
import { HeliusTransaction } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const txPath = path.join(__dirname, 'repro_jupiter_limit_order.json');
const txData = JSON.parse(fs.readFileSync(txPath, 'utf-8')) as HeliusTransaction;

const tokenMint = 'CSrwNk6B1DwWCHRMsaoDVUfD5bBMQCJPY72ZG3Nnpump';

console.log('Parsing transaction...');
const parsed = TransactionParser.parse(txData, tokenMint);

if (parsed) {
    console.log('Parsed Transaction:');
    console.log(JSON.stringify(parsed, null, 2));
    
    if (parsed.solAmount > 0) {
        console.log('SUCCESS: solAmount is greater than 0');
    } else {
        console.log('FAILURE: solAmount is 0');
    }
    
    if (parsed.dex === 'Jupiter Limit Order') {
        console.log('SUCCESS: DEX is Jupiter Limit Order');
    } else {
        console.log(`FAILURE: DEX is ${parsed.dex}`);
    }
} else {
    console.log('Failed to parse transaction');
}
