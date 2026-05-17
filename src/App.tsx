import { type FormEvent, useEffect, useState } from 'react'
import './App.css'
import { isStaleBrokerSnapshot } from './telemetry'
import { defaultTelemetryTopic, useMqttDashboard } from './useMqttDashboard'

function fmt1(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  return n.toFixed(1)
}

function fmtDist(n: number | undefined, valid?: boolean): string {
  if (valid === false || n === undefined || !Number.isFinite(n) || n < 0) return '—'
  return n.toFixed(1)
}

function AxisIcon({ axis }: { axis: 'x' | 'y' | 'z' }) {
  const hx = axis === 'x' ? '#00e8ff' : 'rgba(232,244,255,0.35)'
  const hy = axis === 'y' ? '#00e8ff' : 'rgba(232,244,255,0.35)'
  const hz = axis === 'z' ? '#00e8ff' : 'rgba(232,244,255,0.35)'
  return (
    <svg className="axis-icon" width="44" height="44" viewBox="0 0 44 44" aria-hidden={true}>
      <path d="M8 36 L36 10" stroke="rgba(232,244,255,0.25)" strokeWidth="1.2" />
      <path d="M8 36 L32 36" stroke={hx} strokeWidth="2" />
      <path d="M8 36 L8 12" stroke={hy} strokeWidth="2" />
      <path d="M8 36 L28 20" stroke={hz} strokeWidth="2" />
      <text x="34" y="38" fill={hx} fontSize="9" fontWeight="700">
        X
      </text>
      <text x="4" y="14" fill={hy} fontSize="9" fontWeight="700">
        Y
      </text>
      <text x="26" y="18" fill={hz} fontSize="9" fontWeight="700">
        Z
      </text>
    </svg>
  )
}

function LedBulb({ on, green }: { on: boolean; green: boolean }) {
  const fill = on ? (green ? '#00e8ff' : '#ff4d6d') : 'rgba(232,244,255,0.2)'
  const glowId = green ? 'glow-g' : 'glow-r'
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden={true}>
      <defs>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation={on ? 2.2 : 0} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        filter={on ? 'url(#' + glowId + ')' : undefined}
        d="M20 6c-5 0-9 4-9 9 0 4 2.5 7.5 6 8.5V28h6v-4.5c3.5-1 6-4.5 6-8.5 0-5-4-9-9-9z"
        fill={fill}
        stroke="rgba(232,244,255,0.35)"
        strokeWidth="1"
      />
      <path d="M14 30h12v2H14z" fill={fill} opacity={on ? 0.9 : 0.35} />
    </svg>
  )
}

function PumpIcon({ on }: { on: boolean }) {
  const c = on ? '#00e8ff' : 'rgba(232,244,255,0.25)'
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden={true}>
      <rect x="8" y="14" width="18" height="16" rx="3" fill="none" stroke={c} strokeWidth="2" />
      <path d="M26 22h10l4 4v-8l-4 4z" fill={c} opacity={on ? 0.95 : 0.4} />
      <circle cx="17" cy="22" r="4" fill="none" stroke={c} strokeWidth="1.5" />
    </svg>
  )
}

function TrashGraphic({ fillPct }: { fillPct: number }) {
  const h = Math.min(100, Math.max(0, fillPct))
  return (
    <svg className="trash-icon-wrap" width="52" height="56" viewBox="0 0 52 56" aria-hidden={true}>
      <path
        d="M10 20h32v28a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V20z"
        fill="rgba(0,0,0,0.25)"
        stroke="rgba(0,232,255,0.45)"
        strokeWidth="1.5"
      />
      <clipPath id="trash-clip">
        <path d="M12 22h28v24a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V22z" />
      </clipPath>
      <g clipPath="url(#trash-clip)">
        <rect
          x="12"
          y={22 + (24 * (100 - h)) / 100}
          width="28"
          height={24}
          fill={h > 85 ? 'rgba(255,77,109,0.55)' : 'rgba(0,232,255,0.25)'}
        />
      </g>
      <path d="M16 20V14h20v6" fill="none" stroke="rgba(0,232,255,0.5)" strokeWidth="1.5" />
    </svg>
  )
}

function AlertBucket() {
  return (
    <svg className="alert-icon" width="40" height="40" viewBox="0 0 40 40" aria-hidden={true}>
      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,77,109,0.85)" strokeWidth="2" />
      <path d="M20 11v10" stroke="#ff4d6d" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20" cy="26" r="1.6" fill="#ff4d6d" />
    </svg>
  )
}

export default function App() {
  const {
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
  } = useMqttDashboard()

  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const acc = telemetry?.acc_mg
  const trashFull = telemetry?.trash_full ?? false
  const fillPct = telemetry?.trash_fill_pct ?? 0
  const led1 = controls.led1_on
  const led2 = controls.led2_on
  const ledManual = controls.led_manual
  const pumpOn = controls.pump_on
  const canControl = conn === 'connected'
  const telemetryAgeSec =
    telemetryAt != null ? Math.floor((clock.getTime() - telemetryAt) / 1000) : null
  const telemetryLive = telemetryAgeSec != null && telemetryAgeSec < 3
  const distValid = telemetry?.dist_valid !== false && (telemetry?.dist_cm ?? -1) >= 0
  const brokerStale = telemetry != null && isStaleBrokerSnapshot(telemetry)

  const timeStr = clock.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const statusLabel =
    conn === 'connected' ? 'ACTIVE' : conn === 'connecting' ? 'CONNECTING' : 'OFFLINE'

  function onMqttSubmit(e: FormEvent) {
    e.preventDefault()
    connect()
  }

  return (
    <div className="app">
      <div className="shell">
        <header className="header">
          <h1 className="title">SEASLUG control dashboard</h1>
          <div className="status-bar">
            SYSTEM STATUS:{' '}
            <strong className={conn === 'connected' ? '' : 'offline'}>{statusLabel}</strong>
            {' | '}
            {timeStr}
          </div>
          {conn === 'connected' && !telemetry ? (
            <p className="mqtt-err" style={{ margin: '0.5rem 0 0', maxWidth: '52rem' }}>
              Broker connected — waiting for ESP on <code>{defaultTelemetryTopic()}</code>. Upload
              and run <code>robotic_dashboard_mqtt.ino</code> (Wi‑Fi + mqttgo.io:1883).
            </p>
          ) : null}
          {conn === 'connected' && telemetry && !telemetryLive ? (
            <p className="mqtt-err" style={{ margin: '0.5rem 0 0', maxWidth: '52rem' }}>
              Telemetry stale ({telemetryAgeSec}s old). ESP may be offline — check Serial Monitor.
            </p>
          ) : null}
          {conn === 'connected' && brokerStale ? (
            <p className="mqtt-err" style={{ margin: '0.5rem 0 0', maxWidth: '52rem' }}>
              Broker sent an old empty snapshot (acc 0, dist invalid). Re-upload ESP firmware, reset
              the board, and wait for Serial lines with real acc(mg) — dashboard should update within
              1s. ESP t_ms={espTms ?? '—'}.
            </p>
          ) : null}
        </header>

        <div className="grid-main">
          <div>
            <p className="section-label">Object position (accel axes)</p>
            {telemetry?.bmx_ok === false ? (
              <p className="toggle-state" style={{ marginBottom: '0.5rem' }}>
                IMU not detected on ESP (BMX160 / I2C wiring).
              </p>
            ) : null}
            <div className="axis-stack">
              <div className="panel axis-card">
                <div>
                  <span className="axis-value">{fmt1(acc?.x)}</span>
                  <span className="axis-unit">mg</span>
                </div>
                <AxisIcon axis="x" />
              </div>
              <div className="panel axis-card">
                <div>
                  <span className="axis-value">{fmt1(acc?.y)}</span>
                  <span className="axis-unit">mg</span>
                </div>
                <AxisIcon axis="y" />
              </div>
              <div className="panel axis-card">
                <div>
                  <span className="axis-value">{fmt1(acc?.z)}</span>
                  <span className="axis-unit">mg</span>
                </div>
                <AxisIcon axis="z" />
              </div>
            </div>

            <p className="section-label" style={{ marginTop: '1.1rem' }}>
              Trash bin status
            </p>
            <div className="panel trash-panel">
              <TrashGraphic fillPct={fillPct} />
              <div className="trash-status">
                <div className={`trash-word ${trashFull ? 'full' : ''}`}>
                  {trashFull ? 'FULL' : 'OK'}
                </div>
                <div className="trash-capacity">
                  CAPACITY: {fmt1(fillPct)}% · {fmtDist(telemetry?.dist_cm, distValid)} cm
                </div>
                {telemetry ? (
                  <div className="trash-capacity" style={{ marginTop: '0.35rem' }}>
                    MQTT: dist {fmtDist(telemetry.dist_cm, distValid)} cm · ESP t_ms{' '}
                    {espTms ?? '—'}
                    {brokerStale ? ' (stale)' : telemetryLive ? ' (live)' : ''}
                  </div>
                ) : null}
              </div>
              {trashFull ? <AlertBucket /> : <div style={{ width: 40 }} />}
            </div>
          </div>

          <div className="controls">
            <p className="section-label">Device controls</p>
            {telemetry ? (
              <p className="toggle-state" style={{ marginBottom: '0.6rem' }}>
                LEDs:{' '}
                <span>{ledManual ? 'manual (dashboard)' : 'auto (trash sensor)'}</span>
                {ledManual ? (
                  <>
                    {' · '}
                    <button type="button" className="secondary" disabled={!canControl} onClick={setLedAuto}>
                      Return to auto
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}

            <div className="panel control-row">
              <div className="control-head">
                <span className="control-label">LED 1 control </span>
                <button
                  type="button"
                  className={`toggle ${led1 ? 'on' : ''}`}
                  disabled={!canControl}
                  aria-pressed={led1}
                  onClick={() => setLed1(!led1)}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
              <div className="toggle-state">
                State: <span>{led1 ? 'ON' : 'OFF'}</span>
              </div>
              <div className={`control-icon ${led1 ? '' : 'dim'}`}>
                <LedBulb on={led1} green />
              </div>
            </div>

            <div className="panel control-row">
              <div className="control-head">
                <span className="control-label">LED 2 control </span>
                <button
                  type="button"
                  className={`toggle ${led2 ? 'on' : ''}`}
                  disabled={!canControl}
                  aria-pressed={led2}
                  onClick={() => setLed2(!led2)}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
              <div className="toggle-state">
                State: <span>{led2 ? 'ON' : 'OFF'}</span> 
              </div>
              <div className={`control-icon ${led2 ? '' : 'dim'}`}>
                <LedBulb on={led2} green={false} />
              </div>
            </div>

            <div className="panel control-row">
              <div className="control-head">
                <span className="control-label">Pump control</span>
                <button
                  type="button"
                  className={`toggle ${pumpOn ? 'on' : ''}`}
                  disabled={!canControl}
                  aria-pressed={pumpOn}
                  onClick={() => setPump(!pumpOn)}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
              <div className="toggle-state">
                State: <span>{pumpOn ? 'ON' : 'OFF'}</span> 
              </div>
              <div className={`control-icon ${pumpOn ? '' : 'dim'}`}>
                <PumpIcon on={pumpOn} />
              </div>
            </div>
          </div>
        </div>

        <div className="panel mqtt-bar">
          <div>
            Browser MQTT 
          </div>
          <form onSubmit={onMqttSubmit}>
            <input
              type="url"
              placeholder="wss://mqttgo.io:8084/mqtt"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              autoComplete="off"
            />
            <input
              type="text"
              placeholder="MQTT user (optional)"
              value={mqttUser}
              onChange={(e) => setMqttUser(e.target.value)}
              autoComplete="username"
            />
            <input
              type="password"
              placeholder="MQTT password (optional)"
              value={mqttPass}
              onChange={(e) => setMqttPass(e.target.value)}
              autoComplete="current-password"
            />
            <button type="submit">Connect</button>
            <button type="button" className="secondary" onClick={() => disconnect()}>
              Disconnect
            </button>
          </form>
          {lastError ? <div className="mqtt-err">{lastError}</div> : null}
        </div>
      </div>
    </div>
  )
}
