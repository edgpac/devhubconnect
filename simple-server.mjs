import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:atUkFxuogjjZODArPEnnbgUtSlZZswCe@ballast.proxy.rlwy.net:59419/railway',
  ssl: { rejectUnauthorized: false }
});

// Function to parse workflow details
function parseWorkflowDetails(workflowJson) {
  try {
    if (!workflowJson) return { steps: 0, apps: [] };
    
    const workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
    
    // Count nodes as steps
    const steps = workflow.nodes ? workflow.nodes.length : 0;
    
    // Extract app integrations from node types
    const apps = workflow.nodes ? 
      [...new Set(workflow.nodes
        .map(node => node.type?.replace('n8n-nodes-base.', '') || 'Unknown')
        .filter(type => type !== 'Unknown')
      )] : [];
    
    return { steps, apps };
  } catch (error) {
    console.error('Error parsing workflow:', error);
    return { steps: 0, apps: [] };
  }
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/templates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM templates ORDER BY id');
    
    // Add parsed workflow details to each template
    const templatesWithDetails = result.rows.map(template => {
      const workflowDetails = parseWorkflowDetails(template.workflow_json);
      return {
        ...template,
        workflowDetails
      };
    });
    
    res.json({ 
      templates: templatesWithDetails,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

app.get('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [parseInt(id)]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    const workflowDetails = parseWorkflowDetails(template.workflow_json);
    
    res.json({ 
      template: {
        ...template,
        workflowDetails
      },
      ...template,
      workflowDetails
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

app.get('/api/template/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [parseInt(id)]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    const workflowDetails = parseWorkflowDetails(template.workflow_json);
    
    res.json({ 
      template: {
        ...template,
        workflowDetails
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${port}`);
});
