import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

// Docker-safe middleware
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.send(`🚀 Backend is working! Port: ${port}, Time: ${new Date().toISOString()}`);
});

app.get('/api/templates', (req, res) => {
  res.json({ 
    message: 'Templates endpoint working!', 
    templates: [],
    port: port,
    env: process.env.NODE_ENV || 'development'
  });
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
