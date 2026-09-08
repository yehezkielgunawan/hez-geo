import { describe, expect, it, vi } from 'vitest'
import { createApiRoutes } from './api'
import type { WindObservation } from '../domain/types'

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

describe('volcano API routes', () => {
  it('lists the five volcanoes and the representative observation', async () => {
    const app = createApiRoutes(async () => wind)
    const response = await app.request('/volcanoes')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.volcanoes).toHaveLength(5)
    expect(body.volcanoes[0]).toMatchObject({ id: 'semeru', name: 'Semeru' })
    expect(body.observation.imageUrl).toBe('/imagery/ash-rgb-anak-krakatau.webp')
  })

  it('returns normalized wind for a known volcano', async () => {
    const provider = vi.fn(async (volcano) => {
      expect(volcano.id).toBe('semeru')
      return wind
    })
    const app = createApiRoutes(provider)
    const response = await app.request('/volcanoes/semeru/wind')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.volcano.id).toBe('semeru')
    expect(body.wind.windToDirectionDeg).toBe(90)
    expect(provider).toHaveBeenCalledOnce()
  })

  it('rejects unknown volcano ids before calling the provider', async () => {
    const provider = vi.fn(async () => wind)
    const app = createApiRoutes(provider)
    const response = await app.request('/volcanoes/unknown/wind')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Volcano not found' })
    expect(provider).not.toHaveBeenCalled()
  })

  it('hides provider errors behind a controlled unavailable response', async () => {
    const provider = vi.fn(async () => {
      throw new Error('secret upstream details')
    })
    const app = createApiRoutes(provider)
    const response = await app.request('/volcanoes/ibu/wind')

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Wind information unavailable',
      volcanoId: 'ibu',
    })
  })
})
