(() => {
  const desktopQuery = window.matchMedia("(min-width: 901px)");
  const screen = document.querySelector(".screen");
  const linkLayer = document.querySelector("#measurementLinks");
  if (!screen || !linkLayer) return;

  const storageKey = screen.classList.contains("texture-dashboard") ? "shaft-monitor-workspace-layout-v2" : "shaft-monitor-layout-v1";
  const items = new Map();
  let savedLayout = {};
  try { savedLayout = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { savedLayout = {}; }
  if (!savedLayout || typeof savedLayout !== "object" || Array.isArray(savedLayout)) savedLayout = {};

  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const saveLayout = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(savedLayout)); } catch { /* 位置仍在当前页面生效。 */ }
  };

  const register = ({ key, element, handle, bounds }) => {
    const state = { x: 0, y: 0 };
    const stored = savedLayout[key];
    if (stored) {
      state.x = Number(stored.x) * window.innerWidth || 0;
      state.y = Number(stored.y) * window.innerHeight || 0;
    }

    const apply = () => {
      element.style.transform = desktopQuery.matches
        ? `translate3d(${state.x}px, ${state.y}px, 0)`
        : "";
    };
    apply();
    items.set(key, { element, state, apply, bounds });

    handle.title = "拖动调整位置，双击恢复默认位置";
    handle.addEventListener("pointerdown", event => {
      if (!desktopQuery.matches || event.button !== 0) return;
      event.preventDefault();
      const start = { pointerX: event.clientX, pointerY: event.clientY, x: state.x, y: state.y };
      const initialRect = element.getBoundingClientRect();
      handle.setPointerCapture(event.pointerId);
      element.classList.add("is-dragging");

      const move = moveEvent => {
        const dx = moveEvent.clientX - start.pointerX;
        const dy = moveEvent.clientY - start.pointerY;
        const desiredX = start.x + dx;
        const desiredY = start.y + dy;
        const limits = bounds(initialRect, start);
        state.x = clamp(desiredX, limits.minX, limits.maxX);
        state.y = clamp(desiredY, limits.minY, limits.maxY);
        apply();
        updateLinks();
      };

      const finish = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", finish);
        handle.removeEventListener("pointercancel", finish);
        element.classList.remove("is-dragging");
        savedLayout[key] = { x: state.x / window.innerWidth, y: state.y / window.innerHeight };
        saveLayout();
      };

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", finish);
      handle.addEventListener("pointercancel", finish);
    });

    handle.addEventListener("dblclick", event => {
      event.preventDefault();
      state.x = 0;
      state.y = 0;
      delete savedLayout[key];
      saveLayout();
      apply();
      updateLinks();
    });

    if (handle === element) {
      handle.addEventListener("keydown", event => {
        if (!desktopQuery.matches) return;
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const direction = directions[event.key];
        if (!direction) return;
        event.preventDefault();
        const limits = bounds(element.getBoundingClientRect(), state);
        const step = event.shiftKey ? 20 : 5;
        state.x = clamp(state.x + direction[0] * step, limits.minX, limits.maxX);
        state.y = clamp(state.y + direction[1] * step, limits.minY, limits.maxY);
        savedLayout[key] = { x: state.x / window.innerWidth, y: state.y / window.innerHeight };
        saveLayout();
        apply();
        updateLinks();
      });
    }
  };

  const cardBounds = (rect, start) => ({
    minX: start.x + 14 - rect.left,
    maxX: start.x + window.innerWidth - 14 - rect.right,
    minY: start.y + (window.innerWidth > 1100 ? 154 : 124) - rect.top,
    maxY: start.y + window.innerHeight - 22 - rect.bottom,
  });

  const hotspotBounds = (rect, start) => {
    const stageRect = document.querySelector("#shaftStage").getBoundingClientRect();
    return {
      minX: start.x + stageRect.left + 18 - rect.left,
      maxX: start.x + stageRect.right - 175 - rect.right,
      minY: start.y + stageRect.top + 72 - rect.top,
      maxY: start.y + stageRect.bottom - 62 - rect.bottom,
    };
  };

  document.querySelectorAll(".sensor-station").forEach(station => {
    const sensorId = station.dataset.sensorId;
    register({ key: `card-${sensorId}`, element: station, handle: station.querySelector(".station-cap"), bounds: cardBounds });
  });
  document.querySelectorAll(".shaft-hotspot").forEach(hotspot => {
    const sensorId = hotspot.dataset.hotspotSensor;
    register({ key: `hotspot-${sensorId}`, element: hotspot, handle: hotspot, bounds: hotspotBounds });
  });

  function updateLinks() {
    if (!desktopQuery.matches) return;
    // Re-clamp restored positions after viewport or scene-mode changes.
    items.forEach(item => {
      const limits = item.bounds(item.element.getBoundingClientRect(), item.state);
      item.state.x = clamp(item.state.x, limits.minX, Math.max(limits.minX, limits.maxX));
      item.state.y = clamp(item.state.y, limits.minY, Math.max(limits.minY, limits.maxY));
      item.apply();
    });
    const screenRect = screen.getBoundingClientRect();
    ["1", "2"].forEach(sensorId => {
      const hotspot = document.querySelector(`[data-hotspot-sensor="${sensorId}"] .hotspot-pulse`);
      const cap = document.querySelector(`.sensor-station[data-sensor-id="${sensorId}"] .station-cap`);
      const line = linkLayer.querySelector(`[data-link-sensor="${sensorId}"]`);
      if (!hotspot || !cap || !line) return;
      const hotspotRect = hotspot.getBoundingClientRect();
      const capRect = cap.getBoundingClientRect();
      line.setAttribute("x1", hotspotRect.left + hotspotRect.width / 2 - screenRect.left);
      line.setAttribute("y1", hotspotRect.top + hotspotRect.height / 2 - screenRect.top);
      line.setAttribute("x2", capRect.left + capRect.width / 2 - screenRect.left);
      line.setAttribute("y2", capRect.top + 2 - screenRect.top);
    });
  }

  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      items.forEach(item => {
        item.state.x = 0;
        item.state.y = 0;
        item.apply();
      });
      Object.entries(savedLayout).forEach(([key, saved]) => {
        const item = items.get(key);
        if (!item) return;
        item.state.x = Number(saved.x) * window.innerWidth || 0;
        item.state.y = Number(saved.y) * window.innerHeight || 0;
        item.apply();
      });
      updateLinks();
    });
  });

  if (document.fonts?.ready) document.fonts.ready.then(updateLinks);
  document.querySelector("#resetLayoutButton")?.addEventListener("click", () => {
    savedLayout = {};
    saveLayout();
    items.forEach(item => {
      item.state.x = 0;
      item.state.y = 0;
      item.apply();
    });
    updateLinks();
  });
  document.addEventListener("twin-scene-ready", updateLinks);
  requestAnimationFrame(updateLinks);
  setTimeout(updateLinks, 300);
})();
