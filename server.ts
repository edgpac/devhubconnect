import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { withRLSContext, extractUserContext, DatabaseContext } from './db'; // Import your RLS-ready db
import { schema } from './schema'; // ADD THIS: Import your database schema
import { eq } from 'drizzle-orm'; // ADD THIS: Import eq function for database queries
import jwt from 'jsonwebtoken';

const app = express();
const port = process.env.PORT || 3000;

// ✅ Security middleware
app.use(helmet()); // Security headers

// ✅ Restrict CORS to your frontend domain
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Rate limiting
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each user to 10 AI requests per windowMs
  message: { error: 'Too many AI requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ Authentication middleware
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    tenantId?: string;
    roles?: string[];
  };
  userId?: string;
  tenantId?: string;
}

const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // ✅ Verify user exists in database with RLS context
    const userContext: DatabaseContext = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      roles: decoded.roles || []
    };

    // Query user from database to ensure they're still active
    const user = await withRLSContext(userContext, async (db) => {
      return db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, decoded.userId),
        columns: { id: true, email: true, tenantId: true, isActive: true }
      });
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    // Set user context for RLS
    req.user = {
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      roles: decoded.roles || []
    };
    req.userId = user.id;
    req.tenantId = user.tenantId;

    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ✅ ADD THIS: Auth verification endpoint
app.get('/api/auth/verify', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // If we get here, the authenticateToken middleware passed
    // which means the token is valid
    res.json({ 
      valid: true, 
      user: {
        id: req.user?.id,
        email: req.user?.email,
        tenantId: req.user?.tenantId,
        roles: req.user?.roles
      }
    });
  } catch (error) {
    console.error('Error verifying auth:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ✅ Template Routes
// Get all templates
app.get('/api/templates', async (req: Request, res: Response) => {
  try {
    // This could be public or require auth depending on your needs
    const templates = await withRLSContext({ userId: 'public', tenantId: 'public', roles: [] }, async (db) => {
      return db.query.templates.findMany({
        columns: { id: true, name: true, description: true, price: true, imageUrl: true, createdAt: true }
      });
    });

    res.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates.' });
  }
});

// Get single template
app.get('/api/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const template = await withRLSContext({ userId: 'public', tenantId: 'public', roles: [] }, async (db) => {
      return db.query.templates.findFirst({
        where: (templates, { eq }) => eq(templates.id, id)
      });
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template.' });
  }
});

// Update template
app.patch('/api/templates/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, price, imageUrl, workflowJson } = req.body;
    
    const userContext = extractUserContext(req);

    const updatedTemplate = await withRLSContext(userContext, async (db) => {
      return db.update(schema.templates)
        .set({
          name,
          description,
          price: Math.round(price * 100), // Convert to cents
          imageUrl,
          workflow_json: workflowJson,
          updatedAt: new Date()
        })
        .where(eq(schema.templates.id, id))
        .returning();
    });

    if (!updatedTemplate.length) {
      return res.status(404).json({ error: 'Template not found or access denied' });
    }

    res.json({ template: updatedTemplate[0] });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template.' });
  }
});

// Delete template
app.delete('/api/templates/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const userContext = extractUserContext(req);

    const deletedTemplate = await withRLSContext(userContext, async (db) => {
      return db.delete(schema.templates)
        .where(eq(schema.templates.id, id))
        .returning();
    });

    if (!deletedTemplate.length) {
      return res.status(404).json({ error: 'Template not found or access denied' });
    }

    res.json({ message: 'Template deleted successfully', template: deletedTemplate[0] });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template.' });
  }
});

// ✅ RLS-protected AI endpoint
app.post('/api/ask-ai', aiLimiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { prompt, jsonFileId } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  if (!jsonFileId) {
    return res.status(400).json({ error: 'JSON file ID is required.' });
  }

  try {
    // ✅ Get user context for RLS
    const userContext = extractUserContext(req);

    // ✅ Verify user has access to this JSON file with RLS
    const jsonFile = await withRLSContext(userContext, async (db) => {
      return db.query.userFiles.findFirst({
        where: (files, { eq, and }) => and(
          eq(files.id, jsonFileId),
          eq(files.userId, req.userId!) // RLS ensures user can only access their files
        ),
        columns: { id: true, filename: true, content: true }
      });
    });

    if (!jsonFile) {
      return res.status(404).json({ error: 'JSON file not found or access denied.' });
    }

    // ✅ Log the AI request with RLS context
    await withRLSContext(userContext, async (db) => {
      return db.insert(schema.aiRequests).values({
        userId: req.userId!,
        tenantId: req.tenantId,
        prompt: prompt.substring(0, 500), // Truncate for logging
        fileId: jsonFileId,
        createdAt: new Date()
      });
    });

    // ✅ Make AI request with user context
    const ollamaResponse = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3:instruct',
        stream: false,
        messages: [
          {
            role: 'system',
            content: `You are the AI assistant for DevHubConnect.com for user ${req.user?.email}.
You are helping with their uploaded JSON file: "${jsonFile.filename}".

File content: ${jsonFile.content}

Answer questions strictly about this JSON file's deployment or installation within DevHubConnect.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.error(`Ollama API error: Status ${ollamaResponse.status}, Response: ${errorText}`);
      return res.status(ollamaResponse.status).json({ error: `AI service error: ${errorText}` });
    }

    const data = await ollamaResponse.json() as { message?: { content: string }, response?: string };
    const aiResponse = data.message?.content ? data.message.content.trim() : 'No response received from AI model.';

    // ✅ Log the successful response
    await withRLSContext(userContext, async (db) => {
      return db.insert(schema.aiResponses).values({
        userId: req.userId!,
        tenantId: req.tenantId,
        requestId: req.body.requestId, // If you want to track request/response pairs
        response: aiResponse.substring(0, 1000), // Truncate for storage
        createdAt: new Date()
      });
    });

    res.json({ response: aiResponse });

  } catch (error) {
    console.error('Error in AI request:', error);
    res.status(500).json({ error: 'Failed to process AI request.' });
  }
});

// ✅ Health check endpoint (no auth required)
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ✅ User's files endpoint with RLS
app.get('/api/user/files', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userContext = extractUserContext(req);
    
    const files = await withRLSContext(userContext, async (db) => {
      return db.query.userFiles.findMany({
        where: (files, { eq }) => eq(files.userId, req.userId!),
        columns: { id: true, filename: true, createdAt: true, updatedAt: true }
      });
    });

    res.json({ files });
  } catch (error) {
    console.error('Error fetching user files:', error);
    res.status(500).json({ error: 'Failed to fetch files.' });
  }
});

// ✅ Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ✅ 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(port, () => {
  console.log(`✅ RLS-Secure DevHubConnect server running at http://localhost:${port}`);
});

export default app;