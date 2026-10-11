import { createApp } from './app';
import { config } from './config/env';
import { connectDatabase } from './config/db';

async function bootstrap() {
  const app = createApp();

  // Connect to MongoDB Atlas if URI is provided
  await connectDatabase();

  const server = app.listen(config.port, config.host, () => {
    console.log(`[Server] Spendly API running on http://${config.host}:${config.port} (${config.nodeEnv})`);
    console.log(`[Server] Local health check: http://localhost:${config.port}/api/v1/health`);
  });

  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('[Server] Shutting down gracefully...');
    server.close(() => {
      console.log('[Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
