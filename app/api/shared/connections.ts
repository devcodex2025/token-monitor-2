import WebSocket from 'ws';

// Use globalThis to persist connections across HMR reloads in development
const globalForConnections = global as unknown as {
  connections: Map<string, Set<ReadableStreamDefaultController>>;
  websockets: Map<string, WebSocket>;
};

// Shared WebSocket connections store for stream and webhook routes
export const connections = globalForConnections.connections || new Map<string, Set<ReadableStreamDefaultController>>();

// Map to store shared WebSocket connections for each token
export const websockets = globalForConnections.websockets || new Map<string, WebSocket>();

if (process.env.NODE_ENV !== 'production') {
  globalForConnections.connections = connections;
  globalForConnections.websockets = websockets;
}
