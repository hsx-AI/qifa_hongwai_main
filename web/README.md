# 汽发转轴加工温度在线监测看板

## 启动

```powershell
cd E:\Desktop\tuixiu_protect\qifa_hongwai\qifa_hongwai_main\web
python app.py --serial-port COM3
```

默认监听 `127.0.0.1:8080`。若需局域网访问，使用 `python app.py --host 0.0.0.0 --port 8081`。

然后打开：

```text
http://127.0.0.1:8080
```

如果不传 `--serial-port`，程序会尝试自动选择一个串口。主站固件串口波特率为 `115200`。

网页已支持 **双从站** 显示：按 `sensor_id` 区分（1 和 2），曲线、卡片和统计都会分别展示。

## 测试模式

没有硬件时可以启动模拟数据：

```powershell
python app.py --simulate
```

## 数据库

温度数据保存在当前目录的 `temperature.db`，表名为 `readings`。
