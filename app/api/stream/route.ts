import { NextRequest } from 'next/server';
import WebSocket from 'ws';
import { TransactionParser } from '@/lib/transactionParser';
import { WebSocketTransformer } from '@/lib/websocketTransformer';
import { writeFileSync } from 'fs';
import { join } from 'path';

// Store active connections per token for webhook delivery
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const tokenAddress = searchParams.get('token');

  if (!tokenAddress) {
    return new Response('Token address required', { status: 400 });
  }

  // Set up Server-Sent Events with Helius WebSocket
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let heliusWs: WebSocket | null = null;

      // Register this connection for webhook delivery
      if (!connections.has(tokenAddress)) {
        connections.set(tokenAddress, new Set());
      }
      connections.get(tokenAddress)!.add(controller);

      const sendEvent = (data: any) => {
        if (isClosed) return;
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (err) {
          isClosed = true;
        }
      };

      // Connect to Helius Enhanced WebSocket
      const connectHeliusWebSocket = () => {
        const wsUrl = `wss://atlas-mainnet.helius-rpc.com?api-key=${process.env.HELIUS_API_KEY}`;
        
        heliusWs = new WebSocket(wsUrl);

        heliusWs.on('open', () => {
          console.log(`🔌 WebSocket connected for ${tokenAddress.slice(0, 8)}...`);
          
          // Subscribe to transactions
          heliusWs!.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'transactionSubscribe',
            params: [
              { failed: false, accountInclude: [tokenAddress] },
              {
                commitment: 'confirmed',
                encoding: 'jsonParsed',
                transactionDetails: 'full',
                maxSupportedTransactionVersion: 0
              }
            ]
          }));

          sendEvent({ 
            type: 'connected', 
            message: 'WebSocket connected - listening for transactions',
            tokenAddress: tokenAddress.slice(0, 8) + '...'
          });
        });

        heliusWs.on('message', async (data: Buffer) => {
          const t0 = performance.now();
          
          try {
            const response = JSON.parse(data.toString());
            
            // Handle subscription confirmation
            if (response.result) {
              console.log(`✅ Subscribed to transactions for ${tokenAddress.slice(0, 8)}...`);
              return;
            }

            // Handle transaction notification
            if (response.params?.result) {
              const result = response.params.result;
              const t1 = performance.now();
              
              // Save full transaction to file for analysis
              try {
                const filePath = join(process.cwd(), 'enhanced-websocket-transaction.json');
                writeFileSync(filePath, JSON.stringify(response.params.result, null, 2));
                console.log(`💾 Saved transaction to enhanced-websocket-transaction.json`);
              } catch (err) {
                console.error('Failed to save transaction:', err);
              }
              
              
              console.log(`📝 Transaction received in ${Math.round(t1 - t0)}ms`);
              console.log('Result structure:', {
                hasTransaction: !!result.transaction,
                hasSlot: !!result.slot,
                hasSignature: !!result.signature,
                keys: Object.keys(result)
              });
              
              // The transaction data is in result.transaction
              if (result.transaction) {
                const t1 = performance.now();
                
                console.log(`📝 Transaction received in ${Math.round(t1 - t0)}ms`);
                
                // Transform WebSocket format to Enhanced format locally (no API call!)
                const enhanced = WebSocketTransformer.transform(result);
                
                if (!enhanced) {
                  console.log('❌ Failed to transform transaction');
                  return;
                }
                
                const t2 = performance.now();
                console.log(`🔄 Local transformation took ${Math.round(t2 - t1)}ms`);
                console.log(`📊 Enhanced data:`, {
                  tokenTransfers: enhanced.tokenTransfers?.length,
                  nativeTransfers: enhanced.nativeTransfers?.length,
                  feePayer: enhanced.feePayer?.slice(0, 8),
                  instructions: enhanced.instructions?.length
                });
              
                // Parse transaction
                const parsed = TransactionParser.parse(enhanced, tokenAddress);
              
                if (parsed) {
                  console.log('Parse result:', `${parsed.type} ${parsed.solAmount} SOL`);
                  const t3 = performance.now();
                
                  sendEvent({
                    type: 'transaction',
                    transaction: parsed,
                    _timing: {
                      receive: Math.round(t1 - t0),
                      transform: Math.round(t2 - t1),
                      parse: Math.round(t3 - t2),
                      total: Math.round(t3 - t0)
                    },
                    _source: 'websocket'
                  });

                  console.log(`⚡ WebSocket TX: ${parsed.type} ${parsed.solAmount} SOL in ${Math.round(t3 - t0)}ms`);
                } else {
                  console.log('❌ Parser returned null - checking tokenTransfers:');
                  const ourTokenTransfers = enhanced.tokenTransfers?.filter(t => t.mint === tokenAddress);
                  console.log(`   Our token (${tokenAddress.slice(0, 8)}...) transfers:`, ourTokenTransfers?.length || 0);
                  if (ourTokenTransfers && ourTokenTransfers.length > 0) {
                    console.log(`   First transfer:`, ourTokenTransfers[0]);
                  }
                }
              }
            }
          } catch (error) {
            console.error('WebSocket message error:', error);
          }
        });

        heliusWs.on('error', (error) => {
          console.error('WebSocket error:', error);
          sendEvent({ type: 'error', message: 'WebSocket connection error' });
        });

        heliusWs.on('close', () => {
          console.log(`🔌 WebSocket disconnected for ${tokenAddress.slice(0, 8)}...`);
          
          // Reconnect if connection is still active
          if (!isClosed) {
            console.log('Reconnecting WebSocket in 3s...');
            setTimeout(connectHeliusWebSocket, 3000);
          }
        });
      };

      // Start WebSocket connection
      connectHeliusWebSocket();

      // Send initial connection confirmation
      sendEvent({ 
        type: 'connecting', 
        message: 'Connecting to Helius WebSocket...',
        tokenAddress: tokenAddress.slice(0, 8) + '...'
      });

      // Send heartbeat every 30s to keep SSE connection alive
      const heartbeat = setInterval(() => {
        sendEvent({ type: 'heartbeat', timestamp: Date.now() });
      }, 30000);

      // Send ping to WebSocket every 10s to prevent timeout
      const wsPing = setInterval(() => {
        if (heliusWs && heliusWs.readyState === WebSocket.OPEN) {
          heliusWs.ping();
        }
      }, 10000);

      // Clean up on disconnect
      req.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(heartbeat);
        clearInterval(wsPing);
        
        // Close WebSocket
        if (heliusWs) {
          heliusWs.close();
          heliusWs = null;
        }
        
        // Remove this connection from webhook delivery
        const tokenConnections = connections.get(tokenAddress);
        if (tokenConnections) {
          tokenConnections.delete(controller);
          if (tokenConnections.size === 0) {
            connections.delete(tokenAddress);
          }
        }
        
        try {
          controller.close();
        } catch (err) {
          // Already closed, ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Export connections for webhook route
export { connections };
