import { HeliusTransaction, Transaction } from '../../types';
import { BaseParser } from './base';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export class PumpFunParser extends BaseParser {
  private static PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

  canParse(transaction: HeliusTransaction): boolean {
    const { source, instructions } = transaction;
    return (
      source === 'PUMP_FUN' ||
      instructions?.some((ix: any) => ix.programId === PumpFunParser.PUMP_FUN_PROGRAM_ID) ||
      false
    );
  }

  parse(transaction: HeliusTransaction, tokenMint: string): Transaction | null {
    try {
      const { tokenTransfers, instructions } = transaction;
      
      // Derive Bonding Curve Address
      const PUMP_FUN_PROGRAM = new PublicKey(PumpFunParser.PUMP_FUN_PROGRAM_ID);
      const [bondingCurve] = PublicKey.findProgramAddressSync(
        [Buffer.from('bonding-curve'), new PublicKey(tokenMint).toBuffer()],
        PUMP_FUN_PROGRAM
      );
      const bondingCurveAddress = bondingCurve.toBase58();

      // Find the token transfer involving the bonding curve
      const curveTransfer = tokenTransfers?.find(t => 
        t.mint === tokenMint && 
        (t.fromUserAccount === bondingCurveAddress || t.toUserAccount === bondingCurveAddress)
      );

      if (!curveTransfer) {
        return null;
      }

      let type: 'BUY' | 'SELL';
      let wallet: string;

      // Determine direction based on flow relative to Bonding Curve
      if (curveTransfer.fromUserAccount === bondingCurveAddress) {
        // Bonding Curve sends tokens -> User BUYS
        type = 'BUY';
        wallet = curveTransfer.toUserAccount;
      } else {
        // User sends tokens to Bonding Curve -> User SELLS
        type = 'SELL';
        wallet = curveTransfer.fromUserAccount;
      }

      // Calculate SOL amount
      let solAmount = 0;

      // Strategy: Sum native transfers inside the Pump.fun instruction
      // This captures the actual cost (Curve + Fee) excluding external tips/fees
      const pumpInstruction = instructions?.find((ix: any) => ix.programId === PumpFunParser.PUMP_FUN_PROGRAM_ID);
      
      if (pumpInstruction && pumpInstruction.innerInstructions) {
        for (const inner of pumpInstruction.innerInstructions) {
            if (inner.programId === '11111111111111111111111111111111') {
                try {
                    const data = bs58.decode(inner.data);
                    // Transfer instruction: index (4 bytes) + amount (8 bytes)
                    if (data.length >= 12) {
                        const instructionIndex = data.readUInt32LE(0);
                        if (instructionIndex === 2) { // Transfer
                            const amount = Number(data.readBigUInt64LE(4));
                            const source = inner.accounts[0];
                            const dest = inner.accounts[1];
                            
                            if (type === 'BUY') {
                                if (source === wallet) {
                                    solAmount += amount;
                                }
                            } else { // SELL
                                if (dest === wallet) {
                                    solAmount += amount;
                                }
                            }
                        }
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
      }
      
      if (solAmount > 0) {
          solAmount = solAmount / 1e9;
      } else {
          // Fallback: Use global nativeTransfers
          if (transaction.nativeTransfers) {
            for (const transfer of transaction.nativeTransfers) {
              if (type === 'BUY') {
                if (transfer.fromUserAccount === wallet && transfer.toUserAccount !== wallet) {
                  solAmount += transfer.amount;
                }
              } else if (type === 'SELL') {
                if (transfer.toUserAccount === wallet && transfer.fromUserAccount !== wallet) {
                  solAmount += transfer.amount;
                }
              }
            }
            if (solAmount > 0) {
              solAmount = solAmount / 1e9;
            }
          }
      }

      return this.createTransaction(
        transaction,
        type,
        wallet,
        curveTransfer.tokenAmount,
        tokenMint,
        'Pump.fun',
        solAmount // Pass calculated amount
      );
    } catch (error) {
      console.error('Error parsing Pump.fun transaction:', error);
      return null;
    }
  }
}
