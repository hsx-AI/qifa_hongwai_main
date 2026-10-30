(() => {
  const stage = document.querySelector("#shaftStage");
  const image = document.querySelector("#twinSceneImage");
  if (!stage || !image) return;
  const ready = () => {
    stage.dataset.sceneState = image.naturalWidth ? "ready" : "error";
    const status = stage.querySelector(".shaft-status");
    status.hidden = Boolean(image.naturalWidth);
    if (!image.naturalWidth) status.textContent = "设备场景暂未加载，请刷新页面";
    document.dispatchEvent(new Event("twin-scene-ready"));
  };
  image.addEventListener("load", ready, { once: true });
  image.addEventListener("error", ready, { once: true });
  if (image.complete) ready();

  const screen = document.querySelector(".texture-dashboard");
  const sceneButton = document.querySelector("#sceneViewButton");
  sceneButton?.addEventListener("click", () => {
    const expanded = screen.classList.toggle("scene-expanded");
    sceneButton.setAttribute("aria-pressed", String(expanded));
    sceneButton.textContent = expanded ? "返回监测" : "设备全景";
    document.dispatchEvent(new Event("twin-scene-ready"));
  });
  ["1", "2"].forEach(id => {
    const hotspot = document.querySelector(`[data-hotspot-sensor="${id}"]`);
    const station = document.querySelector(`[data-sensor-id="${id}"]`);
    [hotspot, station].forEach(element => {
      const highlight = active => [hotspot, station].forEach(item => item?.classList.toggle("is-highlighted", active));
      element?.addEventListener("pointerenter", () => highlight(true));
      element?.addEventListener("pointerleave", () => highlight(false));
      element?.addEventListener("focusin", () => highlight(true));
      element?.addEventListener("focusout", () => highlight(false));
    });
  });
})();
