import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticate, baseUrl, rateLimit } from './auth.js';
import { config } from './config.js';
import { createMcpServer, storeBackend } from './mcp.js';

const rpcError = (res, status, code, message) => res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });

export function mcpRouter({ store, games }) {
  const r = express.Router();
  r.use(rateLimit());
  r.use(express.json({ limit: '1mb' }));

  r.post('/', async (req, res) => {
    const auth = authenticate(req);
    if (!auth.ok) return rpcError(res, auth.status, -32001, auth.error);
    const server = createMcpServer(storeBackend(store, games, baseUrl(req)), config.version);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp]', err);
      if (!res.headersSent) rpcError(res, 500, -32603, 'Erreur interne');
    }
  });

  r.all('/', (req, res) => {
    res.set('Allow', 'POST');
    rpcError(res, 405, -32000, 'Méthode non autorisée');
  });

  r.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return rpcError(res, 400, -32700, 'JSON invalide');
    if (err.type === 'entity.too.large') return rpcError(res, 413, -32600, 'Requête trop volumineuse');
    console.error('[mcp]', err);
    rpcError(res, 500, -32603, 'Erreur interne');
  });

  return r;
}
