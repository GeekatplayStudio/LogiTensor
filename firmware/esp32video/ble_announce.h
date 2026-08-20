// BLE for the esp32video firmware:
//  - INFO characteristic (read/notify): JSON with AP SSID + both IPs, so a
//    phone can discover the camera over Bluetooth and learn where the
//    video stream lives.
//  - CONTROL characteristic (write): lets a connected device configure the
//    board at runtime — no reflash needed:
//        wifi:<ssid>|<password>   join a WiFi network (saved, survives reboot)
//        wifi_off                 forget saved WiFi and drop the connection
//        restart                  reboot the board
//
// Video itself never travels over BLE — the bandwidth (~kb/s) is three
// orders of magnitude short of MJPEG; BLE is for discovery and control.
//
// Commands are only queued here; the sketch's loop() applies them. Doing
// WiFi work inside a BLE callback stalls the Bluetooth stack.
#pragma once

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Random project-specific UUIDs (stable — the iPhone app filters on them).
#define LB_BLE_SERVICE_UUID "7a0e1000-63b1-4be3-9a10-4d3f6e1a2b01"
#define LB_BLE_INFO_CHAR_UUID "7a0e1001-63b1-4be3-9a10-4d3f6e1a2b01"
#define LB_BLE_CONTROL_CHAR_UUID "7a0e1002-63b1-4be3-9a10-4d3f6e1a2b01"

static BLECharacteristic *lbInfoChar = nullptr;
// Pending command written over BLE, consumed by loop().
static String lbPendingCommand = "";

class LbControlCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *ch) override {
    String value = ch->getValue().c_str();
    if (value.length() > 0 && value.length() <= 120) {
      lbPendingCommand = value;
    }
  }
};

inline void bleAnnounceStart(const char *deviceName) {
  BLEDevice::init(deviceName);
  BLEServer *server = BLEDevice::createServer();
  BLEService *service = server->createService(LB_BLE_SERVICE_UUID);

  lbInfoChar = service->createCharacteristic(
      LB_BLE_INFO_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  lbInfoChar->addDescriptor(new BLE2902());

  BLECharacteristic *controlChar = service->createCharacteristic(
      LB_BLE_CONTROL_CHAR_UUID, BLECharacteristic::PROPERTY_WRITE);
  controlChar->setCallbacks(new LbControlCallback());

  service->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(LB_BLE_SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

inline void bleAnnounceUpdate(const String &json) {
  if (lbInfoChar == nullptr) return;
  lbInfoChar->setValue((uint8_t *)json.c_str(), json.length());
  lbInfoChar->notify();
}

/** Returns and clears the last command written over BLE ("" if none). */
inline String bleTakeCommand() {
  String cmd = lbPendingCommand;
  lbPendingCommand = "";
  return cmd;
}
