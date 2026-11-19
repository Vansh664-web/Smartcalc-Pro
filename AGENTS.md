# Repository Guidelines

## Project Structure & Module Organization

SmartCalc Pro is a browser app with one optional Node server. `index.html` defines the dashboard and calculator dialog, `styles.css` contains the responsive design system, and `app.js` handles navigation, rendering, interactions, and local persistence. Keep formulas and calculator schemas in `calculations.js`. `server.js` serves the app locally and proxies the AI Tutor to Gemini; `netlify/functions/solve.js` is the production equivalent. Calculation tests live in `tests/`; user-facing run instructions are in `README.md`.

## Build, Test, and Development Commands

There is no build step or package installation. Open `index.html` in a modern browser or run `python3 -m http.server 8000` from the repository root and visit `http://localhost:8000`. Run `node --check app.js` and `node --check calculations.js` for syntax checks. Run `node tests/calculations.test.js` to exercise all calculator defaults, representative formulas, parser safety, and invalid inputs.

## Coding Style & Naming Conventions

Use two spaces for indentation in JavaScript, HTML, and CSS. Keep calculator IDs lowercase kebab-case and align them with their display names (for example, `compound-interest-calculator`). Keep calculation logic in the engine instead of mixing formulas into UI event handlers. Use descriptive field labels, explicit units, finite-number validation, and safe expression parsing; never use `eval()` or `Function()` to evaluate user input.

## Testing Guidelines

Add coverage in `tests/calculations.test.js` when adding or changing a formula. Test default results, boundary values, and invalid inputs. The suite uses only Node’s built-in `assert` and `vm` modules, so it needs no dependencies.

## Pull Request Guidelines

Keep changes focused and describe the user-visible behavior and formula assumptions. Include the commands run and their results. For layout changes, check a narrow mobile viewport and a desktop viewport in a browser; include screenshots when they help explain a visual change.

## Configuration & Data

History, favorites, recent tools, and theme are stored in the browser’s local storage on the user’s device. Do not add credentials or transmit calculation data to external services without a clear product requirement. The Gemini key belongs in `.env` or the host’s environment variables — never in a committed file, never in client JavaScript, and never in the repository.
