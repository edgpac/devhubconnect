import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Docker-safe middleware
app.use(express.json({ limit: '10mb' }));

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// API endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/templates', (req, res) => {
  res.json({ 
    message: 'Templates endpoint working!', 
    templates: [],
    port: port,
    env: process.env.NODE_ENV || 'development'
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Docker-safe server binding
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${port}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🐳 Container ready!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});
