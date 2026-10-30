(() => {
  const screen = document.querySelector('.texture-dashboard');
  const mount = document.querySelector('#shaftModel');
  const select = document.querySelector('#sceneModeSelect');
  if (!screen || !mount || !select) return;
  const status = mount.querySelector('.model-status');
  let loading;
  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('模型脚本加载失败'));
    document.head.appendChild(script);
  });
  const load = async () => {
    try {
      if (!window.THREE) await loadScript('/vendor/three.min.js?v=0.160.0');
      await loadScript('/shaft-scene.js?v=20261030-2');
      if (mount.dataset.sceneState !== 'ready') throw new Error('三维渲染不可用');
      status.hidden = true;
    } catch (error) {
      status.hidden = false;
      status.textContent = '三维模型加载失败，请切换贴图场景继续监测';
      console.error(error);
    }
  };
  const applySceneMode = () => {
    const model = select.value === 'model';
    screen.classList.toggle('model-scene-active', model);
    mount.hidden = !model;
    if (model && !loading) loading = load();
    document.dispatchEvent(new Event('twin-scene-ready'));
  };
  select.addEventListener('change', applySceneMode);
  applySceneMode();
})();
