const chart = document.getElementById("temperatureChart");
const ctx = chart.getContext("2d");

const SENSOR_IDS = [1, 2];
const SENSOR_COLORS = {
  1: { line: "#35d5e6", fill: "rgba(53, 213, 230, 0.18)", glow: "rgba(53, 213, 230, 0.42)" },
  2: { line: "#ffc35a", fill: "rgba(255, 195, 90, 0.16)", glow: "rgba(255, 195, 90, 0.42)" },
};

let activeWindow = 3600;
let latestReadings = [];
let selectedPort = "";

const fmt = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function $(id) {
  return document.getElementById(id);
}

function formatTemp(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "--.-";
}

function parseTs(ts) {
  return new Date(ts).getTime();
}

function resizeCanvas() {
  const rect = chart.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  chart.width = Math.max(800, Math.floor(rect.width * dpr));
  chart.height = Math.max(360, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function movingAverage(values) {
  if (values.length < 4) {
    return values.slice();
  }

  const radius = values.length > 80 ? 4 : values.length > 30 ? 3 : 2;
  return values.map((_, index) => {
    let sum = 0;
    let weightSum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sampleIndex = Math.min(values.length - 1, Math.max(0, index + offset));
      const weight = radius + 1 - Math.abs(offset);
      sum += values[sampleIndex] * weight;
      weightSum += weight;
    }
    return sum / weightSum;
  });
}

function drawSmoothCurve(points, color, glow) {
  if (points.length < 2) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const previous = points[i - 1] || current;
    const afterNext = points[i + 2] || next;
    const tension = 0.22;
    const cp1x = current.x + (next.x - previous.x) * tension;
    const cp1y = current.y + (next.y - previous.y) * tension;
    const cp2x = next.x - (afterNext.x - current.x) * tension;
    const cp2y = next.y - (afterNext.y - current.y) * tension;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.shadowBlur = 16;
  ctx.shadowColor = glow;
  ctx.stroke();
  ctx.restore();
}

function calculateYRange(allTemps) {
  if (!allTemps.length) {
    return { minTemp: 20, maxTemp: 30 };
  }

  const minTempRaw = Math.min(...allTemps);
  const maxTempRaw = Math.max(...allTemps);
  const center = (minTempRaw + maxTempRaw) / 2;
  const rawSpan = maxTempRaw - minTempRaw;
  const minDisplaySpan = 6;
  const span = Math.max(minDisplaySpan, rawSpan * 2.4);
  const minTemp = Math.floor((center - span / 2) * 2) / 2;
  const maxTemp = Math.ceil((center + span / 2) * 2) / 2;
  return { minTemp, maxTemp };
}

function groupReadingsBySensor(readings) {
  const grouped = {};
  SENSOR_IDS.forEach((sensorId) => {
    grouped[sensorId] = readings
      .filter((reading) => Number(reading.sensor_id) === sensorId)
      .sort((a, b) => parseTs(a.ts) - parseTs(b.ts));
  });
  return grouped;
}

function drawChart(readings) {
  resizeCanvas();
  const width = chart.clientWidth;
  const height = chart.clientHeight;
  ctx.clearRect(0, 0, width, height);

  const pad = { left: 64, right: 28, top: 28, bottom: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  ctx.fillStyle = "rgba(4, 14, 18, 0.45)";
  ctx.fillRect(pad.left, pad.top, plotW, plotH);

  ctx.strokeStyle = "rgba(145, 174, 182, 0.18)";
  ctx.lineWidth = 1;
  ctx.font = "12px Microsoft YaHei, Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(238, 247, 248, 0.72)";

  for (let i = 0; i <= 5; i += 1) {
    const y = pad.top + (plotH / 5) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }

  const grouped = groupReadingsBySensor(readings);
  const allTemps = readings
    .map((reading) => Number(reading.temperature_c))
    .filter((value) => Number.isFinite(value));

  if (!allTemps.length) {
    ctx.fillStyle = "rgba(238, 247, 248, 0.72)";
    ctx.font = "22px Microsoft YaHei, Segoe UI, sans-serif";
    ctx.fillText("等待双从站温度数据", pad.left + 28, pad.top + 70);
    return;
  }

  const allTimes = readings.map((reading) => parseTs(reading.ts));
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);
  const { minTemp, maxTemp } = calculateYRange(allTemps);

  for (let i = 0; i <= 5; i += 1) {
    const temp = maxTemp - ((maxTemp - minTemp) / 5) * i;
    const y = pad.top + (plotH / 5) * i;
    ctx.fillStyle = "rgba(238, 247, 248, 0.7)";
    ctx.fillText(`${temp.toFixed(1)}°C`, 12, y + 4);
  }

  for (let i = 0; i <= 4; i += 1) {
    const x = pad.left + (plotW / 4) * i;
    const t = minTime + ((maxTime - minTime) / 4) * i;
    ctx.fillStyle = "rgba(238, 247, 248, 0.58)";
    ctx.fillText(fmt.format(new Date(t)), x - 28, pad.top + plotH + 30);
  }

  const xFor = (t) =>
    pad.left + ((t - minTime) / Math.max(1, maxTime - minTime)) * plotW;
  const yFor = (temp) =>
    pad.top + (1 - (temp - minTemp) / Math.max(0.1, maxTemp - minTemp)) * plotH;

  SENSOR_IDS.forEach((sensorId) => {
    const sensorReadings = grouped[sensorId];
    if (!sensorReadings.length) {
      return;
    }

    const colors = SENSOR_COLORS[sensorId];
    const temps = sensorReadings.map((reading) => Number(reading.temperature_c));
    const smoothTemps = movingAverage(temps);
    const rawPoints = sensorReadings.map((reading) => ({
      x: xFor(parseTs(reading.ts)),
      y: yFor(Number(reading.temperature_c)),
    }));
    const smoothPoints = sensorReadings.map((reading, index) => ({
      x: xFor(parseTs(reading.ts)),
      y: yFor(smoothTemps[index]),
    }));

    if (rawPoints.length >= 2) {
      const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      gradient.addColorStop(0, colors.fill);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.beginPath();
      rawPoints.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.lineTo(rawPoints[rawPoints.length - 1].x, pad.top + plotH);
      ctx.lineTo(rawPoints[0].x, pad.top + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    ctx.beginPath();
    rawPoints.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.72;
    ctx.stroke();
    ctx.globalAlpha = 1;

    drawSmoothCurve(smoothPoints, colors.line, colors.glow);

    const last = rawPoints[rawPoints.length - 1];
    ctx.fillStyle = "rgba(4, 14, 18, 0.86)";
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.font = "12px Microsoft YaHei, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  SENSOR_IDS.forEach((sensorId, index) => {
    const colors = SENSOR_COLORS[sensorId];
    const x = pad.left + 8 + index * 120;
    ctx.fillStyle = colors.line;
    ctx.fillRect(x, pad.top + 10, 24, 3);
    ctx.fillStyle = "rgba(238, 247, 248, 0.86)";
    ctx.fillText(`从站 ${sensorId}`, x + 32, pad.top + 12);
  });
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function renderSensorCard(sensorId, latest, stats) {
  const card = document.querySelector(`.sensor-card[data-sensor-id="${sensorId}"]`);
  if (!card) {
    return;
  }

  card.classList.toggle("offline", !latest);
  card.querySelector(".sensor-temp").textContent = latest
    ? formatTemp(Number(latest.temperature_c))
    : "--.-";
  card.querySelector(".sensor-time").textContent = latest
    ? `更新时间 ${fmt.format(new Date(latest.ts))}`
    : "等待数据";
  card.querySelector(".sensor-status").textContent = latest?.status || "Waiting";
  card.querySelector(".sensor-ambient").textContent = latest
    ? `${formatTemp(Number(latest.ambient_temperature_c))} °C / ${formatTemp(
        Number(latest.ambient_humidity_percent)
      )}%`
    : "--.- °C / --.-%";
  card.querySelector(".sensor-avg").textContent = `${formatTemp(Number(stats?.avg_temp))} °C`;
  card.querySelector(".sensor-mac").textContent = latest?.peer_mac || "--";
}

function renderPorts(ports, currentPort) {
  const select = $("serialSelect");
  const previousValue = select.value || selectedPort || currentPort || "";
  select.innerHTML = "";

  if (!ports.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未发现串口";
    select.appendChild(option);
    select.disabled = true;
    $("applySerialButton").disabled = true;
    return;
  }

  select.disabled = false;
  $("applySerialButton").disabled = false;

  ports.forEach((port) => {
    const option = document.createElement("option");
    option.value = port.device;
    option.textContent = `${port.device} - ${port.description || "Serial Port"}`;
    if (port.hwid) {
      option.title = port.hwid;
    }
    select.appendChild(option);
  });

  const values = new Set(ports.map((port) => port.device));
  select.value = values.has(previousValue) ? previousValue : currentPort || ports[0].device;
  selectedPort = select.value;
}

async function refreshPorts() {
  const res = await fetch("/api/ports");
  const data = await res.json();
  renderPorts(data.ports || [], data.selected?.port || "");
}

async function applySelectedPort() {
  const port = $("serialSelect").value;
  if (!port) {
    return;
  }

  $("applySerialButton").disabled = true;
  $("applySerialButton").textContent = "切换中";
  try {
    const res = await fetch("/api/serial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, baud: 115200 }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "串口切换失败");
    }
    selectedPort = port;
    await refresh();
  } catch (error) {
    $("noticeText").textContent = `串口切换失败：${error.message}`;
  } finally {
    $("applySerialButton").disabled = false;
    $("applySerialButton").textContent = "应用串口";
  }
}

async function refresh() {
  const [statusRes, readingsRes] = await Promise.all([
    fetch("/api/status"),
    fetch(`/api/readings?window=${activeWindow}`),
  ]);
  const status = await statusRes.json();
  const data = await readingsRes.json();
  latestReadings = data.readings || [];

  const latestBySensor = status.latest_by_sensor || {};
  const statsBySensor = data.stats_by_sensor || {};
  const collector = status.collector || {};
  const stats = data.stats || {};

  renderPorts(status.ports || [], collector.port || "");

  SENSOR_IDS.forEach((sensorId) => {
    renderSensorCard(sensorId, latestBySensor[sensorId], statsBySensor[sensorId]);
    $(`sensor${sensorId}Status`).textContent = latestBySensor[sensorId]?.status || "Waiting";
    $(`sensor${sensorId}Mac`).textContent = latestBySensor[sensorId]?.peer_mac || "--";
    $(`sensor${sensorId}Count`).textContent = `${statsBySensor[sensorId]?.count || 0} 点`;
    $(`sensor${sensorId}Range`).textContent = `最高 ${formatTemp(
      Number(statsBySensor[sensorId]?.max_temp)
    )} / 最低 ${formatTemp(Number(statsBySensor[sensorId]?.min_temp))} °C`;
  });

  $("rangeTemp").textContent = `${formatTemp(Number(stats.max_temp))} / ${formatTemp(
    Number(stats.min_temp)
  )} °C`;
  $("sampleCount").textContent = `${stats.count || 0} 个采样点`;
  $("storedCount").textContent = collector.stored ?? "--";
  $("storedCountPanel").textContent = collector.stored ?? "--";
  $("receivedCount").textContent = collector.received ?? "--";
  $("receivedCountPanel").textContent = collector.received ?? "--";

  $("serialPort").textContent = collector.port || "--";
  $("serialBaud").textContent = collector.baud || "--";

  const onlineCount = SENSOR_IDS.filter(
    (sensorId) => latestBySensor[sensorId]?.status === "OK"
  ).length;
  const ok = onlineCount > 0 && !collector.last_error;
  $("statusDot").className = `status-dot ${ok ? "ok" : collector.last_error ? "error" : ""}`;
  $("collectorState").textContent = ok
    ? `在线监测中 · ${onlineCount}/${SENSOR_IDS.length} 从站`
    : collector.last_error
      ? "采集异常"
      : "等待数据";
  $("collectorMeta").textContent = collector.port
    ? `${collector.port} · ${collector.mode || "serial"}`
    : "未选择串口";
  $("noticeText").textContent = collector.last_error
    ? `采集提示：${collector.last_error}`
    : "双从站数据已写入 SQLite，页面按当前时间窗口实时刷新。";

  drawChart(latestReadings);
}

document.querySelectorAll("[data-window]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-window]").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    activeWindow = Number(button.dataset.window);
    refresh().catch(console.error);
  });
});

$("serialSelect").addEventListener("change", (event) => {
  selectedPort = event.target.value;
});
$("applySerialButton").addEventListener("click", () => applySelectedPort().catch(console.error));
$("refreshPortsButton").addEventListener("click", () => refreshPorts().catch(console.error));

window.addEventListener("resize", () => drawChart(latestReadings));

refresh().catch(console.error);
setInterval(() => refresh().catch(console.error), 2000);
