import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  createDownwindSector,
  destinationPoint,
} from './domain/wind'
import type { ObservationMetadata, Volcano, WindObservation } from './domain/types'

interface VolcanoResponse {
  volcanoes: Volcano[]
  observation: ObservationMetadata
}

interface WindResponse {
  volcano: Volcano
  wind: WindObservation
}

const warningLabels: Record<WindObservation['warningLevel'], string> = {
  calm: 'Calm transport conditions',
  light: 'Light transport conditions',
  moderate: 'Moderate transport conditions',
  strong: 'Strong transport conditions',
  'very-strong': 'Very strong transport conditions',
}

const state = {
  activeVolcanoId: 'semeru',
  requestId: 0,
  map: null as MapLibreMap | null,
  mapReady: false,
  windCache: new Map<string, WindObservation>(),
  arrowMarker: null as maplibregl.Marker | null,
  mapMarkers: new Map<string, HTMLElement>(),
}

let volcanoCatalog: Volcano[] = []

const elements = {
  map: document.querySelector<HTMLDivElement>('#map'),
  mapLoading: document.querySelector<HTMLDivElement>('#map-loading'),
  systemState: document.querySelector<HTMLDivElement>('#system-state'),
  systemStateLabel: document.querySelector<HTMLSpanElement>('#system-state-label'),
  mapCoordinateValue: document.querySelector<HTMLElement>('#map-coordinate-value'),
  volcanoButtons: Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-volcano-id]'),
  ),
  selectedVolcanoName: document.querySelector<HTMLElement>('#selected-volcano-name'),
  selectedVolcanoLocation: document.querySelector<HTMLElement>('#selected-volcano-location'),
  windStatus: document.querySelector<HTMLDivElement>('#wind-status'),
  windStatusValue: document.querySelector<HTMLElement>('#wind-status-value'),
  windSpeed: document.querySelector<HTMLElement>('#wind-speed'),
  windFrom: document.querySelector<HTMLElement>('#wind-from'),
  windFromDegree: document.querySelector<HTMLElement>('#wind-from-degree'),
  windTo: document.querySelector<HTMLElement>('#wind-to'),
  windToDegree: document.querySelector<HTMLElement>('#wind-to-degree'),
  windObservedAt: document.querySelector<HTMLElement>('#wind-observed-at'),
  windRetrievedAt: document.querySelector<HTMLElement>('#wind-retrieved-at'),
  windError: document.querySelector<HTMLDivElement>('#wind-error'),
  ashSample: document.querySelector<HTMLImageElement>('#ash-sample'),
  ashOpacity: document.querySelector<HTMLInputElement>('#ash-opacity'),
  ashOpacityValue: document.querySelector<HTMLOutputElement>('#ash-opacity-value'),
}

function setText(element: Element | null, value: string) {
  if (element) element.textContent = value
}

function setSystemState(stateName: 'loading' | 'ready' | 'degraded', label: string) {
  elements.systemState?.setAttribute('data-state', stateName)
  setText(elements.systemStateLabel, label)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value)) + ' UTC'
}

function formatDegrees(value: number) {
  return `${Math.round(value).toString().padStart(3, '0')}°`
}

function getVolcano(id: string) {
  const button = elements.volcanoButtons.find(
    (candidate) => candidate.dataset.volcanoId === id,
  )
  if (!button) return undefined
  return {
    id,
    name: button.querySelector('strong')?.textContent ?? id,
  }
}

function setSelectedButton(id: string) {
  for (const button of elements.volcanoButtons) {
    const selected = button.dataset.volcanoId === id
    button.classList.toggle('is-selected', selected)
    button.setAttribute('aria-pressed', String(selected))
  }
  for (const [volcanoId, marker] of state.mapMarkers) {
    marker.classList.toggle('is-active', volcanoId === id)
  }
}

function setWindGeometryVisible(visible: boolean) {
  if (!state.mapReady || !state.map) return
  for (const layerId of [
    'wind-sector-fill',
    'wind-sector-outline',
    'wind-direction-line',
  ]) {
    if (state.map.getLayer(layerId)) {
      state.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }
  if (!visible) {
    state.arrowMarker?.remove()
    state.arrowMarker = null
  }
}

function setSourceData(sourceId: string, data: object) {
  const source = state.map?.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
  source?.setData(data as never)
}

function clearWindGeometry() {
  setWindGeometryVisible(false)
  setSourceData('wind-sector', {
    type: 'FeatureCollection',
    features: [],
  })
  setSourceData('wind-direction', {
    type: 'FeatureCollection',
    features: [],
  })
}

function updateWindGeometry(volcano: Volcano, wind: WindObservation) {
  const origin = {
    latitude: volcano.latitude,
    longitude: volcano.longitude,
  }
  const endpoint = destinationPoint(origin, wind.windToDirectionDeg, wind.arrowLengthKm)
  const sector = createDownwindSector(
    origin,
    wind.windToDirectionDeg,
    wind.sectorWidthDeg,
    wind.sectorRadiusKm,
  )

  setSourceData('wind-sector', sector)
  setSourceData('wind-direction', {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [volcano.longitude, volcano.latitude],
            [endpoint.longitude, endpoint.latitude],
          ],
        },
      },
    ],
  })

  const arrow = document.createElement('div')
  arrow.className = 'wind-arrow-marker'
  arrow.setAttribute('aria-hidden', 'true')
  const glyph = document.createElement('span')
  glyph.className = 'wind-arrow-glyph'
  glyph.style.transform = `rotate(${wind.windToDirectionDeg}deg)`
  arrow.append(glyph)
  state.arrowMarker?.remove()
  state.arrowMarker = new maplibregl.Marker({
    element: arrow,
    anchor: 'center',
  })
    .setLngLat([endpoint.longitude, endpoint.latitude])
    .addTo(state.map as MapLibreMap)

  setWindGeometryVisible(true)
}

function renderWindLoading(volcano: Volcano) {
  elements.windStatus?.setAttribute('data-state', 'loading')
  setText(elements.windStatusValue, `Loading ${volcano.defaultWindLevel} guidance`)
  setText(elements.windSpeed, '--')
  setText(elements.windFrom, '--')
  setText(elements.windFromDegree, '---°')
  setText(elements.windTo, '--')
  setText(elements.windToDegree, '---°')
  setText(elements.windObservedAt, 'Waiting')
  setText(elements.windRetrievedAt, 'Waiting')
  if (elements.windError) elements.windError.hidden = true
  clearWindGeometry()
}

function renderWindError() {
  elements.windStatus?.setAttribute('data-state', 'error')
  setText(elements.windStatusValue, 'Wind information unavailable')
  if (elements.windError) elements.windError.hidden = false
  setSystemState('degraded', 'WIND SERVICE DEGRADED')
  clearWindGeometry()
}

function renderWind(volcano: Volcano, wind: WindObservation) {
  elements.windStatus?.setAttribute('data-state', wind.warningLevel)
  setText(elements.windStatusValue, warningLabels[wind.warningLevel])
  setText(elements.windSpeed, wind.windSpeedMs.toFixed(1))
  setText(elements.windFrom, wind.windFromLabel)
  setText(elements.windFromDegree, formatDegrees(wind.windFromDirectionDeg))
  setText(elements.windTo, wind.windToLabel)
  setText(elements.windToDegree, formatDegrees(wind.windToDirectionDeg))
  setText(elements.windObservedAt, formatTime(wind.observedAt))
  setText(elements.windRetrievedAt, formatTime(wind.retrievedAt))
  if (elements.windError) elements.windError.hidden = true
  setSystemState('ready', 'WIND SERVICE ONLINE')
  updateWindGeometry(volcano, wind)
}

async function loadWind(volcano: Volcano) {
  const cached = state.windCache.get(volcano.id)
  if (cached) {
    renderWind(volcano, cached)
    return
  }

  const requestId = ++state.requestId
  renderWindLoading(volcano)

  try {
    const response = await fetch(`/api/volcanoes/${volcano.id}/wind`)
    if (!response.ok) throw new Error('wind request failed')
    const body = (await response.json()) as WindResponse
    if (
      !body.wind ||
      !Number.isFinite(body.wind.windSpeedMs) ||
      !Number.isFinite(body.wind.windToDirectionDeg)
    ) {
      throw new Error('invalid wind response')
    }
    if (requestId !== state.requestId || volcano.id !== state.activeVolcanoId) return
    state.windCache.set(volcano.id, body.wind)
    renderWind(volcano, body.wind)
  } catch {
    if (requestId !== state.requestId || volcano.id !== state.activeVolcanoId) return
    renderWindError()
  }
}

function selectVolcano(volcano: Volcano) {
  state.activeVolcanoId = volcano.id
  setSelectedButton(volcano.id)
  setText(elements.selectedVolcanoName, volcano.name)
  setText(
    elements.selectedVolcanoLocation,
    `${volcano.latitude >= 0 ? 'North' : 'South'} Indonesia / ${volcano.elevationM.toLocaleString()} m`,
  )
  setText(
    elements.mapCoordinateValue,
    `${Math.abs(volcano.latitude).toFixed(2)}° ${volcano.latitude >= 0 ? 'N' : 'S'} / ${Math.abs(volcano.longitude).toFixed(2)}° E`,
  )
  if (state.mapReady) {
    state.map?.flyTo({
      center: [volcano.longitude, volcano.latitude],
      zoom: 6.5,
      duration: 900,
      essential: true,
    })
  }
  loadWind(volcano)
}

function createMap(volcanoCatalog: Volcano[]) {
  if (!elements.map) return

  const map = new maplibregl.Map({
    container: elements.map,
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#071316' },
        },
        {
          id: 'osm',
          type: 'raster',
          source: 'osm',
          paint: {
            'raster-opacity': 0.58,
            'raster-saturation': -0.75,
            'raster-contrast': 0.2,
          },
        },
      ],
    },
    center: [117, -3],
    zoom: 4.15,
    minZoom: 3,
    maxZoom: 10,
  })
  state.map = map
  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right')

  map.on('load', () => {
    map.addSource('wind-sector', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addSource('wind-direction', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: 'wind-sector-fill',
      type: 'fill',
      source: 'wind-sector',
      paint: {
        'fill-color': '#e5bd51',
        'fill-opacity': 0.16,
      },
    })
    map.addLayer({
      id: 'wind-sector-outline',
      type: 'line',
      source: 'wind-sector',
      paint: {
        'line-color': '#e5bd51',
        'line-opacity': 0.55,
        'line-width': 1.5,
        'line-dasharray': [2, 2],
      },
    })
    map.addLayer({
      id: 'wind-direction-line',
      type: 'line',
      source: 'wind-direction',
      paint: {
        'line-color': '#f7e6a1',
        'line-width': 3,
        'line-opacity': 0.95,
        'line-blur': 0.2,
      },
    })

    for (const volcano of volcanoCatalog) {
      const markerElement = document.createElement('button')
      markerElement.className = 'map-volcano-marker'
      markerElement.type = 'button'
      markerElement.setAttribute('aria-label', `Select ${volcano.name}`)
      markerElement.innerHTML = `<span class="marker-pulse"></span><span class="marker-core"></span><span class="marker-label">${volcano.name}</span>`
      markerElement.addEventListener('click', () => selectVolcano(volcano))
      state.mapMarkers.set(volcano.id, markerElement)
      new maplibregl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([volcano.longitude, volcano.latitude])
        .addTo(map)
    }

    state.mapReady = true
    if (elements.mapLoading) elements.mapLoading.hidden = true
    selectVolcano(volcanoCatalog.find((volcano) => volcano.id === state.activeVolcanoId) ?? volcanoCatalog[0])
  })

  map.on('error', () => {
    if (!state.mapReady) {
      if (elements.mapLoading) elements.mapLoading.textContent = 'MAP TILE SOURCE UNAVAILABLE'
      setSystemState('degraded', 'MAP SURFACE DEGRADED')
    }
  })
}

function setupSampleControl() {
  elements.ashOpacity?.addEventListener('input', () => {
    const value = Number(elements.ashOpacity?.value ?? 82)
    if (elements.ashSample) elements.ashSample.style.opacity = String(value / 100)
    setText(elements.ashOpacityValue, `${value}%`)
  })

  elements.ashSample?.addEventListener('error', () => {
    elements.ashSample?.closest('.sample-image-wrap')?.classList.add('is-unavailable')
  })
}

async function bootstrap() {
  setupSampleControl()
  for (const button of elements.volcanoButtons) {
    button.addEventListener('click', () => {
      const volcanoId = button.dataset.volcanoId
      if (!volcanoId) return
      const volcano = volcanoCatalog.find((candidate) => candidate.id === volcanoId)
      if (volcano) selectVolcano(volcano)
    })
  }

  try {
    const response = await fetch('/api/volcanoes')
    if (!response.ok) throw new Error('catalog request failed')
    const body = (await response.json()) as VolcanoResponse
    if (!body.volcanoes.length) throw new Error('empty volcano catalog')
    volcanoCatalog = body.volcanoes
    createMap(body.volcanoes)
  } catch {
    setSystemState('degraded', 'CATALOG UNAVAILABLE')
    if (elements.mapLoading) elements.mapLoading.textContent = 'VOLCANO CATALOG UNAVAILABLE'
    const fallback = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-volcano-id]'))
    const firstId = fallback[0]?.dataset.volcanoId
    const basicVolcano = firstId ? getVolcano(firstId) : undefined
    if (basicVolcano) {
      setText(elements.selectedVolcanoName, basicVolcano.name)
      renderWindError()
    }
  }
}

void bootstrap()
