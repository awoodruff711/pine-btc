function sma(values, period) {
  if (values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((sum, n) => sum + n, 0) / period;
}

function stdev(values, period) {
  if (values.length < period) return null;
  const mean = sma(values, period);
  const variance = values.slice(-period).reduce((sum, n) => sum + (n - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

function rma(values, period) {
  if (!values.length) return [];
  const alpha = 1 / period;
  const output = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    output[i] = alpha * values[i] + (1 - alpha) * output[i - 1];
  }
  return output;
}

export function calculateRsi(closes, len = 14) {
  if (closes.length < len + 1) return null;
  const changes = closes.map((v, i) => (i === 0 ? 0 : v - closes[i - 1]));
  const up = changes.map((c) => Math.max(c, 0));
  const down = changes.map((c) => Math.max(-c, 0));
  const upRma = rma(up, len);
  const downRma = rma(down, len);
  const u = upRma[upRma.length - 1];
  const d = downRma[downRma.length - 1];
  if (d === 0) return 100;
  if (u === 0) return 0;
  return 100 - 100 / (1 + u / d);
}

export function calculateMfi(candles, len = 14) {
  if (candles.length < len + 1) return null;
  const typical = candles.map((c) => (c.high + c.low + c.close) / 3);
  let upper = 0;
  let lower = 0;
  for (let i = candles.length - len; i < candles.length; i += 1) {
    const change = typical[i] - typical[i - 1];
    if (change > 0) upper += candles[i].volume * typical[i];
    if (change < 0) lower += candles[i].volume * typical[i];
  }
  if (lower === 0) return 100;
  if (upper === 0) return 0;
  return 100 - 100 / (1 + upper / lower);
}

function bollinger(closes, length, mult = 1.0) {
  const basis = sma(closes, length);
  const dev = stdev(closes, length);
  if (basis == null || dev == null) return null;
  return {
    upper: basis + mult * dev,
    lower: basis - mult * dev,
  };
}

export function evaluateSignal(candles, version, settings = {}) {
  const closes = candles.map((c) => c.close);
  const lastPrice = closes[closes.length - 1];
  const rsi = calculateRsi(closes, 14);
  const mfi = calculateMfi(candles, 14);
  const bb1 = bollinger(closes, 20, 1.0);
  const bb2 = bollinger(closes, 17, 1.0);

  if (!bb1 || !bb2 || rsi == null || mfi == null) {
    return { action: "HOLD", reason: "Not enough candles", rsi, mfi, price: lastPrice };
  }

  const v1Buy = lastPrice < bb1.lower && rsi < 42;
  const v1Sell = lastPrice > bb1.upper && rsi > 70;

  const v2Buy = lastPrice < bb2.lower && rsi < 42;
  const v2Sell = lastPrice > bb2.upper && rsi > 76;

  const v3Buy = lastPrice < bb1.lower && mfi < 60;
  const v3Sell = lastPrice > bb1.upper && rsi > 65 && mfi > 64;

  if (version === "v1") {
    if (v1Buy) return { action: "BUY", reason: "v1 BBBuy + RSI", rsi, mfi, price: lastPrice };
    if (v1Sell) return { action: "SELL", reason: "v1 BBSell + RSI", rsi, mfi, price: lastPrice };
  }

  if (version === "v2") {
    if (v2Buy) return { action: "BUY", reason: "v2 BBBuy + RSI", rsi, mfi, price: lastPrice };
    if (v2Sell) return { action: "SELL", reason: "v2 BBSell + RSI", rsi, mfi, price: lastPrice };
  }

  if (version === "v3") {
    if (v3Buy) return { action: "BUY", reason: "v3 BBBuy + MFI", rsi, mfi, price: lastPrice };
    if (v3Sell) return { action: "SELL", reason: "v3 BBSell + RSI + MFI", rsi, mfi, price: lastPrice };
  }

  return {
    action: "HOLD",
    reason: "No entry/exit trigger",
    rsi,
    mfi,
    price: lastPrice,
    stopLossPct: Number(settings.stopLossPct || 0) / 100,
    takeProfitPct: Number(settings.takeProfitPct || 0) / 100,
  };
}
