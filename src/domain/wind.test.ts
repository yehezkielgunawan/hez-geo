import { describe, expect, it } from 'vitest'
import {
  arrowLengthKm,
  compassDirection,
  createDownwindSector,
  destinationPoint,
  classifyWind,
  windToDirection,
} from './wind'

describe('wind direction helpers', () => {
  it('converts meteorological wind-from direction to transport direction', () => {
    expect(windToDirection(270)).toBe(90)
    expect(windToDirection(180)).toBe(0)
    expect(windToDirection(10)).toBe(190)
  })

  it('labels compass directions in eight sectors', () => {
    expect(compassDirection(0)).toBe('N')
    expect(compassDirection(44)).toBe('NE')
    expect(compassDirection(90)).toBe('E')
    expect(compassDirection(225)).toBe('SW')
    expect(compassDirection(359)).toBe('N')
  })

  it('classifies the configured wind speed thresholds', () => {
    expect(classifyWind(1.99)).toBe('calm')
    expect(classifyWind(2)).toBe('light')
    expect(classifyWind(5)).toBe('moderate')
    expect(classifyWind(10)).toBe('strong')
    expect(classifyWind(15)).toBe('very-strong')
  })

  it('bounds the arrow length for calm and strong winds', () => {
    expect(arrowLengthKm(0)).toBe(20)
    expect(arrowLengthKm(8)).toBe(64)
    expect(arrowLengthKm(100)).toBe(150)
  })

  it('calculates an eastward destination from a north-up bearing', () => {
    const point = destinationPoint({ latitude: 0, longitude: 0 }, 90, 100)

    expect(point.latitude).toBeCloseTo(0, 2)
    expect(point.longitude).toBeGreaterThan(0.8)
  })

  it('creates a closed polygon sector anchored at the volcano', () => {
    const sector = createDownwindSector(
      { latitude: -8.108, longitude: 112.922 },
      90,
      45,
      100,
    )
    const coordinates = sector.geometry.coordinates[0]

    expect(sector.type).toBe('Feature')
    expect(sector.geometry.type).toBe('Polygon')
    expect(coordinates[0]).toEqual([112.922, -8.108])
    expect(coordinates.at(-1)).toEqual(coordinates[0])
    expect(coordinates.length).toBeGreaterThan(3)
  })
})

describe('wind input validation', () => {
  it('rejects non-finite and negative wind values', () => {
    expect(() => windToDirection(Number.NaN)).toThrow(RangeError)
    expect(() => classifyWind(-1)).toThrow(RangeError)
    expect(() => arrowLengthKm(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})
