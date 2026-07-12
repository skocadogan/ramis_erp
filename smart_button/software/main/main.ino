#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <EEPROM.h>
#include <string.h>

extern "C" {
  #include "user_interface.h"
}
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// OLED Ekran Yapılandırması
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Buton: D6 (GPIO12). Derin uyku için D0 (GPIO16) → RST bağlantısı gereklidir.
const int buttonPin = D6;

const unsigned long SETUP_HOLD_MS      = 8000;  // 8 sn → kurulum moduna geç
const unsigned long TOGGLE_SLEEP_HOLD_MS = 5000; // 5 sn → uyku modunu aç/kapat
const unsigned long WAITER_MSG_MS      = 3500;  // Çağrı ekran mesajı süresi
const unsigned long BUTTON_DEBOUNCE_MS = 25;
const unsigned long SPLASH_MS          = 2000;
const int WIFI_BOOT_TIMEOUT_TICKS      = 100;
const unsigned long WIFI_CHECK_INTERVAL_MS = 3000;

enum WifiBootState {
  WIFI_BOOT_CONNECTED,
  WIFI_BOOT_FAILED
};

const unsigned char ramis_exact_logofavicon[] PROGMEM = {
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x7f, 0xef, 0x7f, 0xfb, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x58, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x70, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x60, 0x1b, 0x6d, 0xb6, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x90, 0x08, 0x00, 0x03, 0x80, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x10, 0x00, 0x00, 0x60, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x60, 0x18, 0x00, 0x00, 0x30, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x08, 0x00, 0x00, 0x10, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x90, 0x00, 0x00, 0x00, 0xc8, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x60, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x5b, 0x49, 0x37, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x06, 0x40, 0x49, 0x00, 0x00, 0x28, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x12, 0x04, 0x00, 0x40, 0x00, 0xc8, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x00, 0x00, 0x00, 0x03, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x60, 0x09, 0x26, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x1a, 0x49, 0x80, 0x48, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x90, 0x10, 0x00, 0xc0, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x14, 0x00, 0x38, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x60, 0x10, 0x00, 0x08, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x18, 0x00, 0x06, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x90, 0x08, 0x00, 0x03, 0x00, 0x70, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x24, 0x00, 0x00, 0xc0, 0x18, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x6c, 0xb0, 0x00, 0x00, 0x64, 0x8e, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x24, 0x90, 0x00, 0x00, 0x19, 0xa2, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x6d, 0xb0, 0x00, 0x06, 0x00, 0x03, 0x00, 0x00, 0xc0, 0x30, 0x03, 0x6c, 0x00, 0x00,
  0x00, 0x00, 0x20, 0x0e, 0x00, 0x13, 0x80, 0x02, 0xc0, 0x03, 0x40, 0x18, 0x08, 0x01, 0x00, 0x00,
  0x00, 0x00, 0x90, 0x03, 0x00, 0x18, 0xc0, 0x02, 0x40, 0x03, 0x20, 0x40, 0x18, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x40, 0x01, 0x00, 0x20, 0x50, 0x03, 0x30, 0x0c, 0x80, 0x30, 0x06, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x68, 0x06, 0x00, 0xc0, 0x10, 0x01, 0x18, 0x10, 0xc0, 0x18, 0x03, 0xf4, 0x00, 0x00,
  0x00, 0x00, 0x29, 0x30, 0x00, 0x58, 0xb0, 0x06, 0x06, 0x40, 0x40, 0x48, 0x00, 0x06, 0x00, 0x00,
  0x00, 0x00, 0x94, 0x98, 0x01, 0x46, 0x2c, 0x02, 0x03, 0x40, 0xc0, 0x20, 0x00, 0x03, 0x80, 0x00,
  0x00, 0x00, 0x50, 0x0a, 0x03, 0x20, 0x46, 0x03, 0x00, 0x80, 0x90, 0x30, 0x00, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x40, 0x03, 0x06, 0x00, 0x02, 0x04, 0x80, 0x00, 0xc0, 0x18, 0x1e, 0xdc, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
};

// Light sleep modu: RAM korunur, D6 interrupt ile uyanır, donanım değişikliği gerektirmez.
// deepSleepEnabled güç kesintisinde sıfırlanır (varsayılan: uyku açık) — kasıtlı davranış.
bool deepSleepEnabled = true;

// Non-blocking buton durum makinesi
enum ButtonFSMState {
  BTN_FSM_IDLE,
  BTN_FSM_DEBOUNCE,
  BTN_FSM_HELD
};

// Buton olay sonuçları
enum ButtonEvent {
  BTN_EVT_NONE,
  BTN_EVT_SHORT,   // < 5 sn → garson çağır
  BTN_EVT_MEDIUM,  // 5–8 sn → uyku modunu aç/kapat
  BTN_EVT_LONG     // ≥ 8 sn → kurulum modu (FSM içinde tetiklenir)
};

bool isConfigured = false;
WifiBootState wifiBootState = WIFI_BOOT_CONNECTED;

ButtonFSMState btnFSM = BTN_FSM_IDLE;
unsigned long btnFSMStart = 0;
unsigned long lastWifiCheckMs = 0;

// Kurulum modunda bağlı istemci IP takibi
String lastDisplayedClientIp = "";


// Web Sunucusu (Port 80)
ESP8266WebServer server(80);

// EEPROM Bellek Yapısı (schema 2: masa_id 40 byte)
struct RamisConfig {
  char flag[6];
  uint8_t schema_version; // 2 = guncel yerlesim
  char wifi_ssid[32];
  char wifi_pass[64];
  char ramis_ip[40]; // IPV6 dahil
  char masa_id[40]; // UUID: 36 karakter + null
  char masa_name[32]; // Orn: Masa 1
};

const uint8_t CONFIG_SCHEMA_VERSION = 2;

RamisConfig configData;

// Tarayıcılar İçin B Planı: Manuel HTML Tasarımı
const char CONFIG_PAGE[] PROGMEM = R"=====(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAMIS Çağrı Düğmesi Kurulumu</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f6fa; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .container { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); width: 100%; max-width: 380px; }
        h2 { color: #2f3640; text-align: center; margin-bottom: 8px; font-weight: 600; font-size: 22px; }
        .subtitle { color: #7f8c8d; text-align: center; font-size: 13px; margin-bottom: 25px; }
        .form-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 6px; color: #718093; font-size: 13px; font-weight: 500; }
        input[type="text"], input[type="password"] { width: 100%; padding: 11px; border: 1px solid #dcdde1; border-radius: 6px; box-sizing: border-box; font-size: 14px; transition: border 0.3s; }
        input:focus { border-color: #00a8ff; outline: none; }
        button { width: 100%; padding: 12px; background-color: #4cd137; border: none; border-radius: 6px; color: white; font-size: 15px; font-weight: bold; cursor: pointer; transition: background 0.3s; margin-top: 10px; }
        button:hover { background-color: #44bd32; }
    </style>
</head>
<body>
    <div class="container">
        <h2>RAMIS Çağrı Düğmesi Kurulumu</h2>
        <div class="subtitle">Kurulum ve Yapılandırma</div>
        <form action="/save" method="POST">
            <div class="form-group">
                <label>Wi-Fi Ağ Adı (SSID)</label>
                <input type="text" name="ssid" required placeholder="Restoran Wi-Fi adı">
            </div>
            <div class="form-group">
                <label>Wi-Fi Şifresi</label>
                <input type="password" name="password" required placeholder="••••••••">
            </div>
            <div class="form-group">
                <label>RAMIS Sunucu IP / Domain</label>
                <input type="text" name="ramis_ip" required placeholder="Örn: 192.168.1.100">
            </div>
            <div class="form-group">
                <label>Masa ID</label>
                <input type="text" name="masa" required placeholder="36 haneli masa id">
            </div>
            <div class="form-group">
                <label>Masa Adı</label>
                <input type="text" name="masa_name" required placeholder="Cihazda görünecek masa adı">
            </div>
            <button type="submit">Ayarları Kaydet ve Başlat</button>
        </form>
    </div>
</body>
</html>
)=====";


int randomUniqueId = random(1000000000, 9999999999);
String uniqueId = String(randomUniqueId);

// Bilgi Ekranı Yönetimi (const char* — heap fragmentation yok)
void showOnScreen(const char* title, const char* msg1, const char* msg2) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(2);
  display.setCursor(0, 0);
  display.println(title);
  display.setTextSize(1);
  display.drawLine(0, 20, 128, 20, SSD1306_WHITE);

  display.setCursor(0, 26);
  display.println(msg1);

  display.setCursor(0, 47);
  display.println(msg2);
  display.display();
}

// EEPROM Bellek Okuma
void readConfig() {
  EEPROM.begin(sizeof(RamisConfig));
  EEPROM.get(0, configData);
  EEPROM.end();
}

// EEPROM Bellek Yazma
void saveConfig() {
  EEPROM.begin(sizeof(RamisConfig));
  EEPROM.put(0, configData);
  EEPROM.commit();
  EEPROM.end();
}

void enterSetupModeFromLongPress();
void showReadyScreen();
void showSplashLogo();
void waitWithLongPressCheck(unsigned long ms);
bool connectToWifiAtBoot();
void runConfiguredBootSequence();
bool syncTableNameFromServer();
String readHttpBody(HTTPClient& http);
void toggleDeepSleepMode();
void runLightSleepCycle();

// Kurulum moduna dönmek için yapılandırmayı sıfırla
void clearConfig() {
  memset(&configData, 0, sizeof(configData));
  saveConfig();
}

// Buton basıldı mı? (INPUT_PULLUP: basılı = LOW)
bool isButtonPressed() {
  return digitalRead(buttonPin) == LOW;
}

// Buton 5 sn basılı tutuldu mu? (INPUT_PULLUP: basılı = LOW)
bool isButtonHeld(unsigned long holdMs) {
  if (!isButtonPressed()) {
    return false;
  }
  unsigned long pressStart = millis();
  while (isButtonPressed()) {
    if (millis() - pressStart >= holdMs) {
      return true;
    }
    delay(10);
  }
  return false;
}

// Non-blocking buton FSM — döngüyü dondurMAZ.
// Kısa (<5 sn) → BTN_EVT_SHORT
// Orta (5–8 sn) → BTN_EVT_MEDIUM  (uyku aç/kapat)
// Uzun (≥8 sn)  → doğrudan enterSetupModeFromLongPress() çağrılır
ButtonEvent processButtonNonBlocking() {
  const bool pressed = (digitalRead(buttonPin) == LOW);
  const unsigned long now = millis();

  switch (btnFSM) {
    case BTN_FSM_IDLE:
      if (pressed) {
        btnFSMStart = now;
        btnFSM = BTN_FSM_DEBOUNCE;
      }
      break;

    case BTN_FSM_DEBOUNCE:
      if (!pressed) {
        btnFSM = BTN_FSM_IDLE; // Gürültü
      } else if (now - btnFSMStart >= BUTTON_DEBOUNCE_MS) {
        btnFSM = BTN_FSM_HELD;
      }
      break;

    case BTN_FSM_HELD:
      if (now - btnFSMStart >= SETUP_HOLD_MS) {
        // 8 sn doldu, buton hâlâ basılı → kurulum
        btnFSM = BTN_FSM_IDLE;
        enterSetupModeFromLongPress();
        return BTN_EVT_NONE;
      }
      if (!pressed) {
        // Bırakıldı — basılı kalma süresine göre ayırt et
        btnFSM = BTN_FSM_IDLE;
        const unsigned long dur = now - btnFSMStart;
        if (dur >= TOGGLE_SLEEP_HOLD_MS) {
          return BTN_EVT_MEDIUM; // 5–8 sn
        }
        return BTN_EVT_SHORT;   // < 5 sn
      }
      break;
  }
  return BTN_EVT_NONE;
}

// OLED için masa etiketi (masa_name öncelikli, yoksa masa_id kısaltması)
String formatMasaForDisplay() {
  String name = String(configData.masa_name);
  name.trim();
  if (name.length() > 0) {
    if (name.length() > 16) {
      return name.substring(0, 16);
    }
    return name;
  }

  String masa = String(configData.masa_id);
  masa.trim();
  if (masa.length() == 0) {
    return "?";
  }
  if (masa.length() > 10) {
    return masa.substring(0, 10);
  }
  return masa;
}

void showReadyScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(3);
  display.setCursor(0, 0);
  display.println(formatMasaForDisplay());
  display.drawLine(0, 21, 128, 21, SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 28);
  display.println("Garsonu cagirmak icin");
  display.setCursor(0, 48);
  display.println("butona basin");

  // Uyku modu göstergesi
  display.setCursor(0, 56);
  display.print(deepSleepEnabled ? F("[Uyku: Acik]") : F("[Uyku: Kapali]"));

  display.display();
}

void showSplashLogo() {
  display.clearDisplay();
  display.drawBitmap(0, 0, ramis_exact_logofavicon, SCREEN_WIDTH, SCREEN_HEIGHT, SSD1306_WHITE);
  display.display();
}

void waitWithLongPressCheck(unsigned long ms) {
  unsigned long start = millis();
  while (millis() - start < ms) {
    if (isButtonHeld(SETUP_HOLD_MS)) {
      enterSetupModeFromLongPress();
    }
    delay(10);
  }
}

bool connectToWifiAtBoot() {
  showOnScreen("RAMIS", "Ag baglantisi", "saglaniyor...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(configData.wifi_ssid, configData.wifi_pass);

  int timeoutCounter = 0;
  while (WiFi.status() != WL_CONNECTED) {
    if (isButtonHeld(SETUP_HOLD_MS)) {
      enterSetupModeFromLongPress();
    }
    delay(200);
    timeoutCounter++;
    if (timeoutCounter > WIFI_BOOT_TIMEOUT_TICKS) {
      Serial.println(F("Acilis Wi-Fi baglantisi basarisiz"));
      return false;
    }
  }

  Serial.print(F("Wi-Fi baglandi, IP: "));
  Serial.println(WiFi.localIP());
  return true;
}

void runConfiguredBootSequence() {
  showSplashLogo();
  waitWithLongPressCheck(SPLASH_MS);

  if (connectToWifiAtBoot()) {
    wifiBootState = WIFI_BOOT_CONNECTED;
    syncTableNameFromServer();
    showReadyScreen();
    return;
  }

  wifiBootState = WIFI_BOOT_FAILED;
  showOnScreen("RAMIS", "Ag Baglantisi", "Saglanamadi");
}

bool isWifiBootReady() {
  return wifiBootState == WIFI_BOOT_CONNECTED;
}

void checkWifiConnectionAndRestart() {
  if (!isConfigured || !isWifiBootReady()) {
    return;
  }

  unsigned long now = millis();
  if (now - lastWifiCheckMs < WIFI_CHECK_INTERVAL_MS) {
    return;
  }
  lastWifiCheckMs = now;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("Wi-Fi baglantisi koptu, yeniden baslatiliyor..."));
    showOnScreen("RAMIS", "Ag baglantisi", "Yeniden basliyor...");
    ESP.restart();
  }
}

// ── Light Sleep ───────────────────────────────────────────────────────────────
// D6 (GPIO12) interrupt ile uyandırma; donanım değişikliği gerektirmez.
// RAM korunur: connectToWifi, configData vb. tekrar okunmaya gerek yok.

// 5 sn basışla uyku modunu aç/kapat
void toggleDeepSleepMode() {
  deepSleepEnabled = !deepSleepEnabled;
  if (deepSleepEnabled) {
    showOnScreen("UYKU MODU", "Aktif", "Cagri sonrasi uyur");
  } else {
    showOnScreen("UYKU MODU", "Devre Disi", "Cagri sonrasi uyanik");
  }
  delay(2000);
  showReadyScreen();
}

// const char* başındaki boşlukları atla (heap allocation yok)
const char* trimStringStart(const char* str) {
  if (!str) return "";
  while (*str == ' ' || *str == '\t' || *str == '\r' || *str == '\n') {
    str++;
  }
  return str;
}

// HTTP isteği at; yanıt kodunu döndür (başarı: 2xx, hata: ≤0 veya 4xx/5xx)
int sendWaiterCallHttp() {
  WiFiClient wc;
  HTTPClient http;
  char url[256];
  // Ek güvenlik: masa_id başındaki boşlukları temizle (eski EEPROM kayıtları için)
  const char* cleanMasaId = trimStringStart(configData.masa_id);
  snprintf(url, sizeof(url), "http://%s/api/v1/call-waiter/?table_id=%s",
           configData.ramis_ip, cleanMasaId);
  Serial.print(F("GET ")); Serial.println(url);
  http.begin(wc, url);
  const int code = http.GET();
  http.end();
  Serial.print(F("HTTP: ")); Serial.println(code);
  return code;
}

// Light sleep döngüsü: uyku modunda buton basışlarını işler.
// Olumlu HTTP yanıtı alınana kadar uykuya GEÇİLMEZ.
// Döngüden çıkmak için: uyku modunu kapat (5 sn basış) → loop() devam eder.
void runLightSleepCycle() {
  while (deepSleepEnabled) {
    // ── Uykuya geç ──────────────────────────────────────────────────────────
    Serial.println(F("Light sleep basliyor..."));
    Serial.flush();
    display.clearDisplay();
    display.display();
    delay(2000);
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    delay(200);
    wifi_fpm_set_sleep_type(LIGHT_SLEEP_T);
    wifi_fpm_open();
    gpio_pin_wakeup_enable(GPIO_ID_PIN(12), GPIO_PIN_INTR_LOLEVEL);
    wifi_fpm_do_sleep(0xFFFFFFF); // D6 LOW sinyali ile uyan
    delay(20);                    // Uyandıktan sonra stabilizasyon
    gpio_pin_wakeup_disable();

    // ── Uyandı: buton basılı ────────────────────────────────────────────────
    const unsigned long wakeMs = millis();

    // Buton bırakılana kadar bekle; süre ölçümü yap
    while (digitalRead(buttonPin) == LOW) {
      if (millis() - wakeMs >= SETUP_HOLD_MS) {
        enterSetupModeFromLongPress(); // never returns
      }
      delay(5);
    }

    const unsigned long pressDur = millis() - wakeMs;

    if (pressDur >= TOGGLE_SLEEP_HOLD_MS) {
      // 5–8 sn: uyku modunu kapat
      deepSleepEnabled = false;
      showOnScreen("UYKU MODU", "Devre Disi", "Uyanik kaliyor");
      delay(2000);
      break; // döngüden çık → WiFi yeniden bağlan → loop() devam eder
    }

    // ── Kısa basış: garson çağır ─────────────────────────────────────────────
    showOnScreen("RAMIS", formatMasaForDisplay().c_str(), "Garson Cagriliyor");
    WiFi.mode(WIFI_STA);

    if (!connectToWifiAtBoot()) {
      showOnScreen("HATA", "WiFi", "Baglanilamadi");
      delay(2000);
      continue; // uykuya dön, bir sonraki basışta tekrar dene
    }
    wifiBootState = WIFI_BOOT_CONNECTED;

    const int code = sendWaiterCallHttp();

    if (code >= 200 && code < 300) {
      // Olumlu yanıt → brief bilgi ekranı → uykuya dön
      showOnScreen("RAMIS", "Cagrisi Iletildi", formatMasaForDisplay().c_str());
      delay(1200);
      // Döngü başa döner → uykuya geçer
    } else {
      // Olumsuz veya bağlanamadı → uykuya GEÇMEDen döngüye devam et
      // (Kullanıcı tekrar basana kadar bekle)
      char errBuf[48];
      if (code <= 0) {
        strcpy_P(errBuf, PSTR("Sunucu yanit vermedi"));
      } else {
        snprintf(errBuf, sizeof(errBuf), "HTTP: %d", code);
      }
      showOnScreen("HATA", "Cagri iletilemedi", errBuf);
      delay(2500);
      // continue → bir sonraki wake'te tekrar dener
    }
  }

  // Uyku modu kapatıldı → WiFi yeniden bağlan ve normal çalışmaya geç
  WiFi.mode(WIFI_STA);
  if (connectToWifiAtBoot()) {
    wifiBootState = WIFI_BOOT_CONNECTED;
    showReadyScreen();
  } else {
    wifiBootState = WIFI_BOOT_FAILED;
    showOnScreen("RAMIS", "Ag Baglantisi", "Saglanamadi");
  }
}

// 8 sn basılı tutulunca EEPROM sıfırla ve kurulum moduna geç
void enterSetupModeFromLongPress() {
  clearConfig();
  showOnScreen("KURULUM", "Sifirlaniyor", "Yeniden basliyor...");
  delay(1500);
  ESP.restart();
}

// AP moduna bağlanan istemcinin IP adresini al
String getConnectedClientIP() {
  struct station_info* station = wifi_softap_get_station_info();
  String clientIp = "";

  while (station != NULL) {
    IPAddress ip(station->ip.addr);
    if (clientIp.length() > 0) {
      clientIp += ", ";
    }
    clientIp += ip.toString();
    station = STAILQ_NEXT(station, next);
  }

  wifi_softap_free_station_info();
  return clientIp;
}

// Kurulum modunda OLED üzerinde istemci bağlantısını göster
void updateSetupModeDisplay() {
  String clientIp = getConnectedClientIP();

  if (clientIp.length() > 0) {
    if (clientIp != lastDisplayedClientIp) {
      char ipBuf[48];
      snprintf(ipBuf, sizeof(ipBuf), "Istemci:%s", clientIp.c_str());
      showOnScreen("KURULUM", "Baglanti saglandi", ipBuf);
      lastDisplayedClientIp = clientIp;
    }
    return;
  }

  if (lastDisplayedClientIp.length() > 0) {
    showOnScreen("RAMIS", "Baglanti Agi Acildi", "IP: 192.168.4.1");
    lastDisplayedClientIp = "";
  }
}

// Ortak Veri İşleme Mantığı (heap allocation yok)
String extractJsonStringValue(const String& json, const char* key) {
  char pattern[64];
  snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
  int keyIdx = json.indexOf(pattern);
  if (keyIdx == -1) {
    return "";
  }
  int valueStart = keyIdx + strlen(pattern);
  int valueEnd = json.indexOf("\"", valueStart);
  if (valueEnd == -1 || valueEnd <= valueStart) {
    return "";
  }
  return json.substring(valueStart, valueEnd);
}

String readRequestBody() {
  if (server.hasArg("plain")) {
    return server.arg("plain");
  }

  if (!server.hasHeader("Content-Length")) {
    return "";
  }

  const size_t len = (size_t)server.header("Content-Length").toInt();
  if (len == 0 || len > 1024) {
    return "";
  }

  // Tek seferde oku — karakter karakter String büyütme yok
  WiFiClient& client = server.client();
  char buf[1024];
  size_t pos = 0;
  unsigned long start = millis();
  while (pos < len && millis() - start < 3000) {
    const size_t avail = client.available();
    if (avail > 0) {
      const size_t toRead = (avail < (len - pos)) ? avail : (len - pos);
      const size_t n = client.readBytes(buf + pos, toRead);
      pos += n;
    }
    delay(1);
  }
  buf[pos] = '\0';
  return String(buf);
}

String readHttpBody(HTTPClient& http) {
  return http.getString();
}

bool syncTableNameFromServer() {
  // Önce EEPROM'da masa adı var mı kontrol et
  if (strnlen(configData.masa_name, sizeof(configData.masa_name)) > 0) {
    Serial.print(F("Masa adi (EEPROM): "));
    Serial.println(configData.masa_name);
    return true;
  }

  if (strnlen(configData.masa_id, sizeof(configData.masa_id)) == 0) {
    Serial.println(F("Masa adi senkron atlandi: masa_id bos"));
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  char url[256];
  const char* cleanMasaId = trimStringStart(configData.masa_id);
  snprintf(url, sizeof(url), "http://%s/api/v1/smart-button/table/?table_id=%s",
           configData.ramis_ip, cleanMasaId);

  Serial.print(F("Masa adi sunucudan aliniyor: "));
  Serial.println(url);

  http.begin(client, url);
  const int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    Serial.print(F("Masa adi HTTP hatasi: "));
    Serial.println(httpCode);
    http.end();
    return false;
  }

  const String body = readHttpBody(http);
  http.end();

  const String tableName = extractJsonStringValue(body, "table_name");
  if (tableName.length() == 0) {
    Serial.println(F("Masa adi yanitinda table_name yok"));
    return false;
  }

  memset(configData.masa_name, 0, sizeof(configData.masa_name));
  strncpy(configData.masa_name, tableName.c_str(), sizeof(configData.masa_name) - 1);
  configData.masa_name[sizeof(configData.masa_name) - 1] = '\0';
  saveConfig();

  Serial.print(F("Masa adi kaydedildi: "));
  Serial.println(configData.masa_name);
  return true;
}

void processAndSaveData(String ssid, String pass, String ip, String masa, String masaName) {
  // Baştaki/sondaki boşlukları temizle — yoksa URL'lerde ve API çağrılarında hata oluşur!
  ssid.trim();
  pass.trim();
  ip.trim();
  masa.trim();
  masaName.trim();

  memset(&configData, 0, sizeof(configData));
  strcpy(configData.flag, "RAMIS");
  configData.schema_version = CONFIG_SCHEMA_VERSION;
  strncpy(configData.wifi_ssid, ssid.c_str(), sizeof(configData.wifi_ssid) - 1);
  configData.wifi_ssid[sizeof(configData.wifi_ssid) - 1] = '\0';
  strncpy(configData.wifi_pass, pass.c_str(), sizeof(configData.wifi_pass) - 1);
  configData.wifi_pass[sizeof(configData.wifi_pass) - 1] = '\0';
  strncpy(configData.ramis_ip, ip.c_str(), sizeof(configData.ramis_ip) - 1);
  configData.ramis_ip[sizeof(configData.ramis_ip) - 1] = '\0';
  strncpy(configData.masa_id, masa.c_str(), sizeof(configData.masa_id) - 1);
  configData.masa_id[sizeof(configData.masa_id) - 1] = '\0';
  strncpy(configData.masa_name, masaName.c_str(), sizeof(configData.masa_name) - 1);
  configData.masa_name[sizeof(configData.masa_name) - 1] = '\0';

  Serial.println(F("--- Kurulum kaydediliyor ---"));
  Serial.print(F("masa_id: '"));
  Serial.print(configData.masa_id);
  Serial.println(F("'"));
  Serial.print(F("masa_name: '"));
  Serial.print(configData.masa_name);
  Serial.println(F("'"));

  saveConfig();
}

// Web Tarayıcı Form POST İşleyicisi
void handleBrowserSave() {
  processAndSaveData(
    server.arg("ssid"),
    server.arg("password"),
    server.arg("ramis_ip"),
    server.arg("masa"),
    server.arg("masa_name")
  );

  String successPage = "<html><head><meta charset='UTF-8'></head>"
                       "<body style='text-align:center;font-family:sans-serif;padding-top:50px;color:#2f3640;'> "
                       "<h2>RAMIS Çağrı Düğmesi Kurulumu Başarıyla Alındı!</h2>"
                       "<p>Cihaz kaydedildi. Kurulum modundan çıkılıyor...</p>"
                       "</body></html>";
                       
  server.send(200, "text/html", successPage);
  showOnScreen("RAMIS", "Ayarlar Alindi", "Yeniden Basliyor...");
  delay(2000);
  ESP.restart();
}

// Mobil Uygulama API POST İşleyicisi (JSON Stringi)
void handleMobileApiSave() {
  const String jsonString = readRequestBody();

  Serial.println(F("--- Mobil kurulum JSON ---"));
  Serial.println(jsonString);

  const String parsed_ssid = extractJsonStringValue(jsonString, "ssid");
  const String parsed_pass = extractJsonStringValue(jsonString, "password");
  const String parsed_ip = extractJsonStringValue(jsonString, "ramis_ip");
  const String parsed_masa = extractJsonStringValue(jsonString, "masa");
  const String parsed_masaName = extractJsonStringValue(jsonString, "masa_name");

  if (parsed_ssid.length() == 0 || parsed_pass.length() == 0 ||
      parsed_ip.length() == 0 || parsed_masa.length() == 0) {
    server.send(
      400,
      "application/json",
      "{\"status\":\"error\", \"message\":\"Gecersiz veya eksik JSON formati.\"}"
    );
    return;
  }

  processAndSaveData(parsed_ssid, parsed_pass, parsed_ip, parsed_masa, parsed_masaName);

  server.send(
    200,
    "application/json",
    "{\"status\":\"success\", \"message\":\"JSON verisi alindi. Cihaz baslatiliyor.\"}"
  );

  showOnScreen("RAMIS", "Kurulum", "Yeniden Basliyor...");
  delay(2000);
  ESP.restart();
}

// Tarayıcı GET İstek Karşılayıcı
void handleRoot() {
  server.send(200, "text/html", CONFIG_PAGE);
}

// Uyanık moddaki kısa basış: garson çağrısı.
// Yalnızca deepSleepEnabled=false durumunda loop()'tan çağrılır.
// deepSleepEnabled=true ise runLightSleepCycle() bu işi üstlenir.
void executeWaiterCall() {
  showOnScreen("RAMIS", formatMasaForDisplay().c_str(), "Garson Cagriliyor");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("Wi-Fi baglantisi yok, garson cagrisi iptal"));
    showOnScreen("HATA", "WiFi", "Baglantisi Yok");
    delay(WAITER_MSG_MS);
    showReadyScreen();
    return;
  }

  const int httpCode = sendWaiterCallHttp();

  if (httpCode >= 200 && httpCode < 300) {
    showOnScreen("RAMIS", "Cagrisi Iletildi", formatMasaForDisplay().c_str());
    delay(WAITER_MSG_MS);
    // Uyku modu açıksa light sleep döngüsüne gir
    if (deepSleepEnabled) {
      runLightSleepCycle();
      return;
    }
  } else {
    char errBuf[48];
    if (httpCode <= 0) {
      strcpy_P(errBuf, PSTR("Sunucu yanit vermedi"));
    } else {
      snprintf(errBuf, sizeof(errBuf), "HTTP: %d", httpCode);
    }
    showOnScreen("HATA", "Cagri iletilemedi", errBuf);
    delay(WAITER_MSG_MS);
  }

  showReadyScreen();
}

// processButtonNonBlocking() her loop'ta çağrılır; bu fonksiyon sonucunu yorumlar.
void handleConfiguredButton(ButtonEvent evt) {
  if (!isWifiBootReady()) {
    return;
  }
  switch (evt) {
    case BTN_EVT_SHORT:
      executeWaiterCall();
      break;
    case BTN_EVT_MEDIUM:
      toggleDeepSleepMode();
      break;
    default:
      break;
  }
}

// Yapılandırma Modu (Yayıncı ve Dinleyici)
void runServerMode() {
  WiFi.mode(WIFI_AP);
  WiFi.softAP("RAMIS_BTN_" + uniqueId);
  
  showOnScreen("KURULUM", "Baglanti Acildi", "IP: 192.168.4.1");

  server.on("/", HTTP_GET, handleRoot);                     // Tarayıcı arayüzü
  server.on("/save", HTTP_POST, handleBrowserSave);         // Tarayıcı form postu
  server.on("/api/setup", HTTP_POST, handleMobileApiSave);   // Mobil uygulama API postu
  
  server.begin();
}

void setup() {
  Serial.begin(115200);
  randomSeed(ESP.getChipId() ^ micros());
  pinMode(buttonPin, INPUT_PULLUP);

  /* I2C pin tanımlamaları (D2 = SDA, D1 = SCL) */
  Wire.begin(4, 5);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("OLED baslatma hatasi."));
    for (;;);
  }

  // ── Normal açılış ──────────────────────────────────────────────────────────
  // Light sleep RAM'i korur → güç kesintisinde deepSleepEnabled varsayılana döner (true).
  readConfig();

  // Açılışta 8 sn basılı tutulursa kurulum moduna zorla
  if (isButtonHeld(SETUP_HOLD_MS)) {
    enterSetupModeFromLongPress();
  }

  isConfigured = (strcmp(configData.flag, "RAMIS") == 0) &&
                 (configData.schema_version == CONFIG_SCHEMA_VERSION);

  if (isConfigured) {
    runConfiguredBootSequence();
    return;
  }

  runServerMode();
}

void loop() {
  // Buton FSM her loop iterasyonunda çağrılır — bloklama yok
  const ButtonEvent evt = processButtonNonBlocking();

  if (isConfigured) {
    checkWifiConnectionAndRestart();
    handleConfiguredButton(evt);
    return;
  }

  // Kurulum modu
  server.handleClient();
  updateSetupModeDisplay();
}