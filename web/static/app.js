const SENSOR_IDS = [1, 2];
const WINDOW_VALUES = [600, 1800, 3600, 14400, 86400, 604800];
let activeWindow = 1800;
const lastReadings = { 1: [], 2: [] };
const latestBySensor = { 1: null, 2: null };
let currentConfig = null;
let refreshInProgress = false;
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const axisTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const longAxisTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  hour12: false,
});

function parseTs(ts) { return new Date(ts).getTime(); }
function formatNumber(value, fallback = "--.-") {
  if (value === null || value === undefined || value === "") return fallback;
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

/**
 * 按 3.5V 为零电量、4.2V 为满电计算百分比，并将有效电压限制在该范围内。
 * 缺失或非数字电压返回 null，供页面显示为未知，而不是误报为 0%。
 */
function calculateBatteryPercent(voltage) {
  if (voltage === null || voltage === undefined || voltage === "") return null;
  const numeric = Number(voltage);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(Math.max(0, Math.min(100, ((numeric - 3.5) / 0.7) * 100)));
}

function resizeCanvas(canvas, context) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  const targetWidth = Math.max(1, Math.round(rect.width * ratio));
  const targetHeight = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: rect.width, height: rect.height };
}

function drawChart(canvas, readings) {
  const ctx = canvas.getContext("2d");
  const { width, height } = resizeCanvas(canvas, ctx);
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 52, right: 16, top: 18, bottom: 36 };
  const plotWidth = Math.max(1, width - pad.left - pad.right);
  const plotHeight = Math.max(1, height - pad.top - pad.bottom);
  const now = Date.now();
  const minTime = now - activeWindow * 1000;
  const maxTime = now;
  const points = readings
    .map(item => ({ time: parseTs(item.ts), temperature: Number(item.temperature_c) }))
    .filter(item => Number.isFinite(item.time)
      && Number.isFinite(item.temperature)
      && item.time >= minTime
      && item.time <= maxTime);
  const temperatures = points.map(item => item.temperature);
  const hasPoints = temperatures.length > 0;
  const rawMin = hasPoints ? Math.min(...temperatures) : 40;
  const rawMax = hasPoints ? Math.max(...temperatures) : 80;
  const spread = Math.max(rawMax - rawMin, 1);
  const padding = Math.max(spread * 0.15, 0.5);
  const roughStep = (spread + padding * 2) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const stepFactor = normalizedStep <= 1.5 ? 1
    : normalizedStep <= 2.5 ? 2
      : normalizedStep <= 3.5 ? 2.5
        : normalizedStep <= 7.5 ? 5 : 10;
  const tempStep = hasPoints ? stepFactor * magnitude : 10;
  const minTemp = hasPoints ? Math.floor((rawMin - padding) / tempStep) * tempStep : 40;
  const maxTemp = hasPoints ? Math.ceil((rawMax + padding) / tempStep) * tempStep : 80;

  ctx.font = `${Math.max(11, Math.min(16, width / 44))}px Microsoft YaHei`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(157, 195, 218, .82)";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("°C", 8, pad.top - 3);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const rowCount = Math.max(1, Math.round((maxTemp - minTemp) / tempStep));
  for (let row = 0; row <= rowCount; row += 1) {
    const value = maxTemp - tempStep * row;
    const y = pad.top + (plotHeight / rowCount) * row;
    ctx.strokeStyle = "rgba(112, 165, 196, .22)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = "rgba(202, 220, 233, .88)";
    ctx.fillText(Number.isInteger(tempStep) ? String(Math.round(value)) : value.toFixed(1), pad.left - 10, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const columnCount = Math.max(2, Math.min(6, Math.floor(plotWidth / 78)));
  const timeFormatter = activeWindow >= 86400 ? longAxisTimeFormatter : axisTimeFormatter;
  for (let col = 0; col <= columnCount; col += 1) {
    const x = pad.left + (plotWidth / columnCount) * col;
    ctx.strokeStyle = "rgba(112, 165, 196, .16)";
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + plotHeight); ctx.stroke();
    const time = minTime + ((maxTime - minTime) / columnCount) * col;
    ctx.fillStyle = "rgba(202, 220, 233, .82)";
    ctx.font = `${Math.max(10, Math.min(13, width / 52))}px Microsoft YaHei`;
    ctx.fillText(timeFormatter.format(new Date(time)), x, pad.top + plotHeight + 9);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(147, 188, 212, .58)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotHeight);
  ctx.lineTo(width - pad.right, pad.top + plotHeight);
  ctx.stroke();

  if (!points.length) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(155, 187, 212, .72)";
    ctx.font = "16px Microsoft YaHei";
    ctx.fillText("等待温度数据", pad.left + plotWidth / 2, pad.top + plotHeight / 2);
    return;
  }

  const xFor = value => pad.left + ((value - minTime) / Math.max(1, maxTime - minTime)) * plotWidth;
  const yFor = value => pad.top + (1 - (value - minTemp) / Math.max(1, maxTemp - minTemp)) * plotHeight;
  const chartPoints = points.map(item => ({
    ...item,
    x: xFor(item.time),
    y: yFor(item.temperature),
  }));
  const renderPoints = [];
  let bucketX = null;
  let bucket = [];
  const flushBucket = () => {
    if (!bucket.length) return;
    if (bucket.length === 1) {
      renderPoints.push(bucket[0]);
    } else {
      const low = bucket.reduce((best, point) => point.temperature < best.temperature ? point : best);
      const high = bucket.reduce((best, point) => point.temperature > best.temperature ? point : best);
      renderPoints.push(...[low, high].sort((a, b) => a.time - b.time));
    }
  };
  chartPoints.forEach(point => {
    const pixel = Math.floor(point.x);
    if (bucketX !== null && pixel !== bucketX) {
      flushBucket();
      bucket = [];
    }
    bucketX = pixel;
    bucket.push(point);
  });
  flushBucket();

  const fill = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotHeight);
  fill.addColorStop(0, "rgba(10, 197, 244, .2)");
  fill.addColorStop(1, "rgba(10, 136, 205, .01)");
  ctx.beginPath();
  ctx.moveTo(renderPoints[0].x, pad.top + plotHeight);
  renderPoints.forEach(point => ctx.lineTo(point.x, point.y));
  ctx.lineTo(renderPoints.at(-1).x, pad.top + plotHeight);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(renderPoints[0].x, renderPoints[0].y);
  renderPoints.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
  ctx.strokeStyle = "#16d7ff";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(0, 200, 255, .55)";
  ctx.shadowBlur = 5;
  ctx.stroke();
  ctx.restore();

  const drawMarker = (point, label, color, verticalOffset) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#061522";
    ctx.stroke();

    const text = `${label} ${point.temperature.toFixed(1)}°C`;
    ctx.font = `${Math.max(10, Math.min(12, width / 58))}px Microsoft YaHei`;
    ctx.textBaseline = "middle";
    ctx.textAlign = point.x > width * 0.72 ? "right" : "left";
    ctx.fillStyle = color;
    const labelY = Math.max(pad.top + 6, Math.min(pad.top + plotHeight - 6, point.y + verticalOffset));
    ctx.fillText(text, point.x + (ctx.textAlign === "right" ? -8 : 8), labelY);
  };
  const lowest = chartPoints.reduce((best, point) => point.temperature < best.temperature ? point : best);
  const highest = chartPoints.reduce((best, point) => point.temperature > best.temperature ? point : best);
  if (lowest === highest) {
    drawMarker(highest, "当前", "#43e8ff", -13);
  } else {
    drawMarker(highest, "最高", "#ffc76b", -12);
    drawMarker(lowest, "最低", "#75c8ff", 12);
  }

  const last = chartPoints.at(-1);
  ctx.beginPath();
  ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#43e8ff";
  ctx.shadowColor = "#20dfff";
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function calculateTrend(readings) {
  const values = readings
    .map(item => Number(item.temperature_c))
    .filter(Number.isFinite);
  if (values.length < 4) return "趋势：数据不足";
  const half = Math.max(2, Math.floor(values.length / 2));
  const previous = values.slice(0, half);
  const recent = values.slice(-half);
  const change = recent.reduce((sum, value) => sum + value, 0) / recent.length
    - previous.reduce((sum, value) => sum + value, 0) / previous.length;
  if (Math.abs(change) < 0.2) return "趋势：基本平稳";
  return `趋势：${change > 0 ? "上升" : "下降"} ${Math.abs(change).toFixed(1)}°C`;
}

function renderStation(sensorId, latest, readings, stats) {
  const station = getStation(sensorId);
  if (!station) return;
  station.querySelector(".sensor-temp").textContent = formatNumber(latest?.temperature_c);
  station.querySelector(".sensor-ambient-temp").textContent = formatNumber(latest?.ambient_temperature_c);
  station.querySelector(".sensor-humidity").textContent = formatNumber(latest?.ambient_humidity_percent, "--").replace(".0", "");
  const batteryPercent = calculateBatteryPercent(latest?.battery_voltage_v);
  const batteryVoltage = latest?.battery_voltage_v == null || latest.battery_voltage_v === ""
    ? null : Number(latest.battery_voltage_v);
  const batteryItem = station.querySelector(".battery-item");
  const batteryFill = station.querySelector(".battery-fill");
  station.querySelector(".sensor-battery").textContent = batteryPercent === null ? "--" : String(batteryPercent);
  station.querySelector(".sensor-battery-voltage").textContent = Number.isFinite(batteryVoltage)
    ? `${batteryVoltage.toFixed(2)}V` : "--V";
  batteryItem.classList.toggle("low", batteryPercent !== null && batteryPercent > 0 && batteryPercent <= 15);
  batteryItem.classList.toggle("depleted", batteryPercent === 0);
  batteryFill.setAttribute("width", batteryPercent === null ? "0" : (batteryPercent * 0.21).toFixed(2));
  station.querySelector(".sensor-time").textContent = formatTimestamp(latest?.ts);
  const config = currentConfig?.sensors?.find(item => Number(item.sensor_id) === sensorId);
  const sensorName = config?.name || `测量点 ${sensorId}`;
  station.querySelector(".sensor-name").textContent = sensorName;
  const hotspotName = document.querySelector(`[data-hotspot-sensor="${sensorId}"] .hotspot-name`);
  if (hotspotName) hotspotName.textContent = sensorName;
  station.classList.toggle("offline", !latest);
  station.querySelector(".chart-min").textContent = formatNumber(stats?.min_temp);
  station.querySelector(".chart-avg").textContent = formatNumber(stats?.avg_temp);
  station.querySelector(".chart-max").textContent = formatNumber(stats?.max_temp);
  station.querySelector(".chart-trend").textContent = calculateTrend(readings);
  lastReadings[sensorId] = readings;
  drawChart(station.querySelector("canvas"), readings);
}

// 避免接口响应超过轮询间隔时叠加请求，减少弱网和低性能终端的额外负担。
async function refresh() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const [statusResponse, readingsResponse] = await Promise.all([
      fetch("/api/status?brief=1"),
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
      payload.stats_by_sensor?.[sensorId],
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
  } finally {
    refreshInProgress = false;
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
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function beijingInputToISOString(value) {
  return new Date(`${value}:00+08:00`).toISOString();
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
    start: beijingInputToISOString(startValue),
    end: beijingInputToISOString(endValue),
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
