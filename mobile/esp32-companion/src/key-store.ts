import * as SecureStore from "expo-secure-store";

// Device keys are stored in the platform's hardware-backed secret store —
// iOS Keychain, Android Keystore — NOT in AsyncStorage, Redux, or a .env
// file bundled with the app. A key in the JS bundle is a key in every
// copy of the app on every phone; extracting it is a five-minute job.

const KEY_PREFIX = "esp32_device_key_";

export async function saveDeviceKey(deviceId: string, keyHex: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_PREFIX + deviceId, keyHex, {
    // Only readable while the phone is unlocked, and never migrated to a
    // new device via backup — a stolen backup must not carry device control.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadDeviceKey(deviceId: string): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_PREFIX + deviceId);
}

export async function forgetDeviceKey(deviceId: string): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PREFIX + deviceId);
}
