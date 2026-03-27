const BASE = "https://api.exchange.coinbase.com";

export async function fetchCandles(productId = "BTC-USD", granularity = 300) {
  const url = `${BASE}/products/${productId}/candles?granularity=${granularity}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Candle fetch failed (${response.status})`);
  }

  const payload = await response.json();

  return payload
    .map((row) => ({
      time: row[0],
      low: Number(row[1]),
      high: Number(row[2]),
      open: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .sort((a, b) => a.time - b.time);
}
