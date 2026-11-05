import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { http, ROOT, startServer } from '../helpers.js';

const TOOLS = ['add_questions', 'create_quiz', 'delete_quiz', 'get_quiz', 'list_live_games', 'list_quizzes', 'update_quiz', 'validate_quiz'];

const parse = res => {
  const text = res.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const QUIZ = {
  title: 'Planètes',
  description: 'Généré par une IA',
  questions: [
    { text: 'Plus grande planète ?', answers: ['Mars', 'Jupiter', 'Vénus', 'Terre'], correct: [1] },
    { type: 'truefalse', text: 'Pluton est une planète naine.', correct: true, timeLimit: 10 },
    { text: 'Planète rouge ?', answers: [{ text: 'Mars', correct: true }, { text: 'Saturne' }], points: 'double' },
  ],
};

async function httpClient(url, headers = {}) {
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers } }));
  return client;
}

async function scenario(client, url) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), TOOLS);
  const create = tools.find(t => t.name === 'create_quiz');
  assert.ok(create.inputSchema.properties.questions);
  assert.deepEqual(create.inputSchema.required.sort(), ['questions', 'title']);

  const created = parse(await client.callTool({ name: 'create_quiz', arguments: QUIZ }));
  assert.equal(created.questionCount, 3);
  assert.match(created.launchUrl, new RegExp(`/launch/${created.id}$`));

  const quiz = parse(await client.callTool({ name: 'get_quiz', arguments: { id: created.id } }));
  assert.deepEqual(quiz.questions[1].correct, [0]);
  assert.equal(quiz.questions[1].timeLimit, 10);
  assert.equal(quiz.questions[2].points, 2000);
  assert.deepEqual(quiz.questions[2].correct, [0]);

  const listed = parse(await client.callTool({ name: 'list_quizzes', arguments: {} }));
  assert.ok(listed.some(q => q.id === created.id));

  const updated = parse(await client.callTool({ name: 'update_quiz', arguments: { id: created.id, title: 'Système solaire' } }));
  assert.equal(updated.title, 'Système solaire');
  assert.equal(updated.questionCount, 3);

  const added = parse(await client.callTool({ name: 'add_questions', arguments: { id: created.id, questions: [{ text: 'Satellite de la Terre ?', answers: ['Lune', 'Titan'], correct: [0] }] } }));
  assert.equal(added.questionCount, 4);

  const invalid = await client.callTool({ name: 'create_quiz', arguments: { title: 'x', questions: [{ text: 'q', answers: ['seule'] }] } });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /au moins 2 réponses/);

  const validation = parse(await client.callTool({ name: 'validate_quiz', arguments: { title: '', questions: [] } }));
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.length, 2);

  const missing = await client.callTool({ name: 'get_quiz', arguments: { id: 'inexistant' } });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /introuvable/);

  assert.deepEqual(parse(await client.callTool({ name: 'list_live_games', arguments: {} })), []);

  const viaApi = await http(url, `/api/quizzes/${created.id}`);
  if (viaApi.status === 200) assert.equal(viaApi.data.quiz.questions.length, 4);

  assert.match(parse(await client.callTool({ name: 'delete_quiz', arguments: { id: created.id } })), /supprimé/);
  assert.equal((await client.callTool({ name: 'get_quiz', arguments: { id: created.id } })).isError, true);
}

describe('MCP HTTP (/mcp)', () => {
  let server;
  before(async () => {
    server = await startServer();
  });
  after(() => server.stop());

  it('expose les outils et gère un scénario complet', async () => {
    const client = await httpClient(server.url);
    try {
      await scenario(client, server.url);
    } finally {
      await client.close();
    }
  });

  it('refuse GET et JSON invalide', async () => {
    assert.equal((await http(server.url, '/mcp')).status, 405);
    const bad = await http(server.url, '/mcp', { method: 'POST', raw: '{', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' } });
    assert.equal(bad.status, 400);
  });
});

describe('MCP HTTP avec clé API', () => {
  let server;
  const key = 'mcp-key-' + Math.random().toString(36).slice(2);
  before(async () => {
    server = await startServer({ env: { HAKOOT_API_KEY: key, HAKOOT_TRUST_LOCALHOST: 'false' } });
  });
  after(() => server.stop());

  it('refuse sans clé et accepte avec', async () => {
    await assert.rejects(httpClient(server.url));
    await assert.rejects(httpClient(server.url, { authorization: 'Bearer faux' }));
    const client = await httpClient(server.url, { authorization: `Bearer ${key}` });
    const created = parse(await client.callTool({ name: 'create_quiz', arguments: QUIZ }));
    assert.ok(created.id);
    await client.close();
  });
});

describe('MCP stdio (mcp/stdio.js)', () => {
  let server;
  const key = 'stdio-key-' + Math.random().toString(36).slice(2);
  before(async () => {
    server = await startServer({ env: { HAKOOT_API_KEY: key, HAKOOT_TRUST_LOCALHOST: 'false' } });
  });
  after(() => server.stop());

  const stdioClient = async env => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'mcp/stdio.js')], env: { ...process.env, ...env }, stderr: 'pipe' }),
    );
    return client;
  };

  it('fonctionne via l\'API HTTP avec la clé', async () => {
    const client = await stdioClient({ HAKOOT_URL: server.url, HAKOOT_API_KEY: key });
    try {
      await scenario(client, server.url);
    } finally {
      await client.close();
    }
  });

  it('remonte une erreur lisible si la clé est fausse', async () => {
    const client = await stdioClient({ HAKOOT_URL: server.url, HAKOOT_API_KEY: 'faux' });
    try {
      const res = await client.callTool({ name: 'list_quizzes', arguments: {} });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /Clé API invalide/);
    } finally {
      await client.close();
    }
  });

  it('remonte une erreur lisible si le serveur est éteint', async () => {
    const client = await stdioClient({ HAKOOT_URL: 'http://127.0.0.1:9', HAKOOT_API_KEY: '' });
    try {
      const res = await client.callTool({ name: 'list_quizzes', arguments: {} });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /injoignable/);
    } finally {
      await client.close();
    }
  });
});
