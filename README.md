# pine-btc

Web app for running the Flawless Victory BTC strategy with paper mode **or live Coinbase market orders**.

## What changed

- Strategy polling + hold-aware execution (won't rebuy every poll if already long)
- Sell logic on Pine signal, plus optional SL/TP exits for v2/v3
- Live mode toggle for real market order placement
- Realized + unrealized P/L display
- Local position persistence across refreshes

## Preview in Codex

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Live trading notes

- Enable **LIVE market orders** in the UI.
- Provide a valid Coinbase API bearer token with permissions to view balances and place orders.
- The app sends market IOC buy/sell orders through Coinbase Advanced Trade endpoints.
- For safety, the key is not persisted to disk by this app.

## Safety reminder

Live trading carries risk. Start with very small max buy values and validate behavior in paper mode first.
