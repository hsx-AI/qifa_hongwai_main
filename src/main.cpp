#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <math.h>

namespace {
constexpr uint8_t kEspNowChannel = 6;
constexpr uint32_t kSerialBaud = 115200;
constexpr uint32_t kHeartbeatIntervalMs = 5000;
constexpr uint16_t kPacketMagic = 0x5148;  // QH
constexpr uint8_t kPacketVersion = 2;

struct __attribute__((packed)) SensorPacket {
  uint16_t magic;
  uint8_t version;
  uint8_t sensorId;
  uint32_t sequence;
  uint32_t uptimeMs;
  float temperatureC;
  float ambientTemperatureC;
  float ambientHumidityPercent;
  uint8_t statusCode;
  uint8_t ambientStatusCode;
  uint32_t okCount;
  uint32_t errorCount;
};

float lastTemperature = NAN;
float lastAmbientTemperature = NAN;
float lastAmbientHumidity = NAN;
uint8_t lastSensorId = 0;
uint32_t lastSequence = 0;
uint32_t lastReceiveMs = 0;
uint32_t receivedCount = 0;
uint32_t duplicateCount = 0;
uint32_t badPacketCount = 0;
uint32_t heartbeatMs = 0;
String lastStatus = "Waiting";
uint8_t lastPeerMac[6] = {};
uint8_t actualChannel = 0;

String macToString(const uint8_t *mac) {
  char text[18];
  snprintf(text,
           sizeof(text),
           "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0],
           mac[1],
           mac[2],
           mac[3],
           mac[4],
           mac[5]);
  return String(text);
}

const char *statusText(uint8_t statusCode) {
  switch (statusCode) {
    case 0:
      return "OK";
    case 1:
      return "Timeout";
    case 2:
      return "CRC error";
    case 3:
      return "Bad frame";
    case 4:
      return "Sensor error";
    case 5:
      return "Ambient error";
    default:
      return "Unknown";
  }
}

void printJsonPacket(const SensorPacket &packet, const uint8_t *mac) {
  Serial.print("{\"type\":\"sensor\",\"sensor_id\":");
  Serial.print(packet.sensorId);
  Serial.print(",\"mac\":\"");
  Serial.print(macToString(mac));
  Serial.print("\",\"sequence\":");
  Serial.print(packet.sequence);
  Serial.print(",\"uptime_ms\":");
  Serial.print(packet.uptimeMs);
  Serial.print(",\"temperature_c\":");
  if (isnan(packet.temperatureC)) {
    Serial.print("null");
  } else {
    Serial.print(packet.temperatureC, 2);
  }
  Serial.print(",\"ambient_temperature_c\":");
  if (isnan(packet.ambientTemperatureC)) {
    Serial.print("null");
  } else {
    Serial.print(packet.ambientTemperatureC, 2);
  }
  Serial.print(",\"ambient_humidity_percent\":");
  if (isnan(packet.ambientHumidityPercent)) {
    Serial.print("null");
  } else {
    Serial.print(packet.ambientHumidityPercent, 2);
  }
  Serial.print(",\"status\":\"");
  Serial.print(statusText(packet.statusCode));
  Serial.print("\",\"ambient_status\":\"");
  Serial.print(statusText(packet.ambientStatusCode));
  Serial.print("\",\"ok\":");
  Serial.print(packet.okCount);
  Serial.print(",\"error\":");
  Serial.print(packet.errorCount);
  Serial.print(",\"received\":");
  Serial.print(receivedCount);
  Serial.println("}");
}

void printStatus() {
  Serial.print("{\"type\":\"status\",\"mac\":\"");
  Serial.print(WiFi.macAddress());
  Serial.print("\",\"channel\":");
  Serial.print(kEspNowChannel);
  Serial.print(",\"actual_channel\":");
  Serial.print(actualChannel);
  Serial.print(",\"last_sensor_id\":");
  Serial.print(lastSensorId);
  Serial.print(",\"last_peer\":\"");
  Serial.print(macToString(lastPeerMac));
  Serial.print("\",\"last_sequence\":");
  Serial.print(lastSequence);
  Serial.print(",\"age_ms\":");
  Serial.print(lastReceiveMs == 0 ? 0 : millis() - lastReceiveMs);
  Serial.print(",\"temperature_c\":");
  if (isnan(lastTemperature)) {
    Serial.print("null");
  } else {
    Serial.print(lastTemperature, 2);
  }
  Serial.print(",\"ambient_temperature_c\":");
  if (isnan(lastAmbientTemperature)) {
    Serial.print("null");
  } else {
    Serial.print(lastAmbientTemperature, 2);
  }
  Serial.print(",\"ambient_humidity_percent\":");
  if (isnan(lastAmbientHumidity)) {
    Serial.print("null");
  } else {
    Serial.print(lastAmbientHumidity, 2);
  }
  Serial.print(",\"status\":\"");
  Serial.print(lastStatus);
  Serial.print("\",\"received\":");
  Serial.print(receivedCount);
  Serial.print(",\"duplicates\":");
  Serial.print(duplicateCount);
  Serial.print(",\"bad_packets\":");
  Serial.print(badPacketCount);
  Serial.println("}");
}

void onDataReceived(const uint8_t *mac, const uint8_t *data, int length) {
  if (length != static_cast<int>(sizeof(SensorPacket))) {
    ++badPacketCount;
    return;
  }

  SensorPacket packet;
  memcpy(&packet, data, sizeof(packet));
  if (packet.magic != kPacketMagic || packet.version != kPacketVersion) {
    ++badPacketCount;
    return;
  }

  if (packet.sensorId == lastSensorId && packet.sequence == lastSequence &&
      memcmp(lastPeerMac, mac, sizeof(lastPeerMac)) == 0) {
    ++duplicateCount;
    return;
  }

  memcpy(lastPeerMac, mac, sizeof(lastPeerMac));
  lastSensorId = packet.sensorId;
  lastSequence = packet.sequence;
  lastTemperature = packet.temperatureC;
  lastAmbientTemperature = packet.ambientTemperatureC;
  lastAmbientHumidity = packet.ambientHumidityPercent;
  lastStatus = statusText(packet.statusCode);
  lastReceiveMs = millis();
  ++receivedCount;

  printJsonPacket(packet, mac);
}

void handleSerialCommand() {
  if (!Serial.available()) {
    return;
  }

  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toLowerCase();

  if (command == "status") {
    printStatus();
  } else if (command == "mac") {
    Serial.print("{\"type\":\"mac\",\"mac\":\"");
    Serial.print(WiFi.macAddress());
    Serial.println("\"}");
  } else if (command == "help") {
    Serial.println("{\"type\":\"help\",\"commands\":[\"status\",\"mac\",\"help\"]}");
  }
}

void setupEspNow() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false, false);
  WiFi.setSleep(false);
  esp_wifi_set_ps(WIFI_PS_NONE);
  esp_wifi_set_promiscuous(true);
  esp_err_t channelResult = esp_wifi_set_channel(kEspNowChannel, WIFI_SECOND_CHAN_NONE);
  esp_wifi_set_promiscuous(false);
  if (channelResult != ESP_OK) {
    Serial.print("{\"type\":\"error\",\"stage\":\"set_channel\",\"code\":");
    Serial.print(static_cast<int>(channelResult));
    Serial.println("}");
  }

  esp_err_t initResult = esp_now_init();
  if (initResult != ESP_OK) {
    Serial.print("{\"type\":\"error\",\"stage\":\"esp_now_init\",\"code\":");
    Serial.print(static_cast<int>(initResult));
    Serial.println("}");
    while (true) {
      delay(1000);
    }
  }

  esp_now_register_recv_cb(onDataReceived);

  wifi_second_chan_t secondChannel = WIFI_SECOND_CHAN_NONE;
  esp_wifi_get_channel(&actualChannel, &secondChannel);
}
}  // namespace

void setup() {
  Serial.begin(kSerialBaud);
  delay(500);

  setupEspNow();

  Serial.print("{\"type\":\"boot\",\"role\":\"master\",\"mac\":\"");
  Serial.print(WiFi.macAddress());
  Serial.print("\",\"channel\":");
  Serial.print(kEspNowChannel);
  Serial.print(",\"actual_channel\":");
  Serial.print(actualChannel);
  Serial.println("}");
}

void loop() {
  handleSerialCommand();

  const uint32_t nowMs = millis();
  if (nowMs - heartbeatMs >= kHeartbeatIntervalMs) {
    heartbeatMs = nowMs;
    printStatus();
  }

  delay(5);
}
