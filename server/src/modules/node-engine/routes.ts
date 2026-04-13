import type { FastifyInstance } from 'fastify';
import { getPublicNodeDefinitions } from './registry.js';
import { requireAuth } from '../../middleware/auth.js';

export async function nodeEngineRoutes(app: FastifyInstance) {
  // Return all available node types with their metadata. Consumed by the
  // frontend to render the palette, inspector and custom nodes — meaning
  // adding/editing/removing a node server-side flows through to the UI
  // automatically.
  app.get('/api/v1/node-types', {
    schema: { tags: ['Node Types'] },
    preHandler: [requireAuth],
  }, async () => {
    return { items: getPublicNodeDefinitions() };
  });
}
