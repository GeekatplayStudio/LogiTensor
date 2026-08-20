// LogiBoard Device Lab — ESP32 camera test firmware.
//
// What it does:
//  - Starts its own WiFi access point (default SSID "esp32video",
//    password "testESP32") so a phone/laptop can always reach it directly.
//  - Optionally ALSO joins your home network (AP+STA) when STA_SSID /
//    STA_PSK are baked in as compile defines — then it is reachable from
//    every device on that network too.
//  - Streams MJPEG video over HTTP:  http://<ip>/stream
//    single JPEG still:              http://<ip>/capture
//    JSON status:                    http://<ip>/
//  - Advertises over BLE as "esp32video" with a GATT characteristic that
//    carries the same JSON (SSID + IPs) so the iPhone app can discover the
//    camera over Bluetooth and learn where the video lives.
//
// Camera model is selected with -DCAMERA_MODEL_x (see camera_pins.h);
// default is the AI-Thinker ESP32-CAM. Build with the huge_app partition —
// camera + WiFi + BLE do not fit the default scheme.

#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include "esp_camera.h"
#include "camera_pins.h"
#include "ble_announce.h"
#include "secure_channel.h"
#include "led_control.h"

#ifndef AP_SSID
#define AP_SSID "esp32video"
#endif
#ifndef AP_PSK
#define AP_PSK "testESP32"
#endif
// Optional home-network join (AP stays up either way).
#ifndef STA_SSID
#define STA_SSID ""
#endif
#ifndef STA_PSK
#define STA_PSK ""
#endif

WebServer server(80);
Preferences prefs;
static bool cameraOk = false;

// Joins a WiFi network at runtime (BLE command, HTTP /wifi, or saved
// credentials at boot). The board's own AP stays up throughout, so a
// device can always fall back to connecting directly.
static bool wifiJoin(const String &ssid, const String &psk) {
  if (ssid.length() == 0) return false;
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(ssid.c_str(), psk.c_str());
  Serial.printf("Joining %s", ssid.c_str());
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nLAN: http://%s/\n", WiFi.localIP().toString().c_str());
    return true;
  }
  Serial.println("\nWiFi join failed — AP still available");
  return false;
}

static void wifiSave(const String &ssid, const String &psk) {
  prefs.putString("ssid", ssid);
  prefs.putString("psk", psk);
}

// Applies a control command from BLE or HTTP. Runs in loop() context.
static void applyCommand(const String &cmd) {
  if (cmd.startsWith("wifi:")) {
    int sep = cmd.indexOf('|');
    String ssid = sep > 5 ? cmd.substring(5, sep) : cmd.substring(5);
    String psk = sep > 5 ? cmd.substring(sep + 1) : "";
    Serial.printf("Command: join WiFi \"%s\"\n", ssid.c_str());
    if (wifiJoin(ssid, psk)) wifiSave(ssid, psk);
  } else if (cmd == "wifi_off") {
    Serial.println("Command: forget WiFi");
    prefs.remove("ssid");
    prefs.remove("psk");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_AP);
  } else if (cmd == "restart") {
    Serial.println("Command: restart");
    delay(200);
    ESP.restart();
  } else if (cmd.length() > 0) {
    Serial.printf("Unknown command: %s\n", cmd.c_str());
  }
}

// Runs one application command and returns a JSON result. Used by every
// transport (serial, HTTP /cmd, BLE) AFTER authentication has been decided
// by the caller.
static String executeCommand(const String &cmd) {
  if (ledCommand(cmd)) {
    return String("{\"ok\":true,\"led\":") + ledStateJson() + "}";
  }
  if (cmd.startsWith("echo:")) {
    // Data send/receive lesson: the device answers with what it heard plus
    // its own timestamp, so round-trip time can be measured end to end.
    String payload = cmd.substring(5);
    payload.replace("\\", "\\\\");
    payload.replace("\"", "\\\"");
    return "{\"ok\":true,\"echo\":\"" + payload + "\",\"deviceMs\":" + String(millis()) + "}";
  }
  if (cmd == "info") return statusJson();
  if (cmd == "test") return selfTestJson();
  // Provisioning/system commands (wifi:, wifi_off, restart).
  applyCommand(cmd);
  return statusJson();
}

// Network entry point: enforces the security policy, then executes.
// With a DEVICE_KEY baked, every network command needs nonce + MIC; without
// one (learning mode) commands run open and the status JSON says so.
static String executeNetworkCommand(const String &cmd, const String &nonceHex, const String &micHex) {
  if (secureEnabled() && !secureVerify(cmd, nonceHex, micHex)) {
    Serial.printf("REJECTED unauthenticated command: %s\n", cmd.c_str());
    return "{\"ok\":false,\"error\":\"auth failed: bad or missing nonce/MIC\"}";
  }
  return executeCommand(cmd);
}

static bool cameraInit() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  // PSRAM (ESP32-CAM has it) buys VGA double-buffering; without it fall
  // back to a small frame so the firmware still proves the pipeline.
  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 15;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x (check CAMERA_MODEL define / ribbon cable)\n", err);
    return false;
  }
  return true;
}

// Full self-test: exercises the camera (real frame grab with timing),
// reports WiFi/BLE/memory health. One-line JSON so tools can parse it.
static String selfTestJson() {
  String json = "{\"test\":\"esp32video\"";
  json += ",\"uptimeMs\":" + String(millis());
  json += ",\"heapFree\":" + String(ESP.getFreeHeap());
  json += ",\"psram\":" + String(psramFound() ? ESP.getFreePsram() : 0);
  json += ",\"camera\":";
  if (cameraOk) {
    uint32_t t0 = millis();
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) {
      json += "{\"ok\":true,\"frameBytes\":" + String(fb->len) +
              ",\"width\":" + String(fb->width) + ",\"height\":" + String(fb->height) +
              ",\"captureMs\":" + String(millis() - t0) + "}";
      esp_camera_fb_return(fb);
    } else {
      json += "{\"ok\":false,\"error\":\"frame grab failed\"}";
    }
  } else {
    json += "{\"ok\":false,\"error\":\"init failed\"}";
  }
  json += ",\"ap\":{\"ssid\":\"" AP_SSID "\",\"ip\":\"" + WiFi.softAPIP().toString() +
          "\",\"clients\":" + String(WiFi.softAPgetStationNum()) + "}";
  json += ",\"sta\":{\"connected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") +
          ",\"ip\":\"" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("")) +
          "\",\"rssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0) + "}";
  json += ",\"ble\":true}";
  return json;
}

static String statusJson() {
  String json = "{\"name\":\"" AP_SSID "\",\"camera\":";
  json += cameraOk ? "true" : "false";
  json += ",\"apIp\":\"" + WiFi.softAPIP().toString() + "\"";
  json += ",\"staIp\":\"" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("")) + "\"";
  json += ",\"clients\":" + String(WiFi.softAPgetStationNum());
  json += ",\"rssi\":" + String(WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0);
  json += ",\"secure\":" + String(secureEnabled() ? "true" : "false");
  json += ",\"led\":" + ledStateJson();
  json += "}";
  return json;
}

static void handleRoot() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", statusJson());
}

static void handleCapture() {
  if (!cameraOk) {
    server.send(503, "text/plain", "camera not initialized");
    return;
  }
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    server.send(503, "text/plain", "frame capture failed");
    return;
  }
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.setContentLength(fb->len);
  server.send(200, "image/jpeg", "");
  server.client().write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

// MJPEG: one long multipart response, a JPEG per part. Every consumer
// (browser <img>, iOS URLSession, VLC) understands this format.
static void handleStream() {
  if (!cameraOk) {
    server.send(503, "text/plain", "camera not initialized");
    return;
  }
  WiFiClient client = server.client();
  client.print(
      "HTTP/1.1 200 OK\r\n"
      "Access-Control-Allow-Origin: *\r\n"
      "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\r\n");
  while (client.connected()) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) break;
    client.printf("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len);
    client.write(fb->buf, fb->len);
    client.print("\r\n");
    esp_camera_fb_return(fb);
    // ~20 fps cap keeps WiFi + BLE coexistence stable on the classic ESP32.
    delay(50);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.println("\n=== LogiBoard esp32video ===");

  secureInit();
  ledInit();
  Serial.println(secureEnabled()
                     ? "Secure mode: network commands require nonce+MIC"
                     : "LEARNING MODE: no DEVICE_KEY baked — network commands are open");
  cameraOk = cameraInit();
  Serial.println(cameraOk ? "Camera OK" : "Camera FAILED (HTTP endpoints stay up for diagnostics)");

  // AP always up. STA credentials come from, in priority order: values
  // saved at runtime (BLE/HTTP provisioning, in NVS), then compile-time
  // defines from the flash wizard.
  prefs.begin("esp32video", false);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PSK);
  Serial.printf("AP up: SSID=%s  http://%s/\n", AP_SSID, WiFi.softAPIP().toString().c_str());
  String staSsid = prefs.getString("ssid", STA_SSID);
  String staPsk = prefs.getString("psk", STA_PSK);
  if (staSsid.length() > 0) wifiJoin(staSsid, staPsk);

  server.on("/", handleRoot);
  server.on("/capture", handleCapture);
  server.on("/stream", handleStream);
  server.on("/test", []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", selfTestJson());
  });
  // Secured command channel (see secure_channel.h):
  //   GET /auth/nonce                 -> {"nonce":"<32 hex>"}  (single-use, 30 s)
  //   GET /cmd?c=<cmd>&n=<nonce>&m=<mic>
  // mic = HMAC-SHA256(deviceKey, nonce + "|" + cmd), hex. Without a baked
  // DEVICE_KEY the n/m parameters are ignored (learning mode).
  server.on("/auth/nonce", []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", "{\"nonce\":\"" + secureIssueNonce() + "\"}");
  });
  server.on("/cmd", []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    String result = executeNetworkCommand(server.arg("c"), server.arg("n"), server.arg("m"));
    server.send(result.indexOf("\"ok\":false") >= 0 ? 401 : 200, "application/json", result);
  });
  // Same provisioning as the BLE control channel, over HTTP:
  //   GET /wifi?ssid=Home&psk=secret   |   GET /wifi?off=1
  server.on("/wifi", []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    if (server.hasArg("off")) {
      applyCommand("wifi_off");
    } else {
      applyCommand("wifi:" + server.arg("ssid") + "|" + server.arg("psk"));
    }
    server.send(200, "application/json", statusJson());
  });
  server.begin();

  bleAnnounceStart(AP_SSID);
  bleAnnounceUpdate(statusJson());
  Serial.println("BLE advertising as " AP_SSID);
}

// Test commands over USB serial — type them in the Device Lab monitor or
// let the backend's firmware probe send them:
//   ping   -> "pong <uptimeMs>"       (is anything alive?)
//   info   -> status JSON             (who are you, which IPs?)
//   test   -> self-test JSON          (camera frame grab, WiFi, memory)
// Anything else goes to applyCommand (wifi:<ssid>|<psk>, wifi_off, restart).
static void serialPoll() {
  static String buf = "";
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      buf.trim();
      if (buf == "ping") {
        Serial.printf("pong %lu\n", (unsigned long)millis());
      } else if (buf == "info") {
        Serial.println(statusJson());
      } else if (buf == "test") {
        Serial.println(selfTestJson());
      } else if (buf.length() > 0) {
        // Serial = physical access: commands run without MIC (same trust
        // model as holding the BOOT button — you have the hardware).
        Serial.println(executeCommand(buf));
      }
      buf = "";
    } else if (buf.length() < 160) {
      buf += c;
    }
  }
}

void loop() {
  server.handleClient();
  serialPoll();
  ledPoll();
  // Commands written to the BLE control characteristic are applied here —
  // never inside the BLE callback (WiFi work there stalls the BT stack).
  // BLE protocol:  "getnonce"                        -> notify {"nonce":...}
  //                "secure:<cmd>|<nonce>|<mic>"      -> authenticated command
  //                plain command                     -> only in learning mode
  String cmd = bleTakeCommand();
  if (cmd.length() > 0) {
    if (cmd == "getnonce") {
      bleAnnounceUpdate("{\"nonce\":\"" + secureIssueNonce() + "\"}");
    } else if (cmd.startsWith("secure:")) {
      String body = cmd.substring(7);
      int p1 = body.lastIndexOf('|');
      int p2 = body.lastIndexOf('|', p1 - 1);
      if (p1 > 0 && p2 > 0) {
        bleAnnounceUpdate(executeNetworkCommand(
            body.substring(0, p2), body.substring(p2 + 1, p1), body.substring(p1 + 1)));
      } else {
        bleAnnounceUpdate("{\"ok\":false,\"error\":\"malformed secure envelope\"}");
      }
    } else if (secureEnabled()) {
      Serial.printf("REJECTED plain BLE command (secure mode): %s\n", cmd.c_str());
      bleAnnounceUpdate("{\"ok\":false,\"error\":\"device is secured: use secure:<cmd>|<nonce>|<mic>\"}");
    } else {
      bleAnnounceUpdate(executeCommand(cmd));
    }
  }
  // Refresh the BLE info payload every ~5 s so a phone that connects gets
  // current IPs and client counts.
  static uint32_t lastBle = 0;
  if (millis() - lastBle > 5000) {
    lastBle = millis();
    bleAnnounceUpdate(statusJson());
  }
  delay(2);
}
