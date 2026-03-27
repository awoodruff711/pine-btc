# pine-btc

A preview web app that ports your Pine Script **Flawless Victory Strategy** logic to JavaScript and runs paper-trading signals for BTC.

## Features

- Clean UI for strategy configuration and runtime metrics
- Coinbase Advanced API key input (stored in browser memory only)
- Start/Stop controls
- Max buy amount control in USD
- Supports v1, v2, v3 strategy modes
- Candle polling from Coinbase public market data
- Paper trading execution log with PnL and SL/TP handling

## Preview in Codex

From repo root:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173` in your preview/browser.

## Important

This build is **preview/paper mode only**. It intentionally does not place live orders from the browser.
Live trading should be implemented through a secure backend signer service.
