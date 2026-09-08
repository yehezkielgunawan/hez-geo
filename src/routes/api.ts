import { Hono } from 'hono'
import { representativeObservation } from '../data/observation'
import { findVolcano, volcanoes } from '../data/volcanoes'
import { createOpenMeteoProvider } from '../services/open-meteo'
import type { WindProvider } from '../services/open-meteo'

export function createApiRoutes(
  provider: WindProvider = createOpenMeteoProvider(),
) {
  const app = new Hono()

  app.get('/volcanoes', (c) => {
    return c.json({
      volcanoes,
      observation: representativeObservation,
    })
  })

  app.get('/volcanoes/:volcanoId/wind', async (c) => {
    const volcano = findVolcano(c.req.param('volcanoId'))
    if (!volcano) {
      return c.json({ error: 'Volcano not found' }, 404)
    }

    try {
      const wind = await provider(volcano)
      return c.json({ volcano, wind })
    } catch {
      return c.json(
        {
          error: 'Wind information unavailable',
          volcanoId: volcano.id,
        },
        503,
      )
    }
  })

  return app
}
