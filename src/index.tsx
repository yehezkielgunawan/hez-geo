import { Hono } from 'hono'
import { Dashboard } from './app'
import { renderer } from './renderer'
import { createApiRoutes } from './routes/api'
import type { WindProvider } from './services/open-meteo'

export function createApp(provider?: WindProvider) {
  const app = new Hono()

  app.route('/api', createApiRoutes(provider))
  app.use(renderer)

  app.get('/', (c) => c.render(<Dashboard />))

  return app
}

export default createApp()
