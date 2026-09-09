# Himawari-9 Volcanic Ash Monitoring Web Application

## 1. Project Overview

### Working Title

**Himawari Volcano Monitor**

### Objective

Build a near-real-time web application for monitoring volcanic ash around Indonesian volcanoes using multispectral observations from the **Himawari-9 Advanced Himawari Imager (AHI)**.

The system will automatically:

1. Retrieve newly available Himawari-9 observations.
2. Extract the required infrared bands.
3. Convert raw satellite measurements into brightness temperatures.
4. Generate a JMA-style **Ash RGB composite**.
5. Crop imagery around selected Indonesian volcanoes.
6. Retrieve and display wind direction and wind-speed information near each volcano.
7. Add a wind-direction warning or directional marker to indicate the likely downwind direction of an ash plume.
8. Store processed imagery, wind data, warnings, and metadata.
9. Serve observations through a Hono API.
10. Display them on an interactive web map.
11. Allow users to browse and animate observations over time.

The first version is intended for **visualization and monitoring**, not eruption prediction or official hazard forecasting.

Wind direction should be treated as an indicator of the **likely transport direction** of ash, not as a precise prediction of where ash will travel. Actual ash movement depends on wind at different altitudes, plume height, atmospheric stability, eruption strength, particle size, and weather conditions.

---

# 2. Near-Real-Time Characteristics

Himawari-9 performs Full Disk observations every approximately:

```text
10 minutes
```

Therefore the application will use a processing cycle such as:

```text
00:00 observation
00:10 observation
00:20 observation
00:30 observation
...
```

The system should not promise that a newly observed image appears exactly 10 minutes later.

Actual availability is:

```text
Satellite observation
        ↓
JMA processing
        ↓
NOAA distribution
        ↓
Object becomes available
        ↓
Application detects it
        ↓
Application processes it
        ↓
Wind data is retrieved
        ↓
Image and wind indicator are displayed
```

Therefore the application should describe itself as:

> Near-real-time volcanic ash satellite monitoring with indicative wind-direction guidance.

rather than:

> Real-time volcanic ash monitoring and prediction.

Wind data may have a different update frequency and latency from Himawari imagery. The application must display the wind observation or forecast time separately from the satellite observation time.

---

# 3. Primary Data Source

## NOAA Himawari-9 Open Data

Primary upstream source:

```text
s3://noaa-himawari9/
```

The bucket is publicly readable and does not require an AWS account for unsigned access.

Example:

```bash
aws s3 ls \
  --no-sign-request \
  s3://noaa-himawari9/
```

The project will primarily consume:

```text
AHI-L1b-FLDK
```

Full Disk Himawari AHI Level-1b imagery.

Primary required bands:

| Band | Wavelength | Role                         |
| ---- | ---------: | ---------------------------- |
| B11  |   \~8.6 µm | Ash/SO₂/cloud discrimination |
| B13  |  \~10.4 µm | Infrared temperature         |
| B15  |  \~12.4 µm | Ash discrimination           |

---

# 4. Ash RGB Product

The application will implement the JMA Ash RGB composition.

Conceptually:

```text
RED
B15 - B13

GREEN
B13 - B11

BLUE
B13
inverted
```

Recommended JMA-style ranges:

```text
Red:
B15 - B13
-4 K → +2 K

Green:
B13 - B11
-4 K → +5 K

Blue:
B13
243 K → 208 K
inverted
```

Typical qualitative interpretation:

```text
Red / magenta
→ volcanic ash

Green
→ SO₂-rich plume

Yellow
→ mixture of ash and SO₂

Dark / blue tones
→ clouds / surface depending on conditions
```

The exact visual interpretation must not be treated as a deterministic ash classification.

The wind-direction indicator should be displayed as a separate map layer and should not be blended into the Ash RGB image itself. This keeps the satellite product scientifically distinguishable from the meteorological guidance layer.

---

# 5. Wind Direction and Ash Transport Warning

## Purpose

The application should show the direction in which ash may be transported if an eruption occurs or if an ash plume is detected.

The wind layer should answer:

```text
What direction is the wind moving toward?
```

This is important because meteorological wind direction is commonly reported as the direction the wind is **coming from**, while ash transport follows the direction the wind is **moving toward**.

Example:

```text
Wind from the west
        ↓
Ash generally moves toward the east
```

The UI must clearly distinguish:

```text
Wind from:
270° / West

Ash transport toward:
90° / East
```

---

## Recommended Wind Data

The application should support a configurable meteorological data provider.

Possible sources include:

```text
Open-Meteo
NOAA weather model data
ECMWF-based forecast data
Météo-France or other numerical weather prediction services
```

For the MVP, use a provider that supplies:

- wind speed;
- wind direction;
- pressure-level or altitude-level wind data;
- forecast or observation timestamp;
- latitude and longitude;
- model run or data source metadata.

Surface wind alone is not sufficient for ash transport analysis. The application should preferably retrieve wind at several pressure levels, such as:

```text
1000 hPa
925 hPa
850 hPa
700 hPa
500 hPa
300 hPa
```

Approximate altitude interpretation:

| Pressure level | Approximate altitude | Use                     |
| -------------- | -------------------: | ----------------------- |
| 1000 hPa       |         near surface | low-level ash transport |
| 925 hPa        |              \~750 m | low-level plume         |
| 850 hPa        |             \~1.5 km | lower plume             |
| 700 hPa        |               \~3 km | mid-level plume         |
| 500 hPa        |             \~5.5 km | elevated plume          |
| 300 hPa        |               \~9 km | high plume              |

These altitude estimates vary with atmospheric conditions. The application should label them as approximate.

---

## Wind Direction Calculation

Meteorological wind direction is usually expressed as the direction from which the wind originates.

Convert it to the ash transport direction:

```ts
const transportDirection =
  (windFromDirection + 180) % 360
```

Example:

```text
windFromDirection = 270°
transportDirection = 90°
```

The application should store both values:

```ts
windFromDirection
windToDirection
```

Do not overwrite the original meteorological direction.

---

## Wind Marker

For each volcano, display:

```text
volcano marker
        +
wind arrow
        +
downwind transport direction
```

Example:

```text
                 ash transport
                      ───────►

                    🌋
                 Semeru
```

The arrow should point toward the direction in which ash is likely to move.

Recommended marker properties:

```text
arrow direction:
windToDirection

arrow length:
scaled by wind speed

arrow color:
based on wind speed or warning status

label:
"Indicative ash transport direction"
```

The arrow should be anchored at the volcano location.

---

## Wind Speed Scaling

Wind speed should influence arrow length, but the scale must be bounded so that very strong winds do not make the map unreadable.

Example:

```ts
const arrowLengthKm = clamp(
  windSpeedMs * 8,
  20,
  150,
)
```

The exact scale should be configurable.

The arrow length is a visualization aid. It must not be interpreted as the actual distance ash will travel.

---

## Wind Warning Sector

In addition to an arrow, display a translucent downwind sector.

Example:

```text
                    ░░░░░░░
                ░░░░░░░░░░░░░
             ░░░░░░░░░░░░░░░░░
                    🌋
```

Recommended properties:

```text
sector center:
windToDirection

sector width:
30°–60°

sector radius:
configurable, for example 50–150 km

opacity:
0.15–0.30
```

The sector should be labeled:

> Indicative downwind area

It must not be labeled:

> Confirmed ash area

or:

> Predicted ash plume

unless an official ash-dispersion model or advisory supports that claim.

---

## Wind Warning Levels

The application may provide a simple wind-transport status based on wind speed:

```text
Calm:
< 2 m/s

Light:
2–5 m/s

Moderate:
5–10 m/s

Strong:
10–15 m/s

Very strong:
> 15 m/s
```

Example UI:

```text
Wind transport:
Moderate toward East

Wind:
6.4 m/s from West

Indicative ash direction:
East
```

These categories describe wind conditions only. They do not indicate eruption severity or ash concentration.

---

## Multi-Level Wind Display

If wind data is available at multiple altitudes, display separate arrows:

```text
Surface / 1000 hPa
        ─────► East

850 hPa
        ─────────► Northeast

500 hPa
        ◄──── West
```

This is important because wind direction can change significantly with altitude.

Recommended UI:

```text
Wind level:
[ Surface ▼ ]

Options:
- Surface
- 925 hPa
- 850 hPa
- 700 hPa
- 500 hPa
- 300 hPa
```

The application should also provide an optional vertical wind profile panel.

---

## Wind Direction Warning Text

When a volcano is selected, show a clear warning panel:

```text
Indicative ash transport

Wind at 850 hPa:
From West at 8.2 m/s

Ash transport direction:
Toward East

Important:
This is a wind-based indication only.
It is not an official ash forecast.
```

If wind data is unavailable:

```text
Wind information unavailable

The downwind indicator cannot be calculated
for this observation.
```

If wind data is stale:

```text
Wind data delayed

Last updated:
20:00 WIB

Use caution when interpreting the
indicative ash transport direction.
```

---

# 6. High-Level Architecture

```text
                     HIMAWARI-9
                          │
                          ▼
                NOAA Open Data S3
                          │
                          ▼
                ┌─────────────────┐
                │ Ingestion Worker│
                │ TypeScript/Bun  │
                └────────┬────────┘
                         │
                         ▼
                Download B11/B13/B15
                         │
                         ▼
               ┌───────────────────┐
               │ Satellite Processor│
               │                   │
               │ calibration       │
               │ radiance          │
               │ brightness temp   │
               │ geolocation       │
               │ crop ROI          │
               │ Ash RGB           │
               └─────────┬─────────┘
                         │
                         │
                         ▼
                ┌───────────────────┐
                │ Wind Data Service  │
                │                   │
                │ wind speed        │
                │ wind direction    │
                │ pressure levels   │
                │ forecast time     │
                └─────────┬─────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
         Object Storage            Database
          R2 / S3                  D1/Postgres
              │                       │
              └───────────┬───────────┘
                          │
                          ▼
                      Hono API
                          │
                          ▼
                    Web Frontend
                          │
                          ▼
                   MapLibre GL JS
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
       Ash RGB raster          Wind arrow/sector
                          │
                          ▼
                  Timeline playback
```

---

# 7. Recommended Technology Stack

## Language

```text
TypeScript
```

Use TypeScript for:

- API;
- ingestion;
- data indexing;
- scheduling;
- wind-data retrieval;
- wind-direction calculations;
- web frontend;
- domain models.

---

## Backend API

```text
Hono
```

Deployment target:

```text
Cloudflare Workers
```

Hono is well suited to Cloudflare Workers and can also run under Node.js, Bun, and other JavaScript runtimes.

---

## Processing Runtime

Recommended:

```text
Bun
```

or:

```text
Node.js
```

The satellite processing workload should initially run separately from Cloudflare Workers.

Reason:

```text
Himawari binary data
+
large arrays
+
image transformation
+
projection
+
compression
```

are more naturally handled in a conventional compute environment.

---

## Frontend

Recommended options:

```text
React
+
Vite
```

or:

```text
Hono JSX
+
Vite
```

Recommended initial choice:

```text
React + Vite
```

because the application will contain relatively interactive UI:

- map;
- playback;
- image opacity;
- time selector;
- layers;
- volcano selector;
- wind-level selector;
- wind warning panel.

---

## Map Engine

```text
MapLibre GL JS
```

Use it for:

- volcano markers;
- satellite raster overlays;
- wind arrows;
- downwind sectors;
- geographic bounds;
- layer toggling;
- zoom/pan;
- eventual ash polygons.

---

## Database

MVP:

```text
Cloudflare D1
```

Alternative:

```text
PostgreSQL
```

D1 is sufficient because the database primarily stores metadata, wind information, and product references rather than large satellite images.

---

## Image/Object Storage

Recommended:

```text
Cloudflare R2
```

Store:

```text
Ash RGB imagery
raw-band preview imagery
thumbnail imagery
processing artifacts
optional wind-profile JSON
```

Do not store large images directly in D1.

---

## Package Manager

```text
pnpm
```

Recommended monorepo setup:

```text
pnpm workspaces
```

---

# 8. Repository Structure

```text
himawari-volcano-monitor/
│
├── apps/
│   │
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   │
│   │   │   ├── routes/
│   │   │   │   ├── volcanoes.ts
│   │   │   │   ├── observations.ts
│   │   │   │   ├── imagery.ts
│   │   │   │   ├── wind.ts
│   │   │   │   └── status.ts
│   │   │   │
│   │   │   ├── services/
│   │   │   │   ├── volcano.service.ts
│   │   │   │   ├── observation.service.ts
│   │   │   │   ├── imagery.service.ts
│   │   │   │   └── wind.service.ts
│   │   │   │
│   │   │   ├── repositories/
│   │   │   │   ├── volcano.repository.ts
│   │   │   │   ├── observation.repository.ts
│   │   │   │   └── wind.repository.ts
│   │   │   │
│   │   │   └── middleware/
│   │   │
│   │   └── package.json
│   │
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── VolcanoMap.tsx
│   │   │   │   ├── Timeline.tsx
│   │   │   │   ├── LayerControl.tsx
│   │   │   │   ├── VolcanoSelector.tsx
│   │   │   │   ├── WindArrow.tsx
│   │   │   │   ├── WindSector.tsx
│   │   │   │   ├── WindWarningPanel.tsx
│   │   │   │   └── WindLevelSelector.tsx
│   │   │   │
│   │   │   ├── hooks/
│   │   │   │   ├── useLatestObservation.ts
│   │   │   │   ├── useWindData.ts
│   │   │   │   └── useWindProfile.ts
│   │   │   │
│   │   │   ├── pages/
│   │   │   ├── map/
│   │   │   │   ├── wind-layer.ts
│   │   │   │   └── ash-layer.ts
│   │   │   └── api/
│   │   │
│   │   └── package.json
│   │
│   └── worker/
│       ├── src/
│       │   │
│       │   ├── ingestion/
│       │   │   ├── discover.ts
│       │   │   ├── download.ts
│       │   │   └── s3.ts
│       │   │
│       │   ├── himawari/
│       │   │   ├── parser.ts
│       │   │   ├── calibration.ts
│       │   │   ├── radiance.ts
│       │   │   ├── temperature.ts
│       │   │   └── projection.ts
│       │   │
│       │   ├── wind/
│       │   │   ├── provider.ts
│       │   │   ├── fetch.ts
│       │   │   ├── direction.ts
│       │   │   ├── levels.ts
│       │   │   └── warning.ts
│       │   │
│       │   ├── processing/
│       │   │   ├── crop.ts
│       │   │   ├── normalize.ts
│       │   │   ├── ash-rgb.ts
│       │   │   └── encode.ts
│       │   │
│       │   ├── storage/
│       │   │   ├── r2.ts
│       │   │   └── metadata.ts
│       │   │
│       │   └── jobs/
│       │       └── process-observation.ts
│       │
│       └── package.json
│
├── packages/
│   │
│   ├── shared/
│   │   └── src/
│   │       ├── types.ts
│   │       ├── schemas.ts
│   │       └── constants.ts
│   │
│   ├── volcanoes/
│   │   └── src/
│   │       ├── indonesia.ts
│   │       └── types.ts
│   │
│   ├── himawari/
│   │   └── src/
│   │       ├── bands.ts
│   │       ├── filenames.ts
│   │       ├── observation.ts
│   │       └── types.ts
│   │
│   ├── wind/
│   │   └── src/
│   │       ├── direction.ts
│   │       ├── bearing.ts
│   │       ├── levels.ts
│   │       ├── speed.ts
│   │       └── types.ts
│   │
│   └── ash-rgb/
│       └── src/
│           ├── composite.ts
│           ├── normalize.ts
│           └── types.ts
│
├── scripts/
│   ├── bootstrap-volcanoes.ts
│   └── backfill.ts
│
├── data/
│   └── volcanoes.json
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

# 9. Domain Model

## Volcano

```ts
export interface Volcano {
  id: string
  name: string

  latitude: number
  longitude: number

  elevation?: number

  roiRadiusKm: number

  defaultWindLevel?: WindLevel
}
```

Example:

```ts
export const semeru: Volcano = {
  id: 'semeru',
  name: 'Semeru',

  latitude: -8.108,
  longitude: 112.922,

  roiRadiusKm: 300,

  defaultWindLevel: '850hPa',
}
```

---

## Wind Level

```ts
export type WindLevel =
  | 'surface'
  | '1000hPa'
  | '925hPa'
  | '850hPa'
  | '700hPa'
  | '500hPa'
  | '300hPa'
```

---

## Wind Observation

```ts
export interface WindObservation {
  id: string

  volcanoId: string

  observedAt: string
  retrievedAt: string

  level: WindLevel
  pressureHpa?: number
  approximateAltitudeKm?: number

  windSpeedMs: number

  windFromDirectionDeg: number
  windToDirectionDeg: number

  directionLabel: string
  transportDirectionLabel: string

  provider: string
  model?: string
  modelRun?: string

  status:
    | 'available'
    | 'stale'
    | 'unavailable'
}
```

---

## Observation

```ts
export interface Observation {
  id: string

  volcanoId: string

  observedAt: string
  processedAt: string

  satellite: 'Himawari-9'
  instrument: 'AHI'

  status:
    | 'discovered'
    | 'downloading'
    | 'processing'
    | 'ready'
    | 'failed'

  products: {
    ashRgb?: string
    band11?: string
    band13?: string
    band15?: string
  }

  wind?: {
    defaultLevel?: WindLevel
    observations?: WindObservation[]
    warning?: WindTransportWarning
  }
}
```

---

## Wind Transport Warning

```ts
export interface WindTransportWarning {
  level:
    | 'calm'
    | 'light'
    | 'moderate'
    | 'strong'
    | 'very-strong'
    | 'unknown'

  label: string

  windFromDirectionDeg?: number
  windToDirectionDeg?: number

  windFromLabel?: string
  windToLabel?: string

  windSpeedMs?: number

  sectorWidthDeg: number
  sectorRadiusKm: number

  generatedAt: string

  disclaimer: string
}
```

---

# 10. Initial Indonesian Volcanoes

The MVP should intentionally support only a limited number.

Suggested initial set:

```text
Semeru
Merapi
Anak Krakatau
Lewotobi Laki-laki
Ibu
Dukono
Marapi
```

Reason:

These provide enough diversity for testing while avoiding unnecessary processing across all Indonesian volcanoes.

The architecture should nevertheless support expanding the list later.

Each volcano should have:

```text
default ROI radius
default wind level
optional preferred wind provider
```

For example:

```text
Semeru:
ROI radius = 300 km
default wind level = 850 hPa
```

The default wind level should be configurable because eruption plume heights vary.

---

# 11. Region of Interest Strategy

Do not initially generate custom full-disk visualizations for the frontend.

Instead:

```text
Full Disk
   ↓
identify volcano coordinates
   ↓
project coordinates
   ↓
crop ROI
   ↓
generate local product
```

Example:

```text
                 300 km radius

        ┌─────────────────────────┐
        │                         │
        │         plume           │
        │          ░░░░░          │
        │       🌋░░░░░░          │
        │           ░░░░░         │
        │                         │
        └─────────────────────────┘
                 Semeru
```

Initial default:

```text
ROI radius = 300 km
```

Allow it to become configurable later.

The wind sector should be generated independently from the satellite crop. It should use the volcano coordinates as its origin and should be rendered as a geographic map layer.

---

# 12. Near-Real-Time Ingestion Flow

## Scheduler

Run the ingestion check approximately every:

```text
5 minutes
```

This does NOT mean Himawari produces images every five minutes.

It simply ensures the application detects new 10-minute observations reasonably quickly.

Example:

```text
Cron
 │
 ├── 00:00
 ├── 00:05
 ├── 00:10
 ├── 00:15
 └── ...
```

Wind data should be refreshed independently, for example:

```text
Satellite ingestion:
every 5 minutes

Wind data:
every 15–60 minutes,
depending on provider update frequency
```

The application should not request new wind data for every satellite frame if the wind provider has not published new data.

---

## Discovery Algorithm

```text
START
  │
  ▼
Determine expected recent observation times
  │
  ▼
Round time to Himawari timeline
  │
  ▼
Check NOAA S3
  │
  ▼
Does B11 exist?
  │
  ├── no → stop / retry later
  │
  ▼ yes
Does B13 exist?
  │
  ├── no → retry later
  │
  ▼ yes
Does B15 exist?
  │
  ├── no → retry later
  │
  ▼ yes
Create observation job
  │
  ▼
Retrieve or reuse wind data
  │
  ▼
PROCESS
```

The worker must be **idempotent**.

If:

```text
2026-09-06T13:20Z
```

was already processed, the scheduler must not process it again unnecessarily.

---

# 13. Observation State Machine

```text
DISCOVERED
    │
    ▼
DOWNLOADING
    │
    ▼
PROCESSING
    │
    ├── retrieve wind data
    │
    ├── calculate transport direction
    │
    └── generate warning metadata
    │
    ▼
READY
```

Failure:

```text
DISCOVERED
    │
    ▼
DOWNLOADING
    │
    └──► FAILED

PROCESSING
    │
    └──► FAILED

WIND RETRIEVAL
    │
    └──► WIND_UNAVAILABLE
```

Wind failure should not necessarily cause the satellite observation to fail.

The observation may still become:

```text
READY
```

with:

```text
wind.status = unavailable
```

Store:

```text
failure_reason
retry_count
last_attempt_at
wind_failure_reason
```

for operational visibility.

---

# 14. Satellite Processing Pipeline

The central processing pipeline is:

```text
Himawari L1b
     │
     ▼
Decode binary
     │
     ▼
Extract digital counts
     │
     ▼
Calibration
     │
     ▼
Radiance
     │
     ▼
Brightness temperature
     │
     ├── B11
     ├── B13
     └── B15
     │
     ▼
Geolocation
     │
     ▼
Volcano ROI crop
     │
     ▼
Ash RGB
     │
     ▼
PNG / WebP
```

Wind processing is separate:

```text
Volcano coordinates
        │
        ▼
Retrieve wind data
        │
        ▼
Select pressure level
        │
        ▼
Read wind speed and direction
        │
        ▼
Convert wind-from to wind-to
        │
        ▼
Generate arrow and sector geometry
        │
        ▼
Store wind metadata
        │
        ▼
Render on MapLibre
```

---

# 15. Brightness Temperature Processing

The application should NEVER calculate Ash RGB directly from arbitrary raw digital values.

Required pipeline:

```text
Digital Number
      ↓
Radiance
      ↓
Brightness Temperature
      ↓
Kelvin
```

Result:

```text
B11[x][y] = temperature K
B13[x][y] = temperature K
B15[x][y] = temperature K
```

Only then:

```ts
const red = b15 - b13
const green = b13 - b11
const blue = b13
```

---

# 16. Ash RGB Implementation

Pseudo-code:

```ts
function ashRgb(
  b11: number,
  b13: number,
  b15: number,
) {
  const redDifference =
    b15 - b13

  const greenDifference =
    b13 - b11

  const r = normalize(
    redDifference,
    -4,
    2,
  )

  const g = normalize(
    greenDifference,
    -4,
    5,
  )

  const b = normalizeInverse(
    b13,
    208,
    243,
  )

  return {
    r: r * 255,
    g: g * 255,
    b: b * 255,
  }
}
```

Normalization:

```ts
function normalize(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    0,
    Math.min(
      1,
      (value - min) /
        (max - min),
    ),
  )
}
```

---

# 17. Wind Direction Processing

## Direction Conversion

```ts
function windToDirection(
  windFromDirectionDeg: number,
) {
  return (
    windFromDirectionDeg + 180
  ) % 360
}
```

Example:

```ts
const windFrom = 270
const windTo = windToDirection(windFrom)

// windTo = 90
```

---

## Compass Direction

```ts
function compassDirection(
  degrees: number,
) {
  const directions = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ]

  const index = Math.round(
    degrees / 45,
  ) % 8

  return directions[index]
}
```

Example:

```text
270° → W
90°  → E
45°  → NE
```

---

## Wind Warning Classification

```ts
function classifyWind(
  speedMs: number,
) {
  if (speedMs < 2) {
    return 'calm'
  }

  if (speedMs < 5) {
    return 'light'
  }

  if (speedMs < 10) {
    return 'moderate'
  }

  if (speedMs < 15) {
    return 'strong'
  }

  return 'very-strong'
}
```

This classification describes wind transport potential only. It does not describe eruption intensity.

---

## Wind Sector Geometry

The sector should be generated from:

```text
origin:
volcano latitude/longitude

center bearing:
windToDirectionDeg

width:
sectorWidthDeg

radius:
sectorRadiusKm
```

Example:

```ts
const sector = createDownwindSector({
  latitude: volcano.latitude,
  longitude: volcano.longitude,
  bearingDeg: windToDirectionDeg,
  widthDeg: 45,
  radiusKm: 100,
})
```

The geometry should be stored as GeoJSON or generated in the frontend.

Recommended initial approach:

```text
store wind metadata
generate sector GeoJSON in the frontend
```

This allows the user to change the sector radius or width without reprocessing satellite imagery.

---

# 18. Output Products

For each observation:

```text
observations/
└── semeru/
    └── 2026/
        └── 09/
            └── 06/
                └── 1320/
                    ├── ash.webp
                    ├── b11.webp
                    ├── b13.webp
                    ├── b15.webp
                    └── metadata.json
```

Wind data may be stored with the observation metadata:

```text
observations/
└── semeru/
    └── 2026/
        └── 09/
            └── 06/
                └── 1320/
                    ├── ash.webp
                    ├── b11.webp
                    ├── b13.webp
                    ├── b15.webp
                    ├── wind.json
                    └── metadata.json
```

Example metadata:

```json
{
  "volcano": "semeru",
  "observedAt": "2026-09-06T13:20:00Z",
  "processedAt": "2026-09-06T13:24:42Z",
  "satellite": "Himawari-9",
  "instrument": "AHI",
  "bands": [
    11,
    13,
    15
  ],
  "roiRadiusKm": 300,
  "wind": {
    "provider": "configured-provider",
    "observedAt": "2026-09-06T13:00:00Z",
    "level": "850hPa",
    "windSpeedMs": 8.2,
    "windFromDirectionDeg": 270,
    "windToDirectionDeg": 90,
    "windFromLabel": "W",
    "windToLabel": "E",
    "warningLevel": "moderate",
    "sectorWidthDeg": 45,
    "sectorRadiusKm": 100,
    "status": "available"
  }
}
```

---

# 19. Database Schema

## volcanoes

```text
id
name
latitude
longitude
elevation
roi_radius_km
default_wind_level
created_at
updated_at
```

---

## observations

```text
id
volcano_id

observed_at
processed_at

status

ash_rgb_url
band_11_url
band_13_url
band_15_url

source_objects

default_wind_level
wind_status
wind_observed_at
wind_provider
wind_model
wind_speed_ms
wind_from_direction_deg
wind_to_direction_deg
wind_from_label
wind_to_label
wind_warning_level
wind_sector_width_deg
wind_sector_radius_km

retry_count
failure_reason
wind_failure_reason

created_at
updated_at
```

Important index:

```sql
UNIQUE (
  volcano_id,
  observed_at
)
```

This prevents duplicate processing.

---

## Optional wind\_observations Table

If the application stores multiple pressure levels:

```text
wind_observations
-----------------
id
volcano_id
observation_id

observed_at
retrieved_at

level
pressure_hpa
approximate_altitude_km

wind_speed_ms
wind_from_direction_deg
wind_to_direction_deg

provider
model
model_run
status

created_at
updated_at
```

Important index:

```sql
UNIQUE (
  volcano_id,
  observed_at,
  level,
  provider
)
```

---

# 20. Hono API

Base:

```text
/api
```

---

## Volcanoes

```http
GET /api/volcanoes
```

```http
GET /api/volcanoes/:volcanoId
```

---

## Latest Observation

```http
GET /api/volcanoes/:volcanoId/observations/latest
```

Example:

```json
{
  "volcano": {
    "id": "semeru",
    "name": "Semeru",
    "latitude": -8.108,
    "longitude": 112.922
  },

  "observation": {
    "observedAt": "2026-09-06T13:20:00Z",
    "processedAt": "2026-09-06T13:24:42Z",

    "products": {
      "ashRgb": "https://...",
      "band11": "https://...",
      "band13": "https://...",
      "band15": "https://..."
    },

    "wind": {
      "observedAt": "2026-09-06T13:00:00Z",
      "level": "850hPa",
      "windSpeedMs": 8.2,
      "windFromDirectionDeg": 270,
      "windToDirectionDeg": 90,
      "windFromLabel": "W",
      "windToLabel": "E",
      "warningLevel": "moderate",
      "sectorWidthDeg": 45,
      "sectorRadiusKm": 100,
      "status": "available"
    }
  }
}
```

---

## Observation History

```http
GET /api/volcanoes/:volcanoId/observations
```

Parameters:

```text
from
to
limit
cursor
windLevel
```

Example:

```http
GET /api/volcanoes/semeru/observations?limit=12&windLevel=850hPa
```

---

## Specific Observation

```http
GET /api/observations/:observationId
```

---

## Wind Data

```http
GET /api/volcanoes/:volcanoId/wind
```

Parameters:

```text
level
from
to
```

Example:

```http
GET /api/volcanoes/semeru/wind?level=850hPa
```

---

## Wind Profile

```http
GET /api/volcanoes/:volcanoId/wind/profile
```

Example:

```json
{
  "volcanoId": "semeru",
  "observedAt": "2026-09-06T13:00:00Z",
  "levels": [
    {
      "level": "surface",
      "windSpeedMs": 3.1,
      "windFromDirectionDeg": 250,
      "windToDirectionDeg": 70,
      "windFromLabel": "WSW",
      "windToLabel": "ENE"
    },
    {
      "level": "850hPa",
      "windSpeedMs": 8.2,
      "windFromDirectionDeg": 270,
      "windToDirectionDeg": 90,
      "windFromLabel": "W",
      "windToLabel": "E"
    },
    {
      "level": "500hPa",
      "windSpeedMs": 14.4,
      "windFromDirectionDeg": 300,
      "windToDirectionDeg": 120,
      "windFromLabel": "NW",
      "windToLabel": "SE"
    }
  ]
}
```

---

## System Status

```http
GET /api/status
```

Example:

```json
{
  "latestSatelliteObservation":
    "2026-09-06T13:20:00Z",

  "latestProcessedObservation":
    "2026-09-06T13:20:00Z",

  "latestWindUpdate":
    "2026-09-06T13:00:00Z",

  "processorHealthy": true,

  "windServiceHealthy": true
}
```

---

# 21. Hono Route Structure

```ts
const app = new Hono()

app.route(
  '/api/volcanoes',
  volcanoRoutes,
)

app.route(
  '/api/observations',
  observationRoutes,
)

app.route(
  '/api/wind',
  windRoutes,
)

app.route(
  '/api/status',
  statusRoutes,
)

export default app
```

Example:

```ts
volcanoRoutes.get(
  '/:id/observations/latest',
  async (c) => {
    const volcanoId =
      c.req.param('id')

    const result =
      await observationService
        .getLatest(volcanoId)

    if (!result) {
      return c.json(
        {
          error:
            'Observation not found',
        },
        404,
      )
    }

    return c.json(result)
  },
)
```

Example wind route:

```ts
windRoutes.get(
  '/volcanoes/:id/wind',
  async (c) => {
    const volcanoId =
      c.req.param('id')

    const level =
      c.req.query('level') ??
      '850hPa'

    const result =
      await windService.getLatest(
        volcanoId,
        level,
      )

    if (!result) {
      return c.json(
        {
          error:
            'Wind data unavailable',
        },
        404,
      )
    }

    return c.json(result)
  },
)
```

---

# 22. Frontend Architecture

Main screen:

```text
┌─────────────────────────────────────────────────┐
│ Himawari Volcano Monitor                        │
├─────────────────────────────────────────────────┤
│ Volcano: [ Semeru ▼ ]                          │
│ Wind level: [ 850 hPa ▼ ]                      │
│                                                 │
│ Observation: 20:20 WIB                         │
│ Himawari-9 • AHI • Ash RGB                     │
├─────────────────────────────────────────────────┤
│                                                 │
│                  MAP                            │
│                                                 │
│                         ───────►                │
│                    ░░░░░░░░░░░                  │
│                ░░░░░░░░░░░░░░░                 │
│                     🌋                          │
│                  Semeru                        │
│                                                 │
├─────────────────────────────────────────────────┤
│ Indicative ash transport                       │
│ Wind from West at 8.2 m/s                      │
│ Ash transport toward East                     │
│ This is not an official ash forecast            │
├─────────────────────────────────────────────────┤
│ 19:30  19:40  19:50  20:00  20:10  20:20     │
│   ○      ○      ○      ○      ○      ●         │
│                                                 │
│             ◀  ▶ Play     1x 2x 4x             │
└─────────────────────────────────────────────────┘
```

---

# 23. Map Layers

MapLibre layers:

```text
Basemap
   │
   ├── administrative boundaries
   │
   ├── volcano markers
   │
   ├── wind direction arrows
   │
   ├── indicative downwind sectors
   │
   └── satellite raster
           │
           ├── Ash RGB
           ├── B11
           ├── B13
           └── B15
```

UI:

```text
Layers

[x] Ash RGB
[ ] B11
[ ] B13
[ ] B15
[x] Wind direction
[x] Indicative downwind area

Wind level
[ 850 hPa ▼ ]

Sector radius
────────●────

Opacity
────────●────
```

---

## Wind Arrow Styling

Recommended:

```text
arrow direction:
windToDirectionDeg

arrow origin:
volcano coordinates

arrow color:
blue or orange depending on design

arrow width:
scaled by wind speed

arrow opacity:
0.8–1.0

arrow label:
"Transport direction"
```

The arrow should point toward the direction of ash transport.

Do not use an arrow pointing toward the direction the wind comes from.

---

## Downwind Sector Styling

Recommended:

```text
fill color:
orange or yellow

fill opacity:
0.15–0.30

outline:
orange

sector width:
45° by default

sector radius:
100 km by default
```

The sector should be visually distinct from the Ash RGB layer.

---

# 24. Wind Warning Panel

The warning panel should always include:

```text
Wind data time
Wind level
Wind speed
Wind-from direction
Ash transport direction
Data provider
Disclaimer
```

Example:

```text
Indicative ash transport

Wind level:
850 hPa

Wind:
8.2 m/s from West

Transport direction:
East

Wind data:
20:00 WIB

Status:
Moderate transport potential

This indicator shows the direction ash may be
transported by the selected wind layer. It is not
an official ash-dispersion forecast.
```

If the wind direction changes significantly between levels:

```text
Vertical wind shear detected

Surface transport:
Toward Northeast

850 hPa transport:
Toward East

500 hPa transport:
Toward Southeast

Ash movement may vary with plume altitude.
```

This is a valuable warning because a single arrow can be misleading when wind direction changes with height.

---

# 25. Timeline Playback

The frontend retrieves observations:

```http
GET /api/volcanoes/semeru/observations?limit=12
```

which corresponds approximately to:

```text
2 hours of observations
```

at 10-minute intervals.

Playback:

```text
13:00
 ↓
13:10
 ↓
13:20
 ↓
13:30
 ↓
...
```

Controls:

```text
Play
Pause

Previous
Next

1x
2x
4x
```

During playback, update both:

```text
Ash RGB image
Wind arrow and downwind sector
```

The wind layer should use the wind data associated with the selected observation time, or the nearest valid wind data with a clearly displayed time difference.

If wind data is reused across multiple satellite frames, show:

```text
Wind data unchanged since:
20:00 WIB
```

---

# 26. Browser Near-Real-Time Updates

Initial MVP:

```text
Browser polling
```

Recommended:

```text
GET latest observation
every 60 seconds
```

Example:

```ts
setInterval(
  fetchLatestObservation,
  60_000,
)
```

There is no need for the browser to poll every second because the satellite Full Disk cadence is approximately 10 minutes.

Wind data may be refreshed separately:

```ts
setInterval(
  fetchLatestWind,
  15 * 60_000,
)
```

The frontend should avoid replacing the wind layer unnecessarily when the provider has not published new data.

---

# 27. Future Real-Time Push Option

Later replace browser polling with:

```text
Server-Sent Events
```

or:

```text
WebSocket
```

Flow:

```text
New observation READY
        │
        ▼
publish event
        │
        ▼
Hono / realtime service
        │
        ▼
browser
        │
        ▼
update Ash RGB
        │
        ▼
update wind indicator
```

For the initial release this complexity is unnecessary.

---

# 28. Caching Strategy

Processed images are immutable.

Therefore:

```text
/semeru/20260906/1320/ash.webp
```

never changes.

Use:

```http
Cache-Control:
public,
max-age=31536000,
immutable
```

For:

```http
GET /latest
```

use very short caching:

```text
30–60 seconds
```

For wind data:

```text
cache according to provider update frequency
```

Suggested initial cache:

```text
15 minutes
```

Wind data should include its own timestamp so users can distinguish:

```text
fresh wind data
```

from:

```text
cached wind data
```

---

# 29. Processing Deployment

Recommended initial production topology:

```text
                    Cloudflare
              ┌──────────────────┐
Browser ─────►│ Hono API         │
              │                  │
              │ D1               │
              │ R2               │
              └────────▲─────────┘
                       │
                       │ upload
                       │
              ┌────────┴─────────┐
              │ Processing Worker│
              │                  │
              │ Bun / Node       │
              │ Docker           │
              └────────▲─────────┘
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
     NOAA Himawari-9 S3    Wind Data Provider
```

---

# 30. Processing Worker Deployment Options

Suitable environments:

```text
VPS
Fly.io
Railway
Render
AWS EC2
AWS ECS
Google Cloud Run
GitHub Actions cron
```

For experimentation:

```text
local machine
```

is sufficient.

For stable near-real-time operation, use:

```text
persistent server
or
scheduled container
```

The worker should maintain separate health checks for:

```text
satellite ingestion
wind-data retrieval
image processing
database access
object storage access
```

---

# 31. Cron Processing

Example logic:

```text
*/5 * * * *
```

Every five minutes:

```bash
pnpm worker ingest:latest
```

Wind refresh may run separately:

```text
*/15 * * * *
```

or according to the provider's update schedule.

Worker:

```text
check expected timestamps
         │
         ▼
find unseen observation
         │
         ▼
download B11/B13/B15
         │
         ▼
process satellite data
         │
         ▼
retrieve current wind data
         │
         ▼
calculate wind-to direction
         │
         ▼
generate warning metadata
         │
         ▼
upload imagery
         │
         ▼
store metadata
         │
         ▼
mark READY
```

---

# 32. Idempotency

Critical rule:

```text
same volcano
+
same observation timestamp
=
same processing job
```

Use a unique key:

```text
semeru:2026-09-06T13:20:00Z
```

Before processing:

```ts
const existing =
  await observations.find(
    volcanoId,
    observedAt,
  )

if (existing?.status === 'ready') {
  return
}
```

Wind data should also be cached by:

```text
volcano
+
wind observation time
+
wind level
+
provider
```

This prevents unnecessary requests to the weather provider.

---

# 33. Retry Strategy

Example:

```text
attempt 1
immediate

attempt 2
+2 min

attempt 3
+5 min

attempt 4
+10 min
```

Failures may result from:

```text
upstream object not yet published

incomplete band availability

temporary network problem

decoder failure

storage failure

wind provider timeout

wind provider rate limit
```

Do not mark missing upstream data as permanently failed immediately.

If wind retrieval fails, continue processing the satellite image when possible:

```text
satellite status:
ready

wind status:
unavailable
```

---

# 34. Monitoring

Track:

```text
last successful ingestion

last processed observation

processing duration

number of failed jobs

upstream latency

image generation duration

last successful wind retrieval

wind provider latency

wind data age

number of stale wind responses
```

Useful derived metric:

```text
processing_latency =
processedAt -
observedAt
```

Example:

```text
Observation:
13:20 UTC

Available:
13:23 UTC

Processed:
13:24 UTC

Displayed:
13:24 UTC
```

Near-real-time latency:

```text
~4 minutes
```

The actual value will depend on upstream availability and infrastructure.

---

# 35. User-Facing Freshness Indicator

Always show:

```text
Observed at:
20:20 WIB

Processed at:
20:24 WIB

Data age:
4 min
```

For wind data, show separately:

```text
Wind data time:
20:00 WIB

Wind data age:
24 min
```

Potential status:

```text
● Current

● Delayed

● Stale
```

Suggested satellite logic:

```text
Current:
< 20 minutes old

Delayed:
20–60 minutes

Stale:
> 60 minutes
```

Suggested wind logic:

```text
Current:
within provider's expected update interval

Delayed:
more than one expected update interval old

Stale:
older than 3 hours
```

These should be application-level UX definitions, not scientific classifications.

---

# 36. Time Zones

Store timestamps internally as:

```text
UTC
```

Example:

```text
2026-09-06T13:20:00Z
```

Convert in the frontend to:

```text
Asia/Jakarta
```

Example:

```text
20:20 WIB
```

Do not store local Indonesian time as the canonical database timestamp.

Store separate timestamps for:

```text
satellite observation
satellite processing
wind observation or forecast
wind retrieval
```

---

# 37. MVP Scope

## Version 0.1

Required:

- Himawari-9 NOAA ingestion;
- B11 retrieval;
- B13 retrieval;
- B15 retrieval;
- image decoding;
- brightness-temperature conversion;
- JMA-compatible Ash RGB;
- one volcano;
- ROI cropping;
- WebP output;
- metadata storage;
- one wind provider;
- wind speed retrieval;
- wind direction retrieval;
- conversion from wind-from to wind-to direction;
- basic wind arrow;
- basic downwind sector;
- wind timestamp and disclaimer.

Target volcano:

```text
Semeru
```

Target wind level:

```text
850 hPa
```

---

## Version 0.2

Add:

- Hono REST API;
- Cloudflare D1;
- Cloudflare R2;
- React frontend;
- MapLibre;
- Semeru map;
- latest observation;
- historical observations;
- wind warning panel;
- wind-level selector;
- wind data freshness indicator.

---

## Version 0.3

Add:

- timeline;
- playback;
- automatic updates;
- freshness status;
- multiple volcanoes;
- multiple wind pressure levels;
- vertical wind profile;
- wind shear warning.

Target:

```text
Semeru
Merapi
Anak Krakatau
Lewotobi
Ibu
Dukono
Marapi
```

---

## Version 0.4

Add operational robustness:

- retry handling;
- health endpoint;
- processing monitoring;
- error reporting;
- upstream-delay handling;
- stale-data indication;
- wind-provider fallback;
- wind-data caching;
- provider rate-limit handling.

---

# 38. Future Extensions

After the monitoring application is stable, integrate:

```text
VAAC Darwin
```

for:

- volcanic ash advisories;
- ash cloud polygons;
- plume altitude;
- forecast movement.

Architecture:

```text
Himawari Ash RGB
        +
Wind direction
        +
VAAC polygon
        ↓
combined visualization
```

The official VAAC product should take precedence over the simple wind-direction indicator when both are available.

The UI should distinguish:

```text
Official advisory:
VAAC or authorized agency product

Indicative wind direction:
application-generated guidance
```

---

## PVMBG / MAGMA

Potential enrichment:

```text
eruption reports

volcano activity level

eruption timestamp

plume descriptions
```

Use as contextual metadata rather than satellite measurement.

---

## Smithsonian GVP

Potential enrichment:

```text
canonical volcano metadata

eruption history

volcano characteristics
```

---

# 39. Future Computer Vision Extension

Once enough observations are accumulated:

```text
Himawari Ash RGB
        +
VAAC labels
        +
wind fields
        ↓
dataset
        ↓
segmentation model
```

Potential models:

```text
U-Net
DeepLabV3+
SegFormer
```

Output:

```text
ash probability mask
```

Example:

```text
Himawari image

        ↓

SegFormer

        ↓

┌───────────────────┐
│                   │
│      █████        │
│    █████████      │
│       █████       │
│                   │
└───────────────────┘

Ash probability
```

This should remain a separate experimental component from the operational Ash RGB renderer.

Wind data may be used as an additional model feature, but it must not be treated as a substitute for labeled ash observations.

---

# 40. Scientific Limitations

Ash RGB is an interpretation product.

It must not be presented as:

```text
confirmed ash detection
```

unless additional validation is present.

The wind arrow and downwind sector must not be presented as:

```text
confirmed ash location
```

or:

```text
official ash forecast
```

Limitations include:

- high clouds may obscure ash;
- low-level ash can be difficult to identify;
- thin ash may not produce a strong spectral signal;
- surface temperature effects can cause ambiguity;
- meteorological clouds can produce similar visual characteristics;
- Ash RGB does not independently provide ash concentration;
- Ash RGB does not independently determine plume altitude;
- wind direction can change substantially with altitude;
- surface wind may not represent wind at plume height;
- wind forecasts and observations contain uncertainty;
- ash transport depends on plume height, particle size, eruption strength, precipitation, and atmospheric stability;
- the downwind sector is a simplified visualization, not a dispersion model;
- the arrow length does not represent the actual ash travel distance;
- a wind direction indicator cannot determine whether an eruption is occurring.

Recommended UI wording:

> Satellite-derived Ash RGB visualization based on Himawari-9 AHI infrared observations.

For wind:

> Indicative ash transport direction based on selected-level wind data.

For the sector:

> Indicative downwind area. This is not an official ash-dispersion forecast.

Avoid:

> Confirmed volcanic ash.

Avoid:

> Ash will move here.

Avoid:

> Safe area.

---

# 41. Attribution

The application should acknowledge:

```text
Satellite data:
Japan Meteorological Agency (JMA)

Distribution:
NOAA Open Data Dissemination
```

The wind-data provider must also be credited according to its terms.

When data is modified into derived imagery, make it clear that the displayed product is generated by the application and is not an official JMA product.

Example:

```text
Satellite data: JMA Himawari-9,
distributed via NOAA Open Data.

Wind data:
[Configured meteorological provider]

Ash RGB visualization and
wind-direction overlay generated
by Himawari Volcano Monitor.
```

---

# 42. Recommended Development Order

Do not start with the UI.

Recommended implementation sequence:

```text
1
Discover Himawari objects

↓

2
Download one B13 observation

↓

3
Decode B13

↓

4
Convert to brightness temperature

↓

5
Render grayscale B13

↓

6
Add B11

↓

7
Add B15

↓

8
Generate Ash RGB

↓

9
Implement geolocation

↓

10
Crop Semeru ROI

↓

11
Store WebP output

↓

12
Retrieve wind data for Semeru

↓

13
Convert wind-from direction to wind-to direction

↓

14
Render a wind arrow and downwind sector

↓

15
Store wind metadata

↓

16
Automate latest observation ingestion

↓

17
Add database metadata

↓

18
Build Hono API

↓

19
Build MapLibre frontend

↓

20
Add wind warning panel

↓

21
Add wind-level selector

↓

22
Add timeline playback

↓

23
Add multiple volcanoes

↓

24
Deploy continuous worker
```

---

# 43. First Engineering Milestone

The first important milestone should be entirely CLI-driven:

```bash
pnpm worker process \
  --volcano semeru \
  --time 2026-09-06T12:00:00Z \
  --wind-level 850hPa
```

Expected result:

```text
Downloading B11...
Downloading B13...
Downloading B15...

Decoding...

Calculating brightness temperature...

Cropping Semeru ROI...

Generating Ash RGB...

Retrieving wind data...

Wind from:
West at 8.2 m/s

Ash transport toward:
East

Generating wind warning metadata...

Done.

output/
└── semeru/
    └── 20260906T1200/
        ├── ash.webp
        ├── b11.webp
        ├── b13.webp
        ├── b15.webp
        ├── wind.json
        └── metadata.json
```

Only after this pipeline is scientifically and technically correct should web development become the priority.

---

# 44. Final Production Flow

```text
                HIMAWARI-9
                     │
              every ~10 min
                     │
                     ▼
             JMA observation
                     │
                     ▼
           NOAA Open Data S3
                     │
                     ▼
               Cron Worker
               every 5 min
                     │
                     ▼
             New observation?
                │         │
               no        yes
                │         │
                │         ▼
                │    B11/B13/B15
                │         │
                │         ▼
                │     Calibration
                │         │
                │         ▼
                │ Brightness Temperature
                │         │
                │         ▼
                │     Projection
                │         │
                │         ▼
                │     Volcano ROI
                │         │
                │         ▼
                │      Ash RGB
                │         │
                │         ├──────────────┐
                │         │              │
                │         ▼              ▼
                │      WebP       Retrieve wind data
                │                        │
                │                        ▼
                │                 Select wind level
                │                        │
                │                        ▼
                │                 Calculate wind-to
                │                        │
                │                        ▼
                │                 Generate warning
                │                        │
                │         ┌──────────────┘
                │         │
                │         ▼
                │     Cloudflare R2
                │         │
                │         ├─────► D1 metadata
                │         │
                │         ▼
                └────► Hono API
                          │
                          ▼
                     React Web
                          │
                          ▼
                       MapLibre
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
          Ash RGB              Wind arrow/sector
                          │
                          ▼
                  Timeline playback
```

---

# 45. Final Technology Selection

```text
Language
TypeScript

Runtime
Bun / Node.js

API
Hono

Frontend
React + Vite

Map
MapLibre GL JS

Validation
Zod

Database
Cloudflare D1

Object Storage
Cloudflare R2

Satellite Source
NOAA Himawari-9 Open Data

Satellite
JMA Himawari-9

Instrument
AHI

Bands
B11 + B13 + B15

Derived Product
Ash RGB

Wind Data
Configurable meteorological provider

Wind Variables
Wind speed
Wind-from direction
Wind-to transport direction
Pressure-level wind

Wind Visualization
Directional arrow
Indicative downwind sector
Wind warning panel

Worker
Bun / Node.js container

Scheduling
Cron every 5 minutes for satellite ingestion

Wind Refresh
Every 15–60 minutes or provider-dependent

Package Manager
pnpm

Repository
pnpm monorepo
```

---

# 46. Success Criteria for v1.0

The application can be considered v1.0 when it can reliably:

1. Detect new Himawari-9 Full Disk observations.
2. Process B11, B13 and B15 automatically.
3. Generate Ash RGB images.
4. Crop products around supported Indonesian volcanoes.
5. Retrieve wind speed and direction data.
6. Convert meteorological wind-from direction into ash transport direction.
7. Display a wind arrow pointing toward the indicative downwind direction.
8. Display a translucent indicative downwind sector.
9. Show the selected wind level and wind-data timestamp.
10. Warn users when wind data is stale or unavailable.
11. Publish observations without manual intervention.
12. Serve them through Hono.
13. Display them geographically using MapLibre.
14. Show observation, processing, and wind timestamps.
15. Animate multiple observations chronologically.
16. Update both Ash RGB and wind indicators during playback.
17. Gracefully communicate missing or delayed satellite observations.
18. Clearly distinguish indicative wind guidance from official ash forecasts.

The v1.0 definition should **not** require machine learning, VAAC integration, eruption prediction, official ash-dispersion modeling, or automated ash classification.

Those are subsequent research and product-development layers.
