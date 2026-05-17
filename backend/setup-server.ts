import fastify from 'fastify';
import cors from '@fastify/cors';
import setupWizardRoutes from './src/routes/setup-wizard.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = fastify({
  logger: { level: 'info' }
});

await app.register(cors, {
  origin: true,
  credentials: true
});

await app.register(setupWizardRoutes, { prefix: '/api/setup-wizard' });

app.get('/api/health', async () => ({
  status: 'setup-mode',
  timestamp: new Date().toISOString()
}));

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`[Setup Server] Running on port ${PORT}`);
} catch (err) {
  console.error('[Fatal] Setup server failed:', err);
  process.exit(1);
}
