// Netlify Function: POST /api/solve -> Gemini.
//
// Set GEMINI_API_KEY in Netlify (Site configuration -> Environment variables).
// It is read at runtime and never bundled into the site.

const MODEL_CHAIN = [...new Set([
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
].filter(Boolean))];
const apiUrl = model => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const MAX_QUESTION = 2000;

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

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return { ...json(405, { error: 'Use POST.' }), headers: { Allow: 'POST', 'Content-Type': 'application/json' } };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(503, { error: 'The AI tutor is not configured. Set GEMINI_API_KEY in Netlify environment variables.' });
  }

  let question = '';
  try {
    const body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : {};
    question = String(body.question ?? '').trim();
  } catch {
    return json(400, { error: 'Send JSON like {"question":"..."}.' });
  }

  if (!question) return json(400, { error: 'Ask a calculation question first.' });
  if (question.length > MAX_QUESTION) return json(400, { error: `Keep the question under ${MAX_QUESTION} characters.` });

  const deadline = Date.now() + 22_000;
  let lastError;

  try {
    for (const model of MODEL_CHAIN) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(8_000, remaining));
      try {
        const response = await fetch(apiUrl(model), {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: question }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1200, topP: 0.9 },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastError = payload?.error?.message || `AI provider returned ${response.status}.`;
          // Retry on retired models (400/404) and transient overload (429/500/503).
          if ([400, 404, 429, 500, 503].includes(response.status)) continue;
          return json(502, { error: lastError });
        }

        const answer = (payload?.candidates?.[0]?.content?.parts || [])
          .map(part => part.text || '')
          .join('')
          .trim();

        if (!answer) return json(502, { error: 'The AI returned an empty answer.' });
        return json(200, { answer, model });
      } finally {
        clearTimeout(timer);
      }
    }
    return json(502, { error: lastError || 'No AI model is available right now. Try again shortly.' });
  } catch (error) {
    return json(error.name === 'AbortError' ? 504 : 502, {
      error: error.name === 'AbortError' ? 'The AI took too long to answer. Try again.' : error.message,
    });
  }
};
