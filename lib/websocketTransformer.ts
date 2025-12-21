import { HeliusTransaction } from '../types';

interface WebSocketTransaction {
  slot: number;
  signature: string;
  transaction: {
    transaction: {
      signatures: string[];
      message: {
        accountKeys: Array<{
          pubkey: string;
          writable: boolean;
          signer: boolean;
          source: string;
        }>;
        instructions: any[];
      };
    };
    meta: {
      err: any;
      fee: number;
      preBalances: number[];
      postBalances: number[];
      innerInstructions: Array<{
        index: number;
        instructions: any[];
      }>;
      preTokenBalances: any[];
      postTokenBalances: any[];
      logMessages: string[];
    };
  };
}

export class WebSocketTransformer {
  static transform(wsTransaction: WebSocketTransaction): HeliusTransaction | null {
    try {
      const { slot, signature, transaction } = wsTransaction;
      const { meta } = transaction;
      const accountKeys = transaction.transaction.message.accountKeys;

      // Extract fee payer (first signer)
      const feePayer = accountKeys.find(key => key.signer)?.pubkey || '';

      // Extract token transfers from innerInstructions
      const tokenTransfers: any[] = [];
      
      if (meta.innerInstructions) {
        for (const inner of meta.innerInstructions) {
          for (const ix of inner.instructions) {
            // Look for parsed token transfers
            if (ix.parsed?.type === 'transferChecked') {
              const info = ix.parsed.info;
              const tokenAmount = info.tokenAmount || {};
              
              // Use uiAmount (already converted) or calculate from amount/decimals
              const amount = tokenAmount.uiAmount !== undefined && tokenAmount.uiAmount !== null
                ? tokenAmount.uiAmount
                : parseFloat(tokenAmount.amount || '0') / Math.pow(10, tokenAmount.decimals || 0);
              
              const transfer = {
                fromUserAccount: info.authority || info.source || '',  // authority is the actual user
                toUserAccount: info.destination || '',
                fromTokenAccount: info.source || '',
                toTokenAccount: info.destination || '',
                tokenAmount: amount, // Already converted to decimal
                mint: info.mint || '',
                tokenStandard: ix.programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' ? 'Token2022' : 'Fungible',
              };
              
              tokenTransfers.push(transfer);
            }
          }
        }
      }

      // Extract native transfers from balance changes
      const nativeTransfers: any[] = [];
      for (let i = 0; i < accountKeys.length; i++) {
        const preBalance = meta.preBalances[i] || 0;
        const postBalance = meta.postBalances[i] || 0;
        const diff = postBalance - preBalance;
        
        if (diff !== 0 && diff !== -meta.fee) { // Exclude fee
          nativeTransfers.push({
            fromUserAccount: diff < 0 ? accountKeys[i].pubkey : '',
            toUserAccount: diff > 0 ? accountKeys[i].pubkey : '',
            amount: Math.abs(diff),
          });
        }
      }

      // Build Enhanced format
      const enhanced: HeliusTransaction = {
        signature,
        timestamp: Math.floor(Date.now() / 1000), // Use current time or derive from slot
        slot,
        tokenTransfers,
        nativeTransfers,
        accountData: accountKeys.map(key => ({
          account: key.pubkey,
          nativeBalanceChange: 0,
          tokenBalanceChanges: [],
        })),
        transactionError: meta.err,
        instructions: transaction.transaction.message.instructions,
        events: {},
        fee: meta.fee,
        feePayer,
        type: 'UNKNOWN',
        source: 'WEBSOCKET',
      };

      return enhanced;
    } catch (error) {
      console.error('WebSocket transformation error:', error);
      return null;
    }
  }
}
