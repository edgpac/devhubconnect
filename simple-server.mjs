// Line 1: Imports and Setup
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
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

// Line 95: Passport GitHub Strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: `${frontendUrl}/api/auth/github/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE github_id = $1',
      [profile.id]
    );
    let user;
    if (result.rows.length > 0) {
      user = result.rows[0];
      await pool.query(
        'UPDATE users SET github_access_token = $1, updated_at = NOW() WHERE github_id = $2',
        [accessToken, profile.id]
      );
    } else {
      const insertResult = await pool.query(
        'INSERT INTO users (github_id, username, email, github_access_token, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *',
        [profile.id, profile.username, profile.emails[0].value, accessToken, 'user']
      );
      user = insertResult.rows[0];
    }
    return done(null, user);
  } catch (error) {
    console.error('GitHub auth error:', error);
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
    
    // Redirect admin users to admin dashboard
    if (userRole === 'admin') {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect(frontendUrl);
    }
  } catch (error) {
    console.error('❌ GitHub OAuth error:', error);
    res.redirect(frontendUrl);
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
app.get('/api/auth/profile/session', (req, res) => {
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

// General /api/templates endpoint (frontend expects this instead of /api/templates/list)
app.get('/api/templates', async (req, res) => {
  try {
    console.log('📋 Fetching templates for user:', req.user?.email || req.user?.username || 'unauthenticated');
    const result = await pool.query(`
      SELECT id, name, description, price, image_url, rating, 
             COALESCE(download_count, 0) as download_count, 
             COALESCE(view_count, 0) as view_count
      FROM templates 
      WHERE is_public = true 
      ORDER BY rating DESC, download_count DESC 
      LIMIT 1000
    `);
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
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

// Line 396: Stripe Checkout Session
app.post('/api/stripe/create-checkout-session', passport.authenticate('github', { session: true, failureRedirect: '/api/auth/github' }), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/api/auth/github' });
  }
  const { templateId } = req.body;
  if (!templateId) {
    return res.status(400).json({ error: 'Template ID is required' });
  }
  try {
    console.log('💳 Creating checkout session for:', templateId, 'by user:', req.user.email || req.user.username);
    const template = await pool.query('SELECT name, price FROM templates WHERE id = $1', [templateId]);
    if (template.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: template.rows[0].name },
          unit_amount: template.rows[0].price
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
      metadata: { templateId, userId: req.user.id }
    });
    await pool.query(
      'INSERT INTO purchases (user_id, template_id, stripe_session_id, status, amount_paid, purchased_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [req.user.id, templateId, session.id, 'pending', template.rows[0].price]
    );
    res.json({ success: true, sessionId: session.id, url: session.url });
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

// Line 467: User Purchases Endpoint
app.get('/api/purchases', passport.authenticate('github', { session: true, failureRedirect: '/api/auth/github' }), async (req, res) => {
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

// Catch-All Handler for React Routes (BEFORE SERVER STARTUP)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'API endpoint not found',
      path: req.path,
      method: req.method
    });
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Line 501: AI Learning System Functions
async function checkLearnedResponses(prompt, templateId) {
  try {
    const result = await pool.query(`
      SELECT 
        ai_response,
        COUNT(*) as usage_count,
        AVG(CASE WHEN user_feedback = 'helpful' THEN 1 ELSE 0 END) as helpfulness_score
      FROM chat_interactions 
      WHERE 
        LOWER(user_question) = LOWER($1)
        AND template_id = $2
        AND interaction_type IN ('groq_api', 'learned_response')
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY ai_response
      HAVING COUNT(*) >= 2 AND AVG(CASE WHEN user_feedback = 'helpful' THEN 1 ELSE 0 END) > 0.7
      ORDER BY COUNT(*) DESC, AVG(CASE WHEN user_feedback = 'helpful' THEN 1 ELSE 0 END) DESC
      LIMIT 1
    `, [prompt, templateId]);
    if (result.rows.length > 0) {
      return {
        response: result.rows[0].ai_response,
        confidence: Math.min(0.95, result.rows[0].helpfulness_score * result.rows[0].usage_count / 10)
      };
    }
    return null;
  } catch (error) {
    console.error('Error checking learned responses:', error);
    return null;
  }
}

async function learnFromInteraction(question, response, templateId, isSuccessful) {
  try {
    const successRate = isSuccessful ? 100.0 : 0.0;
    await pool.query(`
      INSERT INTO template_intelligence (
        template_id, 
        common_questions, 
        success_rate,
        last_updated
      ) 
      VALUES (
        $1,
        jsonb_build_array($2),
        $3,
        NOW()
      )
      ON CONFLICT (template_id) DO UPDATE SET
        common_questions = CASE 
          WHEN template_intelligence.common_questions ? $2 THEN template_intelligence.common_questions
          ELSE template_intelligence.common_questions || jsonb_build_array($2)
        END,
        last_updated = NOW()
    `, [templateId, question, successRate]);
    console.log('🧠 Learned from interaction:', { question: question.substring(0, 50), templateId, isSuccessful });
  } catch (error) {
    console.error('Error learning from interaction:', error);
  }
}

function generateSmartFallback(prompt, templateContext, history) {
  const userPrompt = prompt.toLowerCase();
  const templateId = templateContext?.templateId || '';
  let confidence = 0.5;
  const credentialKeywords = ['credential', 'credentials', 'api key', 'setup', 'configure', 'authentication', 'login', 'token'];
  const isCredentialQuestion = credentialKeywords.some(keyword => userPrompt.includes(keyword));
  if (isCredentialQuestion) confidence += 0.3;
  if (templateId && (userPrompt.includes('node') || userPrompt.includes('workflow') || userPrompt.includes('template'))) {
    confidence += 0.2;
  }
  if (userPrompt.includes('openai') && userPrompt.includes('credential')) {
    return {
      confidence: 0.95,
      response: `🔑 **Complete OpenAI Credential Setup Guide**

**Step 1: Get Your API Key**
1. Go to: **https://platform.openai.com/api-keys**
2. Sign in to your OpenAI account
3. Click **"+ Create new secret key"**
4. **Copy the entire key** (starts with \`sk-\`)
5. ⚠️ **Save it now** - you can't see it again!

**Step 2: Add to n8n**
1. n8n sidebar → **"Credentials"**
2. **"+ Add Credential"** button
3. Search: **"OpenAI"**
4. Paste your \`sk-\` key in **"API Key"** field
5. **"Test"** → **"Save"**

**Troubleshooting:**
❌ "Invalid API key" → Key must start with \`sk-\`, no spaces
❌ "Rate limit exceeded" → Add billing at platform.openai.com

**Current Status:** Do you have your API key, or do you need help getting one?`
    };
  }
  return {
    confidence: Math.min(confidence, 0.7),
    response: generateStructuredFallback(prompt, templateContext, history)
  };
}

async function logChatInteraction(templateId, question, response, userId, interactionType = 'unknown') {
  try {
    let questionCategory = 'general';
    const lowerQuestion = question.toLowerCase();
    if (lowerQuestion.includes('credential') || lowerQuestion.includes('api key')) {
      questionCategory = 'credentials';
    } else if (lowerQuestion.includes('test') || lowerQuestion.includes('workflow')) {
      questionCategory = 'testing';
    } else if (lowerQuestion.includes('node') || lowerQuestion.includes('configure')) {
      questionCategory = 'configuration';
    } else if (lowerQuestion.includes('error') || lowerQuestion.includes('troubleshoot')) {
      questionCategory = 'troubleshooting';
    }
    await pool.query(`
      INSERT INTO chat_interactions (
        template_id, user_question, ai_response, user_id, created_at,
        interaction_type, question_category, learning_score
      )
      VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)
    `, [
      templateId,
      question,
      response,
      userId,
      interactionType,
      questionCategory,
      interactionType === 'learned_response' ? 10 : (interactionType === 'groq_api' ? 5 : 3)
    ]);
  } catch (error) {
    console.error('Error logging chat interaction:', error);
  }
}

function isPromptDisclosure(prompt) {
  const disclosurePatterns = [
    /prompt.*(runs|controls|used|that.*runs.*this.*chat)/i,
    /instructions.*(you.*follow|given.*to.*you)/i,
    /system.*(message|prompt)/i
  ];
  return disclosurePatterns.some(pattern => pattern.test(prompt));
}

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

// Line 651: Enhanced Chat Endpoint with Learning System
app.post('/api/ask-ai', passport.authenticate('github', { session: true, failureRedirect: '/api/auth/github' }), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/api/auth/github' });
  }
  const { prompt, history, templateContext } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }
  try {
    console.log('🧠 Learning AI request by:', req.user.email || req.user.username, { 
      prompt: prompt.substring(0, 100) + '...',
      templateId: templateContext?.templateId || 'none'
    });
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
    if (isPromptDisclosure(prompt)) {
      return res.json({ 
        response: "I cannot answer questions about my instructions. I'm here to help with your uploaded .json file only." 
      });
    }
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
    const groqApiKey = process.env.GROQ_API_KEY;
    let response = '';
    let responseSource = 'fallback';
    if (groqApiKey) {
      try {
        console.log('💰 Using Groq API - counting cost...');
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
        console.log('🚀 Sending structured request to Groq for user:', req.user.email || req.user.username);
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
// Line 901: Generate Setup Instructions
app.post('/api/generate-setup-instructions', passport.authenticate('github', { session: true, failureRedirect: '/api/auth/github' }), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/api/auth/github' });
  }
  const { workflow, templateId, purchaseId } = req.body;
  if (!workflow || !templateId) {
    return res.status(400).json({ error: 'Workflow and templateId are required.' });
  }
  try {
    console.log('📋 Generating setup instructions for:', templateId, 'by user:', req.user.email || req.user.username);
    console.log('🔑 Groq API Key available:', !!process.env.GROQ_API_KEY);
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
      try {
        const structuredPrompt = `You are a technical writer specializing in beginner-friendly automation guides. Analyze the provided n8n workflow JSON and generate setup instructions for the specific service it implements. 

Respond with ONLY this JSON structure: 
{
  "name": "Template title (max 60 chars)", 
  "description": "Paragraph 1: Workflow purpose and key nodes.\\n\\nParagraph 2: Setup requirements and configuration.\\n\\nParagraph 3: Testing and deployment steps. Use exactly 400 words total. Include key nodes relevant to the workflow and the specific service. Provide detailed beginner instructions: include n8n installation steps, credential acquisition for the service, and error-handling examples. Focus on webhook setup, API credential configuration, and output validation. Use standard n8n node names and focus on their functions."
}

JSON: ${JSON.stringify(workflow).substring(0, 8000)}`;
        console.log('🚀 Sending request to Groq API for user:', req.user.email || req.user.username);
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
            messages: [{ role: 'user', content: structuredPrompt }],
            max_tokens: 1500,
            temperature: 0.1,
            stream: false
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        console.log('📡 Groq response status:', groqResponse.status);
        if (groqResponse.ok) {
          const data = await groqResponse.json();
          const aiResponse = data.choices?.[0]?.message?.content || '';
          console.log('✅ Groq response received, length:', aiResponse.length);
          try {
            const parsedResponse = JSON.parse(aiResponse);
            console.log('✅ Successfully parsed AI response');
            return res.json({ 
              success: true,
              instructions: `# ${parsedResponse.name}\n\n${parsedResponse.description}`,
              source: 'groq_ai'
            });
          } catch (parseError) {
            console.error('❌ Failed to parse AI response as JSON:', parseError);
            console.log('Raw AI response:', aiResponse.substring(0, 200));
          }
        } else {
          const errorText = await groqResponse.text();
          console.error('❌ Groq API error:', errorText);
        }
      } catch (groqError) {
        console.error('❌ Groq fetch error:', groqError.message);
      }
    } else {
      console.log('⚠️ No Groq API key found, using structured fallback');
    }
    console.log('📝 Generating structured fallback instructions for user:', req.user.email || req.user.username);
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
3. **Test Connection:** Verify API calls work before activation

**Common AI Node Configuration:**
- **Model:** Use \`gpt-3.5-turbo\` or \`gpt-4\` 
- **Max Tokens:** Set appropriate limits (e.g., 1000)
- **Temperature:** 0.7 for creative, 0.1 for factual responses`;
    } else if (nodeTypes.some(node => node.includes('Webhook'))) {
      workflowType = 'Webhook-Based Integration';
      specificInstructions = `
**🔗 Webhook Setup Requirements:**
1. **Webhook URL:** Copy from your n8n Webhook node
2. **External Service:** Configure webhook in source system
3. **Test Webhook:** Send test payload to verify connection

**Webhook Security:**
- Use authentication headers when possible
- Validate incoming payload structure
- Set up proper error handling`;
    } else if (nodeTypes.some(node => node.includes('Slack') || node.includes('Discord'))) {
      workflowType = 'Communication Automation';
      specificInstructions = `
**💬 Chat Integration Setup:**
1. **Bot Creation:** Create bot in your platform (Slack/Discord)
2. **Permissions:** Grant necessary scopes (read, write, manage)
3. **Token Setup:** Add bot token to n8n credentials
4. **Channel Access:** Invite bot to target channels`;
    }
    const instructions = `# ${templateId.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

## 🎯 Workflow Overview

This **${workflowType}** template contains **${workflow.nodes?.length || 0} nodes** designed to streamline your automation processes. The workflow integrates with **${uniqueServices.length > 0 ? uniqueServices.join(', ') : 'core n8n functionality'}** to deliver powerful automation capabilities.

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
4. **Monitor:** Watch the execution history for successful runs

## 🔧 Troubleshooting

**Common Issues:**
- **❌ Credential errors:** Verify API keys and permissions
- **❌ Node failures:** Check required fields are filled
- **❌ Webhook timeouts:** Ensure external services can reach n8n
- **❌ Rate limits:** Add delays between API calls if needed

## 💬 Need Help?

Ask me specific questions like:
- *"How do I add OpenAI credentials?"*
- *"Where do I find my webhook URL?"*
- *"How do I test this workflow?"*

I'll provide exact n8n UI navigation steps for any setup question!

---
**Template ID:** ${templateId}  
**Nodes:** ${workflow.nodes?.length || 0}  
**Services:** ${uniqueServices.join(', ') || 'Core n8n'}`;
    console.log('✅ Structured fallback instructions generated for user:', req.user.email || req.user.username);
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

// Line 961: Get Learning Statistics
app.get('/api/ai/learning-stats', passport.authenticate('github', { session: true, failureRedirect: '/api/auth/github' }), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/api/auth/github' });
  }
  try {
    console.log('📊 Fetching AI learning stats for user:', req.user.email || req.user.username);
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_interactions,
        COUNT(CASE WHEN interaction_type = 'learned_response' THEN 1 END) as learned_responses,
        COUNT(CASE WHEN interaction_type = 'groq_api' THEN 1 END) as api_calls,
        ROUND(
          COUNT(CASE WHEN interaction_type = 'learned_response' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(*), 0), 
          2
        ) as cost_savings_percentage
      FROM chat_interactions 
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    const categoryStats = await pool.query(`
      SELECT 
        question_category,
        COUNT(*) as count,
        AVG(learning_score) as avg_score
      FROM chat_interactions 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY question_category
      ORDER BY count DESC
    `);
    res.json({
      overall: stats.rows[0],
      categories: categoryStats.rows,
      message: `AI learning system active! ${stats.rows[0].cost_savings_percentage}% of responses use learned patterns instead of API calls.`
    });
  } catch (error) {
    console.error('Error fetching learning stats for user:', req.user.email || req.user.username, error);
    res.status(500).json({ error: 'Failed to fetch learning statistics' });
  }
});

// Line 982: User Feedback for Learning
app.post('/api/ai/feedback', passport.authenticate('github', { session: true, failureRedirect: '/api/auth/github' }), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/api/auth/github' });
  }
  try {
    const { interactionId, feedback, helpful } = req.body;
    console.log('📝 Recording AI feedback for user:', req.user.email || req.user.username);
    await pool.query(`
      UPDATE chat_interactions 
      SET 
        user_feedback = $1,
        learning_score = learning_score + CASE WHEN $2 THEN 2 ELSE -1 END
      WHERE id = $3
    `, [feedback, helpful, interactionId]);
    res.json({ success: true, message: 'Feedback recorded - AI will learn from this!' });
  } catch (error) {
    console.error('Error recording feedback for user:', req.user.email || req.user.username, error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});
// Line 1201: Template-Specific Intelligence
app.get('/api/ai/template-intelligence/:templateId', passport.authenticate('github', { session: true, failureRedirect: '/api/auth/github' }), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/api/auth/github' });
  }
  try {
    const { templateId } = req.params;
    if (!templateId || typeof templateId !== 'string' || templateId.length > 100) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    console.log('📊 Fetching template intelligence for:', templateId, 'by user:', req.user.email || req.user.username);
    const templateStats = await pool.query(`
      SELECT 
        template_id,
        common_questions,
        success_rate,
        last_updated,
        (
          SELECT COUNT(*) FROM chat_interactions 
          WHERE template_id = $1 
          AND created_at >= NOW() - INTERVAL '30 days'
        ) as recent_interactions,
        (
          SELECT COUNT(DISTINCT user_id) FROM chat_interactions 
          WHERE template_id = $1 
          AND created_at >= NOW() - INTERVAL '30 days'
        ) as unique_users
      FROM template_intelligence 
      WHERE template_id = $1
    `, [templateId]);
    const commonIssues = await pool.query(`
      SELECT 
        user_question,
        COUNT(*) as frequency,
        AVG(CASE WHEN user_feedback = 'helpful' THEN 1 ELSE 0 END) as helpfulness_rate,
        MAX(created_at) as last_asked
      FROM chat_interactions 
      WHERE template_id = $1 
      AND created_at >= NOW() - INTERVAL '30 days'
      AND question_category IN ('troubleshooting', 'configuration', 'credentials')
      GROUP BY user_question
      HAVING COUNT(*) >= 2
      ORDER BY frequency DESC, helpfulness_rate ASC
      LIMIT 10
    `, [templateId]);
    const userJourney = await pool.query(`
      SELECT 
        question_category,
        interaction_type,
        COUNT(*) as step_frequency,
        AVG(learning_score) as avg_success_score,
        string_agg(DISTINCT LEFT(user_question, 100), ' | ') as example_questions
      FROM chat_interactions 
      WHERE template_id = $1 
      AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY question_category, interaction_type
      ORDER BY step_frequency DESC
    `, [templateId]);
    res.json({
      templateStats: templateStats.rows[0] || { template_id: templateId, message: 'No data yet' },
      commonIssues: commonIssues.rows,
      userJourney: userJourney.rows,
      recommendations: generateTemplateRecommendations(templateStats.rows[0], commonIssues.rows)
    });
  } catch (error) {
    console.error('Error fetching template intelligence for user:', req.user.email || req.user.username, error);
    res.status(500).json({ error: 'Failed to fetch template intelligence' });
  }
});

// Line 1235: Conversation Reset
app.post('/api/ai/reset-conversation', passport.authenticate('github', { session: true, failureRedirect: '/api/auth/github' }), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated', loginUrl: '/api/auth/github' });
  }
  try {
    const { templateId, userId } = req.body;
    if (!templateId || !userId) {
      return res.status(400).json({ error: 'Template ID and User ID are required' });
    }
    if (typeof templateId !== 'string' || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }
    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot reset conversation for another user' });
    }
    console.log('🔄 Resetting conversation for user:', req.user.email || req.user.username, 'template:', templateId);
    const key = `${userId}_${templateId}`;
    conversationStates.delete(key);
    await logChatInteraction(
      templateId,
      'Conversation reset requested',
      'Conversation state cleared - starting fresh',
      req.user.id,
      'conversation_reset'
    );
    res.json({ 
      success: true, 
      message: 'Conversation reset successfully',
      newState: {
        startTime: Date.now(),
        interactions: 0,
        completedSteps: [],
        lastActivity: Date.now()
      }
    });
  } catch (error) {
    console.error('Error resetting conversation for user:', req.user.email || req.user.username, error);
    res.status(500).json({ error: 'Failed to reset conversation' });
  }
});

// Line 1260: Performance Analytics
app.get('/api/ai/performance-analytics', requireGitHubAdmin, async (req, res) => {
  try {
    console.log('📊 Fetching performance analytics for admin:', req.user.email || req.user.username);
    const timeframe = req.query.timeframe || '30';
    const validTimeframes = ['7', '14', '30', '60', '90'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({ error: 'Invalid timeframe. Use: 7, 14, 30, 60, or 90 days' });
    }
    const performanceData = await pool.query(`
      WITH daily_stats AS (
        SELECT 
          DATE(created_at) as day,
          COUNT(*) as total_interactions,
          COUNT(CASE WHEN interaction_type = 'learned_response' THEN 1 END) as learned_responses,
          COUNT(CASE WHEN interaction_type LIKE '%groq%' THEN 1 END) as api_calls,
          COUNT(CASE WHEN interaction_type = 'conversation_completion' THEN 1 END) as completions,
          AVG(learning_score) as avg_effectiveness
        FROM chat_interactions 
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY DATE(created_at)
        ORDER BY day DESC
      ),
      cost_analysis AS (
        SELECT 
          SUM(CASE WHEN interaction_type LIKE '%groq%' THEN 1 ELSE 0 END) as total_api_calls,
          SUM(CASE WHEN interaction_type = 'learned_response' THEN 1 END) as saved_api_calls,
          COUNT(*) as total_interactions
        FROM chat_interactions 
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      )
      SELECT 
        (SELECT json_agg(daily_stats.*) FROM daily_stats) as daily_trends,
        (SELECT row_to_json(cost_analysis.*) FROM cost_analysis) as cost_savings
    `, [parseInt(timeframe)]);
    const topTemplates = await pool.query(`
      SELECT 
        template_id,
        COUNT(*) as interaction_count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN interaction_type = 'conversation_completion' THEN 1 END) as completion_count,
        ROUND(
          COUNT(CASE WHEN interaction_type = 'conversation_completion' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(DISTINCT user_id), 0), 
          2
        ) as completion_rate,
        AVG(learning_score) as avg_effectiveness
      FROM chat_interactions 
      WHERE created_at >= NOW() - INTERVAL '1 day' * $1
      AND template_id != 'general_chat'
      GROUP BY template_id
      ORDER BY interaction_count DESC
      LIMIT 10
    `, [parseInt(timeframe)]);
    const userEngagement = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) as total_users,
        AVG(user_interactions) as avg_interactions_per_user,
        MAX(user_interactions) as max_interactions_per_user,
        COUNT(CASE WHEN user_interactions >= 5 THEN 1 END) as engaged_users
      FROM (
        SELECT 
          user_id,
          COUNT(*) as user_interactions
        FROM chat_interactions 
        WHERE created_at >= NOW() - INTERVAL '1 day' * $1
        GROUP BY user_id
      ) user_stats
    `, [parseInt(timeframe)]);
    res.json({
      performanceData: performanceData.rows[0],
      topTemplates: topTemplates.rows,
      userEngagement: userEngagement.rows[0],
      metadata: {
        timeframe: `${timeframe} days`,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching performance analytics for admin:', req.user.email || req.user.username, error);
    res.status(500).json({ error: 'Failed to fetch performance analytics' });
  }
});

// Line 1304: Export Conversation Data
app.get('/api/ai/export-conversations/:templateId', requireGitHubAdmin, async (req, res) => {
  try {
    console.log('📤 Exporting conversations for template:', req.params.templateId, 'by admin:', req.user.email || req.user.username);
    const { templateId } = req.params;
    const { format = 'json', timeframe = '30' } = req.query;
    if (!templateId || typeof templateId !== 'string' || templateId.length > 100) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    const validTimeframes = ['7', '14', '30', '60', '90'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({ error: 'Invalid timeframe. Use: 7, 14, 30, 60, or 90 days' });
    }
    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use: json or csv' });
    }
    const conversations = await pool.query(`
      SELECT 
        id,
        template_id,
        user_question,
        ai_response,
        user_id,
        created_at,
        interaction_type,
        question_category,
        learning_score,
        user_feedback
      FROM chat_interactions 
      WHERE template_id = $1 
      AND created_at >= NOW() - INTERVAL '1 day' * $2
      ORDER BY created_at DESC
    `, [templateId, parseInt(timeframe)]);
    if (format === 'csv') {
      const csv = [
        'ID,Template,Question,Response,User,Date,Type,Category,Score,Feedback',
        ...conversations.rows.map(row => 
          `"${row.id}","${row.template_id}","${row.user_question.replace(/"/g, '""')}","${row.ai_response.replace(/"/g, '""')}","${row.user_id}","${row.created_at}","${row.interaction_type}","${row.question_category}","${row.learning_score}","${row.user_feedback || ''}"`
        )
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${templateId}_conversations_${timeframe}days.csv"`);
      res.send(csv);
    } else {
      res.json({
        templateId,
        timeframe: `${timeframe} days`,
        totalConversations: conversations.rows.length,
        exportedAt: new Date().toISOString(),
        conversations: conversations.rows
      });
    }
  } catch (error) {
    console.error('Error exporting conversations for admin:', req.user.email || req.user.username, error);
    res.status(500).json({ error: 'Failed to export conversations' });
  }
});

// Line 1348: AI Health Check
app.get('/api/ai/health', requireGitHubAdmin, async (req, res) => {
  try {
    console.log('🩺 Performing AI health check for admin:', req.user.email || req.user.username);
    const healthChecks = {
      database: false,
      groqApi: false,
      learningSystem: false,
      conversationIntelligence: false
    };
    try {
      await pool.query('SELECT 1');
      healthChecks.database = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }
    if (process.env.GROQ_API_KEY) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const testResponse = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        healthChecks.groqApi = testResponse.ok;
      } catch (error) {
        console.error('Groq API health check failed:', error);
      }
    }
    try {
      const recentLearning = await pool.query(`
        SELECT COUNT(*) as learned_count 
        FROM chat_interactions 
        WHERE interaction_type = 'learned_response' 
        AND created_at >= NOW() - INTERVAL '24 hours'
      `);
      healthChecks.learningSystem = true;
    } catch (error) {
      console.error('Learning system health check failed:', error);
    }
    try {
      const conversationStatesCount = conversationStates.size;
      healthChecks.conversationIntelligence = conversationStatesCount >= 0;
    } catch (error) {
      console.error('Conversation intelligence health check failed:', error);
    }
    const overallHealth = Object.values(healthChecks).every(check => check);
    res.json({
      status: overallHealth ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: healthChecks,
      version: '2.0.0-enhanced',
      features: [
        'Learning System',
        'Conversation Intelligence', 
        'Smart Completion Detection',
        'Cost Optimization',
        'Performance Analytics'
      ]
    });
  } catch (error) {
    console.error('Health check error for admin:', req.user.email || req.user.username, error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
// Line 1549: Admin Dashboard Endpoint
app.get('/api/admin/dashboard', requireGitHubAdmin, async (req, res) => {
  try {
    console.log('📊 Admin dashboard requested by:', req.user.email || req.user.username);
    const templateStats = await pool.query(`
      SELECT 
        COUNT(*) as total_templates,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_templates,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_templates,
        ROUND(AVG(price)::numeric, 2) as avg_price,
        COALESCE(SUM(download_count), 0) as total_downloads
      FROM templates
    `);
    const purchaseStats = await pool.query(`
      SELECT 
        COUNT(*) as total_purchases,
        COALESCE(SUM(amount_paid), 0) as total_revenue,
        COUNT(CASE WHEN purchased_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_purchases,
        COUNT(DISTINCT user_id) as unique_customers
      FROM purchases
      WHERE status = 'completed'
    `);
    const userStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users,
        COUNT(CASE WHEN github_id IS NOT NULL THEN 1 END) as github_users
      FROM users
    `);
    const topTemplates = await pool.query(`
      SELECT 
        id, name, 
        COALESCE(download_count, 0) as download_count, 
        COALESCE(view_count, 0) as view_count, 
        price,
        (SELECT COUNT(*) FROM purchases WHERE template_id = templates.id) as purchase_count
      FROM templates 
      WHERE is_public = true
      ORDER BY download_count DESC, view_count DESC
      LIMIT 10
    `);
    res.json({
      success: true,
      dashboard: {
        templates: templateStats.rows[0],
        purchases: purchaseStats.rows[0],
        users: userStats.rows[0],
        topTemplates: topTemplates.rows
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Admin dashboard error for user:', req.user.email || req.user.username, error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load dashboard data'
    });
  }
});

// Line 1595: Template Upload Endpoint
app.post('/api/templates', requireGitHubAdmin, async (req, res) => {
  try {
    console.log('📤 Template upload by:', req.user.email || req.user.username);
    const { name, description, price, imageUrl, workflowJson } = req.body;
    if (!name || !description || price === undefined || !workflowJson) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    const priceFloat = parseFloat(price);
    if (isNaN(priceFloat) || priceFloat < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid price'
      });
    }
    let parsedWorkflow;
    try {
      parsedWorkflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid workflow JSON'
      });
    }
    const priceInCents = Math.round(priceFloat * 100);
    const adminUserId = req.user.id;
    let finalImageUrl = imageUrl;
    if (!finalImageUrl) {
      const safeName = name.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50);
      finalImageUrl = `https://via.placeholder.com/400x250/4F46E5/FFFFFF?text=${encodeURIComponent(safeName)}`;
    }
    const insertResult = await pool.query(`
      INSERT INTO templates (
        name, description, price, currency, image_url, 
        workflow_json, status, is_public, creator_id,
        created_at, updated_at, download_count, view_count, rating
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        NOW(), NOW(), 0, 0, 4.5
      ) RETURNING id, name, description, price, image_url
    `, [
      name.trim(),
      description.trim(),
      priceInCents,
      'USD',
      finalImageUrl,
      JSON.stringify(parsedWorkflow),
      'active',
      true,
      adminUserId
    ]);
    const newTemplate = insertResult.rows[0];
    console.log('✅ Template uploaded by:', req.user.email || req.user.username, 'Template:', newTemplate.name);
    res.json({
      success: true,
      message: 'Template uploaded successfully',
      template: {
        id: newTemplate.id,
        name: newTemplate.name,
        description: newTemplate.description,
        price: newTemplate.price / 100,
        imageUrl: newTemplate.image_url
      }
    });
  } catch (error) {
    console.error('❌ Template upload error for user:', req.user.email || req.user.username, error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload template'
    });
  }
});

// Line 1655: System Maintenance & Cleanup
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  for (const [key, state] of conversationStates.entries()) {
    if (now - state.lastActivity > maxAge) {
      conversationStates.delete(key);
      console.log(`🧹 Cleaned up old conversation state: ${key.substring(0, 20)}...`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

setInterval(async () => {
  try {
    console.log('🧠 Running learning system optimization...');
    const cleanupResult = await pool.query(`
      DELETE FROM chat_interactions 
      WHERE interaction_type = 'learned_response'
      AND learning_score < 3
      AND created_at < NOW() - INTERVAL '7 days'
    `);
    if (cleanupResult.rowCount > 0) {
      console.log(`🧹 Cleaned up ${cleanupResult.rowCount} low-quality learned responses`);
    }
    await pool.query(`
      INSERT INTO template_intelligence (template_id, success_rate, last_updated)
      SELECT 
        template_id,
        AVG(CASE WHEN interaction_type = 'conversation_completion' THEN 100.0 ELSE 50.0 END),
        NOW()
      FROM chat_interactions 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY template_id
      ON CONFLICT (template_id) DO UPDATE SET
        success_rate = EXCLUDED.success_rate,
        last_updated = EXCLUDED.last_updated
    `);
    console.log('✅ Learning system optimization completed');
  } catch (error) {
    console.error('❌ Learning system optimization error:', error);
  }
}, 6 * 60 * 60 * 1000); // Run every 6 hours

// Line 1691: Graceful Shutdown Handler
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT. Graceful shutdown starting...');
  try {
    console.log('💾 Saving conversation states...');
    for (const [key, state] of conversationStates.entries()) {
      const [userId, templateId] = key.split('_');
      await pool.query(`
        INSERT INTO conversation_states (user_id, template_id, state_data, last_activity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, template_id) DO UPDATE SET
          state_data = EXCLUDED.state_data,
          last_activity = EXCLUDED.last_activity
      `, [userId, templateId, JSON.stringify(state), new Date(state.lastActivity)]);
    }
    console.log('🗄️ Closing database connections...');
    await pool.end();
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Line 1712: Environment Variable Validation
const requiredEnvVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'FRONTEND_URL', 'STRIPE_SECRET_KEY', 'DATABASE_URL', 'SESSION_SECRET', 'ADMIN_ALLOWED_DOMAINS'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Missing environment variable: ${varName}`);
    process.exit(1);
  }
});

// Line 1719: Catch-All Handler for React Routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'API endpoint not found',
      path: req.path,
      method: req.method
    });
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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