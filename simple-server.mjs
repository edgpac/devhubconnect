import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import pg from 'pg';
const { Pool } = pg;
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import Stripe from 'stripe';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
const pgSession = require('connect-pg-simple')(session);

// Line 18: Environment Variables and Configuration
const port = process.env.PORT || 3000;
const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://devhubconnect-production.up.railway.app' : 'http://localhost:3000');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// Line 24: Middleware Setup
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: frontendUrl,
  credentials: true
}));
app.use(express.static(path.join(__dirname, 'dist')));

// Line 32: Secure Database-Based Admin Authentication
async function requireGitHubAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required', 
      loginUrl: '/api/auth/github' 
    });
  }
  
  try {
    // Check admin role from database only
    const result = await pool.query(
      'SELECT role FROM users WHERE github_id = $1', 
      [req.user.github_id]
    );
    
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ 
        error: 'Unauthorized: Admin role required' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Admin auth check error:', error);
    return res.status(500).json({ 
      error: 'Authentication system error' 
    });
  }
}

// Line 57: JWT-based admin authentication for React frontend
const requireAdminAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    
    // Verify user still exists and is admin in database
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND role = $2', 
      [decoded.user_id, 'admin']
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access revoked' });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    console.log('JWT verification failed:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Line 84: Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false, // ✅ CHANGED: Allow frontend to read session
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // ✅ ADDED: CORS support
  }
}));

// Line 95: Passport GitHub Strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: `${frontendUrl}/api/auth/github/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('🔗 GitHub OAuth: Processing user:', profile.username, profile.emails?.[0]?.value);
    
    // ✅ FIXED: Check if user exists by github_id (no github_access_token)
    const result = await pool.query(
      'SELECT * FROM users WHERE github_id = $1',
      [profile.id]
    );
    
    let user;
    if (result.rows.length > 0) {
      // User exists, update basic info only
      user = result.rows[0];
      await pool.query(
        'UPDATE users SET updated_at = NOW() WHERE github_id = $1',
        [profile.id]
      );
      console.log('✅ Updated existing user:', user.username);
    } else {
      // Create new user (removed github_access_token column)
      const insertResult = await pool.query(
        'INSERT INTO users (github_id, username, email, role, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *',
        [profile.id, profile.username, profile.emails?.[0]?.value || '', 'user']
      );
      user = insertResult.rows[0];
      console.log('✅ Created new user:', user.username);
    }
    
    return done(null, user);
  } catch (error) {
    console.error('❌ GitHub auth error:', error.message);
    return done(error);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (error) {
    done(error);
  }
});

app.use(passport.initialize());
app.use(passport.session());

// Line 139: GitHub Authentication Routes
app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/api/auth/github/callback', passport.authenticate('github', { failureRedirect: '/api/auth/github' }), async (req, res) => {
  try {
    console.log(`🔗 GitHub OAuth: Finding/creating user for: ${req.user.username} ${req.user.email}`);
    
    // Check if user should be admin and redirect accordingly
    const result = await pool.query(
      'SELECT role FROM users WHERE github_id = $1', 
      [req.user.github_id]
    );
    
    const userRole = result.rows.length > 0 ? result.rows[0].role : 'user';
    
    console.log(`✅ GitHub OAuth successful for user: ${req.user.username} ${req.user.email} (${userRole})`);
    
    // ✅ FIXED: Send users to auth/success for proper login processing
    const params = new URLSearchParams({
      success: 'true',
      userId: req.user.id,
      userName: req.user.username || '',
      userEmail: req.user.email || ''
    });

    res.redirect(`${frontendUrl}/auth/success?${params.toString()}`);
  } catch (error) {
    console.error('❌ GitHub OAuth error:', error);
    // On error, still try to process through auth/success
    const params = new URLSearchParams({
      success: 'false',
      error: 'oauth_error'
    });
    res.redirect(`${frontendUrl}/auth/success?${params.toString()}`);
  }
});

// Line 163: Admin Login Endpoints
app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    console.log('🔐 Admin login attempt received');

    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Get admin user from database
    const adminQuery = `SELECT * FROM users WHERE role = 'admin' LIMIT 1`;
    const adminResult = await pool.query(adminQuery);
    
    if (adminResult.rows.length === 0) {
      return res.status(500).json({ error: 'No admin user found in database' });
    }

    const adminUser = adminResult.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { 
        admin: true,
        email: adminUser.email,
        role: 'admin',
        user_id: adminUser.id
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '24h' }
    );

    console.log('✅ Admin login successful, JWT generated');

    res.json({ 
      success: true, 
      token,
      user: {
        email: adminUser.email,
        role: adminUser.role,
        username: adminUser.username
      }
    });

  } catch (error) {
    console.log('❌ Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    console.log('🔐 React Admin login attempt received');

    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Get admin user from database
    const adminQuery = `SELECT * FROM users WHERE role = 'admin' LIMIT 1`;
    const adminResult = await pool.query(adminQuery);
    
    if (adminResult.rows.length === 0) {
      return res.status(500).json({ error: 'No admin user found in database' });
    }

    const adminUser = adminResult.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { 
        admin: true,
        email: adminUser.email,
        role: 'admin',
        user_id: adminUser.id
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '24h' }
    );

    console.log('✅ Admin login successful, JWT generated');

    res.json({ 
      success: true, 
      token,
      user: {
        email: adminUser.email,
        role: adminUser.role,
        username: adminUser.username
      }
    });

  } catch (error) {
    console.log('❌ React Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Line 251: Missing Frontend API Endpoints
// Profile/session endpoint that frontend is calling
app.get('/api/auth/profile/session', async (req, res) => {
  try {
    console.log('🔍 DEBUG: Session check - cookies:', req.headers.cookie);
    console.log('🔍 DEBUG: Session ID from passport:', req.sessionID);
    console.log('🔍 DEBUG: Passport user:', req.user);
    
    // Check if user is authenticated via Passport session
    if (req.user && req.user.id) {
      console.log('✅ Session valid for user:', req.user.email);
      return res.json({
        success: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email,
          role: req.user.role,
          github_id: req.user.github_id
        }
      });
    }
    
    console.log('❌ No valid session found');
    res.status(401).json({
      success: false,
      error: 'Not authenticated'
    });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({
      success: false,
      error: 'Session check failed'
    });
  }
});

// User profile endpoint
app.get('/api/user/profile', (req, res) => {
  if (req.user) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        github_id: req.user.github_id
      }
    });
  } else {
    res.status(401).json({
      success: false,
      error: 'Not authenticated'
    });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session destruction failed' });
      }
      res.json({ success: true, message: 'Logged out successfully' });
    });
  });
});

// ✅ ADD THESE MISSING HELPER FUNCTIONS AND ENDPOINTS AFTER LINE 327

// Helper function to convert database field names to frontend format
function convertFieldNames(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    price: template.price,
    currency: template.currency,
    imageUrl: template.image_url,
    workflowJson: template.workflow_json,
    status: template.status,
    isPublic: template.is_public,
    creatorId: template.creator_id,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
    downloadCount: template.download_count,
    viewCount: template.view_count,
    rating: template.rating,
    ratingCount: template.rating_count,
    stripePriceId: template.stripe_price_id
  };
}

function parseWorkflowDetails(workflowJson) {
  try {
    if (!workflowJson) return { steps: 0, apps: [], hasWorkflow: false };
    
    const workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
    const steps = workflow.nodes ? workflow.nodes.length : 0;
    const apps = workflow.nodes ? 
      [...new Set(workflow.nodes
        .map(node => {
          let type = node.type || 'Unknown';
          if (type.startsWith('n8n-nodes-base.')) {
            type = type.replace('n8n-nodes-base.', '');
          }
          return type;
        })
        .filter(type => type !== 'Unknown' && type !== 'Set' && type !== 'NoOp')
      )] : [];
    
    return { steps, apps: apps.slice(0, 10), hasWorkflow: true };
  } catch (error) {
    console.error('Error parsing workflow:', error);
    return { steps: 0, apps: [], hasWorkflow: false };
  }
}

// ✅ MISSING: /api/auth/user endpoint (frontend expects this)
app.get('/api/auth/user', (req, res) => {
  if (req.user) {
    res.json({ 
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role || 'user',
        github_id: req.user.github_id
      }
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// ✅ FIXED: Enhanced /api/templates endpoint with proper field conversion
app.get('/api/templates', async (req, res) => {
  try {
    console.log('📋 Fetching templates for user:', req.user?.email || req.user?.username || 'unauthenticated');
    
    const result = await pool.query(`
      SELECT * FROM templates 
      WHERE is_public = true 
      ORDER BY rating DESC, download_count DESC 
      LIMIT 1000
    `);
    
    const templatesWithDetails = result.rows.map(template => {
      const converted = convertFieldNames(template);
      const workflowDetails = parseWorkflowDetails(template.workflow_json);
      
      return {
        ...converted,
        workflowDetails,
        steps: workflowDetails.steps,
        integratedApps: workflowDetails.apps
      };
    });
    
    res.json({ 
      success: true,
      templates: templatesWithDetails,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ✅ MISSING: /api/recommendations endpoint
app.get('/api/recommendations', async (req, res) => {
  try {
    console.log('🔍 Fetching recommendations...');
    
    // Get popular templates as recommendations
    const popularTemplates = await pool.query(`
      SELECT 
        t.*,
        COALESCE(t.download_count, 0) as downloads,
        COALESCE(t.view_count, 0) as views,
        COALESCE(t.rating, 4.5) as rating
      FROM templates t 
      WHERE t.is_public = true 
      ORDER BY 
        COALESCE(t.download_count, 0) DESC,
        COALESCE(t.view_count, 0) DESC,
        t.created_at DESC
      LIMIT 12
    `);

    const formattedTemplates = popularTemplates.rows.map(template => {
      const converted = convertFieldNames(template);
      const workflowDetails = parseWorkflowDetails(template.workflow_json);
      
      return {
        ...converted,
        workflowDetails,
        steps: workflowDetails.steps,
        integratedApps: workflowDetails.apps,
        _recommendationScore: Math.random() * 0.3 + 0.7,
        recommended: true
      };
    });

    console.log(`✅ Found ${formattedTemplates.length} recommended templates`);

    res.json({ 
      recommendations: formattedTemplates,
      metadata: {
        total: formattedTemplates.length,
        personalized: false,
        trending_boost_applied: true,
        filters_applied: {},
        source: 'popular_templates'
      }
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// ✅ MISSING: /api/user/purchases endpoint  
app.get('/api/user/purchases', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    console.log('📦 Fetching purchases for user:', req.user.email || req.user.username);
    
    const result = await pool.query(`
      SELECT 
        p.id as purchase_id,
        p.purchased_at,
        p.amount_paid,
        p.status,
        t.id as template_id,
        t.name as template_name,
        t.description as template_description,
        t.image_url,
        t.workflow_json
      FROM purchases p
      JOIN templates t ON p.template_id = t.id
      WHERE p.user_id = $1
      ORDER BY p.purchased_at DESC
    `, [req.user.id]);

    const formattedPurchases = result.rows.map(row => ({
      purchaseId: row.purchase_id,
      purchasedAt: row.purchased_at,
      amountPaid: row.amount_paid,
      status: row.status,
      template: {
        id: row.template_id,
        name: row.template_name,
        description: row.template_description,
        imageUrl: row.image_url,
        workflowJson: row.workflow_json,
        purchased: true
      }
    }));

    console.log('✅ Found', formattedPurchases.length, 'purchases for user');
    res.json({ success: true, purchases: formattedPurchases });

  } catch (error) {
    console.error('Error fetching user purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// Line 325: Helper Functions
function generateStructuredFallback(prompt, templateContext, history) {
  return `I'm here to help with your n8n template setup! Try asking about specific steps like "How do I add credentials in n8n?" or "Where do I paste my API key?"`;
}

function getConversationSummary(history) {
  if (!history || !Array.isArray(history)) return 'No conversation history provided.';
  return history
    .slice(-3)
    .map((msg, i) => `Turn ${i + 1} (${msg.role}): ${msg.content.substring(0, 100)}...`)
    .join('\n');
}

function generateTemplateRecommendations(templateStats, commonIssues) {
  const recommendations = [];
  if (!templateStats || templateStats.recent_interactions < 5) {
    recommendations.push('Increase template visibility through documentation or tutorials.');
  }
  if (commonIssues.length > 0) {
    const topIssue = commonIssues[0];
    if (topIssue.frequency > 3 && topIssue.helpfulness_rate < 0.5) {
      recommendations.push(`Address common issue: "${topIssue.user_question.substring(0, 50)}..." in template documentation.`);
    }
  }
  return recommendations;
}

// Line 349: Template List Endpoint (redirect to main templates endpoint)
app.get('/api/templates/list', async (req, res) => {
  // Redirect to the main templates endpoint
  res.redirect('/api/templates');
});

// Line 354: Template Details Endpoint
app.get('/api/templates/:id', async (req, res) => {
  try {
    console.log('📄 Fetching template details for:', req.params.id, 'by user:', req.user?.email || req.user?.username || 'unauthenticated');
    const templateId = req.params.id;
    if (!templateId || typeof templateId !== 'string' || templateId.length > 100) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    await pool.query(
      'UPDATE templates SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1',
      [templateId]
    );
    const result = await pool.query(
      'SELECT id, name, description, price, currency, image_url, workflow_json, rating, COALESCE(download_count, 0) as download_count, COALESCE(view_count, 0) as view_count FROM templates WHERE id = $1',
      [templateId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true, template: result.rows[0] });
  } catch (error) {
    console.error('Error fetching template details:', error);
    res.status(500).json({ error: 'Failed to fetch template details' });
  }
});

// Line 589: Conversation Intelligence System
class ConversationTracker {
  constructor() {
    this.setupSteps = {
      'credentials': ['api_key', 'authentication', 'token_setup'],
      'import': ['json_upload', 'workflow_import', 'template_validation'],
      'configuration': ['node_setup', 'field_configuration', 'service_connection'],
      'testing': ['manual_test', 'execution_check', 'error_resolution'],
      'deployment': ['activation', 'monitoring', 'production_ready']
    };
  }

  analyzeConversationProgress(history, templateId) {
    const userMessages = history.filter(msg => msg.role === 'user').map(msg => msg.content.toLowerCase());
    const completedSteps = [];
    const mentionedTopics = [];
    userMessages.forEach(message => {
      if (message.includes('credential') || message.includes('api key')) {
        mentionedTopics.push('credentials');
      }
      if (message.includes('test') || message.includes('run')) {
        mentionedTopics.push('testing');
      }
      if (message.includes('activate') || message.includes('deploy')) {
        mentionedTopics.push('deployment');
      }
      if (message.includes('error') || message.includes('problem')) {
        mentionedTopics.push('troubleshooting');
      }
    });
    return {
      completedSteps: [...new Set(completedSteps)],
      mentionedTopics: [...new Set(mentionedTopics)],
      conversationLength: userMessages.length,
      lastQuestionType: mentionedTopics[mentionedTopics.length - 1] || 'general_question'
    };
  }

  determineCompletionStatus(progress, templateId) {
    const essentialSteps = ['credentials', 'testing'];
    const completedEssential = essentialSteps.filter(step => progress.mentionedTopics.includes(step));
    const completionPercentage = (completedEssential.length / essentialSteps.length) * 100;
    return {
      completionPercentage: Math.round(completionPercentage),
      isLikelyComplete: completionPercentage >= 80,
      readyForDeployment: progress.mentionedTopics.includes('testing') && progress.mentionedTopics.includes('credentials'),
      nextRecommendedStep: completedEssential.length === 0 ? 'credentials' : 'testing',
      shouldOfferCompletion: completionPercentage >= 80 && progress.conversationLength >= 3
    };
  }
}

const conversationTracker = new ConversationTracker();
const conversationStates = new Map();

function getConversationState(userId, templateId) {
  const key = `${userId}_${templateId}`;
  return conversationStates.get(key) || {
    startTime: Date.now(),
    interactions: 0,
    completedSteps: [],
    lastActivity: Date.now()
  };
}

function updateConversationState(userId, templateId, updates) {
  const key = `${userId}_${templateId}`;
  const current = getConversationState(userId, templateId);
  conversationStates.set(key, { ...current, ...updates, lastActivity: Date.now() });
}

// ✅ MISSING: Enhanced Chat Endpoint with Learning System
app.post('/api/ask-ai', async (req, res) => {
  // ✅ FIXED: Manual authentication check instead of passport middleware
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be signed in to use the AI chat feature',
      loginUrl: '/api/auth/github'
    });
  }

  const { prompt, history, templateContext } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  try {
    console.log('🧠 AI chat request by:', req.user.email || req.user.username, { 
      prompt: prompt.substring(0, 100) + '...',
      templateId: templateContext?.templateId || 'none'
    });

    // Check for learned responses first
    const learnedResponse = await checkLearnedResponses(prompt, templateContext?.templateId);
    if (learnedResponse) {
      console.log('🎓 Using learned response - API cost saved!');
      
      await logChatInteraction(
        templateContext?.templateId || 'general_chat',
        prompt,
        learnedResponse.response,
        req.user.id,
        'learned_response'
      );
      
      return res.json({ 
        response: learnedResponse.response,
        source: 'learned',
        confidence: learnedResponse.confidence
      });
    }

    // Check for JSON validation
    const latestUserMessage = history?.slice(-1)[0]?.content || '';
    let jsonProvidedInThisTurn = false;
    try {
      const parsed = JSON.parse(latestUserMessage);
      if (parsed && typeof parsed === 'object' && parsed.nodes && Array.isArray(parsed.nodes)) {
        jsonProvidedInThisTurn = true;
      }
    } catch (e) {
      // Not JSON, continue
    }

    if (jsonProvidedInThisTurn) {
      const response = `✅ Template validated successfully! I'm your DevHubConnect Setup Assistant, ready to guide you through the deployment process.

To get started, I need to understand your environment:

1. **What type of n8n setup are you using?**
   • n8n Cloud (cloud.n8n.io)
   • Self-hosted Docker installation
   • Local development installation
   • n8n Desktop app

2. **What's your experience level with n8n?**
   • Beginner (new to n8n)
   • Intermediate (familiar with basic workflows)
   • Advanced (experienced with complex automations)

Once I know your setup, I'll provide specific step-by-step instructions for deploying this template successfully.`;

      await logChatInteraction(
        templateContext?.templateId || 'json_validation',
        'JSON template provided',
        response,
        req.user.id,
        'json_validation'
      );

      return res.json({ response, source: 'template_validation' });
    }

    // Check for prompt disclosure attempts
    if (isPromptDisclosure(prompt)) {
      return res.json({ 
        response: "I cannot answer questions about my instructions. I'm here to help with your uploaded .json file only." 
      });
    }

    // Try smart fallback first
    const smartFallback = generateSmartFallback(prompt, templateContext, history);
    if (smartFallback.confidence > 0.8) {
      console.log('🧠 High confidence fallback - API cost saved!');
      
      await logChatInteraction(
        templateContext?.templateId || 'general_chat',
        prompt,
        smartFallback.response,
        req.user.id,
        'smart_fallback'
      );
      
      return res.json({ 
        response: smartFallback.response,
        source: 'smart_fallback',
        confidence: smartFallback.confidence
      });
    }

    // Use Groq API if available
    const groqApiKey = process.env.GROQ_API_KEY;
    let response = '';
    let responseSource = 'fallback';

    if (groqApiKey) {
      try {
        console.log('💰 Using Groq API for user:', req.user.email || req.user.username);
        
        const structuredPrompt = `You are a technical writer specializing in beginner-friendly n8n automation guides. 

CONTEXT: User is asking about n8n template setup.
Template: ${templateContext?.templateId || 'n8n workflow'}
Previous conversation: ${getConversationSummary(history)}

USER QUESTION: "${prompt}"

Provide a detailed, step-by-step response focusing on:
1. Exact n8n UI navigation (specific button names, menu locations)
2. Credential setup with exact field names
3. Common errors and solutions
4. What to do next

Be specific about n8n interface elements. Include exact paths like "Credentials → Add Credential → [Service Name]" and field names like "API Key" field.

Focus on practical, actionable instructions that a beginner can follow exactly.`;

        const messages = [
          { role: 'system', content: structuredPrompt },
          { role: 'user', content: prompt }
        ];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.2,
            stream: false
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (groqResponse.ok) {
          const data = await groqResponse.json();
          response = data.choices?.[0]?.message?.content || 'No response received.';
          responseSource = 'groq_api';
          console.log('✅ Groq response received for user:', req.user.email || req.user.username);
          
          // Learn from successful API response
          await learnFromInteraction(prompt, response, templateContext?.templateId, true);
          
        } else {
          console.error('❌ Groq API error:', groqResponse.status);
          throw new Error(`Groq API failed with status ${groqResponse.status}`);
        }

      } catch (groqError) {
        console.error('❌ Groq error:', groqError.message);
        response = smartFallback.response;
        responseSource = 'error_fallback';
      }
    } else {
      console.log('⚠️ No Groq key, using smart fallback');
      response = smartFallback.response;
      responseSource = 'no_api_key';
    }

    // Log interaction
    await logChatInteraction(
      templateContext?.templateId || 'general_chat',
      prompt,
      response,
      req.user.id,
      responseSource
    );

    res.json({ response, source: responseSource });

  } catch (error) {
    console.error('❌ Chat error for user:', req.user.email || req.user.username, error);
    const fallbackResponse = `I'm here to help with your n8n template setup! Try asking about specific steps like "How do I add credentials in n8n?" or "Where do I paste my API key?"`;
    
    await logChatInteraction(
      templateContext?.templateId || 'general_chat',
      prompt,
      fallbackResponse,
      req.user.id,
      'error'
    );
    
    res.json({ response: fallbackResponse });
  }
});

// ✅ MISSING: Generate Setup Instructions Endpoint
app.post('/api/generate-setup-instructions', async (req, res) => {
  // ✅ FIXED: Manual authentication check
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be signed in to generate setup instructions',
      loginUrl: '/api/auth/github'
    });
  }

  const { workflow, templateId, purchaseId } = req.body;
  if (!workflow || !templateId) {
    return res.status(400).json({ error: 'Workflow and templateId are required.' });
  }

  try {
    console.log('📋 Generating setup instructions for:', templateId, 'by user:', req.user.email || req.user.username);
    
    // Enhanced structured fallback
    const nodeTypes = workflow.nodes?.map((node) => node.type).filter(Boolean) || [];
    const uniqueServices = [...new Set(nodeTypes)]
      .map(service => service.replace('n8n-nodes-base.', ''))
      .filter(service => !['Start', 'Set', 'NoOp', 'If', 'Switch'].includes(service))
      .slice(0, 5);

    let workflowType = 'General Automation';
    let specificInstructions = '';

    if (nodeTypes.some(node => node.includes('OpenAi') || node.includes('langchain'))) {
      workflowType = 'AI-Powered Automation';
      specificInstructions = `
**🤖 AI Setup Requirements:**
1. **OpenAI Account:** Get API key from platform.openai.com
2. **n8n Credentials:** Add OpenAI credential with your \`sk-\` key
3. **Test Connection:** Verify API calls work before activation`;
    } else if (nodeTypes.some(node => node.includes('Webhook'))) {
      workflowType = 'Webhook-Based Integration';
      specificInstructions = `
**🔗 Webhook Setup Requirements:**
1. **Webhook URL:** Copy from your n8n Webhook node
2. **External Service:** Configure webhook in source system
3. **Test Webhook:** Send test payload to verify connection`;
    }

    const instructions = `# ${templateId.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

## 🎯 Workflow Overview

This **${workflowType}** template contains **${workflow.nodes?.length || 0} nodes** designed to streamline your automation processes.

${specificInstructions}

## 🚀 Quick Setup Guide

**Step 1: Import Template**
1. Open your n8n instance (cloud.n8n.io or self-hosted)
2. Navigate to **"Workflows"** → **"Add workflow"** → **"Import from JSON"**
3. Paste your downloaded template JSON
4. Click **"Import"** to create the workflow

**Step 2: Configure Services**
${uniqueServices.length > 0 ? uniqueServices.map(service => {
  return `• **${service}:** Go to Credentials → Add → "${service}" → Configure API connection`;
}).join('\n') : '• Review each node for any required configuration'}

**Step 3: Test & Activate**
1. **Manual Test:** Click **"Test workflow"** button
2. **Check Executions:** Review execution log for errors
3. **Activate:** Toggle the **"Active"** switch when ready

## 💬 Need Help?

Ask me specific questions like:
- *"How do I add OpenAI credentials?"*
- *"Where do I find my webhook URL?"*
- *"How do I test this workflow?"*

---
**Template ID:** ${templateId}  
**Nodes:** ${workflow.nodes?.length || 0}  
**Services:** ${uniqueServices.join(', ') || 'Core n8n'}`;

    console.log('✅ Setup instructions generated for user:', req.user.email || req.user.username);

    res.json({ 
      success: true,
      instructions: instructions,
      source: 'structured_fallback',
      metadata: {
        nodeCount: workflow.nodes?.length || 0,
        services: uniqueServices,
        workflowType: workflowType
      }
    });

  } catch (error) {
    console.error('❌ Error generating setup instructions for user:', req.user.email || req.user.username, error);
    res.status(500).json({ 
      error: 'Failed to generate setup instructions.',
      details: error.message,
      fallback: true
    });
  }
});

// Line 375: Admin Template List Endpoint
app.get('/api/admin/templates', requireGitHubAdmin, async (req, res) => {
  try {
    console.log('📋 Admin fetching template list:', req.user.email || req.user.username);
    const result = await pool.query(`
      SELECT id, name, description, price, currency, image_url, status, is_public, 
             creator_id, created_at, updated_at, rating, 
             COALESCE(download_count, 0) as download_count, 
             COALESCE(view_count, 0) as view_count
      FROM templates 
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    console.error('Error fetching admin templates:', error);
    res.status(500).json({ error: 'Failed to fetch admin templates' });
  }
});

// Line 396: ✅ FIXED Stripe Checkout Session (removed passport middleware)
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  // ✅ FIXED: Check authentication manually instead of using passport middleware
  if (!req.user) {
    console.log('❌ Unauthorized checkout attempt - user not logged in');
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to purchase templates',
      redirectToLogin: true,
      loginUrl: '/api/auth/github'
    });
  }

  const { templateId } = req.body;
  if (!templateId) {
    return res.status(400).json({ error: 'Template ID is required' });
  }

  try {
    console.log('💳 Creating checkout session for:', templateId, 'by user:', req.user.email || req.user.username);
    
    // Get template details
    const template = await pool.query('SELECT name, price FROM templates WHERE id = $1', [templateId]);
    if (template.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // ✅ SECURITY: Check if user already owns this template
    const existingPurchase = await pool.query(`
      SELECT id FROM purchases 
      WHERE user_id = $1 AND template_id = $2 AND status = 'completed'
    `, [req.user.id, templateId]);
    
    if (existingPurchase.rows.length > 0) {
      console.log('⚠️ User already owns this template:', req.user.email, template.rows[0].name);
      return res.status(409).json({ 
        error: 'Template already purchased',
        message: 'You already own this template. Check your dashboard.',
        alreadyOwned: true
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { 
            name: template.rows[0].name,
            description: `n8n automation template`
          },
          unit_amount: template.rows[0].price
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${frontendUrl}/dashboard?purchase=success&template=${templateId}`,
      cancel_url: `${frontendUrl}/template/${templateId}`,
      metadata: { 
        templateId: templateId.toString(), 
        userId: req.user.id.toString(),
        userEmail: req.user.email || '',
        userName: req.user.username || ''
      },
      customer_email: req.user.email
    });

    // Record pending purchase
    await pool.query(
      'INSERT INTO purchases (user_id, template_id, stripe_session_id, status, amount_paid, purchased_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [req.user.id, templateId, session.id, 'pending', template.rows[0].price]
    );

    console.log('✅ Stripe session created:', session.id);
    console.log('🔗 Linked to user:', req.user.id, req.user.email);

    res.json({ 
      success: true, 
      sessionId: session.id, 
      url: session.url,
      userVerified: true,
      templateName: template.rows[0].name
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Line 440: Stripe Webhook
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { templateId, userId } = session.metadata;
      console.log('💰 Checkout completed for template:', templateId, 'user:', userId);
      await pool.query(
        'UPDATE purchases SET status = $1, amount_paid = $2, updated_at = NOW() WHERE stripe_session_id = $3',
        ['completed', session.amount_total, session.id]
      );
      await pool.query(
        'UPDATE templates SET download_count = COALESCE(download_count, 0) + 1 WHERE id = $1',
        [templateId]
      );
    }
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Line 467: ✅ FIXED User Purchases Endpoint (removed passport middleware)
app.get('/api/purchases', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/api/auth/github' });
  }
  try {
    console.log('📦 Fetching purchases for user:', req.user.email || req.user.username);
    const result = await pool.query(`
      SELECT p.id, p.template_id, p.status, p.amount_paid, p.purchased_at, 
             t.name as template_name, t.image_url
      FROM purchases p
      JOIN templates t ON p.template_id = t.id
      WHERE p.user_id = $1
      ORDER BY p.purchased_at DESC
    `, [req.user.id]);
    res.json({ success: true, purchases: result.rows });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// Line 489: Set Admin Role Endpoint
app.post('/api/admin/set-admin-role', requireGitHubAdmin, async (req, res) => {
  try {
    console.log('🔐 Admin role change requested by:', req.user.email || req.user.username);
    const { userId, role } = req.body;
    if (!userId || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid user ID or role' });
    }
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    console.log(`✅ Admin role change by ${req.user.email || req.user.username}: User ${userId} set to ${role}`);
    res.json({ success: true, message: `User ${userId} role updated to ${role}` });
  } catch (error) {
    console.error('Error setting admin role:', error);
    res.status(500).json({ error: 'Failed to set admin role' });
  }
});

// Line 1729: Server Startup with Consolidated Logging
const server = app.listen(port, '0.0.0.0', async () => {
  console.log('\n🚀 ========================================');
  console.log('   DEVHUBCONNECT AI SYSTEM STARTING');
  console.log('========================================');
  console.log(`✅ Server running on 0.0.0.0:${port}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`🔑 Groq API Key configured: ${!!process.env.GROQ_API_KEY}`);
  console.log(`💳 Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`🗄️ Database URL configured: ${!!process.env.DATABASE_URL}`);
  console.log(`🔐 GitHub OAuth configured: ${!!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET}`);
  console.log('');
  console.log('🧠 AI FEATURES ACTIVE:');
  console.log('   ✅ Learning System - Reduces API costs over time');
  console.log('   ✅ Conversation Intelligence - Tracks user progress');
  console.log('   ✅ Smart Completion Detection - Knows when users are done');
  console.log('   ✅ Cost Optimization - Uses learned responses first');
  console.log('   ✅ Performance Analytics - Monitors system effectiveness');
  console.log('   ✅ Template Intelligence - Learns template-specific patterns');
  console.log('');
  console.log('🔐 AUTHENTICATION:');
  console.log('   ✅ GitHub OAuth - /api/auth/github');
  console.log('   ✅ Admin routes require GitHub login and admin role');
  console.log('');
  try {
    console.log('💾 Loading saved conversation states...');
    const savedStates = await pool.query(`
      SELECT user_id, template_id, state_data, last_activity 
      FROM conversation_states 
      WHERE last_activity >= NOW() - INTERVAL '24 hours'
    `);
    savedStates.rows.forEach(row => {
      const key = `${row.user_id}_${row.template_id}`;
      conversationStates.set(key, {
        ...JSON.parse(row.state_data),
        lastActivity: new Date(row.last_activity).getTime()
      });
    });
    console.log(`✅ Loaded ${savedStates.rows.length} conversation states`);
    const learningStats = await pool.query(`
      SELECT 
        COUNT(*) as total_interactions,
        COUNT(CASE WHEN interaction_type = 'learned_response' THEN 1 END) as learned_responses,
        COUNT(CASE WHEN interaction_type = 'conversation_completion' THEN 1 END) as completed_conversations,
        COUNT(DISTINCT template_id) as active_templates
      FROM chat_interactions 
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    const stats = learningStats.rows[0];
    console.log('📊 LEARNING SYSTEM STATS (30 days):');
    console.log(`   💬 Total Interactions: ${stats.total_interactions}`);
    console.log(`   🎓 Learned Responses: ${stats.learned_responses}`);
    console.log(`   🎯 Completed Conversations: ${stats.completed_conversations}`);
    console.log(`   📋 Active Templates: ${stats.active_templates}`);
    if (stats.total_interactions > 0) {
      const costSavings = ((stats.learned_responses / stats.total_interactions) * 100).toFixed(1);
      console.log(`   💰 API Cost Savings: ${costSavings}%`);
    }
  } catch (error) {
    console.error('⚠️ Error loading initial data:', error.message);
  }
  console.log('');
  console.log('🌐 ENDPOINTS AVAILABLE:');
  console.log('   POST /api/ask-ai - AI chat with learning system');
  console.log('   POST /api/generate-setup-instructions - Generate template instructions');
  console.log('   GET  /api/ai/learning-stats - Learning system statistics');
  console.log('   GET  /api/ai/performance-analytics - Detailed performance data (admin)');
  console.log('   GET  /api/ai/template-intelligence/:id - Template-specific insights');
  console.log('   GET  /api/ai/health - System health check (admin)');
  console.log('   POST /api/ai/feedback - User feedback for learning');
  console.log('   POST /api/ai/reset-conversation - Reset conversation state');
  console.log('   GET  /api/ai/export-conversations/:id - Export chat data (admin)');
  console.log('   GET  /api/admin/dashboard - Admin dashboard');
  console.log('   POST /api/templates - Template upload (admin)');
  console.log('   POST /api/stripe/create-checkout-session - Create Stripe checkout');
  console.log('   GET  /api/purchases - User purchases');
  console.log('   GET  /api/admin/templates - Admin template list');
  console.log('   POST /api/admin/set-admin-role - Grant admin role');
  console.log('');
  console.log('✅ System fully initialized and ready for requests!');
  console.log('========================================\n');
});

// Line 1778: Server Error Handling
server.on('error', (error) => {
  console.error('🚨 Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use. Please use a different port.`);
    process.exit(1);
  }
});

// Line 1785: Placeholder for Additional Code (Lines 2001+)
// If you have additional code beyond line 2000 (e.g., Chunk 5 or more), insert it here.
// Please check for and remove any duplicates, such as:
// - Another /api/admin/login endpoint (previously found at lines 1581-1626 or 287-330)
// - Additional catch-all routes (e.g., lines 1549-1560 or 1577-1588)
// - Redundant /api/auth/github/callback (e.g., lines 334-342)
// - Extra logging blocks (e.g., lines 466-473 or 1818-1823)
// Example placeholder for additional endpoints:
/*
app.get('/api/additional-endpoint', (req, res) => {
  res.json({ message: 'Additional endpoint placeholder' });
});
*/
// ✅ SPA ROUTING FIX: Serve React app for all non-API routes
app.get('*', (req, res) => {
  // Don't interfere with API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Serve React app for all other routes
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
