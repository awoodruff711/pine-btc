import { fetchCandles, getBalances, marketBuy, marketSell } from "./coinbase.js";
import { evaluateSignal } from "./strategy.js";

const ui = {
  apiKey: document.querySelector("#apiKey"),
  productId: document.querySelector("#productId"),
  liveTrading: document.querySelector("#liveTrading"),
  version: document.querySelector("#version"),
  stopLossPct: document.querySelector("#stopLossPct"),
  takeProfitPct: document.querySelector("#takeProfitPct"),
  maxBuyUsd: document.querySelector("#maxBuyUsd"),
  pollSeconds: document.querySelector("#pollSeconds"),
  startBtn: document.querySelector("#startBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  botStatus: document.querySelector("#botStatus"),
  modeNotice: document.querySelector("#modeNotice"),
  priceValue: document.querySelector("#priceValue"),
  rsiValue: document.querySelector("#rsiValue"),
  mfiValue: document.querySelector("#mfiValue"),
  positionValue: document.querySelector("#positionValue"),
  entryValue: document.querySelector("#entryValue"),
  slValue: document.querySelector("#slValue"),
  tpValue: document.querySelector("#tpValue"),
  unrealizedPnlValue: document.querySelector("#unrealizedPnlValue"),
  realizedPnlValue: document.querySelector("#realizedPnlValue"),
  logPanel: document.querySelector("#logPanel"),
};

const state = {
  running: false,
  busy: false,
  intervalId: null,
  apiKey: "",
  realizedPnl: 0,
  position: null,
};

const storageKey = "pine-btc-live-position";

function money(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function savePosition() {
  localStorage.setItem(storageKey, JSON.stringify(state.position));
}

function loadPosition() {
  try {
    state.position = JSON.parse(localStorage.getItem(storageKey) || "null");
  } catch {
    state.position = null;
  }
}

function log(line) {
  const ts = new Date().toISOString();
  ui.logPanel.textContent = `[${ts}] ${line}\n${ui.logPanel.textContent}`;
}

function setStatus(running) {
  state.running = running;
  ui.botStatus.textContent = running ? "Running" : "Stopped";
  ui.botStatus.classList.toggle("live", running);
  ui.startBtn.disabled = running;
  ui.stopBtn.disabled = !running;
}

function readSettings() {
  return {
    apiKey: ui.apiKey.value.trim(),
    productId: (ui.productId.value || "BTC-USD").trim().toUpperCase(),
    liveTrading: ui.liveTrading.checked,
    version: ui.version.value,
    stopLossPct: safeNumber(ui.stopLossPct.value),
    takeProfitPct: safeNumber(ui.takeProfitPct.value),
    maxBuyUsd: safeNumber(ui.maxBuyUsd.value),
    pollSeconds: Math.max(10, safeNumber(ui.pollSeconds.value, 20)),
  };
}

function updateRuntime(signal, settings) {
  ui.modeNotice.textContent = settings.liveTrading
    ? "LIVE mode enabled: bot can send market BUY/SELL orders when conditions hit."
    : "Paper mode: signals execute virtually only.";

  ui.priceValue.textContent = money(signal.price);
  ui.rsiValue.textContent = signal.rsi?.toFixed(2) ?? "-";
  ui.mfiValue.textContent = signal.mfi?.toFixed(2) ?? "-";

  if (state.position) {
    ui.positionValue.textContent = `LONG ${state.position.qtyBtc.toFixed(6)} BTC`;
    ui.entryValue.textContent = money(state.position.entryPrice);
  } else {
    ui.positionValue.textContent = "FLAT";
    ui.entryValue.textContent = "-";
  }

  if (state.position?.entryPrice && settings.version !== "v1") {
    const sl = state.position.entryPrice * (1 - settings.stopLossPct / 100);
    const tp = state.position.entryPrice * (1 + settings.takeProfitPct / 100);
    ui.slValue.textContent = money(sl);
    ui.tpValue.textContent = money(tp);
  } else {
    ui.slValue.textContent = "-";
    ui.tpValue.textContent = "-";
  }

  const unrealized = state.position ? (signal.price - state.position.entryPrice) * state.position.qtyBtc : 0;
  ui.unrealizedPnlValue.textContent = money(unrealized);
  ui.realizedPnlValue.textContent = money(state.realizedPnl);
}

function parseOrderSize(response, fallbackBtc) {
  const order = response?.success_response ?? response?.order ?? {};
  const totalBase = safeNumber(order?.filled_size);
  if (totalBase > 0) return totalBase;
  return fallbackBtc;
}

async function ensurePositionConsistency(settings) {
  if (!settings.liveTrading || !settings.apiKey) return;
  const balances = await getBalances(settings.apiKey);

  if (balances.btc > 0.0000001 && !state.position) {
    log(`Detected existing BTC balance ${balances.btc.toFixed(6)} BTC; tracking as current holding.`);
    state.position = {
      entryPrice: safeNumber(state.position?.entryPrice, 0),
      qtyBtc: balances.btc,
    };
    savePosition();
  }

  if (balances.btc <= 0.0000001 && state.position) {
    log("No BTC balance detected on account; clearing local hold state.");
    state.position = null;
    savePosition();
  }
}

async function executeBuy(signal, settings) {
  const desiredQty = settings.maxBuyUsd / signal.price;
  if (desiredQty <= 0) return;

  if (settings.liveTrading) {
    const result = await marketBuy({
      apiKey: settings.apiKey,
      productId: settings.productId,
      quoteSize: settings.maxBuyUsd,
    });
    const qtyBtc = parseOrderSize(result, desiredQty);
    state.position = {
      entryPrice: signal.price,
      qtyBtc,
      openedAt: new Date().toISOString(),
    };
    savePosition();
    log(`BUY (LIVE) ${qtyBtc.toFixed(6)} BTC @ ${money(signal.price)} | ${signal.reason}`);
    return;
  }

  state.position = {
    entryPrice: signal.price,
    qtyBtc: desiredQty,
    openedAt: new Date().toISOString(),
  };
  savePosition();
  log(`BUY (paper) ${desiredQty.toFixed(6)} BTC @ ${money(signal.price)} | ${signal.reason}`);
}

async function executeSell(signal, settings, reason) {
  if (!state.position) return;
  const qtyToSell = state.position.qtyBtc;

  if (settings.liveTrading) {
    await marketSell({
      apiKey: settings.apiKey,
      productId: settings.productId,
      baseSize: qtyToSell,
    });
    log(`SELL (LIVE) ${qtyToSell.toFixed(6)} BTC @ ${money(signal.price)} | ${reason}`);
  } else {
    log(`SELL (paper) ${qtyToSell.toFixed(6)} BTC @ ${money(signal.price)} | ${reason}`);
  }

  const pnl = (signal.price - state.position.entryPrice) * state.position.qtyBtc;
  state.realizedPnl += pnl;
  log(`Trade closed. Realized P/L: ${money(pnl)} | Total: ${money(state.realizedPnl)}`);

  state.position = null;
  savePosition();
}

async function maybeExecute(signal, settings) {
  if (signal.action === "BUY" && !state.position) {
    await executeBuy(signal, settings);
    return;
  }

  if (signal.action === "SELL" && state.position) {
    await executeSell(signal, settings, signal.reason);
    return;
  }

  if (state.position && settings.version !== "v1") {
    const sl = state.position.entryPrice * (1 - settings.stopLossPct / 100);
    const tp = state.position.entryPrice * (1 + settings.takeProfitPct / 100);
    if (signal.price <= sl) {
      await executeSell(signal, settings, "Stop loss reached");
    } else if (signal.price >= tp) {
      await executeSell(signal, settings, "Take profit reached");
    }
  }
}

async function tick() {
  if (state.busy) return;
  state.busy = true;

  const settings = readSettings();
  try {
    await ensurePositionConsistency(settings);
    const candles = await fetchCandles(settings.productId, 300);
    const signal = evaluateSignal(candles, settings.version, settings);
    await maybeExecute(signal, settings);
    updateRuntime(signal, settings);
    log(`${settings.version.toUpperCase()} signal: ${signal.action} (${signal.reason})`);
  } catch (error) {
    log(`Error: ${error.message}`);
  } finally {
    state.busy = false;
  }
}

function stop() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  setStatus(false);
  log("Bot stopped.");
}

function start() {
  const settings = readSettings();
  state.apiKey = settings.apiKey;

  if (settings.liveTrading && !state.apiKey) {
    log("LIVE mode requires an API key. Start aborted.");
    return;
  }

  setStatus(true);
  log(
    `Bot started for ${settings.productId} | mode=${settings.liveTrading ? "LIVE" : "PAPER"} | version=${settings.version} | maxBuy=${money(settings.maxBuyUsd)}.`,
  );

  tick();
  state.intervalId = setInterval(tick, settings.pollSeconds * 1000);
}

loadPosition();
ui.startBtn.addEventListener("click", start);
ui.stopBtn.addEventListener("click", stop);
log("Ready. Configure bot and press Start.");
