import { describe, expect, it } from 'vitest'
import { createApp } from './index'
import type { WindObservation } from './domain/types'

const wind: WindObservation = {
  observedAt: '2026-09-08T13:00:00.000Z',
  retrievedAt: '2026-09-08T13:29:00.000Z',
  level: '850hPa',
  windSpeedMs: 3.5,
  windFromDirectionDeg: 270,
  windToDirectionDeg: 90,
  windFromLabel: 'W',
  windToLabel: 'E',
  warningLevel: 'light',
  arrowLengthKm: 28,
  sectorWidthDeg: 45,
  sectorRadiusKm: 100,
  provider: 'test-provider',
}

describe('application shell', () => {
  it('renders the monitoring shell and client entry', async () => {
    const app = createApp(async () => wind)
    const response = await app.request('/')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Himawari')
    expect(html).toContain('Anak Krakatau')
    expect(html).toContain('/src/client.ts')
    expect(html).toContain('Indicative ash transport direction')
  })
})
