// Consumer-grade command security for esp32video.
//
// Model (the same one commercial IoT devices use, scaled to a lesson):
//  - A unique 256-bit DEVICE_KEY is baked in at flash time (Device Lab
//    keystore). The phone/computer learns it once at pairing, never over
//    the air.
//  - Every command needs a fresh challenge: caller fetches a random nonce
//    (HTTP GET /auth/nonce, or BLE read of the info characteristic's nonce
//    field), then sends  <cmd> | nonce | HMAC-SHA256(key, nonce + "|" + cmd).
//  - Each nonce is single-use and expires after 30 s, so captured traffic
//    cannot be replayed and forged MICs are rejected.
//  - With no DEVICE_KEY baked (learning mode) commands run unauthenticated,
//    and the status JSON says secure:false so the UI can warn.
#pragma once

#include <Arduino.h>
#include "mbedtls/md.h"
#include "esp_random.h"

#ifndef DEVICE_KEY
#define DEVICE_KEY ""
#endif

#define LB_NONCE_TTL_MS 30000
#define LB_NONCE_SLOTS 4

struct LbNonce {
  uint8_t bytes[16];
  uint32_t issuedAt = 0;
  bool used = true;
};

static LbNonce lbNonces[LB_NONCE_SLOTS];
static uint8_t lbKey[32];
static size_t lbKeyLen = 0;

static int lbHexVal(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

inline bool secureEnabled() { return lbKeyLen == 32; }

inline void secureInit() {
  const char *hex = DEVICE_KEY;
  size_t len = strlen(hex);
  if (len != 64) return; // no (valid) key baked — learning mode
  for (size_t i = 0; i < 32; i++) {
    int hi = lbHexVal(hex[2 * i]), lo = lbHexVal(hex[2 * i + 1]);
    if (hi < 0 || lo < 0) return;
    lbKey[i] = (uint8_t)((hi << 4) | lo);
  }
  lbKeyLen = 32;
}

static String lbToHex(const uint8_t *data, size_t len) {
  static const char *digits = "0123456789abcdef";
  String out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; i++) {
    out += digits[data[i] >> 4];
    out += digits[data[i] & 0x0F];
  }
  return out;
}

/** Issues a fresh single-use nonce (hex). Oldest slot is recycled. */
inline String secureIssueNonce() {
  int slot = 0;
  for (int i = 0; i < LB_NONCE_SLOTS; i++) {
    if (lbNonces[i].used) { slot = i; break; }
    if (lbNonces[i].issuedAt < lbNonces[slot].issuedAt) slot = i;
  }
  esp_fill_random(lbNonces[slot].bytes, sizeof(lbNonces[slot].bytes));
  lbNonces[slot].issuedAt = millis();
  lbNonces[slot].used = false;
  return lbToHex(lbNonces[slot].bytes, 16);
}

/** Constant-time-ish compare of two hex MICs. */
static bool lbMicEquals(const String &a, const String &b) {
  if (a.length() != b.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < a.length(); i++) diff |= (uint8_t)(a[i] ^ b[i]);
  return diff == 0;
}

/**
 * Verifies cmd/nonceHex/micHex against the baked key. Consumes the nonce
 * on success — a second command with the same nonce is a replay and fails.
 */
inline bool secureVerify(const String &cmd, const String &nonceHex, const String &micHex) {
  if (!secureEnabled()) return false;
  // Locate a live, unused, unexpired nonce matching nonceHex.
  int found = -1;
  for (int i = 0; i < LB_NONCE_SLOTS; i++) {
    if (!lbNonces[i].used &&
        millis() - lbNonces[i].issuedAt < LB_NONCE_TTL_MS &&
        lbToHex(lbNonces[i].bytes, 16) == nonceHex) {
      found = i;
      break;
    }
  }
  if (found < 0) return false;

  String message = nonceHex + "|" + cmd;
  uint8_t mac[32];
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
                  lbKey, lbKeyLen,
                  (const uint8_t *)message.c_str(), message.length(), mac);
  bool ok = lbMicEquals(lbToHex(mac, 32), micHex);
  if (ok) lbNonces[found].used = true; // consume: no replays
  return ok;
}
