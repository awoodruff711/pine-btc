const EXCHANGE_BASE = "https://api.exchange.coinbase.com";
const ADVANCED_BASE = "https://api.coinbase.com";

function authHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function fetchCandles(productId = "BTC-USD", granularity = 300) {
  const url = `${EXCHANGE_BASE}/products/${productId}/candles?granularity=${granularity}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Candle fetch failed (${response.status})`);

  const payload = await response.json();
  return payload
    .map((row) => ({
      time: Number(row[0]),
      low: Number(row[1]),
      high: Number(row[2]),
      open: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .sort((a, b) => a.time - b.time);
}

export async function getAccounts(apiKey) {
  const response = await fetch(`${ADVANCED_BASE}/api/v3/brokerage/accounts`, {
    method: "GET",
    headers: authHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(`Accounts fetch failed (${response.status})`);
  }

  const data = await response.json();
  return data.accounts ?? [];
}

function extractBalance(accounts, currency) {
  const account = accounts.find((item) => item.currency === currency);
  const value = Number(account?.available_balance?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function getBalances(apiKey) {
  const accounts = await getAccounts(apiKey);
  return {
    usd: extractBalance(accounts, "USD"),
    btc: extractBalance(accounts, "BTC"),
  };
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

async function submitOrder(apiKey, body) {
  const response = await fetch(`${ADVANCED_BASE}/api/v3/brokerage/orders`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Order failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function marketBuy({ apiKey, productId, quoteSize }) {
  return submitOrder(apiKey, {
    client_order_id: uuid(),
    product_id: productId,
    side: "BUY",
    order_configuration: {
      market_market_ioc: {
        quote_size: String(quoteSize),
      },
    },
  });
}

export async function marketSell({ apiKey, productId, baseSize }) {
  return submitOrder(apiKey, {
    client_order_id: uuid(),
    product_id: productId,
    side: "SELL",
    order_configuration: {
      market_market_ioc: {
        base_size: String(baseSize),
      },
    },
  });
}
