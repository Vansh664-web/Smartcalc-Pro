# SmartCalc Pro

SmartCalc Pro is a responsive calculator workspace with 79 tools across math, business, unit conversion, geometry, finance, construction, and advanced mathematics. It runs directly in a modern browser and saves favorites, recently used calculators, theme, and history in local browser storage.

## Run locally

Open `index.html` in a browser, or serve this directory locally:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. No package installation or build step is required.

## AI Math Tutor

The AI Tutor answers any calculation with the answer, the steps, and a check. It
needs a small local server so the API key never reaches the browser.

1. Create a `.env` file in this directory (it is git-ignored):

   ```sh
   GEMINI_API_KEY=your-key-here
   # optional: GEMINI_MODEL=gemini-3.8-flash
   ```

2. Start the server and open `http://localhost:8787`:

   ```sh
   node server.js
   ```

The server exposes `POST /api/solve`, which proxies to Gemini. The key is read
from `.env` or the environment and is never sent to the client. Without the key
the rest of the app still works; only the AI Tutor is disabled.

### Deploying to Netlify

`netlify.toml` publishes the static app and routes `/api/solve` to the function
in `netlify/functions/solve.js`. Add `GEMINI_API_KEY` under
**Site configuration → Environment variables** — never in the repository.

## Verify calculations

Run the self-contained Node test suites:

```sh
node tests/calculations.test.js
node tests/all-calculators.test.js
```

The second suite runs every one of the 79 calculators against defaults, zeros,
negatives, huge values, and every dropdown option, and fails on any `NaN`,
`undefined` or `Infinity` in a result.

The calculation engine is in `calculations.js`; dashboard interactions and browser storage are in `app.js`; responsive styles are in `styles.css`.
