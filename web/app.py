import argparse
import json
import math
import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import serial
from flask import Flask, jsonify, request, send_from_directory
from serial.tools import list_ports


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "temperature.db"
SERIAL_BAUD = 115200
SENSOR_IDS = (1, 2)
LOCAL_TZ = timezone(timedelta(hours=8), name="Asia/Shanghai")

app = Flask(__name__, static_folder=str(BASE_DIR / "static"), static_url_path="")

state_lock = threading.Lock()
serial_lock = threading.Lock()
serial_config = {
    "port": None,
    "baud": SERIAL_BAUD,
    "version": 0,
    "simulate": False,
}
collector_state = {
    "running": False,
    "mode": "idle",
    "port": None,
    "baud": SERIAL_BAUD,
    "last_line": None,
    "last_error": None,
    "last_seen_ts": None,
    "received": 0,
    "stored": 0,
    "ignored": 0,
    "store_errors": 0,
    "last_packet_type": None,
    "last_store_error": None,
}


def local_now_iso():
    return datetime.now(LOCAL_TZ).isoformat(timespec="milliseconds")


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def connect_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def migrate_utc_rows_to_local_time(conn):
    rows = conn.execute(
        """
        SELECT id, ts
        FROM readings
        WHERE ts LIKE '%+00:00' OR ts LIKE '%Z'
        """
    ).fetchall()

    for row in rows:
        source = row["ts"].replace("Z", "+00:00")
        try:
            local_ts = datetime.fromisoformat(source).astimezone(LOCAL_TZ).isoformat(
                timespec="milliseconds"
            )
        except ValueError:
            continue
        conn.execute("UPDATE readings SET ts = ? WHERE id = ?", (local_ts, row["id"]))


def ensure_column(conn, table, column, definition):
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    with connect_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS readings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ts TEXT NOT NULL,
              sensor_id INTEGER NOT NULL,
              peer_mac TEXT NOT NULL,
              sequence INTEGER NOT NULL,
              temperature_c REAL NOT NULL,
              ambient_temperature_c REAL,
              ambient_humidity_percent REAL,
              ambient_status TEXT,
              status TEXT NOT NULL,
              ok_count INTEGER,
              error_count INTEGER,
              raw_json TEXT NOT NULL
            )
            """
        )
        ensure_column(conn, "readings", "ambient_temperature_c", "REAL")
        ensure_column(conn, "readings", "ambient_humidity_percent", "REAL")
        ensure_column(conn, "readings", "ambient_status", "TEXT")
        conn.execute("DROP INDEX IF EXISTS idx_readings_unique_sample")
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_readings_ts
            ON readings(ts)
            """
        )
        migrate_utc_rows_to_local_time(conn)


def update_state(**kwargs):
    with state_lock:
        collector_state.update(kwargs)


def get_state():
    with state_lock:
        return dict(collector_state)


def get_serial_config():
    with serial_lock:
        return dict(serial_config)


def set_serial_config(port, baud=None):
    with serial_lock:
        serial_config["port"] = port
        if baud:
            serial_config["baud"] = baud
        serial_config["version"] += 1
        return dict(serial_config)


def list_serial_ports():
    return [
        {
            "device": port.device,
            "description": port.description,
            "hwid": port.hwid,
        }
        for port in list_ports.comports()
    ]


def choose_serial_port(configured_port):
    if configured_port:
        return configured_port

    ports = list_serial_ports()
    if not ports:
        return None

    usb_ports = [
        port["device"]
        for port in ports
        if "usb" in f"{port['description']} {port['hwid']}".lower()
        or "com" in port["device"].lower()
    ]
    return usb_ports[0] if usb_ports else ports[0]["device"]


def latest_reading_for_sensor(conn, sensor_id):
    row = conn.execute(
        """
        SELECT ts, sensor_id, peer_mac, sequence, temperature_c,
               ambient_temperature_c, ambient_humidity_percent, ambient_status,
               status, ok_count, error_count
        FROM readings
        WHERE sensor_id = ?
        ORDER BY ts DESC
        LIMIT 1
        """,
        (sensor_id,),
    ).fetchone()
    return dict(row) if row else None


def stats_for_sensor(conn, since_iso, sensor_id):
    row = conn.execute(
        """
        SELECT MIN(temperature_c) AS min_temp,
               MAX(temperature_c) AS max_temp,
               AVG(temperature_c) AS avg_temp,
               AVG(ambient_temperature_c) AS avg_ambient_temp,
               AVG(ambient_humidity_percent) AS avg_ambient_humidity,
               COUNT(*) AS count
        FROM readings
        WHERE ts >= ? AND sensor_id = ?
        """,
        (since_iso, sensor_id),
    ).fetchone()
    return dict(row)


def store_sensor_packet(packet):
    temperature = packet.get("temperature_c")
    if temperature is None:
        update_state(last_store_error="Missing temperature_c")
        return False

    try:
        temperature = float(temperature)
    except (TypeError, ValueError):
        update_state(last_store_error=f"Invalid temperature_c: {temperature!r}")
        return False

    if not math.isfinite(temperature):
        update_state(last_store_error=f"Non-finite temperature_c: {temperature!r}")
        return False

    ambient_temperature = packet.get("ambient_temperature_c")
    if ambient_temperature is not None:
        try:
            ambient_temperature = float(ambient_temperature)
        except (TypeError, ValueError):
            ambient_temperature = None
        if ambient_temperature is not None and not math.isfinite(ambient_temperature):
            ambient_temperature = None

    ambient_humidity = packet.get("ambient_humidity_percent")
    if ambient_humidity is not None:
        try:
            ambient_humidity = float(ambient_humidity)
        except (TypeError, ValueError):
            ambient_humidity = None
        if ambient_humidity is not None and not math.isfinite(ambient_humidity):
            ambient_humidity = None

    peer_mac = str(packet.get("mac") or packet.get("peer") or "unknown")
    sensor_id = int(packet.get("sensor_id", 0))
    sequence = int(packet.get("sequence", 0))
    status = str(packet.get("status", "Unknown"))
    ambient_status = str(packet.get("ambient_status", "Unknown"))
    ok_count = packet.get("ok")
    error_count = packet.get("error")

    with connect_db() as conn:
        conn.execute(
            """
            INSERT INTO readings
              (ts, sensor_id, peer_mac, sequence, temperature_c, status,
               ambient_temperature_c, ambient_humidity_percent, ambient_status,
               ok_count, error_count, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                local_now_iso(),
                sensor_id,
                peer_mac,
                sequence,
                temperature,
                status,
                ambient_temperature,
                ambient_humidity,
                ambient_status,
                ok_count,
                error_count,
                json.dumps(packet, ensure_ascii=False),
            ),
        )
        update_state(last_store_error=None)
        return True


def handle_serial_line(line):
    update_state(last_line=line, last_seen_ts=local_now_iso())
    try:
        packet = json.loads(line)
    except json.JSONDecodeError:
        with state_lock:
            collector_state["ignored"] += 1
            collector_state["last_packet_type"] = "json_error"
        return

    with state_lock:
        collector_state["received"] += 1
        collector_state["last_packet_type"] = packet.get("type")

    if packet.get("type") != "sensor":
        with state_lock:
            collector_state["ignored"] += 1
        return

    try:
        stored = store_sensor_packet(packet)
    except Exception as exc:
        with state_lock:
            collector_state["store_errors"] += 1
            collector_state["last_store_error"] = str(exc)
        return

    if stored:
        with state_lock:
            collector_state["stored"] += 1
    else:
        with state_lock:
            collector_state["ignored"] += 1


def serial_worker():
    update_state(running=True, mode="serial", last_error=None)

    while True:
        config = get_serial_config()
        port = config["port"]
        baud = config["baud"]
        version = config["version"]

        if not port:
            update_state(
                running=False,
                mode="serial",
                port=None,
                baud=baud,
                last_error="No serial port selected",
            )
            time.sleep(1)
            continue

        try:
            update_state(running=True, mode="serial", port=port, baud=baud, last_error=None)
            with serial.Serial(port, baud, timeout=1) as ser:
                update_state(last_error=None)
                while True:
                    if get_serial_config()["version"] != version:
                        break
                    raw = ser.readline()
                    if not raw:
                        continue
                    line = raw.decode("utf-8", errors="ignore").strip()
                    if line:
                        handle_serial_line(line)
        except Exception as exc:
            if get_serial_config()["version"] == version:
                update_state(last_error=str(exc), running=False, port=port, baud=baud)
            time.sleep(3)
            if get_serial_config()["version"] == version:
                update_state(running=True)


def simulator_worker():
    with serial_lock:
        serial_config["simulate"] = True
    update_state(running=True, mode="simulate", port="simulator", last_error=None)
    sequences = {sensor_id: 0 for sensor_id in SENSOR_IDS}
    simulator_profiles = {
        1: {
            "mac": "B4:3A:45:41:2A:E8",
            "base_temp": 24.5,
            "base_ambient": 22.8,
            "base_humidity": 45.0,
            "phase": 0.0,
        },
        2: {
            "mac": "C8:3A:45:41:2A:E9",
            "base_temp": 26.2,
            "base_ambient": 23.4,
            "base_humidity": 48.0,
            "phase": 1.7,
        },
    }
    while True:
        for sensor_id in SENSOR_IDS:
            profile = simulator_profiles[sensor_id]
            sequences[sensor_id] += 1
            sequence = sequences[sensor_id]
            phase = profile["phase"]
            packet = {
                "type": "sensor",
                "sensor_id": sensor_id,
                "mac": profile["mac"],
                "sequence": sequence,
                "temperature_c": profile["base_temp"]
                + math.sin(sequence / 8 + phase) * 1.8,
                "ambient_temperature_c": profile["base_ambient"]
                + math.sin(sequence / 13 + phase) * 0.6,
                "ambient_humidity_percent": profile["base_humidity"]
                + math.sin(sequence / 17 + phase) * 5.0,
                "status": "OK",
                "ambient_status": "OK",
                "ok": sequence,
                "error": 0,
            }
            handle_serial_line(json.dumps(packet))
        time.sleep(2)


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/status")
def api_status():
    with connect_db() as conn:
        latest_by_sensor = {
            sensor_id: latest_reading_for_sensor(conn, sensor_id)
            for sensor_id in SENSOR_IDS
        }
        row = conn.execute(
            """
            SELECT ts, sensor_id, peer_mac, sequence, temperature_c,
                   ambient_temperature_c, ambient_humidity_percent, ambient_status,
                   status, ok_count, error_count
            FROM readings
            ORDER BY ts DESC
            LIMIT 1
            """
        ).fetchone()
        total = conn.execute("SELECT COUNT(*) AS total FROM readings").fetchone()["total"]

    return jsonify(
        {
            "collector": get_state(),
            "latest": dict(row) if row else None,
            "latest_by_sensor": latest_by_sensor,
            "sensor_ids": list(SENSOR_IDS),
            "total_readings": total,
            "ports": list_serial_ports(),
        }
    )


@app.route("/api/ports")
def api_ports():
    return jsonify({"ports": list_serial_ports(), "selected": get_serial_config()})


@app.route("/api/serial", methods=["POST"])
def api_serial():
    payload = request.get_json(force=True)
    port = str(payload.get("port") or "").strip()
    baud = int(payload.get("baud") or SERIAL_BAUD)

    if get_serial_config().get("simulate"):
        return jsonify({"ok": False, "error": "Simulator mode is active"}), 409

    valid_ports = {item["device"] for item in list_serial_ports()}
    if port not in valid_ports:
        return jsonify({"ok": False, "error": f"Serial port not found: {port}"}), 400

    selected = set_serial_config(port, baud)
    update_state(
        running=False,
        mode="serial",
        port=port,
        baud=baud,
        last_error="Switching serial port",
        last_line=None,
    )
    return jsonify({"ok": True, "selected": selected})


@app.route("/api/readings")
def api_readings():
    window_seconds = request.args.get("window", default=3600, type=int)
    limit = request.args.get("limit", default=4000, type=int)
    window_seconds = max(60, min(window_seconds, 7 * 24 * 3600))
    limit = max(10, min(limit, 20000))

    since_epoch = time.time() - window_seconds
    since_iso = datetime.fromtimestamp(since_epoch, LOCAL_TZ).isoformat(
        timespec="milliseconds"
    )

    with connect_db() as conn:
        rows = conn.execute(
            """
            SELECT ts, sensor_id, peer_mac, sequence, temperature_c,
                   ambient_temperature_c, ambient_humidity_percent, ambient_status,
                   status
            FROM readings
            WHERE ts >= ?
            ORDER BY ts ASC
            LIMIT ?
            """,
            (since_iso, limit),
        ).fetchall()

        stats = conn.execute(
            """
            SELECT MIN(temperature_c) AS min_temp,
                   MAX(temperature_c) AS max_temp,
                   AVG(temperature_c) AS avg_temp,
                   AVG(ambient_temperature_c) AS avg_ambient_temp,
                   AVG(ambient_humidity_percent) AS avg_ambient_humidity,
                   COUNT(*) AS count
            FROM readings
            WHERE ts >= ?
            """,
            (since_iso,),
        ).fetchone()
        stats_by_sensor = {
            sensor_id: stats_for_sensor(conn, since_iso, sensor_id)
            for sensor_id in SENSOR_IDS
        }

    return jsonify(
        {
            "window_seconds": window_seconds,
            "readings": [dict(row) for row in rows],
            "stats": dict(stats),
            "stats_by_sensor": stats_by_sensor,
            "sensor_ids": list(SENSOR_IDS),
        }
    )


@app.route("/api/ingest", methods=["POST"])
def api_ingest():
    packet = request.get_json(force=True)
    if packet.get("type") != "sensor":
        packet["type"] = "sensor"
    inserted = store_sensor_packet(packet)
    return jsonify({"inserted": inserted})


def main():
    parser = argparse.ArgumentParser(description="Qifa shaft temperature dashboard")
    parser.add_argument("--host", default=os.getenv("WEB_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("WEB_PORT", "8080")))
    parser.add_argument("--serial-port", default=os.getenv("SERIAL_PORT"))
    parser.add_argument("--baud", type=int, default=int(os.getenv("SERIAL_BAUD", SERIAL_BAUD)))
    parser.add_argument("--simulate", action="store_true")
    args = parser.parse_args()

    init_db()

    if args.simulate:
      thread = threading.Thread(target=simulator_worker, daemon=True)
      thread.start()
    else:
      selected_port = choose_serial_port(args.serial_port)
      set_serial_config(selected_port, args.baud)
      thread = threading.Thread(target=serial_worker, daemon=True)
      thread.start()

    app.run(host=args.host, port=args.port, threaded=True)


if __name__ == "__main__":
    main()
