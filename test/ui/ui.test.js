import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { http, ROOT, startServer } from '../helpers.js';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const browserPath = CANDIDATES.find(p => fs.existsSync(p));
const built = fs.existsSync(path.join(ROOT, 'dist', 'index.html'));
const skip = !browserPath ? 'aucun navigateur Chrome/Edge trouvé (CHROME_PATH)' : !built ? 'lance "npm run build" avant' : false;

describe('Interface (navigateur réel)', { skip, timeout: 180000 }, () => {
  let server;
  let puppeteer;
  const browsers = [];
  const errors = [];

  const open = async (width = 1280, height = 800, mobile = false) => {
    const browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: true,
      args: ['--no-first-run', ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [])],
    });
    browsers.push(browser);
    const page = (await browser.pages())[0];
    await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('dialog', d => d.accept());
    page.setDefaultTimeout(20000);
    return page;
  };

  const clickText = async (page, selector, text) => {
    await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].some(e => e.textContent.includes(t) && !e.disabled), {}, selector, text);
    await page.evaluate((s, t) => [...document.querySelectorAll(s)].find(e => e.textContent.includes(t) && !e.disabled).click(), selector, text);
  };

  const textOf = (page, selector) => page.$eval(selector, e => e.textContent);

  const join = async (pin, name) => {
    const page = await open(390, 780, true);
    await page.goto(`${server.url}/?pin=${pin}`);
    await page.waitForSelector('input[placeholder="Pseudo"]');
    await page.type('input[placeholder="Pseudo"]', name);
    await page.click('button.btn.dark');
    await page.waitForSelector('.player-bar');
    return page;
  };

  before(async () => {
    puppeteer = (await import('puppeteer-core')).default;
    server = await startServer();
  });

  after(async () => {
    await Promise.all(browsers.map(b => b.close().catch(() => {})));
    await server.stop();
  });

  it('joue une partie complète depuis un quiz créé par l\'API', async () => {
    const created = await http(server.url, '/api/quizzes', {
      method: 'POST',
      body: {
        title: 'Quiz UI',
        questions: [
          { text: 'Couleur du ciel ?', answers: ['Vert', 'Bleu', 'Rouge'], correct: [1], timeLimit: 10 },
          { type: 'truefalse', text: 'Le feu est chaud.', correct: true, timeLimit: 10 },
        ],
      },
    });
    assert.equal(created.status, 201);

    const host = await open();
    await host.goto(`${server.url}/create`);
    await host.waitForSelector('.quiz-card.server');
    assert.match(await textOf(host, '.quiz-card.server h3'), /Quiz UI/);
    await clickText(host, '.quiz-card.server button', 'Lancer');
    await host.waitForSelector('.pin');
    const pin = (await textOf(host, '.pin')).replace(/\D/g, '');
    assert.match(pin, /^\d{6}$/);

    const alice = await join(pin, 'Alice');
    const bob = await join(pin, 'Bob');
    await host.waitForFunction(() => document.querySelectorAll('.chip').length === 2);

    await clickText(host, 'button', 'Commencer');
    await host.waitForSelector('.intro-text');
    assert.match(await textOf(host, '.intro-text'), /Couleur du ciel/);

    await alice.waitForSelector('.player-answers .answer');
    await bob.waitForSelector('.player-answers .answer');
    assert.equal((await alice.$$('.player-answers .answer')).length, 3);
    await alice.click('.player-answers .answer:nth-child(2)');
    await alice.waitForSelector('.sent-tile');
    await bob.click('.player-answers .answer:nth-child(1)');

    await host.waitForSelector('.chart');
    assert.match(await textOf(host, '.answer.correct'), /Bleu/);
    await alice.waitForSelector('.tone-good');
    await bob.waitForSelector('.tone-bad');
    assert.match(await textOf(bob, '.center-col'), /Bonne réponse : Bleu/);

    await clickText(host, 'button', 'Suivant');
    await host.waitForSelector('.board');
    assert.match(await textOf(host, '.board li:first-child'), /Alice/);

    await clickText(host, 'button', 'Question suivante');
    await alice.waitForSelector('.player-answers .answer');
    await bob.waitForSelector('.player-answers .answer');
    await alice.click('.player-answers .answer:nth-child(1)');
    await bob.click('.player-answers .answer:nth-child(1)');
    await host.waitForSelector('.chart');
    await clickText(host, 'button', 'Voir le podium');
    await host.waitForSelector('.podium');
    await host.waitForFunction(() => document.querySelector('.place-1 .podium-name')?.textContent === 'Alice');
    await alice.waitForFunction(() => document.body.textContent.includes('1re place'));
    await bob.waitForFunction(() => document.body.textContent.includes('2e place'));

    await host.reload();
    await host.waitForSelector('.podium');
    assert.match(await textOf(host, '.results summary'), /2 joueurs/);

    await clickText(host, 'button', 'Terminer');
    await host.waitForFunction(() => location.pathname === '/create');
    await alice.waitForFunction(() => document.body.textContent.includes('Partie terminée'));
  });

  it('lance une partie directement depuis le lien /launch/:id', async () => {
    const created = await http(server.url, '/api/quizzes', {
      method: 'POST',
      body: { title: 'Lien direct', questions: [{ text: 'Q', answers: ['a', 'b'], correct: [0] }] },
    });
    const page = await open();
    await page.goto(created.data.links.launch);
    await page.waitForSelector('.pin');
    await page.waitForFunction(() => location.pathname === '/host');
    assert.match(await textOf(page, '.lobby-title'), /Lien direct/);
    const games = await http(server.url, '/api/games');
    assert.equal(games.data.games.filter(g => g.title === 'Lien direct').length, 1);

    await page.goto(`${server.url}/launch/inexistant`);
    await page.waitForFunction(() => document.body.textContent.includes("n'existe pas"));
  });

  it('crée un quiz dans l\'éditeur avec validation en direct', async () => {
    const page = await open();
    await page.goto(`${server.url}/create`);
    await clickText(page, 'button', 'Nouveau quiz');
    await page.waitForSelector('.q-text');
    await page.waitForSelector('.errors');
    assert.equal(await page.$eval('.topbar .btn.primary', b => b.disabled), true);

    await page.type('.title-input', 'Mon quiz UI');
    await page.type('.q-text', 'Capitale de la France ?');
    const inputs = await page.$$('.edit-answer input');
    await inputs[0].type('Paris');
    await inputs[1].type('Lyon');
    await page.waitForFunction(() => !document.querySelector('.errors'));
    assert.equal(await page.$eval('.topbar .btn.primary', b => b.disabled), false);

    await clickText(page, 'button', 'Vrai / Faux');
    await page.waitForFunction(() => document.querySelectorAll('.q-thumb').length === 2);
    await page.type('.q-text', 'La Terre est ronde.');
    await page.click('.edit-answer:nth-child(2) .correct-toggle');

    await clickText(page, 'a', 'Mes quiz');
    await page.waitForFunction(() => [...document.querySelectorAll('.quiz-card h3')].some(h => h.textContent === 'Mon quiz UI'));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hakoot:quizzes')).find(q => q.title === 'Mon quiz UI'));
    assert.equal(stored.questions.length, 2);
    assert.deepEqual(stored.questions[1].correct, [1]);
  });

  it('affiche une erreur pour un code PIN inconnu', async () => {
    const page = await open(390, 780, true);
    await page.goto(server.url);
    await page.type('.big-input', '000000');
    await page.click('button.btn.dark');
    await page.waitForSelector('.error');
    assert.match(await textOf(page, '.error'), /Aucune partie/);
  });

  it('n\'a produit aucune erreur JavaScript', () => {
    assert.deepEqual(errors.filter(e => !/Failed to load resource/.test(e)), []);
  });
});
