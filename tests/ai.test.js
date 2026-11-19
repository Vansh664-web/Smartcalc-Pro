'use strict';

// Integration smoke test for the AI Math Tutor.
// Start the app first (node server.js), then run: node tests/ai.test.js
// Skips cleanly when no server is listening or no key is configured.

const BASE = process.env.SMARTCALC_URL || 'http://127.0.0.1:8787';

async function post(question) {
  const response = await fetch(`${BASE}/api/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question })
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

async function main() {
  let probe;
  try {
    probe = await post('');
  } catch {
    console.log(`Skipped: no server at ${BASE}. Run "node server.js" first.`);
    return;
  }

  if (probe.status === 503 && /not configured/i.test(probe.body.error || '')) {
    console.log('Skipped: server has no GEMINI_API_KEY configured.');
    return;
  }
  assert(probe.status === 400, `empty question returns 400, got ${probe.status}`);

  const cases = [
    ['What is 15% of 240?', '36'],
    ['Convert 12 km to miles', '7.4'],
    ['Solve 2x^2 - 5x + 3 = 0', '1']
  ];

  for (const [question, expected] of cases) {
    const { status, body } = await post(question);
    assert(status === 200, `"${question}" returns 200, got ${status}`);
    assert(typeof body.answer === 'string' && body.answer.length > 20, `"${question}" returns an answer`);
    assert(/Answer/i.test(body.answer), `"${question}" includes an Answer line`);
    assert(/Steps/i.test(body.answer), `"${question}" includes step-by-step working`);
    assert(!/\$\\?frac|\\\[/.test(body.answer), `"${question}" avoids raw LaTeX`);
    assert(body.answer.includes(expected), `"${question}" contains the expected value ${expected}`);
    console.log(`OK  ${question}`);
  }

  console.log(`Passed: AI tutor answered ${cases.length} questions with steps.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
