import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  BleTransport,
  createChannel,
  DEVICE_COMMANDS,
  isValidDeviceKey,
  scanForDevice,
  WifiTransport,
  type CommandChannel,
  type TransportKind,
} from "./src/transport";
import { forgetDeviceKey, loadDeviceKey, saveDeviceKey } from "./src/key-store";

// ESP32 Companion — one app, two transports, one security model.
//
// Everything below the "channel" line is transport-agnostic: the command
// buttons don't know or care whether bytes leave over WiFi or Bluetooth,
// because authentication happens above the transport.

const DEVICE_ID = "cam-01";

export default function App() {
  const [deviceKey, setDeviceKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [transport, setTransport] = useState<TransportKind>("wifi");
  const [ip, setIp] = useState("192.168.4.1");
  const [channel, setChannel] = useState<CommandChannel | null>(null);
  const [echoText, setEchoText] = useState("hello from my phone");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const keyOk = isValidDeviceKey(deviceKey);
  const append = (line: string) => setLog((prev) => [line, ...prev].slice(0, 40));

  // Recover the paired key from the Keychain/Keystore on launch.
  useEffect(() => {
    loadDeviceKey(DEVICE_ID).then((stored) => {
      if (stored) {
        setDeviceKey(stored);
        setKeySaved(true);
      }
    });
  }, []);

  const pair = async () => {
    if (!keyOk) return;
    await saveDeviceKey(DEVICE_ID, deviceKey.trim());
    setKeySaved(true);
    append(`✓ paired: key for ${DEVICE_ID} stored in secure storage`);
  };

  const unpair = async () => {
    await forgetDeviceKey(DEVICE_ID);
    setDeviceKey("");
    setKeySaved(false);
    setChannel(null);
    append("key forgotten");
  };

  // Connect builds a transport, then wraps it in a signing channel. This is
  // the ONLY place the two transports differ.
  const connect = async () => {
    setBusy(true);
    try {
      const t =
        transport === "wifi" ? new WifiTransport(ip.trim()) : new BleTransport(await scanForDevice());
      await t.connect();
      setChannel(createChannel(t, keyOk ? deviceKey.trim() : null));
      append(`✓ connected: ${t.label}${keyOk ? " (secured)" : " (LEARNING MODE — unsigned)"}`);
    } catch (err) {
      Alert.alert("Connect", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const run = async (command: string) => {
    if (!channel) return;
    setBusy(true);
    try {
      const r = await channel.execute(command);
      append(
        `${r.ok ? "✓" : "✗"} [${r.transport}] ${command} — ${r.roundTripMs} ms\n  ${JSON.stringify(r.response)}`
      );
    } catch (err) {
      append(`✗ [${transport}] ${command} — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.title}>ESP32 Companion</Text>

        {/* 1. Pairing */}
        <Text style={s.section}>1 · Pair</Text>
        <TextInput
          style={[s.input, deviceKey.length > 0 && !keyOk && s.inputBad]}
          value={deviceKey}
          onChangeText={setDeviceKey}
          placeholder="64-hex device key (empty = learning mode)"
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!keySaved}
        />
        <View style={s.row}>
          <Pressable onPress={pair} disabled={!keyOk || keySaved} style={[s.button, s.flex1]}>
            <Text style={s.buttonText}>{keySaved ? "Paired ✓" : "Save to secure storage"}</Text>
          </Pressable>
          {keySaved && (
            <Pressable onPress={unpair} style={s.button}>
              <Text style={s.buttonText}>Forget</Text>
            </Pressable>
          )}
        </View>
        <Text style={s.hint}>
          {keyOk
            ? "Secured: every command carries a fresh nonce + HMAC signature."
            : "Learning mode: commands are unsigned — only unkeyed firmware accepts them."}
        </Text>

        {/* 2. Transport */}
        <Text style={s.section}>2 · Connect</Text>
        <View style={s.row}>
          {(["wifi", "ble"] as TransportKind[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => {
                setTransport(t);
                setChannel(null);
              }}
              style={[s.tab, transport === t && s.tabActive]}
            >
              <Text style={s.buttonText}>{t === "wifi" ? "WiFi" : "Bluetooth"}</Text>
            </Pressable>
          ))}
        </View>
        {transport === "wifi" && (
          <TextInput style={s.input} value={ip} onChangeText={setIp} autoCapitalize="none" />
        )}
        <Pressable onPress={connect} disabled={busy} style={s.button}>
          <Text style={s.buttonText}>{channel ? `Connected — ${channel.label}` : "Connect"}</Text>
        </Pressable>

        {/* 3. Commands — identical code for both transports */}
        <Text style={s.section}>3 · Command</Text>
        <View style={s.row}>
          {[DEVICE_COMMANDS.ledOn, DEVICE_COMMANDS.ledOff, DEVICE_COMMANDS.ledBlink].map((cmd) => (
            <Pressable
              key={cmd}
              onPress={() => run(cmd)}
              disabled={busy || !channel}
              style={[s.button, s.flex1]}
            >
              <Text style={s.buttonText}>{cmd.split(":")[1].toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.row}>
          <TextInput style={[s.input, s.flex1]} value={echoText} onChangeText={setEchoText} />
          <Pressable
            onPress={() => run(DEVICE_COMMANDS.echo(echoText))}
            disabled={busy || !channel}
            style={s.button}
          >
            <Text style={s.buttonText}>Echo</Text>
          </Pressable>
        </View>
        <View style={s.row}>
          {[DEVICE_COMMANDS.info, DEVICE_COMMANDS.selfTest].map((cmd) => (
            <Pressable
              key={cmd}
              onPress={() => run(cmd)}
              disabled={busy || !channel}
              style={[s.button, s.flex1]}
            >
              <Text style={s.buttonText}>{cmd}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.section}>Log</Text>
        {log.map((line, i) => (
          <Text key={i} style={s.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#09090b" },
  body: { padding: 16, gap: 8 },
  title: { color: "#fafafa", fontSize: 22, fontWeight: "800" },
  section: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 18,
    textTransform: "uppercase",
  },
  hint: { color: "#71717a", fontSize: 11 },
  input: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 8,
    color: "#e4e4e7",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  inputBad: { borderColor: "#b45050" },
  row: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  flex1: { flex: 1 },
  tab: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: "#18181b", alignItems: "center" },
  tabActive: { backgroundColor: "#2c3644", borderColor: "#8A9BAD", borderWidth: 1 },
  button: {
    backgroundColor: "#1f2937",
    borderColor: "#374151",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonText: { color: "#e4e4e7", fontSize: 13, fontWeight: "600" },
  logLine: {
    color: "#9ca3af",
    fontFamily: "Courier",
    fontSize: 11,
    borderBottomColor: "#18181b",
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
});
