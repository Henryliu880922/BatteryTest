const state = {
  battery: null,
  currentLevel: null,
  charging: null,
  records: [],
  testStartAt: null,
  pausedAt: null,
  totalPausedMs: 0,
  running: false,
  paused: false,
  timer: null,
  autoRecordTimer: null,
  manualMode: false
};

const $ = (id) => document.getElementById(id);

const elements = {
  apiBadge: $("apiBadge"),
  batteryFill: $("batteryFill"),
  batteryPercentText: $("batteryPercentText"),
  chargingState: $("chargingState"),
  currentPowerSource: $("currentPowerSource"),
  elapsedTime: $("elapsedTime"),
  consumedPercent: $("consumedPercent"),
  drainRate: $("drainRate"),
  estimatedRuntime: $("estimatedRuntime"),
  estimatedRemaining: $("estimatedRemaining"),
  testName: $("testName"),
  testScenario: $("testScenario"),
  brightness: $("brightness"),
  notes: $("notes"),
  manualInputBox: $("manualInputBox"),
  manualBatteryLevel: $("manualBatteryLevel"),
  recordManualButton: $("recordManualButton"),
  startButton: $("startButton"),
  pauseButton: $("pauseButton"),
  stopButton: $("stopButton"),
  resetButton: $("resetButton"),
  addRecordButton: $("addRecordButton"),
  exportButton: $("exportButton"),
  recordsBody: $("recordsBody"),
  recordCount: $("recordCount"),
  batteryChart: $("batteryChart")
};

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map(v => String(v).padStart(2, "0")).join(":");
}

function formatHours(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return "--";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分鐘`;
}

function getElapsedMs() {
  if (!state.testStartAt) return 0;
  const end = state.paused && state.pausedAt ? state.pausedAt : Date.now();
  return Math.max(0, end - state.testStartAt - state.totalPausedMs);
}

function updateBatteryDisplay() {
  const level = state.currentLevel;
  if (level === null) {
    elements.batteryFill.style.width = "0%";
    elements.batteryPercentText.textContent = "--%";
  } else {
    elements.batteryFill.style.width = `${level}%`;
    elements.batteryPercentText.textContent = `${level.toFixed(0)}%`;
    elements.manualBatteryLevel.value = Math.round(level);
  }

  const chargingText = state.charging === null
    ? "狀態：未知"
    : state.charging
      ? "狀態：充電中"
      : "狀態：使用電池";

  elements.chargingState.textContent = chargingText;
  elements.currentPowerSource.textContent = state.charging === null
    ? "電源：未知"
    : state.charging
      ? "電源：外接電源"
      : "電源：電池";
}

function computeMetrics() {
  if (state.records.length < 2) {
    return {
      consumed: 0,
      rate: null,
      totalRuntime: null,
      remaining: null
    };
  }

  const first = state.records[0];
  const last = state.records[state.records.length - 1];
  const consumed = Math.max(0, first.level - last.level);
  const hours = (last.elapsedMs - first.elapsedMs) / 3600000;
  const rate = hours > 0 && consumed > 0 ? consumed / hours : null;
  const totalRuntime = rate ? 100 / rate : null;
  const remaining = rate ? last.level / rate : null;

  return { consumed, rate, totalRuntime, remaining };
}

function updateMetrics() {
  const elapsed = getElapsedMs();
  const metrics = computeMetrics();

  elements.elapsedTime.textContent = formatDuration(elapsed);
  elements.consumedPercent.textContent = `${metrics.consumed.toFixed(1)}%`;
  elements.drainRate.textContent = metrics.rate ? `${metrics.rate.toFixed(2)} % / 小時` : "-- % / 小時";
  elements.estimatedRuntime.textContent = formatHours(metrics.totalRuntime);
  elements.estimatedRemaining.textContent = formatHours(metrics.remaining);
}

function addRecord(note = "") {
  if (state.currentLevel === null) {
    alert("目前沒有電量資料，請先手動輸入目前電量。");
    return;
  }

  const elapsedMs = getElapsedMs();

  const last = state.records[state.records.length - 1];
  if (
    last &&
    Math.abs(last.level - state.currentLevel) < 0.01 &&
    elapsedMs - last.elapsedMs < 30000 &&
    !note
  ) {
    return;
  }

  state.records.push({
    timestamp: new Date(),
    elapsedMs,
    level: Number(state.currentLevel.toFixed(2)),
    charging: state.charging,
    note
  });

  renderRecords();
  updateMetrics();
  drawChart();
  saveSession();
}

function renderRecords() {
  elements.recordCount.textContent = `目前 ${state.records.length} 筆資料`;

  if (state.records.length === 0) {
    elements.recordsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">尚未開始測試</td>
      </tr>`;
    return;
  }

  elements.recordsBody.innerHTML = [...state.records].reverse().map(record => `
    <tr>
      <td>${record.timestamp.toLocaleString("zh-TW", { hour12: false })}</td>
      <td>${formatDuration(record.elapsedMs)}</td>
      <td>${record.level.toFixed(1)}%</td>
      <td>${record.charging === null ? "未知" : record.charging ? "充電中" : "使用電池"}</td>
      <td>${escapeHtml(record.note || "")}</td>
    </tr>
  `).join("");
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function startTest() {
  if (state.currentLevel === null) {
    alert("請先輸入目前電量。");
    return;
  }

  if (!state.testStartAt) {
    state.testStartAt = Date.now();
    state.totalPausedMs = 0;
    state.records = [];
  }

  state.running = true;
  state.paused = false;
  state.pausedAt = null;

  elements.startButton.disabled = true;
  elements.pauseButton.disabled = false;
  elements.stopButton.disabled = false;

  addRecord("測試開始");
  startTimers();
  saveSession();
}

function pauseTest() {
  if (!state.running || state.paused) return;

  state.paused = true;
  state.pausedAt = Date.now();
  elements.pauseButton.textContent = "繼續";
  stopTimers();
  addRecord("測試暫停");
  updateMetrics();
  saveSession();
}

function resumeTest() {
  if (!state.paused || !state.pausedAt) return;

  state.totalPausedMs += Date.now() - state.pausedAt;
  state.pausedAt = null;
  state.paused = false;
  elements.pauseButton.textContent = "暫停";
  addRecord("測試繼續");
  startTimers();
  saveSession();
}

function stopTest() {
  if (!state.testStartAt) return;

  addRecord("測試結束");
  state.running = false;
  state.paused = false;
  state.pausedAt = null;
  stopTimers();

  elements.startButton.disabled = false;
  elements.startButton.textContent = "重新開始測試";
  elements.pauseButton.disabled = true;
  elements.pauseButton.textContent = "暫停";
  elements.stopButton.disabled = true;

  updateMetrics();
  saveSession();
}

function resetTest() {
  if (!confirm("確定要清除目前測試紀錄嗎？")) return;

  stopTimers();
  state.records = [];
  state.testStartAt = null;
  state.pausedAt = null;
  state.totalPausedMs = 0;
  state.running = false;
  state.paused = false;

  elements.startButton.disabled = false;
  elements.startButton.textContent = "開始測試";
  elements.pauseButton.disabled = true;
  elements.pauseButton.textContent = "暫停";
  elements.stopButton.disabled = true;

  renderRecords();
  updateMetrics();
  drawChart();
  localStorage.removeItem("batteryEnduranceSession");
}

function startTimers() {
  stopTimers();
  state.timer = setInterval(updateMetrics, 1000);
  state.autoRecordTimer = setInterval(() => addRecord(), 60000);
}

function stopTimers() {
  clearInterval(state.timer);
  clearInterval(state.autoRecordTimer);
  state.timer = null;
  state.autoRecordTimer = null;
}

function drawChart() {
  const canvas = elements.batteryChart;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.max(600, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(320 * dpr);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 320;
  const padding = { left: 52, right: 20, top: 20, bottom: 38 };

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.fillStyle = "#99a5ba";
  ctx.font = "12px system-ui";

  for (let y = 0; y <= 100; y += 20) {
    const py = padding.top + (100 - y) / 100 * (height - padding.top - padding.bottom);
    ctx.beginPath();
    ctx.moveTo(padding.left, py);
    ctx.lineTo(width - padding.right, py);
    ctx.stroke();
    ctx.fillText(`${y}%`, 10, py + 4);
  }

  if (state.records.length === 0) {
    ctx.fillStyle = "#99a5ba";
    ctx.textAlign = "center";
    ctx.fillText("開始測試後，耗電趨勢會顯示在這裡", width / 2, height / 2);
    ctx.textAlign = "left";
    return;
  }

  const maxElapsed = Math.max(
    state.records[state.records.length - 1].elapsedMs,
    1
  );
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const points = state.records.map(record => ({
    x: padding.left + (record.elapsedMs / maxElapsed) * plotWidth,
    y: padding.top + ((100 - record.level) / 100) * plotHeight
  }));

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(110,231,168,0.28)");
  gradient.addColorStop(1, "rgba(110,231,168,0.01)");

  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padding.bottom);
  points.forEach(point => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = "#6ee7a8";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  points.forEach(point => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#6ee7a8";
    ctx.fill();
  });

  ctx.fillStyle = "#99a5ba";
  ctx.textAlign = "center";
  ctx.fillText("經過時間", width / 2, height - 10);
  ctx.textAlign = "left";
}

function exportCsv() {
  if (state.records.length === 0) {
    alert("目前沒有可以匯出的測試紀錄。");
    return;
  }

  const metrics = computeMetrics();
  const metadata = [
    ["測試名稱", elements.testName.value],
    ["測試情境", elements.testScenario.value],
    ["螢幕亮度", elements.brightness.value],
    ["備註", elements.notes.value],
    ["測試時間", formatDuration(getElapsedMs())],
    ["平均耗電速度", metrics.rate ? `${metrics.rate.toFixed(2)} %/小時` : ""],
    ["預估總續航", formatHours(metrics.totalRuntime)],
    []
  ];

  const rows = [
    ...metadata,
    ["記錄時間", "經過時間", "電量", "充電狀態", "備註"],
    ...state.records.map(record => [
      record.timestamp.toLocaleString("zh-TW", { hour12: false }),
      formatDuration(record.elapsedMs),
      `${record.level.toFixed(1)}%`,
      record.charging === null ? "未知" : record.charging ? "充電中" : "使用電池",
      record.note || ""
    ])
  ];

  const csv = "\uFEFF" + rows
    .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (elements.testName.value || "續航力測試").replace(/[\\/:*?"<>|]/g, "_");

  link.href = url;
  link.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function saveSession() {
  const payload = {
    testName: elements.testName.value,
    testScenario: elements.testScenario.value,
    brightness: elements.brightness.value,
    notes: elements.notes.value,
    records: state.records.map(record => ({
      ...record,
      timestamp: record.timestamp.toISOString()
    })),
    testStartAt: state.testStartAt,
    pausedAt: state.pausedAt,
    totalPausedMs: state.totalPausedMs,
    running: state.running,
    paused: state.paused
  };

  localStorage.setItem("batteryEnduranceSession", JSON.stringify(payload));
}

function restoreSession() {
  try {
    const raw = localStorage.getItem("batteryEnduranceSession");
    if (!raw) return;

    const data = JSON.parse(raw);
    elements.testName.value = data.testName || elements.testName.value;
    elements.testScenario.value = data.testScenario || elements.testScenario.value;
    elements.brightness.value = data.brightness || "";
    elements.notes.value = data.notes || "";

    state.records = (data.records || []).map(record => ({
      ...record,
      timestamp: new Date(record.timestamp)
    }));
    state.testStartAt = data.testStartAt || null;
    state.pausedAt = data.pausedAt || null;
    state.totalPausedMs = data.totalPausedMs || 0;
    state.running = Boolean(data.running);
    state.paused = Boolean(data.paused);

    if (state.running) {
      elements.startButton.disabled = true;
      elements.pauseButton.disabled = false;
      elements.stopButton.disabled = false;

      if (state.paused) {
        elements.pauseButton.textContent = "繼續";
      } else {
        startTimers();
      }
    }

    renderRecords();
    updateMetrics();
    drawChart();
  } catch (error) {
    console.warn("無法還原上次測試資料：", error);
  }
}

async function initBatteryApi() {
  if ("getBattery" in navigator) {
    try {
      state.battery = await navigator.getBattery();
      state.manualMode = false;
      elements.apiBadge.textContent = "自動讀取電量";
      elements.apiBadge.classList.add("supported");

      const syncBattery = () => {
        state.currentLevel = state.battery.level * 100;
        state.charging = state.battery.charging;
        updateBatteryDisplay();

        if (state.running && !state.paused) {
          const last = state.records[state.records.length - 1];
          if (!last || Math.abs(last.level - state.currentLevel) >= 0.5) {
            addRecord();
          }
        }
      };

      syncBattery();
      state.battery.addEventListener("levelchange", syncBattery);
      state.battery.addEventListener("chargingchange", syncBattery);
      return;
    } catch (error) {
      console.warn("Battery API 無法使用：", error);
    }
  }

  state.manualMode = true;
  state.currentLevel = Number(elements.manualBatteryLevel.value);
  state.charging = false;
  elements.manualInputBox.classList.remove("hidden");
  elements.apiBadge.textContent = "手動輸入模式";
  elements.apiBadge.classList.add("manual");
  updateBatteryDisplay();
}

elements.startButton.addEventListener("click", startTest);
elements.pauseButton.addEventListener("click", () => {
  if (state.paused) resumeTest();
  else pauseTest();
});
elements.stopButton.addEventListener("click", stopTest);
elements.resetButton.addEventListener("click", resetTest);
elements.addRecordButton.addEventListener("click", () => addRecord("手動記錄"));
elements.exportButton.addEventListener("click", exportCsv);

elements.recordManualButton.addEventListener("click", () => {
  const value = Number(elements.manualBatteryLevel.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    alert("請輸入 0 到 100 之間的電量。");
    return;
  }
  state.currentLevel = value;
  updateBatteryDisplay();
  if (state.running) addRecord("手動更新電量");
});

["testName", "testScenario", "brightness", "notes"].forEach(id => {
  elements[id].addEventListener("change", saveSession);
});

window.addEventListener("resize", drawChart);
window.addEventListener("beforeunload", saveSession);

restoreSession();
initBatteryApi();
updateBatteryDisplay();
updateMetrics();
drawChart();


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("Service Worker 註冊失敗：", error);
    });
  });
}
