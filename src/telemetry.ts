export interface AccAxes {
  x: number
  y: number
  z: number
}

export interface TelemetryPayload {
  t_ms?: number
  bmx_ok?: boolean
  dist_valid?: boolean
  dist_cm?: number
  trash_full?: boolean
  trash_fill_pct?: number
  led1_on?: boolean
  led2_on?: boolean
  led_manual?: boolean
  pump_on?: boolean
  acc_mg?: AccAxes
  acc_m_s2?: AccAxes
  tilt_deg?: { roll?: number; pitch?: number }
}

export function parseTelemetry(raw: string): TelemetryPayload | null {
  try {
    const o = JSON.parse(raw) as unknown
    if (o && typeof o === 'object') return o as TelemetryPayload
  } catch {
    /* ignore */
  }
  return null
}

/** Old / failed ESP snapshot still stored on the broker (acc 0, no valid dist). */
export function isStaleBrokerSnapshot(t: TelemetryPayload): boolean {
  const a = t.acc_mg
  const accZero = !a || (a.x === 0 && a.y === 0 && a.z === 0)
  const distBad = t.dist_valid === false || (t.dist_cm ?? -1) < 0
  return accZero && distBad && t.bmx_ok === false
}
