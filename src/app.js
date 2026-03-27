import { fetchCandles } from "./coinbase.js";
import { evaluateSignal } from "./strategy.js";

const ui = {
  apiKey: document.querySelector("#apiKey"),
  productId: document.querySelector("#productId"),
  version: document.querySelector("#version"),
  stopLossPct: document.querySelector("#stopLossPct"),
  takeProfitPct: document.querySelector("#takeProfitPct"),
  maxBuyUsd: document.querySelector("#maxBuyUsd"),
  pollSeconds: document.querySelector("#pollSeconds"),
  startBtn: document.querySelector("#startBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  botStatus: document.querySelector("#botStatus"),
  priceValue: document.querySelector("#priceValue"),
  rsiValue: document.querySelector("#rsiValue"),
  mfiValue: document.querySelector("#mfiValue"),
  positionValue: document.querySelector("#positionValue"),
  slValue: document.querySelector("#slValue"),
  tpValue: document.querySelector("#tpValue"),
  logPanel: document.querySelector("#logPanel"),
};

const state = {
  running: false,
  intervalId: null,
  position: null,
  apiKey: "",
};

function money(value) {
  if (value == null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function setStatus(running) {
  state.running = running;
  ui.botStatus.textContent = running ? "Running" : "Stopped";
  ui.botStatus.classList.toggle("live", running);
  ui.startBtn.disabled = running;
  ui.stopBtn.disabled = !running;
}

function log(line) {
  const ts = new Date().toISOString();
  ui.logPanel.textContent = `[${ts}] ${line}\n${ui.logPanel.textContent}`;
}

function readSettings() {
  return {
    productId: (ui.productId.value || "BTC-USD").trim().toUpperCase(),
    version: ui.version.value,
    stopLossPct: Number(ui.stopLossPct.value),
    takeProfitPct: Number(ui.takeProfitPct.value),
    maxBuyUsd: Number(ui.maxBuyUsd.value),
    pollSeconds: Math.max(5, Number(ui.pollSeconds.value || 20)),
  };
}

function applyRuntime(signal, settings) {
  ui.priceValue.textContent = money(signal.price);
  ui.rsiValue.textContent = signal.rsi?.toFixed(2) ?? "-";
  ui.mfiValue.textContent = signal.mfi?.toFixed(2) ?? "-";

  if (state.position?.entryPrice && settings.version !== "v1") {
    const sl = state.position.entryPrice * (1 - settings.stopLossPct / 100);
    const tp = state.position.entryPrice * (1 + settings.takeProfitPct / 100);
    ui.slValue.textContent = money(sl);
    ui.tpValue.textContent = money(tp);
  } else {
    ui.slValue.textContent = "-";
    ui.tpValue.textContent = "-";
  }

  ui.positionValue.textContent = state.position ? `LONG ${state.position.qtyBtc.toFixed(6)} BTC` : "FLAT";
}

function maybeExecute(signal, settings) {
  if (signal.action === "BUY" && !state.position) {
    const qtyBtc = settings.maxBuyUsd / signal.price;
    state.position = {
      side: "LONG",
      entryPrice: signal.price,
      qtyBtc,
      maxBuyUsd: settings.maxBuyUsd,
    };
    log(`BUY (paper) ${qtyBtc.toFixed(6)} BTC @ ${money(signal.price)} | ${signal.reason}`);
    return;
  }

  if (signal.action === "SELL" && state.position) {
    const pnl = (signal.price - state.position.entryPrice) * state.position.qtyBtc;
    log(`SELL (paper) ${state.position.qtyBtc.toFixed(6)} BTC @ ${money(signal.price)} | PnL ${money(pnl)} | ${signal.reason}`);
    state.position = null;
    return;
  }

  if (state.position && settings.version !== "v1") {
    const sl = state.position.entryPrice * (1 - settings.stopLossPct / 100);
    const tp = state.position.entryPrice * (1 + settings.takeProfitPct / 100);
    if (signal.price <= sl) {
      const pnl = (signal.price - state.position.entryPrice) * state.position.qtyBtc;
      log(`STOP LOSS (paper) @ ${money(signal.price)} | PnL ${money(pnl)}`);
      state.position = null;
    } else if (signal.price >= tp) {
      const pnl = (signal.price - state.position.entryPrice) * state.position.qtyBtc;
      log(`TAKE PROFIT (paper) @ ${money(signal.price)} | PnL ${money(pnl)}`);
      state.position = null;
    }
  }
}

async function tick() {
  const settings = readSettings();
  try {
    const candles = await fetchCandles(settings.productId, 300);
    const signal = evaluateSignal(candles, settings.version, settings);
    maybeExecute(signal, settings);
    applyRuntime(signal, settings);
    log(`${settings.version.toUpperCase()} signal: ${signal.action} (${signal.reason})`);
  } catch (error) {
    log(`Error: ${error.message}`);
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
  state.apiKey = ui.apiKey.value.trim();

  if (!state.apiKey) {
    log("No API key provided. Preview mode still works, but live orders are disabled.");
  } else {
    log("API key captured locally for preview session.");
  }

  setStatus(true);
  log(`Bot started for ${settings.productId}, version=${settings.version}, maxBuy=${money(settings.maxBuyUsd)}.`);

  tick();
  state.intervalId = setInterval(tick, settings.pollSeconds * 1000);
}

ui.startBtn.addEventListener("click", start);
ui.stopBtn.addEventListener("click", stop);
log("Ready. Configure bot and press Start.");
