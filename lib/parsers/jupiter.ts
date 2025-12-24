import { HeliusTransaction, Transaction } from '../../types';
import { BaseParser } from './base';
import bs58 from 'bs58';

export class JupiterParser extends BaseParser {
  private static JUPITER_V6_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
  private static JUPITER_LIMIT_ORDER_PROGRAM_ID = 'j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X';

  canParse(transaction: HeliusTransaction): boolean {
    const { instructions } = transaction;
    return (
      instructions?.some((ix: any) => 
        ix.programId === JupiterParser.JUPITER_V6_PROGRAM_ID ||
        ix.programId === JupiterParser.JUPITER_LIMIT_ORDER_PROGRAM_ID
      ) || false
    );
  }

  parse(transaction: HeliusTransaction, tokenMint: string): Transaction | null {
    const { signature, timestamp, tokenTransfers, nativeTransfers, feePayer, instructions, accountData } = transaction;

    // Find all transfers for the monitored token
    let relevantTransfers = tokenTransfers?.filter(t => t.mint === tokenMint) || [];
    
    // Fallback: If no token transfers found, check accountData for balance changes
    if (relevantTransfers.length === 0 && accountData) {
        const accountChanges = accountData.filter(ad => 
            ad.tokenBalanceChanges?.some(tbc => tbc.mint === tokenMint)
        );
        
        if (accountChanges.length > 0) {
            relevantTransfers = accountChanges.flatMap(ad => {
                const change = ad.tokenBalanceChanges!.find(tbc => tbc.mint === tokenMint)!;
                if (!change.rawTokenAmount) return [];
                
                const rawAmount = change.rawTokenAmount;
                const amount = parseFloat(rawAmount.tokenAmount) / Math.pow(10, rawAmount.decimals);
                
                if (amount === 0) return [];

                // Create virtual transfer
                if (amount < 0) {
                    return [{
                        fromUserAccount: change.userAccount || ad.account,
                        toUserAccount: '', 
                        tokenAmount: Math.abs(amount),
                        mint: tokenMint,
                        tokenStandard: 'Fungible'
                    }];
                } else {
                    return [{
                        fromUserAccount: '', 
                        toUserAccount: change.userAccount || ad.account,
                        tokenAmount: amount,
                        mint: tokenMint,
                        tokenStandard: 'Fungible'
                    }];
                }
            });
        }
    }

    if (relevantTransfers.length === 0) return null;

    let wallet = feePayer || '';
    let type: 'BUY' | 'SELL' | 'TRANSFER' = 'BUY';
    let tokenAmount = 0;
    let displayToken = 'SOL';
    let dex = 'Jupiter';

    // Check for Limit Order Cancel
    const isLimitOrder = instructions?.some((ix: any) => ix.programId === JupiterParser.JUPITER_LIMIT_ORDER_PROGRAM_ID);
    
    if (isLimitOrder) {
        // Check if it's a cancel order (user receiving tokens back)
        const incoming = relevantTransfers.filter(t => t.toUserAccount === feePayer);
        if (incoming.length > 0) {
            type = 'TRANSFER';
            wallet = feePayer;
            tokenAmount = incoming.reduce((sum, t) => sum + t.tokenAmount, 0);
            displayToken = 'Cancel Order';
            dex = 'Jupiter Limit Order';
            
            return {
                id: signature,
                signature,
                type,
                wallet,
                tokenAmount,
                solAmount: 0,
                timestamp: Date.now(),
                blockTime: timestamp,
                displayToken,
                dex,
            };
        }
    }

    // Check if feePayer is receiving or sending the token
    const incoming = relevantTransfers.filter(t => t.toUserAccount === feePayer);
    const outgoing = relevantTransfers.filter(t => t.fromUserAccount === feePayer);

    if (incoming.length > 0) {
        type = 'BUY';
        wallet = feePayer;
        tokenAmount = incoming.reduce((sum, t) => sum + t.tokenAmount, 0);
    } else if (outgoing.length > 0) {
        type = 'SELL';
        wallet = feePayer;
        tokenAmount = outgoing.reduce((sum, t) => sum + t.tokenAmount, 0);
    } else {
        // Fallback: If feePayer is not directly involved in the token transfer
        // Pick the first transfer and try to guess
        const t = relevantTransfers[0];
        
        // Check which account is involved in native transfers (paying/receiving SOL)
        const fromInvolved = nativeTransfers?.some(nt => nt.fromUserAccount === t.fromUserAccount || nt.toUserAccount === t.fromUserAccount);
        const toInvolved = nativeTransfers?.some(nt => nt.fromUserAccount === t.toUserAccount || nt.toUserAccount === t.toUserAccount);

        if (fromInvolved && !toInvolved) {
            wallet = t.fromUserAccount;
            type = 'SELL';
        } else if (toInvolved && !fromInvolved) {
            wallet = t.toUserAccount;
            type = 'BUY';
        } else {
            // Default fallback
            if (t.fromUserAccount && !t.toUserAccount) {
                wallet = t.fromUserAccount;
                type = 'SELL';
            } else if (t.toUserAccount && !t.fromUserAccount) {
                wallet = t.toUserAccount;
                type = 'BUY';
            } else {
                wallet = t.toUserAccount || t.fromUserAccount || feePayer;
                type = 'BUY';
            }
        }
        tokenAmount = t.tokenAmount;
    }

    // Calculate SOL Amount
    // Jupiter swaps often involve WSOL or Native SOL.
    // We need to capture the value of the trade in SOL.
    let solAmount = 0;
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

    // 1. Check for WSOL transfers
    if (tokenTransfers) {
        for (const transfer of tokenTransfers) {
            if (transfer.mint === WSOL_MINT) {
                // For SELL: User receives WSOL
                if (type === 'SELL' && transfer.toUserAccount === wallet) {
                    solAmount += transfer.tokenAmount;
                }
                // For BUY: User sends WSOL
                else if (type === 'BUY' && transfer.fromUserAccount === wallet) {
                    solAmount += transfer.tokenAmount;
                }
            }
        }
    }

    // 2. If no WSOL (or mixed), check Native SOL transfers
    // Note: Jupiter often unwraps WSOL to SOL at the end of a swap.
    if (nativeTransfers) {
        let nativeAmount = 0;
        for (const transfer of nativeTransfers) {
            if (type === 'SELL') {
                if (transfer.toUserAccount === wallet) {
                    nativeAmount += transfer.amount;
                }
            } else if (type === 'BUY') {
                if (transfer.fromUserAccount === wallet) {
                    nativeAmount += transfer.amount;
                }
            }
        }
        if (nativeAmount > 0) {
            // If we found native SOL, add it. 
            // Be careful not to double count if WSOL was unwrapped.
            // Usually if there is a WSOL transfer AND a Native transfer of similar amount, it's an unwrap.
            // If solAmount (WSOL) is already > 0, we might want to ignore native if it's just the unwrap.
            // But if solAmount is 0, we definitely take native.
            if (solAmount === 0) {
                solAmount += nativeAmount / 1e9;
            }
        }
    }

    // 3. Fallback: Check inner instructions for System Program transfers
    // This handles cases where SOL is transferred via CPI but not captured in nativeTransfers or WSOL
    if (solAmount === 0 && instructions) {
        const jupiterInstruction = instructions.find((ix: any) => 
            ix.programId === JupiterParser.JUPITER_V6_PROGRAM_ID ||
            ix.programId === JupiterParser.JUPITER_LIMIT_ORDER_PROGRAM_ID
        );

        if (jupiterInstruction && jupiterInstruction.innerInstructions) {
            for (const inner of jupiterInstruction.innerInstructions) {
                if (inner.programId === '11111111111111111111111111111111') { // System Program
                    try {
                        const data = Buffer.from(bs58.decode(inner.data));
                        // Transfer instruction: index (4 bytes) + amount (8 bytes)
                        if (data.length >= 12) {
                            const instructionIndex = data.readUInt32LE(0);
                            if (instructionIndex === 2) { // Transfer
                                const amount = Number(data.readBigUInt64LE(4));
                                const source = inner.accounts[0];
                                const dest = inner.accounts[1];
                                
                                if (type === 'BUY') {
                                    if (source === wallet) {
                                        solAmount += amount / 1e9;
                                    }
                                } else { // SELL
                                    if (dest === wallet) {
                                        solAmount += amount / 1e9;
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
    }

    // 4. If still no SOL, check for other tokens (USDC, USDT, etc.)
    if (solAmount === 0) {
        // Helper to check transfers
        const checkTokenTransfers = (transfers: any[]) => {
            for (const transfer of transfers) {
                if (transfer.mint === tokenMint) continue; // Skip monitored token
                if (transfer.mint === WSOL_MINT) continue; // Skip WSOL (already checked)

                let amount = 0;
                if (type === 'SELL' && transfer.toUserAccount === wallet) {
                    amount = transfer.tokenAmount;
                } else if (type === 'BUY' && transfer.fromUserAccount === wallet) {
                    amount = transfer.tokenAmount;
                }

                if (amount > 0) {
                    solAmount = amount;
                    if (transfer.mint === USDC_MINT) displayToken = 'USDC';
                    else if (transfer.mint === USDT_MINT) displayToken = 'USDT';
                    else displayToken = 'UNKNOWN'; 
                    return true;
                }
            }
            return false;
        };

        // Check real token transfers
        if (tokenTransfers && checkTokenTransfers(tokenTransfers)) {
            // Found
        } 
        // Check account data changes if not found in transfers
        else if (transaction.accountData) {
             const accountChanges = transaction.accountData.filter(ad => 
                ad.tokenBalanceChanges?.some(tbc => tbc.mint !== tokenMint && tbc.mint !== WSOL_MINT)
            );
            
            // Construct virtual transfers for other tokens
            const virtualTransfers = accountChanges.flatMap(ad => {
                // There might be multiple changes, but usually one per account
                return (ad.tokenBalanceChanges || []).map(tbc => {
                    if (tbc.mint === tokenMint || tbc.mint === WSOL_MINT) return null;
                    if (!tbc.rawTokenAmount) return null;
                    
                    const rawAmount = tbc.rawTokenAmount;
                    const amount = parseFloat(rawAmount.tokenAmount) / Math.pow(10, rawAmount.decimals);
                    
                    if (amount === 0) return null;

                    if (amount < 0) {
                        return {
                            fromUserAccount: tbc.userAccount || ad.account,
                            toUserAccount: '', 
                            tokenAmount: Math.abs(amount),
                            mint: tbc.mint
                        };
                    } else {
                        return {
                            fromUserAccount: '', 
                            toUserAccount: tbc.userAccount || ad.account,
                            tokenAmount: amount,
                            mint: tbc.mint
                        };
                    }
                }).filter(t => t !== null);
            });
            
            checkTokenTransfers(virtualTransfers);
        }
    }

    return this.createTransaction(
        transaction,
        type,
        wallet,
        tokenAmount,
        tokenMint,
        'Jupiter',
        solAmount,
        displayToken
    );
  }
}
