import { describe, expect, it } from 'vitest'
import { fetchOpenMeteoWind } from './open-meteo'
import type { Volcano } from '../domain/types'

const semeru: Volcano = {
  id: 'semeru',
  name: 'Semeru',
  latitude: -8.108,
  longitude: 112.922,
  elevationM: 3676,
  defaultWindLevel: '850hPa',
}

const now = new Date('2026-09-08T13:29:00Z')

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchOpenMeteoWind', () => {
  it('normalizes the hourly record nearest to the requested time', async () => {
    let requestedUrl = ''
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = String(input)
      return response({
        hourly: {
          time: ['2026-09-08T13:00:00Z', '2026-09-08T14:00:00Z'],
          wind_speed_850hPa: [3.5, 8.2],
          wind_direction_850hPa: [270, 90],
        },
      })
    }

    const result = await fetchOpenMeteoWind(semeru, { fetcher, now })

    expect(new URL(requestedUrl).searchParams.get('latitude')).toBe('-8.108')
    expect(new URL(requestedUrl).searchParams.get('wind_speed_unit')).toBe('ms')
    expect(result).toMatchObject({
      observedAt: '2026-09-08T13:00:00.000Z',
      windSpeedMs: 3.5,
      windFromDirectionDeg: 270,
      windToDirectionDeg: 90,
      windFromLabel: 'W',
      windToLabel: 'E',
      warningLevel: 'light',
      level: '850hPa',
      provider: 'Open-Meteo',
    })
    expect(result.retrievedAt).toBe(now.toISOString())
  })

  it('rejects a provider response with mismatched hourly arrays', async () => {
    const fetcher: typeof fetch = async () =>
      response({
        hourly: {
          time: ['2026-09-08T13:00:00Z'],
          wind_speed_850hPa: [3.5, 8.2],
          wind_direction_850hPa: [270],
        },
      })

    await expect(fetchOpenMeteoWind(semeru, { fetcher, now })).rejects.toThrow(
      'incomplete hourly wind data',
    )
  })

  it('rejects missing or non-finite wind values', async () => {
    const fetcher: typeof fetch = async () =>
      response({
        hourly: {
          time: ['2026-09-08T13:00:00Z'],
          wind_speed_850hPa: [null],
          wind_direction_850hPa: [270],
        },
      })

    await expect(fetchOpenMeteoWind(semeru, { fetcher, now })).rejects.toThrow(
      'invalid wind value',
    )
  })

  it('turns an upstream HTTP failure into a provider error', async () => {
    const fetcher: typeof fetch = async () => response({ error: true }, 503)

    await expect(fetchOpenMeteoWind(semeru, { fetcher, now })).rejects.toThrow(
      'Open-Meteo request failed with 503',
    )
  })

  it('turns a network failure into a provider error', async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error('network down')
    }

    await expect(fetchOpenMeteoWind(semeru, { fetcher, now })).rejects.toThrow(
      'Open-Meteo request failed: network down',
    )
  })

  it('rejects malformed JSON from the provider', async () => {
    const fetcher: typeof fetch = async () =>
      new Response('{', { status: 200 })

    await expect(fetchOpenMeteoWind(semeru, { fetcher, now })).rejects.toThrow(
      'Open-Meteo response was not valid JSON',
    )
  })
})
