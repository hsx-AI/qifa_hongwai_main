const SENSOR_IDS = [1, 2];
const WINDOW_VALUES = [600, 1800, 3600, 14400, 86400, 604800];
let activeWindow = 1800;
const lastReadings = { 1: [], 2: [] };
const latestBySensor = { 1: null, 2: null };
let currentConfig = null;
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const axisTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit", minute: "2-digit", hour12: false,
});

function parseTs(ts) { return new Date(ts).getTime(); }
function formatNumber(value, fallback = "--.-") {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : fallback;
}
function getStation(sensorId) {
  return document.querySelector(`.sensor-station[data-sensor-id="${sensorId}"]`);
}
function formatTimestamp(ts) {
  if (!ts) return "等待数据";
  return timeFormatter.format(new Date(ts)).replaceAll("/", "-");
}

function resizeCanvas(canvas, context) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(rect.width * ratio));
  const targetHeight = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: rect.width, height: rect.height };
}

function smooth(values) {
  if (values.length < 5) return values;
  return values.map((_, index) => {
    const range = values.slice(Math.max(0, index - 2), Math.min(values.length, index + 3));
    return range.reduce((total, value) => total + value, 0) / range.length;
  });
}

function drawChart(canvas, readings) {
  const ctx = canvas.getContext("2d");
  const { width, height } = resizeCanvas(canvas, ctx);
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 47, right: 15, top: 12, bottom: 34 };
  const plotWidth = Math.max(1, width - pad.left - pad.right);
  const plotHeight = Math.max(1, height - pad.top - pad.bottom);
  const temperatures = readings.map(item => Number(item.temperature_c)).filter(Number.isFinite);
  const now = Date.now();
  const validTimes = readings.map(item => parseTs(item.ts)).filter(Number.isFinite);
  const minTime = validTimes.length ? Math.min(...validTimes) : now - activeWindow * 1000;
  const maxTime = validTimes.length ? Math.max(...validTimes) : now;

  let minTemp = 40;
  let maxTemp = 80;
  if (temperatures.length) {
    const rawMin = Math.min(...temperatures);
    const rawMax = Math.max(...temperatures);
    if (rawMin < 40 || rawMax > 80) {
      minTemp = Math.floor((rawMin - 5) / 10) * 10;
      maxTemp = Math.ceil((rawMax + 5) / 10) * 10;
    }
  }

  ctx.font = `${Math.max(11, Math.min(16, width / 44))}px Microsoft YaHei`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let row = 0; row <= 4; row += 1) {
    const y = pad.top + (plotHeight / 4) * row;
    const value = maxTemp - ((maxTemp - minTemp) / 4) * row;
    ctx.strokeStyle = "rgba(40, 153, 210, .28)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = "rgba(240, 247, 255, .88)";
    ctx.fillText(Math.round(value), pad.left - 10, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let col = 0; col <= 6; col += 1) {
    const x = pad.left + (plotWidth / 6) * col;
    ctx.strokeStyle = "rgba(40, 153, 210, .25)";
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotHeight); ctx.stroke();
    const time = minTime + ((maxTime - minTime) / 6) * col;
    ctx.fillStyle = "rgba(240, 247, 255, .88)";
    ctx.fillText(axisTimeFormatter.format(new Date(time)), x, pad.top + plotHeight + 10);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(223, 238, 250, .8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotHeight);
  ctx.lineTo(width - pad.right, pad.top + plotHeight);
  ctx.stroke();

  if (!temperatures.length) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(155, 187, 212, .72)";
    ctx.font = "16px Microsoft YaHei";
    ctx.fillText("等待温度数据", pad.left + plotWidth / 2, pad.top + plotHeight / 2);
    return;
  }

  const xFor = value => pad.left + ((value - minTime) / Math.max(1, maxTime - minTime)) * plotWidth;
  const yFor = value => pad.top + (1 - (value - minTemp) / Math.max(1, maxTemp - minTemp)) * plotHeight;
  const values = smooth(readings.map(item => Number(item.temperature_c)));
  const points = readings.map((item, index) => ({ x: xFor(parseTs(item.ts)), y: yFor(values[index]) }));

  const fill = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotHeight);
  fill.addColorStop(0, "rgba(10, 197, 244, .36)");
  fill.addColorStop(1, "rgba(10, 136, 205, .03)");
  ctx.beginPath();
  ctx.moveTo(points[0].x, pad.top + plotHeight);
  points.forEach(point => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points.at(-1).x, pad.top + plotHeight);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    const midX = (previous.x + point.x) / 2;
    ctx.quadraticCurveTo(previous.x, previous.y, midX, (previous.y + point.y) / 2);
  }
  ctx.lineTo(points.at(-1).x, points.at(-1).y);
  ctx.strokeStyle = "#16d7ff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "rgba(0, 200, 255, .8)";
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.restore();

  const last = points.at(-1);
  ctx.beginPath();
  ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#43e8ff";
  ctx.shadowColor = "#20dfff";
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function renderStation(sensorId, latest, readings) {
  const station = getStation(sensorId);
  if (!station) return;
  station.querySelector(".sensor-temp").textContent = formatNumber(latest?.temperature_c);
  station.querySelector(".sensor-ambient-temp").textContent = formatNumber(latest?.ambient_temperature_c);
  station.querySelector(".sensor-humidity").textContent = formatNumber(latest?.ambient_humidity_percent, "--").replace(".0", "");
  station.querySelector(".sensor-time").textContent = formatTimestamp(latest?.ts);
  const config = currentConfig?.sensors?.find(item => Number(item.sensor_id) === sensorId);
  const sensorName = config?.name || `测量点 ${sensorId}`;
  station.querySelector(".sensor-name").textContent = sensorName;
  const hotspotName = document.querySelector(`[data-hotspot-sensor="${sensorId}"] .hotspot-name`);
  if (hotspotName) hotspotName.textContent = sensorName;
  station.classList.toggle("offline", !latest);
  lastReadings[sensorId] = readings;
  drawChart(station.querySelector("canvas"), readings);
}

async function refresh() {
  try {
    const [statusResponse, readingsResponse] = await Promise.all([
      fetch("/api/status"),
      fetch(`/api/readings?window=${activeWindow}`),
    ]);
    if (!statusResponse.ok || !readingsResponse.ok) throw new Error("接口暂不可用");
    const status = await statusResponse.json();
    const payload = await readingsResponse.json();
    const readings = payload.readings || [];
    if (payload.sensor_configs) {
      const sensors = Object.values(payload.sensor_configs);
      currentConfig = { ...(currentConfig || {}), sensors };
    }
    SENSOR_IDS.forEach(sensorId => renderStation(
      sensorId,
      status.latest_by_sensor?.[sensorId],
      readings.filter(item => Number(item.sensor_id) === sensorId).sort((a, b) => parseTs(a.ts) - parseTs(b.ts)),
    ));
    SENSOR_IDS.forEach(sensorId => { latestBySensor[sensorId] = status.latest_by_sensor?.[sensorId] || null; });

    const onlineCount = SENSOR_IDS.filter(id => status.latest_by_sensor?.[id]?.status === "OK").length;
    const state = document.getElementById("systemState");
    state.classList.toggle("online", onlineCount > 0 && !status.collector?.last_error);
    document.getElementById("collectorState").textContent = status.collector?.last_error
      ? "采集连接异常"
      : onlineCount > 0 ? `${onlineCount}/${SENSOR_IDS.length} 测点在线` : "等待测点数据";
  } catch (error) {
    document.getElementById("collectorState").textContent = "监测服务连接中";
    SENSOR_IDS.forEach(sensorId => drawChart(getStation(sensorId).querySelector("canvas"), lastReadings[sensorId]));
  }
}

function setDialogStatus(message, isError = false) {
  const status = document.getElementById("settingsStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function populatePorts(ports, selected) {
  const select = document.getElementById("serialSelect");
  select.innerHTML = "";
  if (!ports.length) {
    select.add(new Option("未发现可用串口", ""));
    select.disabled = true;
    document.getElementById("applySerialButton").disabled = true;
    return;
  }
  ports.forEach(port => select.add(new Option(`${port.device} · ${port.description || "Serial Port"}`, port.device)));
  select.disabled = false;
  select.value = ports.some(port => port.device === selected) ? selected : ports[0].device;
  document.getElementById("applySerialButton").disabled = false;
}

function updateCalibrationPreview(sensorId) {
  const card = document.querySelector(`[data-config-sensor="${sensorId}"]`);
  const raw = Number(latestBySensor[sensorId]?.raw_temperature_c);
  const scale = Number(document.querySelector(`[name="sensor_${sensorId}_scale"]`).value);
  const offset = Number(document.querySelector(`[name="sensor_${sensorId}_offset"]`).value);
  card.querySelector(".raw-preview").textContent = Number.isFinite(raw) ? raw.toFixed(1) : "--.-";
  card.querySelector(".calibrated-preview").textContent = Number.isFinite(raw) && Number.isFinite(scale) && Number.isFinite(offset)
    ? (raw * scale + offset).toFixed(1) : "--.-";
}

async function loadConfiguration() {
  const response = await fetch("/api/config");
  if (!response.ok) throw new Error("配置读取失败");
  currentConfig = await response.json();
  currentConfig.sensors.forEach(config => {
    const sensorId = Number(config.sensor_id);
    document.querySelector(`[name="sensor_${sensorId}_name"]`).value = config.name;
    document.querySelector(`[name="sensor_${sensorId}_scale"]`).value = config.calibration_scale;
    document.querySelector(`[name="sensor_${sensorId}_offset"]`).value = config.calibration_offset;
    updateCalibrationPreview(sensorId);
  });
  populatePorts(currentConfig.ports || [], currentConfig.serial?.port || "");
  document.getElementById("baudSelect").value = String(currentConfig.serial?.baud || 115200);
  const simulating = Boolean(currentConfig.serial?.simulate);
  document.getElementById("serialModeText").textContent = simulating
    ? "当前为模拟数据模式，启动真实采集服务后可切换串口。"
    : "配置主站连接使用的串口与波特率。";
  document.getElementById("serialSelect").disabled = simulating || !currentConfig.ports?.length;
  document.getElementById("baudSelect").disabled = simulating;
  document.getElementById("applySerialButton").disabled = simulating || !currentConfig.ports?.length;
  setDialogStatus("");
}

async function saveSensorConfiguration() {
  const sensors = SENSOR_IDS.map(sensorId => ({
    sensor_id: sensorId,
    name: document.querySelector(`[name="sensor_${sensorId}_name"]`).value.trim(),
    calibration_scale: Number(document.querySelector(`[name="sensor_${sensorId}_scale"]`).value),
    calibration_offset: Number(document.querySelector(`[name="sensor_${sensorId}_offset"]`).value),
  }));
  const response = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sensors }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "配置保存失败");
  currentConfig.sensors = result.sensors;
  setDialogStatus("点位名称与校准参数已保存，历史入库温度已重新校准。");
  await refresh();
}

async function refreshPorts() {
  const response = await fetch("/api/ports");
  const result = await response.json();
  populatePorts(result.ports || [], result.selected?.port || "");
  setDialogStatus("串口列表已刷新。");
}

async function applySerial() {
  const port = document.getElementById("serialSelect").value;
  const baud = Number(document.getElementById("baudSelect").value);
  const response = await fetch("/api/serial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port, baud }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "串口应用失败");
  setDialogStatus(`已切换至 ${port} · ${baud}，采集服务正在重新连接。`);
}

function localInputValue(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function openExportDialog() {
  const end = new Date();
  document.getElementById("exportEnd").value = localInputValue(end);
  document.getElementById("exportStart").value = localInputValue(new Date(end.getTime() - 24 * 3600 * 1000));
  const configs = currentConfig?.sensors || [];
  configs.forEach(config => {
    const option = document.querySelector(`#exportSensor option[value="${config.sensor_id}"]`);
    if (option) option.textContent = config.name;
  });
  document.getElementById("exportDialog").showModal();
}

function downloadExport() {
  const startValue = document.getElementById("exportStart").value;
  const endValue = document.getElementById("exportEnd").value;
  if (!startValue || !endValue || startValue >= endValue) {
    document.getElementById("exportStart").setCustomValidity("开始时间必须早于结束时间");
    document.getElementById("exportStart").reportValidity();
    return;
  }
  document.getElementById("exportStart").setCustomValidity("");
  const params = new URLSearchParams({
    start: new Date(startValue).toISOString(),
    end: new Date(endValue).toISOString(),
  });
  const sensorId = document.getElementById("exportSensor").value;
  if (sensorId) params.set("sensor_id", sensorId);
  const link = document.createElement("a");
  link.href = `/api/export?${params}`;
  link.download = "temperature_history.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  document.getElementById("exportDialog").close();
}

function changeWindow(direction) {
  const currentIndex = WINDOW_VALUES.indexOf(activeWindow);
  const nextIndex = Math.max(0, Math.min(WINDOW_VALUES.length - 1, currentIndex + direction));
  activeWindow = WINDOW_VALUES[nextIndex];
  document.getElementById("windowSelect").value = String(activeWindow);
  refresh();
}

window.addEventListener("resize", () => SENSOR_IDS.forEach(sensorId => {
  drawChart(getStation(sensorId).querySelector("canvas"), lastReadings[sensorId]);
}));

document.getElementById("windowSelect").addEventListener("change", event => {
  activeWindow = Number(event.target.value);
  refresh();
});
document.getElementById("zoomOutButton").addEventListener("click", () => changeWindow(1));
document.getElementById("zoomInButton").addEventListener("click", () => changeWindow(-1));
document.querySelectorAll(".temperature-chart").forEach(canvas => {
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    changeWindow(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });
});
document.getElementById("settingsButton").addEventListener("click", async () => {
  document.getElementById("settingsDialog").showModal();
  try { await loadConfiguration(); } catch (error) { setDialogStatus(error.message, true); }
});
SENSOR_IDS.forEach(sensorId => {
  document.querySelector(`[name="sensor_${sensorId}_scale"]`).addEventListener("input", () => updateCalibrationPreview(sensorId));
  document.querySelector(`[name="sensor_${sensorId}_offset"]`).addEventListener("input", () => updateCalibrationPreview(sensorId));
});
document.getElementById("settingsForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { document.getElementById("settingsDialog").close(); return; }
  const button = document.getElementById("saveSettingsButton");
  button.disabled = true;
  try { await saveSensorConfiguration(); } catch (error) { setDialogStatus(error.message, true); }
  finally { button.disabled = false; }
});
document.getElementById("refreshPortsButton").addEventListener("click", () => refreshPorts().catch(error => setDialogStatus(error.message, true)));
document.getElementById("applySerialButton").addEventListener("click", () => applySerial().catch(error => setDialogStatus(error.message, true)));
document.getElementById("exportButton").addEventListener("click", openExportDialog);
document.getElementById("exportForm").addEventListener("submit", event => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { document.getElementById("exportDialog").close(); return; }
  downloadExport();
});

refresh();
setInterval(refresh, 2000);
