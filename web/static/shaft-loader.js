const shaftStage = document.querySelector("#shaftStage");

if (shaftStage) {
  let loadStarted = false;
  let pageLoaded = document.readyState === "complete";
  let stageVisible = false;
  const statusText = shaftStage.querySelector(".shaft-status span");

  const loadSceneScript = src => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`转轴脚本加载失败：${src}`));
    document.head.appendChild(script);
  });

  const loadScene = async () => {
    if (loadStarted) return;
    loadStarted = true;
    statusText.textContent = "正在加载转轴模型";

    try {
      await loadSceneScript("/vendor/three.min.js?v=0.160.0");
      await loadSceneScript("/shaft-scene.js?v=20261029-4");
    } catch (error) {
      console.error(error);
      shaftStage.dataset.sceneState = "error";
      statusText.textContent = "转轴模型加载失败，温度监测仍可使用";
    }
  };

  const scheduleLoad = () => {
    if (loadStarted || !pageLoaded || !stageVisible) return;
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(loadScene, { timeout: 1200 });
    } else {
      window.setTimeout(loadScene, 250);
    }
  };

  window.addEventListener("load", () => {
    pageLoaded = true;
    scheduleLoad();
  }, { once: true });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      stageVisible = true;
      scheduleLoad();
    }, { rootMargin: "240px 0px" });
    observer.observe(shaftStage);
  } else {
    stageVisible = true;
    scheduleLoad();
  }
}
