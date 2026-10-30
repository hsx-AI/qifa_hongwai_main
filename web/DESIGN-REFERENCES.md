# 设备监测工作台参考

调研日期：2026-10-30。参考信息分区和交互思路，未复制外部代码、图片或业务指标。

- Anyplex Digital Twin Factory：设备视图与参数分区，适合作为单设备监测的信息架构参考。
  https://www.mpdv.com/produkte/mip-marketplace/mapp-anyplex-digital-twin-factory
- Autodesk Tandem Dashboard Beta：以资产监测为中心，当前读数、时序曲线独立成卡，支持场景与数据两类关注方式。
  https://intandem.autodesk.com/resource/introducing-tandems-new-dashboards-beta/
- WYE IoT Dashboard：将现场传感器、历史趋势与二维/三维视图放在同一监控界面。
  https://www.wyehk.com/en/projects/iot-dashboard-sample

本次落地：左侧设备场景、右侧两路测点、下方简要概览；弱化切角与发光，突出读数；保留已有 AI 背景与 Three.js 网格模式；修正相机缩放后朝向。概览值直接来自现有接口，无演示温度或新增虚构指标。
