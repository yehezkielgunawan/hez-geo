import { representativeObservation } from './data/observation'
import { volcanoes } from './data/volcanoes'

export function Dashboard() {
  return (
    <main class="monitor-shell">
      <header class="masthead">
        <div class="brand-lockup">
          <span class="eyebrow">FIELD NOTE 01 / INDONESIA</span>
          <h1>Himawari <em>Volcano</em> Monitor</h1>
          <p>
            Infrared satellite context with indicative wind transport guidance.
          </p>
        </div>
        <div class="system-state" id="system-state" data-state="loading">
          <span class="state-dot" aria-hidden="true" />
          <span id="system-state-label">CONNECTING TO WIND SERVICE</span>
        </div>
      </header>

      <section class="monitor-grid" aria-label="Volcano monitoring workspace">
        <aside class="volcano-rail panel" aria-label="Volcano selector">
          <div class="panel-kicker">
            <span>ACTIVE TARGETS</span>
            <span>05</span>
          </div>
          <div class="volcano-list" id="volcano-list">
            {volcanoes.map((volcano, index) => (
              <button
                class={`volcano-button${index === 0 ? ' is-selected' : ''}`}
                type="button"
                data-volcano-id={volcano.id}
                aria-pressed={index === 0 ? 'true' : 'false'}
              >
                <span class="volcano-index">0{index + 1}</span>
                <span class="volcano-button-copy">
                  <strong>{volcano.name}</strong>
                  <small>
                    {volcano.latitude.toFixed(2)}° / {volcano.longitude.toFixed(2)}°
                  </small>
                </span>
                <span class="volcano-chevron" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
          <p class="rail-note">
            Five initial targets. The catalog can expand as the processing pipeline
            comes online.
          </p>
        </aside>

        <section class="map-panel panel" aria-label="Indonesia monitoring map">
          <div class="map-header">
            <div>
              <span class="eyebrow">LIVE METEOROLOGICAL GUIDANCE</span>
              <h2>Indonesia / 850 hPa flow</h2>
            </div>
            <div class="map-coordinate-readout" id="map-coordinate-readout">
              <span>SELECT A TARGET</span>
              <strong id="map-coordinate-value">--° / --°</strong>
            </div>
          </div>
          <div class="map-wrap">
            <div id="map" class="map" aria-label="Interactive map of Indonesian volcanoes" />
            <div class="map-loading" id="map-loading">INITIALIZING MAP SURFACE</div>
            <div class="map-legend" aria-label="Map legend">
              <span><i class="legend-volcano" /> volcano</span>
              <span><i class="legend-wind" /> transport direction</span>
              <span><i class="legend-sector" /> indicative area</span>
            </div>
            <div class="map-stamp">
              <span>HIMAWARI-9 / AHI</span>
              <span>MAP CONTEXT / NOT A FORECAST</span>
            </div>
          </div>
        </section>

        <aside class="details-column" aria-live="polite">
          <section class="details-card panel">
            <div class="detail-heading">
              <div>
                <span class="eyebrow">SELECTED VOLCANO</span>
                <h2 id="selected-volcano-name">Semeru</h2>
              </div>
              <span class="target-badge">TARGET</span>
            </div>
            <p class="location-line" id="selected-volcano-location">East Java / 3,676 m</p>
            <div class="wind-status" id="wind-status" data-state="loading">
              <span class="wind-status-label">WIND TRANSPORT</span>
              <strong id="wind-status-value">Loading current guidance</strong>
            </div>
            <div class="wind-metrics">
              <div class="metric">
                <span>WIND SPEED</span>
                <strong id="wind-speed">--</strong>
                <small>m/s @ 850 hPa</small>
              </div>
              <div class="metric">
                <span>FROM</span>
                <strong id="wind-from">--</strong>
                <small id="wind-from-degree">---°</small>
              </div>
              <div class="metric metric-accent">
                <span>TRANSPORT TO</span>
                <strong id="wind-to">--</strong>
                <small id="wind-to-degree">---°</small>
              </div>
            </div>
            <div class="wind-times">
              <div>
                <span>WIND DATA</span>
                <strong id="wind-observed-at">Waiting</strong>
              </div>
              <div>
                <span>RETRIEVED</span>
                <strong id="wind-retrieved-at">Waiting</strong>
              </div>
            </div>
            <div class="wind-error" id="wind-error" hidden>
              Wind information unavailable. The downwind indicator cannot be calculated
              for this target.
            </div>
            <p class="disclaimer">
              Indicative ash transport direction based on selected-level wind data. This
              is not an official ash forecast or confirmed ash location.
            </p>
          </section>

          <section class="sample-card panel">
            <div class="sample-heading">
              <div>
                <span class="eyebrow">SATELLITE CONTEXT</span>
                <h2>Historical Ash RGB sample</h2>
              </div>
              <span class="sample-badge">STATIC</span>
            </div>
            <div class="sample-image-wrap">
              <img
                id="ash-sample"
                src={representativeObservation.imageUrl}
                alt="Himawari-9 Ash RGB view of the Anak Krakatau eruption"
              />
              <span class="sample-image-label">ANAK KRAKATAU / 04 SEP 2026</span>
            </div>
            <label class="opacity-control" htmlFor="ash-opacity">
              <span>Sample visibility</span>
              <output id="ash-opacity-value" htmlFor="ash-opacity">82%</output>
              <input id="ash-opacity" type="range" min="0" max="100" value="82" />
            </label>
            <p class="sample-note">
              This historical frame is shown as visual context only. It is not
              georeferenced on the map and does not represent the selected target's
              current conditions.
            </p>
            <a
              class="source-link"
              href={representativeObservation.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              View source and method <span aria-hidden="true">↗</span>
            </a>
          </section>
        </aside>
      </section>

      <footer class="site-footer">
        <span>
          Satellite context: JMA Himawari-9 AHI / distributed via NOAA and CIMSS.
        </span>
        <span>Wind provider: Open-Meteo / 850 hPa forecast</span>
        <span>Local MVP / visualization only</span>
      </footer>
    </main>
  )
}
