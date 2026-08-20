// Camera pin maps per board model. Selected with a -DCAMERA_MODEL_x compile
// define from the Device Lab flash wizard; AI-Thinker ESP32-CAM is the
// default because it is the most common camera module.
#pragma once

#if defined(CAMERA_MODEL_XIAO_ESP32S3)
// Seeed XIAO ESP32S3 Sense
#define PWDN_GPIO_NUM -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 10
#define SIOD_GPIO_NUM 40
#define SIOC_GPIO_NUM 39
#define Y9_GPIO_NUM 48
#define Y8_GPIO_NUM 11
#define Y7_GPIO_NUM 12
#define Y6_GPIO_NUM 14
#define Y5_GPIO_NUM 16
#define Y4_GPIO_NUM 18
#define Y3_GPIO_NUM 17
#define Y2_GPIO_NUM 15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM 47
#define PCLK_GPIO_NUM 13
// XIAO's user LED sinks current on GPIO 21.
#ifndef LB_LED_GPIO
#define LB_LED_GPIO 21
#define LB_LED_ACTIVE_LOW 1
#endif

#elif defined(CAMERA_MODEL_ESP32S3_EYE)
// Espressif ESP32-S3-EYE — Freenove ESP32-S3-WROOM CAM boards use the
// same map (S3 + CH343 UART bridge + OV2640).
#define PWDN_GPIO_NUM -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 15
#define SIOD_GPIO_NUM 4
#define SIOC_GPIO_NUM 5
#define Y9_GPIO_NUM 16
#define Y8_GPIO_NUM 17
#define Y7_GPIO_NUM 18
#define Y6_GPIO_NUM 12
#define Y5_GPIO_NUM 10
#define Y4_GPIO_NUM 8
#define Y3_GPIO_NUM 9
#define Y2_GPIO_NUM 11
#define VSYNC_GPIO_NUM 6
#define HREF_GPIO_NUM 7
#define PCLK_GPIO_NUM 13
// Freenove S3 CAM has an addressable RGB LED on GPIO 48.
#if !defined(LB_LED_GPIO) && !defined(LB_LED_WS2812_GPIO)
#define LB_LED_WS2812_GPIO 48
#endif

#elif defined(CAMERA_MODEL_WROVER_KIT)
// Espressif ESP-WROVER-KIT
#define PWDN_GPIO_NUM -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 21
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 19
#define Y4_GPIO_NUM 18
#define Y3_GPIO_NUM 5
#define Y2_GPIO_NUM 4
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

#else
// Default: AI-Thinker ESP32-CAM (OV2640)
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22
// AI-Thinker's onboard red LED sinks current on GPIO 33 (the big flash
// LED is GPIO 4 — deliberately not used, it is blinding).
#ifndef LB_LED_GPIO
#define LB_LED_GPIO 33
#define LB_LED_ACTIVE_LOW 1
#endif
#endif
