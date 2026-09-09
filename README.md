# Himawari Volcano Monitor

Local day-one MVP for monitoring five Indonesian volcanoes with live 850 hPa wind
guidance and historical Himawari-9 Ash RGB context.

## Run Locally

```bash
pnpm install
pnpm run dev
```

Open `http://localhost:5173`.

## Download Latest Himawari Input

```bash
pnpm himawari:latest
```

The command searches NOAA's public Himawari-9 S3 bucket for the newest complete
ten-minute Full Disk observation, then downloads the 30 compressed B11, B13, and B15
segments. Files are stored under `data/himawari/` and are intentionally gitignored.
Existing files with the expected byte size are reused on later runs.

This is a manual local command. It does not schedule itself or update the deployed
dashboard automatically. The downloaded `.DAT.bz2` files are raw inputs only; this
milestone does not decompress, decode, calibrate, or generate Ash RGB imagery.

## Verify

```bash
pnpm test
pnpm run typecheck
pnpm run build
```

## MVP Scope

The dashboard currently supports:

- Semeru
- Merapi
- Anak Krakatau
- Lewotobi Laki-laki
- Ibu

Each target can request live Open-Meteo wind data at 850 hPa. The app converts the
meteorological wind-from direction into an indicative transport-to direction, then
draws an arrow and bounded downwind sector on the map.

The Ash RGB frame is a historical visual reference from the CIMSS Himawari-9 Anak
Krakatau sequence. It is shown in the context panel and is intentionally not
georeferenced on the map because the source frame does not provide defensible corner
coordinates.

## Important Limitations

This is a visualization MVP, not an eruption detector, ash classifier, dispersion
model, or official hazard forecast. Wind guidance describes likely transport direction
at the selected pressure level only. NOAA acquisition is currently a manual local
workflow. Decoding, calibration, generated Ash RGB products, persistence, scheduling,
and deployment remain planned work.

## Data Attribution

- Satellite context: JMA Himawari-9 AHI, distributed via NOAA/CIMSS.
- Ash RGB processing context: Geo2Grid / UW-SSEC CIMSS.
- Wind data: Open-Meteo.
- Basemap: OpenStreetMap contributors.

The application-generated wind overlay is not an official JMA or meteorological agency
product.
