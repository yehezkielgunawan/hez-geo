import type { Volcano } from '../domain/types'

export const volcanoes: Volcano[] = [
  {
    id: 'semeru',
    name: 'Semeru',
    latitude: -8.108,
    longitude: 112.922,
    elevationM: 3676,
    defaultWindLevel: '850hPa',
  },
  {
    id: 'merapi',
    name: 'Merapi',
    latitude: -7.541,
    longitude: 110.446,
    elevationM: 2910,
    defaultWindLevel: '850hPa',
  },
  {
    id: 'anak-krakatau',
    name: 'Anak Krakatau',
    latitude: -6.102,
    longitude: 105.423,
    elevationM: 157,
    defaultWindLevel: '850hPa',
  },
  {
    id: 'lewotobi-laki-laki',
    name: 'Lewotobi Laki-laki',
    latitude: -8.542,
    longitude: 122.775,
    elevationM: 1584,
    defaultWindLevel: '850hPa',
  },
  {
    id: 'ibu',
    name: 'Ibu',
    latitude: 1.488,
    longitude: 127.63,
    elevationM: 1325,
    defaultWindLevel: '850hPa',
  },
]

export function findVolcano(id: string) {
  return volcanoes.find((volcano) => volcano.id === id)
}
