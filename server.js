// SmartCalc Pro — local server for the AI Math Tutor.
//
// Serves the static app and proxies math questions to Gemini. The API key is
// read from the environment (or a local .env file) and never reaches the browser.
//
//   node server.js            -> http://localhost:8787
//
// No dependencies. Requires Node 18+ (global fetch).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8787;
const MODEL_CHAIN = [...new Set([
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
].filter(Boolean))];
const MAX_BODY = 8 * 1024;
const MAX_QUESTION = 2000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, '');
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {
    // No .env file is fine when the variables are already exported.
  }
}

loadEnv(path.join(ROOT, '.env'));

const API_KEY = process.env.GEMINI_API_KEY || '';
const apiUrl = model => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
// Files that should never be served, even though they sit in the project root.
const BLOCKED = new Set(['server.js', 'netlify.toml', 'package.json', 'README.md', 'AGENTS.md']);

const SYSTEM_PROMPT = [
  'You are the math tutor inside SmartCalc Pro, a calculator web app.',
  'Solve the user\'s calculation exactly and show the working.',
  'Always structure the answer as:',
  '1. "**Answer:**" followed by the final result with units.',
  '2. "**Steps:**" followed by a numbered list, one operation per line,',
  '   showing the formula and the substituted numbers.',
  '3. "**Check:**" one short sentence verifying the result.',
  'Use plain arithmetic notation that is easy to read. Do not use LaTeX.',
  'Round money to 2 decimals and state the rounding.',
  'If the question is not a calculation, say so briefly and ask for the numbers.',
  'Never invent values the user did not provide; state any assumption you make.',
].join('\n');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function callModel(model, question, signal) {
  const response = await fetch(apiUrl(model), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200, topP: 0.9 },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || `AI provider returned ${response.status}.`;
    // Retry on retired models (400/404) and transient overload (429/500/503).
    const retryable = [400, 404, 429, 500, 503].includes(response.status);
    throw Object.assign(new Error(message), { status: 502, retryable });
  }

  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const answer = parts.map(part => part.text || '').join('').trim();

  if (!answer) {
    const reason = payload?.candidates?.[0]?.finishReason;
    throw Object.assign(
      new Error(reason === 'SAFETY' ? 'The question was blocked by the safety filter.' : 'The AI returned an empty answer.'),
      { status: 502 },
    );
  }

  return { answer, model };
}

async function askGemini(question) {
  let lastError;
  const deadline = Date.now() + 45_000;
  for (const model of MODEL_CHAIN) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(12_000, remaining));
    try {
      return await callModel(model, question, controller.signal);
    } catch (error) {
      lastError = error.name === 'AbortError'
        ? Object.assign(new Error('The AI took too long to answer. Try again.'), { status: 504 })
        : error;
      if (!error.retryable && error.name !== 'AbortError') throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function handleSolve(req, res) {
  if (!API_KEY) {
    send(res, 503, { error: 'The AI tutor is not configured. Add GEMINI_API_KEY to .env and restart the server.' });
    return;
  }

  const ip = req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) {
    send(res, 429, { error: 'Too many questions. Wait a minute and try again.' });
    return;
  }

  let question = '';
  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    question = String(body.question ?? '').trim();
  } catch (error) {
    send(res, error.status || 400, { error: error.status === 413 ? error.message : 'Send JSON like {"question":"..."}.' });
    return;
  }

  if (!question) {
    send(res, 400, { error: 'Ask a calculation question first.' });
    return;
  }
  if (question.length > MAX_QUESTION) {
    send(res, 400, { error: `Keep the question under ${MAX_QUESTION} characters.` });
    return;
  }

  try {
    send(res, 200, await askGemini(question));
  } catch (error) {
    const status = error.status || (error.name === 'AbortError' ? 504 : 502);
    send(res, status, {
      error: error.name === 'AbortError' ? 'The AI took too long to answer. Try again.' : error.message,
    });
  }
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, relative);

  // Keep requests inside the project, block dotfiles such as .env, and hide server-only files.
  const segments = relative.split(/[\\/]/);
  if (!file.startsWith(ROOT + path.sep) || segments.some(part => part.startsWith('.')) || BLOCKED.has(relative) || ['tests', 'netlify', 'tries'].includes(segments[0])) {
    send(res, 403, { error: 'Forbidden.' });
    return;
  }

  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) {
      send(res, 404, { error: 'Not found.' });
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (pathname === '/api/solve') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      send(res, 405, { error: 'Use POST.' });
      return;
    }
    handleSolve(req, res).catch(error => send(res, 500, { error: error.message }));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, { error: 'Method not allowed.' });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`SmartCalc Pro running at http://localhost:${PORT}`);
  console.log(API_KEY ? `AI tutor ready (models: ${MODEL_CHAIN.join(' -> ')}).` : 'AI tutor disabled: GEMINI_API_KEY is missing from .env.');
});
