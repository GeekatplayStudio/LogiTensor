// LED actuator for the "execute a command" lesson. Per-board wiring comes
// from camera_pins.h model selection or -D overrides:
//   LB_LED_WS2812_GPIO  addressable RGB LED (Freenove S3 CAM: GPIO 48)
//   LB_LED_GPIO         plain LED pin
//   LB_LED_ACTIVE_LOW   plain LED sinks current (AI-Thinker's GPIO 33)
#pragma once

#include <Arduino.h>

#if !defined(LB_LED_WS2812_GPIO) && !defined(LB_LED_GPIO)
#define LB_LED_GPIO 2
#endif

static bool lbLedOn = false;
static bool lbLedBlink = false;

static void lbLedWrite(bool on) {
#if defined(LB_LED_WS2812_GPIO)
  neopixelWrite(LB_LED_WS2812_GPIO, on ? 32 : 0, on ? 32 : 0, on ? 32 : 0);
#elif defined(LB_LED_ACTIVE_LOW)
  digitalWrite(LB_LED_GPIO, on ? LOW : HIGH);
#else
  digitalWrite(LB_LED_GPIO, on ? HIGH : LOW);
#endif
}

inline void ledInit() {
#if !defined(LB_LED_WS2812_GPIO)
  pinMode(LB_LED_GPIO, OUTPUT);
#endif
  lbLedWrite(false);
}

/** Handles led:on / led:off / led:toggle / led:blink. Returns true if handled. */
inline bool ledCommand(const String &cmd) {
  if (cmd == "led:on") { lbLedBlink = false; lbLedOn = true; }
  else if (cmd == "led:off") { lbLedBlink = false; lbLedOn = false; }
  else if (cmd == "led:toggle") { lbLedBlink = false; lbLedOn = !lbLedOn; }
  else if (cmd == "led:blink") { lbLedBlink = true; }
  else return false;
  if (!lbLedBlink) lbLedWrite(lbLedOn);
  return true;
}

/** Call from loop(): drives blink mode at 4 Hz. */
inline void ledPoll() {
  if (!lbLedBlink) return;
  static uint32_t last = 0;
  if (millis() - last >= 250) {
    last = millis();
    lbLedOn = !lbLedOn;
    lbLedWrite(lbLedOn);
  }
}

inline String ledStateJson() {
  return String("{\"on\":") + (lbLedOn ? "true" : "false") +
         ",\"blink\":" + (lbLedBlink ? "true" : "false") + "}";
}
