import { useCallback, useEffect, useRef, useState } from 'react'
import mqtt, { type MqttClient } from 'mqtt'
import { type TelemetryPayload, isStaleBrokerSnapshot, parseTelemetry } from './telemetry'

export type ConnState = 'idle' | 'connecting' | 'connected' | 'error'

type ControlOverrides = {
  led1_on?: boolean
  led2_on?: boolean
  pump_on?: boolean
  led_manual?: boolean
}

const LS_WS = 'robotic-dash-mqtt-ws'
const LS_USER = 'robotic-dash-mqtt-user'
const LS_PASS = 'robotic-dash-mqtt-pass'

function envOr(key: keyof ImportMetaEnv, fallback: string): string {
  const v = import.meta.env[key]
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

export function defaultTelemetryTopic() {
  return envOr('VITE_TOPIC_TELEMETRY', 'robotic/dashboard/telemetry')
}

export function defaultCommandTopic() {
  return envOr('VITE_TOPIC_COMMAND', 'robotic/dashboard/command')
}

/** mqttgo.io port 8084 is WSS-only; plain WS uses port 8000. */
function normalizeBrokerWsUrl(raw: string): { url: string; corrected: boolean } {
  const trimmed = raw.trim()
  if (!/^wss?:\/\//i.test(trimmed)) {
    return { url: trimmed, corrected: false }
  }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'ws:' && parsed.port === '8084') {
      parsed.protocol = 'wss:'
      return { url: parsed.toString(), corrected: true }
    }
  } catch {
    /* keep original; mqtt.connect will fail with a clear error */
  }
  return { url: trimmed, corrected: false }
}

export function useMqttDashboard() {
  const [conn, setConn] = useState<ConnState>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null)
  const [telemetryAt, setTelemetryAt] = useState<number | null>(null)
  const [espTms, setEspTms] = useState<number | null>(null)
  const [controlOverrides, setControlOverrides] = useState<ControlOverrides>({})
  const [wsUrl, setWsUrl] = useState(() => {
    const fromEnv = import.meta.env.VITE_MQTT_WS_URL
    let initial =
      typeof fromEnv === 'string' && fromEnv.length > 0
        ? fromEnv
        : (() => {
            try {
              return localStorage.getItem(LS_WS) ?? ''
            } catch {
              return ''
            }
          })()
    return normalizeBrokerWsUrl(initial).url
  })
  const [mqttUser, setMqttUser] = useState(() => {
    const fromEnv = import.meta.env.VITE_MQTT_USER
    if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
    try {
      return localStorage.getItem(LS_USER) ?? ''
    } catch {
      return ''
    }
  })
  const [mqttPass, setMqttPass] = useState(() => {
    const fromEnv = import.meta.env.VITE_MQTT_PASS
    if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv
    try {
      return localStorage.getItem(LS_PASS) ?? ''
    } catch {
      return ''
    }
  })

  const clientRef = useRef<MqttClient | null>(null)

  const disconnect = useCallback(() => {
    const c = clientRef.current
    clientRef.current = null
    if (c) {
      try {
        c.removeAllListeners()
        c.end(true)
      } catch {
        /* ignore */
      }
    }
    setConn('idle')
    setControlOverrides({})
    setTelemetryAt(null)
    setEspTms(null)
  }, [])

  const mergeControls = useCallback(
    (t: TelemetryPayload | null, overrides: ControlOverrides) => ({
      led1_on: overrides.led1_on ?? t?.led1_on ?? false,
      led2_on: overrides.led2_on ?? t?.led2_on ?? false,
      pump_on: overrides.pump_on ?? t?.pump_on ?? false,
      led_manual: overrides.led_manual ?? t?.led_manual ?? false,
    }),
    [],
  )

  const applyTelemetry = useCallback((parsed: TelemetryPayload) => {
    setTelemetry(parsed)
    setTelemetryAt(Date.now())
    if (typeof parsed.t_ms === 'number') setEspTms(parsed.t_ms)
    setControlOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const next: ControlOverrides = { ...prev }
      if (prev.led1_on !== undefined && parsed.led1_on === prev.led1_on) delete next.led1_on
      if (prev.led2_on !== undefined && parsed.led2_on === prev.led2_on) delete next.led2_on
      if (prev.pump_on !== undefined && parsed.pump_on === prev.pump_on) delete next.pump_on
      if (prev.led_manual !== undefined && parsed.led_manual === prev.led_manual) {
        delete next.led_manual
      }
      return next
    })
  }, [])

  const connect = useCallback(
    (overrideUrl?: string) => {
      const raw = (overrideUrl ?? wsUrl).trim()
      if (!raw) {
        setLastError('WebSocket URL is required (ws:// or wss://).')
        setConn('error')
        return
      }
      if (!/^wss?:\/\//i.test(raw)) {
        setLastError('Use ws:// or wss:// in the browser — not mqtt:// or port 1883.')
        setConn('error')
        return
      }

      const { url, corrected } = normalizeBrokerWsUrl(raw)
      if (corrected) setWsUrl(url)

      disconnect()
      setLastError(
        corrected
          ? 'Port 8084 requires wss:// — URL was updated. Connecting…'
          : null,
      )
      setConn('connecting')

      try {
        localStorage.setItem(LS_WS, url)
        localStorage.setItem(LS_USER, mqttUser)
        localStorage.setItem(LS_PASS, mqttPass)
      } catch {
        /* ignore */
      }

      const telemetryTopic = defaultTelemetryTopic()

      const opts: mqtt.IClientOptions = {
        clientId: `web-dash-${Math.random().toString(16).slice(2, 10)}`,
        reconnectPeriod: 4000,
        connectTimeout: 15_000,
      }
      if (mqttUser) opts.username = mqttUser
      if (mqttPass) opts.password = mqttPass

      const client = mqtt.connect(url, opts)
      clientRef.current = client

      client.on('connect', () => {
        setConn('connected')
        client.subscribe(telemetryTopic, (err) => {
          if (err) setLastError(err.message)
        })
      })

      client.on('message', (_topic, payload) => {
        const parsed = parseTelemetry(payload.toString())
        if (parsed) applyTelemetry(parsed)
      })

      client.on('error', (e) => {
        setLastError(e?.message ?? 'MQTT error')
        setConn('error')
      })
    },
    [disconnect, wsUrl, mqttUser, mqttPass, applyTelemetry],
  )

  useEffect(() => {
    const u = (import.meta.env.VITE_MQTT_WS_URL as string | undefined)?.trim()
    if (u) connect(u)
    return () => disconnect()
    // Intentionally once on mount: env-based broker URL is build-time constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const publishCommand = useCallback((payload: Record<string, boolean>) => {
    const c = clientRef.current
    if (!c?.connected) {
      setLastError('Not connected to broker — click Connect first.')
      return
    }
    const topic = defaultCommandTopic()
    c.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
      if (err) setLastError(`Command failed: ${err.message}`)
    })
  }, [])

  const setPump = useCallback(
    (on: boolean) => {
      setControlOverrides((o) => ({ ...o, pump_on: on }))
      publishCommand({ pump: on })
    },
    [publishCommand],
  )
  const setLed1 = useCallback(
    (on: boolean) => {
      setControlOverrides((o) => ({ ...o, led1_on: on, led_manual: true }))
      publishCommand({ led1: on })
    },
    [publishCommand],
  )
  const setLed2 = useCallback(
    (on: boolean) => {
      setControlOverrides((o) => ({ ...o, led2_on: on, led_manual: true }))
      publishCommand({ led2: on })
    },
    [publishCommand],
  )
  const setLedAuto = useCallback(() => {
    setControlOverrides((o) => ({ ...o, led_manual: false }))
    publishCommand({ led_auto: true })
  }, [publishCommand])

  const controls = mergeControls(telemetry, controlOverrides)

  return {
    conn,
    lastError,
    telemetry,
    telemetryAt,
    espTms,
    controls,
    wsUrl,
    setWsUrl,
    mqttUser,
    setMqttUser,
    mqttPass,
    setMqttPass,
    connect,
    disconnect,
    setPump,
    setLed1,
    setLed2,
    setLedAuto,
  }
}
