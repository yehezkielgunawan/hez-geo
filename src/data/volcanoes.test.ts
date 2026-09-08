import { describe, expect, it } from 'vitest'
import { findVolcano, volcanoes } from './volcanoes'

describe('volcano catalog', () => {
  it('contains the five initial Indonesian monitoring targets', () => {
    expect(volcanoes.map((volcano) => volcano.id)).toEqual([
      'semeru',
      'merapi',
      'anak-krakatau',
      'lewotobi-laki-laki',
      'ibu',
    ])
  })

  it('returns a volcano by id without falling back to another target', () => {
    expect(findVolcano('ibu')?.name).toBe('Ibu')
    expect(findVolcano('unknown')).toBeUndefined()
  })
})
