#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, httpBackend } from '../server/mcp.js';

const url = process.env.HAKOOT_URL || 'http://localhost:3000';
const server = createMcpServer(httpBackend(url, process.env.HAKOOT_API_KEY || ''));
await server.connect(new StdioServerTransport());
