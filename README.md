# SmartCalc Pro

SmartCalc Pro is a responsive calculator workspace with 79 tools across math, business, unit conversion, geometry, finance, construction, and advanced mathematics. It runs directly in a modern browser and saves favorites, recently used calculators, theme, and history in local browser storage.

## Run locally

Open `index.html` in a browser, or serve this directory locally:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. No package installation or build step is required.

## Verify calculations

Run the self-contained Node test suite:

```sh
node tests/calculations.test.js
```

The calculation engine is in `calculations.js`; dashboard interactions and browser storage are in `app.js`; responsive styles are in `styles.css`.
