/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MQTT_WS_URL: string
  readonly VITE_MQTT_USER: string
  readonly VITE_MQTT_PASS: string
  readonly VITE_TOPIC_TELEMETRY: string
  readonly VITE_TOPIC_COMMAND: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
