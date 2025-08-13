import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
  ssl: process.env.DATABASE_USE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Templates API - now with real database query!
app.get('/api/templates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM templates ORDER BY id');
    res.json({ 
      templates: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${port}`);
  console.log(`🐳 Container ready with database!`);
});
