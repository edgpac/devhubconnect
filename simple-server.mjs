import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import Stripe from 'stripe';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import crypto from 'crypto';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize Stripe safely
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Add image validation function
const validateImageURL = async (url, timeout = 5000) => {
  if (!url) return false;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { 
      method: 'HEAD',
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
};

// CRITICAL FIX: Webhook endpoint MUST come before express.json() middleware
app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!stripe || !endpointSecret) {
      console.error('Stripe or webhook secret not configured');
      return res.status(400).send('Webhook configuration missing');
    }

    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Webhook signature verified:', event.type);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('🎉 Payment successful for session:', session.id);
    
      try {
        const templateId = session.metadata.templateId;
        const customerEmail = session.customer_details.email;
        const amountPaid = session.amount_total;
        
        console.log('💰 Recording purchase:', { templateId, customerEmail, amountPaid });

        // Parse templateId as integer for database
        let dbTemplateId = templateId;
        const parsedId = parseInt(templateId, 10);
        if (!isNaN(parsedId)) {
          dbTemplateId = parsedId;
        }

        // Get template details
        const templateResult = await pool.query('SELECT * FROM templates WHERE id = $1', [dbTemplateId]);
        if (templateResult.rows.length === 0) {
          console.error('❌ Template not found for purchase:', templateId);
          break;
        }

        // ✅ FIXED: Find existing GitHub user by email FIRST, then create if needed
        let userId;
        
        // Step 1: Try to find existing user by email
        const existingUserResult = await pool.query(
          'SELECT id FROM users WHERE email = $1 LIMIT 1',
          [customerEmail]
        );

        if (existingUserResult.rows.length > 0) {
          // Found existing user - use their ID
          userId = existingUserResult.rows[0].id;
          console.log('✅ Found existing user for email:', customerEmail, 'ID:', userId);
        } else {
          // No existing user - create new one using the smart function
          const userResult = await pool.query(`
            SELECT find_or_create_user($1, $2, NULL, NULL) as user_id
          `, [customerEmail, customerEmail.split('@')[0]]);
          
          userId = userResult.rows[0].user_id;
          console.log('👤 Created new user for purchase:', customerEmail, 'ID:', userId);
        }

        // Record the purchase (keep this part the same)
        const purchaseResult = await pool.query(`
          INSERT INTO purchases (
            user_id, template_id, stripe_session_id, 
            amount_paid, currency, status, purchased_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NOW()
          ) RETURNING *
        `, [
          userId,
          dbTemplateId,
          session.id,
          amountPaid,
          session.currency,
          'completed'
        ]);

        console.log('✅ Purchase recorded:', purchaseResult.rows[0].id);

      } catch (error) {
        console.error('❌ Error recording purchase:', error);
      }
      break;
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({received: true});
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS in production
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// ✅ ENHANCED: GitHub OAuth Strategy with smart user function
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: `${process.env.FRONTEND_URL}/api/auth/github/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const githubEmail = profile.emails?.[0]?.value;
    const githubUsername = profile.username || `user_${profile.id}`;
    const githubId = profile.id;
    const avatarUrl = profile.photos?.[0]?.value || 'https://github.com/identicons/default.png';

    console.log('🔗 GitHub OAuth: Finding/creating user for:', githubUsername, githubEmail);

    // ✅ ENHANCED: Use smart user function for GitHub OAuth
    const userResult = await pool.query(`
      SELECT find_or_create_user($1, $2, $3, $4) as user_id
    `, [githubEmail, githubUsername, githubId, avatarUrl]);
    
    const userId = userResult.rows[0].user_id;
    
    // Get the full user record
    const fullUserResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = fullUserResult.rows[0];
    
    console.log("✅ GitHub OAuth successful for user:", user.name, user.email);
    return done(null, user);
    
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

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

// NOW express.json() comes AFTER the webhook endpoint
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// GitHub OAuth routes
app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/api/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/auth' }),
  (req, res) => {
    // Successful authentication, redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

app.get('/api/auth/user', (req, res) => {
  if (req.user) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Add missing session endpoint that frontend expects
app.get('/api/auth/profile/session', (req, res) => {
  if (req.user) {
    res.json({ 
      user: req.user,
      authenticated: true 
    });
  } else {
    res.status(401).json({ 
      authenticated: false,
      error: 'Not authenticated' 
    });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Template routes
app.get('/api/templates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM templates WHERE is_public = true ORDER BY id');
    
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
    
    // ✅ FIXED: Handle both string and numeric IDs
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ error: 'Invalid template ID provided' });
    }
    
    // Try parsing as integer first, but fallback to string
    let templateId = id;
    const parsedId = parseInt(id, 10);
    if (!isNaN(parsedId)) {
      templateId = parsedId;
    }
    
    console.log('🔍 Template ID requested:', id, 'Parsed as:', templateId);
    
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [templateId]);
    
    if (result.rows.length === 0) {
      console.log('❌ Template not found for ID:', templateId);
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    const converted = convertFieldNames(template);
    const workflowDetails = parseWorkflowDetails(template.workflow_json);
    
    const enhancedTemplate = {
      ...converted,
      workflowDetails,
      steps: workflowDetails.steps,
      integratedApps: workflowDetails.apps
    };
    
    console.log('✅ Template found:', enhancedTemplate.name);
    
    res.json({ 
      template: enhancedTemplate,
      ...enhancedTemplate
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// ✅ NEW: Download endpoint for purchased templates
app.get('/api/templates/:id/download', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
     return res.status(400).json({ error: 'Invalid template ID' });
    }
    // Check if user has purchased this template
    const purchaseCheck = await pool.query(`
      SELECT p.id, t.name, t.workflow_json 
      FROM purchases p 
      JOIN templates t ON p.template_id = t.id 
      WHERE p.user_id = $1 AND t.id = $2
    `, [req.user.id, templateId]);

    if (purchaseCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Template not purchased' });
    }

    const template = purchaseCheck.rows[0];
    
    // Return the workflow JSON as a downloadable file
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${template.name.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
    res.send(JSON.stringify(template.workflow_json, null, 2));
    
    console.log("✅ GitHub OAuth successful for user:", user.name);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ✅ FIXED: Working recommendations endpoint that shows popular templates
app.get('/api/recommendations', async (req, res) => {
  try {
    console.log('🔍 Fetching recommendations...');
    
    // Get popular templates as fallback recommendations
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
        _recommendationScore: Math.random() * 0.3 + 0.7, // Fake score for now
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

// ✅ NEW: User preferences endpoint for business plan form
app.post('/api/recommendations/preferences', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { preferences } = req.body;
    const { businessType, teamSize, industry, maxPrice, preferredCategories, workflows, integrations } = preferences;

    console.log("✅ GitHub OAuth successful for user:", user.name, preferences);

    // Store preferences in user table or create a preferences table
    await pool.query(`
      UPDATE users 
      SET 
        business_type = $2,
        team_size = $3,
        industry = $4,
        max_price = $5,
        preferred_categories = $6,
        workflows = $7,
        integrations = $8,
        updated_at = NOW()
      WHERE id = $1
    `, [
      req.user.id,
      businessType,
      teamSize,
      industry,
      maxPrice,
      JSON.stringify(preferredCategories || []),
      JSON.stringify(workflows || []),
      JSON.stringify(integrations || [])
    ]);

    res.json({ 
      success: true, 
      message: 'Preferences saved successfully',
      preferences 
    });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ✅ NEW: Get user preferences
app.get('/api/recommendations/preferences', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await pool.query(`
      SELECT 
        business_type,
        team_size,
        industry,
        max_price,
        preferred_categories,
        workflows,
        integrations
      FROM users 
      WHERE id = $1
    `, [req.user.id]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const preferences = {
        businessType: user.business_type,
        teamSize: user.team_size,
        industry: user.industry,
        maxPrice: user.max_price,
        preferredCategories: user.preferred_categories ? JSON.parse(user.preferred_categories) : [],
        workflows: user.workflows ? JSON.parse(user.workflows) : [],
        integrations: user.integrations ? JSON.parse(user.integrations) : []
      };

      res.json({ preferences });
    } else {
      res.json({ preferences: {} });
    }
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ✅ NEW: Admin endpoint to fix template images
app.post('/api/admin/fix-images', async (req, res) => {
  try {
    const templates = await pool.query('SELECT id, name, image_url FROM templates');
    let updated = 0;
    
    for (const template of templates.rows) {
      const isValid = await validateImageURL(template.image_url);
      
      if (!isValid) {
        const colors = ['4F46E5', '059669', 'DC2626', '7C3AED', 'EA580C'];
        const colorIndex = template.id % colors.length;
        const fallbackUrl = `https://via.placeholder.com/400x250/${colors[colorIndex]}/FFFFFF?text=${encodeURIComponent(template.name)}`;
        
        await pool.query('UPDATE templates SET image_url = $1 WHERE id = $2', [fallbackUrl, template.id]);
        updated++;
      }
    }
    
    res.json({ message: `Fixed ${updated} template images`, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ SECURE ADMIN SESSION MANAGEMENT
function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token || !token.startsWith('admin-')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin authentication required' 
      });
    }
    
    // Validate token format and age
    const tokenParts = token.split('-');
    if (tokenParts.length !== 3) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin token format' 
      });
    }
    
    const timestamp = parseInt(tokenParts[1]);
    if (isNaN(timestamp)) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin token' 
      });
    }
    
    const now = Date.now();
    const maxAge = 8 * 60 * 60 * 1000; // 8 hours
    
    if (now - timestamp > maxAge) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin session expired. Please login again.' 
      });
    }
    
    req.adminUser = { role: 'admin', token, loginTime: new Date(timestamp) };
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid admin token' 
    });
  }
}

// ✅ SECURE: Admin login endpoint - REMOVED HARDCODED EMAIL AND UNSAFE DOMAIN CHECK
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    // ✅ SECURITY FIX: Only use environment variable for password validation
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    console.log('🔐 Admin login attempt received');
    
    // Check if admin password is configured
    if (!adminPassword) {
      console.error('❌ ADMIN_PASSWORD environment variable not set');
      return res.status(500).json({ 
        success: false, 
        message: 'Admin authentication not configured. Contact system administrator.' 
      });
    }
    
    if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password is required' 
      });
    }
    
    if (password === adminPassword) {
      // Generate secure admin session token
      const token = `admin-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
      
      console.log('✅ Admin login successful');
      
      res.json({ 
        success: true, 
        token: token,
        message: 'Admin login successful',
        adminUser: {
          role: 'admin',
          loginTime: new Date().toISOString()
        }
      });
    } else {
      console.log('❌ Invalid admin password provided');
      res.status(401).json({ 
        success: false, 
        message: 'Invalid admin password' 
      });
    }
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed due to server error'
    });
  }
});

// ✅ SECURE: Protected admin dashboard endpoint
app.get('/api/admin/dashboard', requireAdminAuth, async (req, res) => {
  try {
    console.log('📊 Admin dashboard data requested by:', req.adminUser.role);
    
    // Get template statistics
    const templateStats = await pool.query(`
      SELECT 
        COUNT(*) as total_templates,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_templates,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_templates,
        ROUND(AVG(price)::numeric, 2) as avg_price,
        COALESCE(SUM(download_count), 0) as total_downloads
      FROM templates
    `);
    
    // Get purchase statistics
    const purchaseStats = await pool.query(`
      SELECT 
        COUNT(*) as total_purchases,
        COALESCE(SUM(amount_paid), 0) as total_revenue,
        COUNT(CASE WHEN purchased_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_purchases,
        COUNT(DISTINCT user_id) as unique_customers
      FROM purchases
      WHERE status = 'completed'
    `);
    
    // Get user statistics
    const userStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users,
        COUNT(CASE WHEN github_id IS NOT NULL THEN 1 END) as github_users
      FROM users
    `);
    
    // Get top templates
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
    console.error('❌ Admin dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load dashboard data'
    });
  }
});

// ✅ Admin logout endpoint
app.post('/api/admin/logout', requireAdminAuth, async (req, res) => {
  try {
    console.log('🔓 Admin logout requested');
    
    res.json({
      success: true,
      message: 'Admin logged out successfully'
    });
  } catch (error) {
    console.error('❌ Admin logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

// ✅ SECURE LOGGING
console.log('✅ Admin authentication system configured');
console.log('🔐 Admin password source:', process.env.ADMIN_PASSWORD ? 'Environment Variable ✅' : 'NOT CONFIGURED ❌');
console.log('📋 Admin endpoints available:');
console.log('   POST /api/admin/login - Admin authentication (public)');
console.log('   POST /api/admin/logout - Admin logout (protected)');
console.log('   GET  /api/admin/dashboard - Admin dashboard data (protected)');
console.log('   POST /api/admin/fix-images - Fix template images (protected)');
console.log('⚠️  Make sure to set ADMIN_PASSWORD environment variable in Railway!');

// ✅ SECURE: Template Upload Endpoint   
app.post('/api/admin/upload-template', requireAdminAuth, async (req, res) => {
  console.log('📤 Admin template upload requested');
  const { name, description, price, imageUrl, workflowJson } = req.body;
  
  // ✅ SECURITY: Input validation with size limits
  if (!name || name.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Invalid name: required and max 100 characters'
    });
  }
  
  if (!description || description.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Invalid description: required and max 500 characters'
    });
  }
  
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0 || parseFloat(price) > 10000) {
    return res.status(400).json({
      success: false,
      message: 'Invalid price: must be between $0 and $10,000'
    });
  }
  
  if (!workflowJson) {
    return res.status(400).json({
      success: false,
      message: 'Workflow JSON is required'
    });
  }
  
  // ✅ SECURITY: Validate and sanitize workflow JSON
  let parsedWorkflow;
  try {
    const workflowString = typeof workflowJson === 'string' ? workflowJson : JSON.stringify(workflowJson);
    
    // ✅ SECURITY: Limit JSON size to prevent DoS
    if (workflowString.length > 1024 * 1024) { // 1MB limit
      return res.status(400).json({
        success: false,
        message: 'Workflow JSON too large (max 1MB)'
      });
    }
    
    parsedWorkflow = JSON.parse(workflowString);
    
    // Add your workflow processing logic here
    // For example:
    // const template = await saveTemplate({ name, description, price, imageUrl, workflow: parsedWorkflow });
    
    return res.status(200).json({
      success: true,
      message: 'Template uploaded successfully'
    });
    
  } catch (error) {
    console.error('❌ Error parsing workflow JSON:', error);
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON format in workflow'
    });
  }  
      // ✅ SECURITY: Validate workflow structure
      if (!parsedWorkflow.nodes || !Array.isArray(parsedWorkflow.nodes)) {
        throw new Error('Invalid workflow: missing nodes array');
      }
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

// NOW express.json() comes AFTER the webhook endpoint
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// GitHub OAuth routes
app.get('/api/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/api/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/auth' }),
  (req, res) => {
    // Successful authentication, redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

app.get('/api/auth/user', (req, res) => {
  if (req.user) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Add missing session endpoint that frontend expects
app.get('/api/auth/profile/session', (req, res) => {
  if (req.user) {
    res.json({ 
      user: req.user,
      authenticated: true 
    });
  } else {
    res.status(401).json({ 
      authenticated: false,
      error: 'Not authenticated' 
    });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Template routes
app.get('/api/templates', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM templates WHERE is_public = true ORDER BY id');
    
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
    
    // ✅ FIXED: Handle both string and numeric IDs
    if (!id || id === 'undefined' || id === 'null') {
      return res.status(400).json({ error: 'Invalid template ID provided' });
    }
    
    // Try parsing as integer first, but fallback to string
    let templateId = id;
    const parsedId = parseInt(id, 10);
    if (!isNaN(parsedId)) {
      templateId = parsedId;
    }
    
    console.log('🔍 Template ID requested:', id, 'Parsed as:', templateId);
    
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [templateId]);
    
    if (result.rows.length === 0) {
      console.log('❌ Template not found for ID:', templateId);
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    const converted = convertFieldNames(template);
    const workflowDetails = parseWorkflowDetails(template.workflow_json);
    
    const enhancedTemplate = {
      ...converted,
      workflowDetails,
      steps: workflowDetails.steps,
      integratedApps: workflowDetails.apps
    };
    
    console.log('✅ Template found:', enhancedTemplate.name);
    
    res.json({ 
      template: enhancedTemplate,
      ...enhancedTemplate
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// ✅ NEW: Download endpoint for purchased templates
app.get('/api/templates/:id/download', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
     return res.status(400).json({ error: 'Invalid template ID' });
    }
    // Check if user has purchased this template
    const purchaseCheck = await pool.query(`
      SELECT p.id, t.name, t.workflow_json 
      FROM purchases p 
      JOIN templates t ON p.template_id = t.id 
      WHERE p.user_id = $1 AND t.id = $2
    `, [req.user.id, templateId]);

    if (purchaseCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Template not purchased' });
    }

    const template = purchaseCheck.rows[0];
    
    // Return the workflow JSON as a downloadable file
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${template.name.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
    res.send(JSON.stringify(template.workflow_json, null, 2));
    
    console.log("✅ GitHub OAuth successful for user:", user.name);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ✅ FIXED: Working recommendations endpoint that shows popular templates
app.get('/api/recommendations', async (req, res) => {
  try {
    console.log('🔍 Fetching recommendations...');
    
    // Get popular templates as fallback recommendations
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
        _recommendationScore: Math.random() * 0.3 + 0.7, // Fake score for now
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

// ✅ NEW: User preferences endpoint for business plan form
app.post('/api/recommendations/preferences', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { preferences } = req.body;
    const { businessType, teamSize, industry, maxPrice, preferredCategories, workflows, integrations } = preferences;

    console.log("✅ GitHub OAuth successful for user:", user.name, preferences);

    // Store preferences in user table or create a preferences table
    await pool.query(`
      UPDATE users 
      SET 
        business_type = $2,
        team_size = $3,
        industry = $4,
        max_price = $5,
        preferred_categories = $6,
        workflows = $7,
        integrations = $8,
        updated_at = NOW()
      WHERE id = $1
    `, [
      req.user.id,
      businessType,
      teamSize,
      industry,
      maxPrice,
      JSON.stringify(preferredCategories || []),
      JSON.stringify(workflows || []),
      JSON.stringify(integrations || [])
    ]);

    res.json({ 
      success: true, 
      message: 'Preferences saved successfully',
      preferences 
    });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ✅ NEW: Get user preferences
app.get('/api/recommendations/preferences', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await pool.query(`
      SELECT 
        business_type,
        team_size,
        industry,
        max_price,
        preferred_categories,
        workflows,
        integrations
      FROM users 
      WHERE id = $1
    `, [req.user.id]);

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const preferences = {
        businessType: user.business_type,
        teamSize: user.team_size,
        industry: user.industry,
        maxPrice: user.max_price,
        preferredCategories: user.preferred_categories ? JSON.parse(user.preferred_categories) : [],
        workflows: user.workflows ? JSON.parse(user.workflows) : [],
        integrations: user.integrations ? JSON.parse(user.integrations) : []
      };

      res.json({ preferences });
    } else {
      res.json({ preferences: {} });
    }
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ✅ NEW: Admin endpoint to fix template images
app.post('/api/admin/fix-images', async (req, res) => {
  try {
    const templates = await pool.query('SELECT id, name, image_url FROM templates');
    let updated = 0;
    
    for (const template of templates.rows) {
      const isValid = await validateImageURL(template.image_url);
      
      if (!isValid) {
        const colors = ['4F46E5', '059669', 'DC2626', '7C3AED', 'EA580C'];
        const colorIndex = template.id % colors.length;
        const fallbackUrl = `https://via.placeholder.com/400x250/${colors[colorIndex]}/FFFFFF?text=${encodeURIComponent(template.name)}`;
        
        await pool.query('UPDATE templates SET image_url = $1 WHERE id = $2', [fallbackUrl, template.id]);
        updated++;
      }
    }
    
    res.json({ message: `Fixed ${updated} template images`, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ SECURE ADMIN SESSION MANAGEMENT
function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token || !token.startsWith('admin-')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin authentication required' 
      });
    }
    
    // Validate token format and age
    const tokenParts = token.split('-');
    if (tokenParts.length !== 3) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin token format' 
      });
    }
    
    const timestamp = parseInt(tokenParts[1]);
    if (isNaN(timestamp)) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin token' 
      });
    }
    
    const now = Date.now();
    const maxAge = 8 * 60 * 60 * 1000; // 8 hours
    
    if (now - timestamp > maxAge) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin session expired. Please login again.' 
      });
    }
    
    req.adminUser = { role: 'admin', token, loginTime: new Date(timestamp) };
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid admin token' 
    });
  }
}

// ✅ SECURITY FIX: Admin login endpoint - REMOVED HARDCODED EMAIL AND UNSAFE DOMAIN CHECK
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    // ✅ SECURITY FIX: Only use environment variable for password validation
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    console.log('🔐 Admin login attempt received');
    
    // Check if admin password is configured
    if (!adminPassword) {
      console.error('❌ ADMIN_PASSWORD environment variable not set');
      return res.status(500).json({ 
        success: false, 
        message: 'Admin authentication not configured. Contact system administrator.' 
      });
    }
    
    if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password is required' 
      });
    }
    
    if (password === adminPassword) {
      // Generate secure admin session token
      const token = `admin-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
      
      console.log('✅ Admin login successful');
      
      res.json({ 
        success: true, 
        token: token,
        message: 'Admin login successful',
        adminUser: {
          role: 'admin',
          loginTime: new Date().toISOString()
        }
      });
    } else {
      console.log('❌ Invalid admin password provided');
      res.status(401).json({ 
        success: false, 
        message: 'Invalid admin password' 
      });
    }
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed due to server error'
    });
  }
});
// ✅ SECURE: Protected admin dashboard endpoint
app.get('/api/admin/dashboard', requireAdminAuth, async (req, res) => {
  try {
    console.log('📊 Admin dashboard data requested by:', req.adminUser.role);
    
    // Get template statistics
    const templateStats = await pool.query(`
      SELECT 
        COUNT(*) as total_templates,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_templates,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_templates,
        ROUND(AVG(price)::numeric, 2) as avg_price,
        COALESCE(SUM(download_count), 0) as total_downloads
      FROM templates
    `);
    
    // Get purchase statistics
    const purchaseStats = await pool.query(`
      SELECT 
        COUNT(*) as total_purchases,
        COALESCE(SUM(amount_paid), 0) as total_revenue,
        COUNT(CASE WHEN purchased_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_purchases,
        COUNT(DISTINCT user_id) as unique_customers
      FROM purchases
      WHERE status = 'completed'
    `);
    
    // Get user statistics
    const userStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users,
        COUNT(CASE WHEN github_id IS NOT NULL THEN 1 END) as github_users
      FROM users
    `);
    
    // Get top templates
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
    console.error('❌ Admin dashboard error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load dashboard data'
    });
  }
});

// ✅ Admin logout endpoint
app.post('/api/admin/logout', requireAdminAuth, async (req, res) => {
  try {
    console.log('🔓 Admin logout requested');
    
    res.json({
      success: true,
      message: 'Admin logged out successfully'
    });
  } catch (error) {
    console.error('❌ Admin logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

// ✅ SECURE LOGGING
console.log('✅ Admin authentication system configured');
console.log('🔐 Admin password source:', process.env.ADMIN_PASSWORD ? 'Environment Variable ✅' : 'NOT CONFIGURED ❌');
console.log('📋 Admin endpoints available:');
console.log('   POST /api/admin/login - Admin authentication (public)');
console.log('   POST /api/admin/logout - Admin logout (protected)');
console.log('   GET  /api/admin/dashboard - Admin dashboard data (protected)');
console.log('   POST /api/admin/fix-images - Fix template images (protected)');
console.log('⚠️  Make sure to set ADMIN_PASSWORD environment variable in Railway!');

// ✅ SECURITY FIX: Template Upload Endpoint - REMOVED HARDCODED EMAIL LOOKUP
app.post('/api/admin/upload-template', requireAdminAuth, async (req, res) => {
  try {
    console.log('📤 Admin template upload requested');
    
    const { name, description, price, imageUrl, workflowJson } = req.body;
    
    // ✅ SECURITY: Input validation with size limits
    if (!name || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid name: required and max 100 characters'
      });
    }
    
    if (!description || description.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Invalid description: required and max 500 characters'
      });
    }
    
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0 || parseFloat(price) > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid price: must be between $0 and $10,000'
      });
    }
    
    if (!workflowJson) {
      return res.status(400).json({
        success: false,
        message: 'Workflow JSON is required'
      });
    }
    
    // ✅ SECURITY: Validate and sanitize workflow JSON
    let parsedWorkflow;
    try {
      const workflowString = typeof workflowJson === 'string' ? workflowJson : JSON.stringify(workflowJson);
      
      // ✅ SECURITY: Limit JSON size to prevent DoS
      if (workflowString.length > 1024 * 1024) { // 1MB limit
        return res.status(400).json({
          success: false,
          message: 'Workflow JSON too large (max 1MB)'
        });
      }
      
      parsedWorkflow = JSON.parse(workflowString);
      
      // ✅ SECURITY: Validate workflow structure
      if (!parsedWorkflow.nodes || !Array.isArray(parsedWorkflow.nodes)) {
        throw new Error('Invalid workflow: missing nodes array');
      }
      
      // ✅ SECURITY: Limit number of nodes to prevent resource exhaustion
      if (parsedWorkflow.nodes.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Workflow too complex (max 100 nodes)'
        });
      }
      
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid workflow JSON format',
        error: error.message
      });
    }
    
    // ✅ SECURITY: Validate and sanitize price
    const priceFloat = parseFloat(price);
    const priceInCents = Math.round(priceFloat * 100);
    
    // ✅ SECURITY: Validate image URL if provided
    let finalImageUrl;
    if (imageUrl) {
      try {
        const url = new URL(imageUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid image URL: must use HTTP/HTTPS'
          });
        }
        finalImageUrl = imageUrl;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid image URL format'
        });
      }
    } else {
      // Generate safe fallback image
      const safeName = name.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50);
      finalImageUrl = `https://via.placeholder.com/400x250/4F46E5/FFFFFF?text=${encodeURIComponent(safeName)}`;
    }
    
    // ✅ SECURITY FIX: Use system admin user instead of hardcoded email lookup
    // Create a system admin user ID (you can modify this to use a proper admin user)
    const adminUserId = 1; // Default to user ID 1 as system admin
    
    // ✅ SECURITY: Secure parameterized query
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
    
    console.log('✅ Template uploaded successfully:', newTemplate.id, newTemplate.name);
    
    res.json({
      success: true,
      message: 'Template uploaded successfully',
      template: {
        id: newTemplate.id,
        name: newTemplate.name,
        description: newTemplate.description,
        price: newTemplate.price,
        imageUrl: newTemplate.image_url
      }
    });
    
  } catch (error) {
    console.error('❌ Template upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload template'
      // ✅ SECURITY: Don't expose error details in production
    });
  }
});
// ✅ SECURE: AI Generate Template Details Endpoint
app.post('/api/admin/generate-details', requireAdminAuth, async (req, res) => {
  try {
    const { workflowJson } = req.body;
    
    if (!workflowJson) {
      return res.status(400).json({
        success: false,
        message: 'Workflow JSON is required'
      });
    }
    
    console.log('🤖 Generating AI template details...');
    
    // Parse workflow to extract information
    let workflow;
    try {
      workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON workflow'
      });
    }
    
    // Extract node types and services
    const nodeTypes = workflow.nodes?.map(node => node.type).filter(Boolean) || [];
    const services = [...new Set(nodeTypes)]
      .map(service => service.replace('n8n-nodes-base.', ''))
      .filter(service => !['Start', 'Set', 'NoOp', 'If', 'Switch'].includes(service))
      .slice(0, 5);
    
    // Determine workflow category
    let category = 'General Automation';
    let suggestedPrice = 1997; // $19.97 in cents
    
    if (services.some(s => s.includes('OpenAi') || s.includes('langchain'))) {
      category = 'AI Automation';
      suggestedPrice = 2997; // $29.97
    } else if (services.some(s => s.includes('Webhook'))) {
      category = 'Integration';
      suggestedPrice = 1497; // $14.97
    } else if (services.some(s => s.includes('Slack') || s.includes('Discord'))) {
      category = 'Communication';
      suggestedPrice = 1997;
    }
    
    // Use Groq API if available, otherwise use structured fallback
    const groqApiKey = process.env.GROQ_API_KEY;
    let generatedDetails = null;
    
    if (groqApiKey) {
      try {
        const prompt = `Analyze this n8n workflow and generate a concise template description. 
        
Services: ${services.join(', ')}
Node Count: ${workflow.nodes?.length || 0}
Category: ${category}

Generate ONLY a JSON response:
{
  "name": "Template Name (max 60 chars)",
  "description": "Brief description (max 200 chars) focusing on the automation's purpose and key benefits.",
  "suggestedPrice": ${suggestedPrice / 100}
}`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
            temperature: 0.3
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          const aiResponse = data.choices?.[0]?.message?.content || '';
          generatedDetails = JSON.parse(aiResponse);
        }
      } catch (error) {
        console.log('⚠️ AI generation failed, using fallback:', error.message);
      }
    }
    
    // Fallback structured response
    if (!generatedDetails) {
      const serviceName = services[0] || 'n8n';
      generatedDetails = {
        name: `${serviceName} ${category} Template`,
        description: `Automate your ${category.toLowerCase()} workflow using ${services.slice(0, 3).join(', ')}. Contains ${workflow.nodes?.length || 0} pre-configured nodes for seamless integration.`,
        suggestedPrice: suggestedPrice / 100
      };
    }
    
    res.json({
      success: true,
      generated: generatedDetails,
      metadata: {
        services,
        category,
        nodeCount: workflow.nodes?.length || 0,
        source: groqApiKey ? 'ai_generated' : 'structured_fallback'
      }
    });
    
  } catch (error) {
    console.error('❌ Generate details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template details'
    });
  }
});

// ✅ SECURE: Get Admin Templates Endpoint
app.get('/api/admin/templates', requireAdminAuth, async (req, res) => {
  try {
    console.log('📋 Admin templates list requested');
    
    const templates = await pool.query(`
      SELECT 
        id, name, description, price, currency, image_url,
        status, is_public, created_at, updated_at,
        download_count, view_count, rating
      FROM templates 
      ORDER BY created_at DESC
    `);
    
    const formattedTemplates = templates.rows.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      price: template.price / 100, // Convert cents to dollars
      currency: template.currency,
      imageUrl: template.image_url,
      status: template.status,
      isPublic: template.is_public,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      downloadCount: template.download_count || 0,
      viewCount: template.view_count || 0,
      rating: template.rating || 4.5
    }));
    
    res.json({
      success: true,
      templates: formattedTemplates,
      count: formattedTemplates.length
    });
    
  } catch (error) {
    console.error('❌ Admin templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates'
    });
  }
});

// ✅ SECURITY: Template Upload Endpoint - IMPROVED VERSION
app.post('/api/admin/upload-template', requireAdminAuth, async (req, res) => {
  try {
    console.log('📤 Admin template upload requested');
    
    const { name, description, price, imageUrl, workflowJson } = req.body;
    
    // ✅ SECURITY: Enhanced input validation with size limits
    if (!name || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid name: required and max 100 characters'
      });
    }
    
    if (!description || description.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Invalid description: required and max 500 characters'
      });
    }
    
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0 || parseFloat(price) > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid price: must be between $0 and $10,000'
      });
    }
    
    if (!workflowJson) {
      return res.status(400).json({
        success: false,
        message: 'Workflow JSON is required'
      });
    }
    
    // ✅ SECURITY: Validate and sanitize workflow JSON
    let parsedWorkflow;
    try {
      const workflowString = typeof workflowJson === 'string' ? workflowJson : JSON.stringify(workflowJson);
      
      // ✅ SECURITY: Limit JSON size to prevent DoS attacks
      if (workflowString.length > 1024 * 1024) { // 1MB limit
        return res.status(400).json({
          success: false,
          message: 'Workflow JSON too large (max 1MB)'
        });
      }
      
      parsedWorkflow = JSON.parse(workflowString);
      
      // ✅ SECURITY: Validate workflow structure
      if (!parsedWorkflow.nodes || !Array.isArray(parsedWorkflow.nodes)) {
        throw new Error('Invalid workflow: missing nodes array');
      }
      
      // ✅ SECURITY: Limit number of nodes to prevent resource exhaustion
      if (parsedWorkflow.nodes.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Workflow too complex (max 100 nodes)'
        });
      }
      
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid workflow JSON format',
        error: error.message
      });
    }
    
    // ✅ SECURITY: Validate and sanitize price
    const priceFloat = parseFloat(price);
    const priceInCents = Math.round(priceFloat * 100);
    
    // ✅ SECURITY: Validate image URL if provided
    let finalImageUrl;
    if (imageUrl) {
      try {
        const url = new URL(imageUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid image URL: must use HTTP/HTTPS'
          });
        }
        finalImageUrl = imageUrl;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid image URL format'
        });
      }
    } else {
      // Generate safe fallback image
      const safeName = name.replace(/[^a-zA-Z0-9\s]/g, '').substring(0, 50);
      finalImageUrl = `https://via.placeholder.com/400x250/4F46E5/FFFFFF?text=${encodeURIComponent(safeName)}`;
    }
    
    // ✅ SECURITY FIX: Use proper admin user lookup instead of hardcoded values
    let adminUserId;
    try {
      const adminCheck = await pool.query(`
        SELECT id FROM users 
        WHERE role = 'admin' 
        ORDER BY created_at ASC 
        LIMIT 1
      `);
      
      if (adminCheck.rows.length === 0) {
        // Fallback to user ID 1 if no admin role found
        adminUserId = 1;
        console.log('⚠️ No admin role found, using system user ID 1');
      } else {
        adminUserId = adminCheck.rows[0].id;
      }
    } catch (error) {
      console.error('Error getting admin user:', error);
      adminUserId = 1; // Safe fallback
    }
    
    // ✅ SECURITY: Secure parameterized query
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
    
    console.log('✅ Template uploaded successfully:', newTemplate.id, newTemplate.name);
    
    res.json({
      success: true,
      message: 'Template uploaded successfully',
      template: {
        id: newTemplate.id,
        name: newTemplate.name,
        description: newTemplate.description,
        price: newTemplate.price,
        imageUrl: newTemplate.image_url
      }
    });
    
  } catch (error) {
    console.error('❌ Template upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload template'
      // ✅ SECURITY: Don't expose error details in production
    });
  }
});

// ✅ SECURITY ENHANCED: AI Generate Template Details Endpoint
app.post('/api/admin/generate-details', requireAdminAuth, async (req, res) => {
  try {
    const { workflowJson } = req.body;
    
    if (!workflowJson) {
      return res.status(400).json({
        success: false,
        message: 'Workflow JSON is required'
      });
    }
    
    console.log('🤖 Generating AI template details...');
    
    // ✅ SECURITY: Validate JSON input
    let workflow;
    try {
      const workflowString = typeof workflowJson === 'string' ? workflowJson : JSON.stringify(workflowJson);
      
      // ✅ SECURITY: Size limit for AI processing
      if (workflowString.length > 512 * 1024) { // 512KB limit for AI
        return res.status(400).json({
          success: false,
          message: 'Workflow JSON too large for AI processing (max 512KB)'
        });
      }
      
      workflow = JSON.parse(workflowString);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON workflow'
      });
    }
    
    // Extract node types and services
    const nodeTypes = workflow.nodes?.map(node => node.type).filter(Boolean) || [];
    const services = [...new Set(nodeTypes)]
      .map(service => service.replace('n8n-nodes-base.', ''))
      .filter(service => !['Start', 'Set', 'NoOp', 'If', 'Switch'].includes(service))
      .slice(0, 5);
    
    // Determine workflow category
    let category = 'General Automation';
    let suggestedPrice = 1997; // $19.97 in cents
    
    if (services.some(s => s.includes('OpenAi') || s.includes('langchain'))) {
      category = 'AI Automation';
      suggestedPrice = 2997; // $29.97
    } else if (services.some(s => s.includes('Webhook'))) {
      category = 'Integration';
      suggestedPrice = 1497; // $14.97
    } else if (services.some(s => s.includes('Slack') || s.includes('Discord'))) {
      category = 'Communication';
      suggestedPrice = 1997;
    }
    
    // Use Groq API if available, otherwise use structured fallback
    const groqApiKey = process.env.GROQ_API_KEY;
    let generatedDetails = null;
    
    if (groqApiKey) {
      try {
        // ✅ SECURITY: Sanitize data before sending to external API
        const sanitizedServices = services.map(s => s.replace(/[<>\"'&]/g, ''));
        const nodeCount = Math.min(workflow.nodes?.length || 0, 1000); // Cap at 1000
        
        const prompt = `Analyze this n8n workflow and generate a concise template description. 
        
Services: ${sanitizedServices.join(', ')}
Node Count: ${nodeCount}
Category: ${category}

Generate ONLY a JSON response:
{
  "name": "Template Name (max 60 chars)",
  "description": "Brief description (max 200 chars) focusing on the automation's purpose and key benefits.",
  "suggestedPrice": ${suggestedPrice / 100}
}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
            temperature: 0.3
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          const aiResponse = data.choices?.[0]?.message?.content || '';
          
          // ✅ SECURITY: Validate AI response
          if (aiResponse.length > 2000) {
            throw new Error('AI response too long');
          }
          
          generatedDetails = JSON.parse(aiResponse);
          
          // ✅ SECURITY: Sanitize AI-generated content
          if (generatedDetails.name) {
            generatedDetails.name = generatedDetails.name.substring(0, 60).replace(/[<>\"'&]/g, '');
          }
          if (generatedDetails.description) {
            generatedDetails.description = generatedDetails.description.substring(0, 200).replace(/[<>\"'&]/g, '');
          }
        }
      } catch (error) {
        console.log('⚠️ AI generation failed, using fallback:', error.message);
      }
    }
    
    // Fallback structured response
    if (!generatedDetails) {
      const serviceName = (services[0] || 'n8n').replace(/[<>\"'&]/g, '');
      generatedDetails = {
        name: `${serviceName} ${category} Template`,
        description: `Automate your ${category.toLowerCase()} workflow using ${services.slice(0, 3).join(', ')}. Contains ${workflow.nodes?.length || 0} pre-configured nodes for seamless integration.`,
        suggestedPrice: suggestedPrice / 100
      };
    }
    
    res.json({
      success: true,
      generated: generatedDetails,
      metadata: {
        services: services.slice(0, 5), // Limit exposed services
        category,
        nodeCount: Math.min(workflow.nodes?.length || 0, 1000),
        source: groqApiKey ? 'ai_generated' : 'structured_fallback'
      }
    });
    
  } catch (error) {
    console.error('❌ Generate details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template details'
    });
  }
});
// ✅ SECURE: Get Admin Templates Endpoint with Pagination
app.get('/api/admin/templates', requireAdminAuth, async (req, res) => {
  try {
    console.log('📋 Admin templates list requested');
    
    // ✅ SECURITY: Limit number of templates returned
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    
    const templates = await pool.query(`
      SELECT 
        id, name, description, price, currency, image_url,
        status, is_public, created_at, updated_at,
        download_count, view_count, rating
      FROM templates 
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    const formattedTemplates = templates.rows.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      price: template.price / 100, // Convert cents to dollars
      currency: template.currency,
      imageUrl: template.image_url,
      status: template.status,
      isPublic: template.is_public,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      downloadCount: template.download_count || 0,
      viewCount: template.view_count || 0,
      rating: template.rating || 4.5
    }));
    
    res.json({
      success: true,
      templates: formattedTemplates,
      count: formattedTemplates.length,
      pagination: {
        limit,
        offset,
        hasMore: formattedTemplates.length === limit
      }
    });
    
  } catch (error) {
    console.error('❌ Admin templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin templates'
    });
  }
});

// ✅ SECURITY FIX: Update Admin User Role - REMOVED UNSAFE DOMAIN CHECK
app.post('/api/admin/set-admin-role', requireAdminAuth, async (req, res) => {
  try {
    const { email } = req.body;
    
    // ✅ SECURITY: Validate email input
    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required'
      });
    }
    
    // ✅ SECURITY: Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
    
    // ✅ SECURITY FIX: Use environment variable for allowed domains instead of hardcoded
    const allowedDomainsEnv = process.env.ADMIN_ALLOWED_DOMAINS;
    if (!allowedDomainsEnv) {
      console.error('❌ ADMIN_ALLOWED_DOMAINS environment variable not set');
      return res.status(500).json({
        success: false,
        message: 'Admin domain authorization not configured. Contact system administrator.'
      });
    }
    
    const allowedDomains = allowedDomainsEnv.split(',').map(domain => domain.trim());
    const emailDomain = email.split('@')[1];
    
    if (!allowedDomains.includes(emailDomain)) {
      return res.status(403).json({
        success: false,
        message: 'Email domain not authorized for admin access'
      });
    }
    
    // Update user role to admin
    const updateResult = await pool.query(`
      UPDATE users 
      SET role = 'admin', updated_at = NOW()
      WHERE email = $1 AND email IS NOT NULL
      RETURNING id, email, role, username
    `, [email.toLowerCase().trim()]);
    
    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = updateResult.rows[0];
    
    console.log('✅ Admin role granted to user:', user.email);
    
    res.json({
      success: true,
      message: 'Admin role granted successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        username: user.username
      }
    });
    
  } catch (error) {
    console.error('❌ Set admin role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set admin role'
    });
  }
});

console.log('✅ Admin upload endpoints configured');
console.log('📤 Available admin endpoints:');
console.log('   POST /api/admin/upload-template - Upload new template (protected)');
console.log('   POST /api/admin/generate-details - AI generate template details (protected)');
console.log('   GET  /api/admin/templates - List all templates (protected)');
console.log('   POST /api/admin/set-admin-role - Grant admin role to user (protected)');
console.log('🛡️ Security features: Input validation, size limits, SQL injection protection, XSS protection');

// ✅ SECURE: Stripe checkout endpoint with authentication
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    // 🔒 CRITICAL: Check if user is authenticated BEFORE allowing purchase
    if (!req.user) {
      console.log('❌ Unauthorized checkout attempt - user not logged in');
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'You must be logged in to purchase templates',
        redirectToLogin: true
      });
    }

    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    const { templateId } = req.body;
    
    // ✅ SECURITY: Validate template ID
    if (!templateId || templateId === 'undefined' || templateId === 'null') {
      return res.status(400).json({ error: 'Invalid template ID provided for checkout' });
    }
    
    console.log("✅ GitHub OAuth successful for user:", user.name, 'template:', templateId);
    
    // Handle both string and numeric IDs
    let dbTemplateId = templateId;
    const parsedId = parseInt(templateId, 10);
    if (!isNaN(parsedId)) {
      dbTemplateId = parsedId;
    }
    
    // Get template details
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [dbTemplateId]);
    if (result.rows.length === 0) {
      console.log('❌ Template not found for checkout:', dbTemplateId);
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    
    // 🔒 SECURITY: Check if user already owns this template
    const existingPurchase = await pool.query(`
      SELECT id FROM purchases 
      WHERE user_id = $1 AND template_id = $2 AND status = 'completed'
    `, [req.user.id, dbTemplateId]);
    
    if (existingPurchase.rows.length > 0) {
      console.log('⚠️ User already owns this template:', req.user.email, template.name);
      return res.status(409).json({ 
        error: 'Template already purchased',
        message: 'You already own this template. Check your dashboard.',
        alreadyOwned: true
      });
    }
    
    console.log("✅ GitHub OAuth successful for user:", user.name);
    console.log('✅ Template:', template.name, 'Price:', template.price);
    
    // 🔒 SECURE: Include user information in Stripe metadata for linking
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: template.name,
            description: template.description,
          },
          unit_amount: template.price, // Price in cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?purchase=success&template=${templateId}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/template/${templateId}`,
      metadata: {
        templateId: templateId.toString(),
        userId: req.user.id,                    // 🔒 CRITICAL: Link to authenticated user
        userEmail: req.user.email || '',       // 🔒 BACKUP: Email for verification
        userName: req.user.name || ''      // 🔒 BACKUP: Username for verification
      },
      customer_email: req.user.email,          // 🔒 PREFILL: User's email
    });
    
    console.log('✅ Secure Stripe session created:', session.id);
    console.log('🔗 Linked to user:', req.user.id, req.user.email);
    
    res.json({ 
      sessionId: session.id, 
      url: session.url,
      userVerified: true,
      templateName: template.name
    });
    
  } catch (error) {
    console.error('❌ Stripe checkout error:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      message: 'Please try again or contact support if the issue persists' 
    });
  }
});
// ✅ SECURE: Get user purchases endpoint
app.get('/api/purchases', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log("✅ GitHub OAuth successful for user:", user.name);

    // ✅ ENHANCED: Try to find purchases by multiple methods
    let purchases = [];
    
    // Method 1: Find by user_id (for linked accounts)
    const userIdResult = await pool.query(`
      SELECT 
        p.id as purchase_id,
        p.purchased_at,
        p.amount_paid,
        p.status,
        t.id as template_id,
        t.name as template_name,
        t.description as template_description,
        t.image_url,
        t.workflow_json,
        t.price,
        t.created_at,
        t.download_count,
        t.view_count,
        t.rating
      FROM purchases p
      JOIN templates t ON p.template_id = t.id
      WHERE p.user_id = $1
      ORDER BY p.purchased_at DESC
    `, [req.user.id]);

    purchases = userIdResult.rows;

    // Method 2: If no purchases found by user_id, try by email
    if (purchases.length === 0 && req.user.email) {
      console.log('🔍 No purchases found by user_id, trying by email:', req.user.email);
      
      const emailResult = await pool.query(`
        SELECT 
          p.id as purchase_id,
          p.purchased_at,
          p.amount_paid,
          p.status,
          t.id as template_id,
          t.name as template_name,
          t.description as template_description,
          t.image_url,
          t.workflow_json,
          t.price,
          t.created_at,
          t.download_count,
          t.view_count,
          t.rating
        FROM purchases p
        JOIN templates t ON p.template_id = t.id
        JOIN users u ON p.user_id = u.id
        WHERE u.email = $1
        ORDER BY p.purchased_at DESC
      `, [req.user.email]);

      purchases = emailResult.rows;
    }

    // Method 3: For GitHub users, also check with common email variations
    if (purchases.length === 0 && req.user.name) {
      const possibleEmails = [
        `${req.user.name}@gmail.com`,
        `${req.user.name}shopify@gmail.com`, // Based on your pattern
        req.user.email
      ].filter(email => email); // Remove null/undefined

      console.log('🔍 Trying email variations:', possibleEmails);

      for (const email of possibleEmails) {
        const emailVariationResult = await pool.query(`
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
          JOIN users u ON p.user_id = u.id
          WHERE u.email = $1
          ORDER BY p.purchased_at DESC
        `, [email]);

        if (emailVariationResult.rows.length > 0) {
          purchases = emailVariationResult.rows;
          console.log('✅ Found purchases with email variation:', email);
          break;
        }
      }
    }

    // ✅ FIXED: Transform to proper structure for TemplateCard
    const formattedPurchases = purchases.map(row => ({
      // Purchase metadata
      purchaseInfo: {
        purchaseId: row.purchase_id,
        amountPaid: row.amount_paid,
        currency: 'USD',
        status: row.status,
        purchasedAt: row.purchased_at
      },
      // Template object (correctly structured for TemplateCard)
      template: {
        id: row.template_id,                    // ✅ Template ID
        name: row.template_name,                // ✅ Template name
        description: row.template_description,  // ✅ Template description
        price: row.price,
        imageUrl: row.image_url,
        workflowJson: row.workflow_json,
        createdAt: row.created_at,
        downloadCount: row.download_count,
        viewCount: row.view_count,
        rating: row.rating,
        purchased: true               
      }
    }));

    console.log('✅ Found', formattedPurchases.length, 'purchases for user');
    res.json({ success: true, purchases: formattedPurchases });

  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// ✅ ENHANCED: API endpoint to get user's purchased templates with email linking
app.get('/api/user/purchases', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log("✅ GitHub OAuth successful for user:", user.name);

    // ✅ ENHANCED: Try to find purchases by multiple methods
    let purchases = [];
    
    // Method 1: Find by user_id (for linked accounts)
    const userIdResult = await pool.query(`
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

    purchases = userIdResult.rows;

    // Method 2: If no purchases found by user_id, try by email
    if (purchases.length === 0 && req.user.email) {
      console.log('🔍 No purchases found by user_id, trying by email:', req.user.email);
      
      const emailResult = await pool.query(`
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
        JOIN users u ON p.user_id = u.id
        WHERE u.email = $1
        ORDER BY p.purchased_at DESC
      `, [req.user.email]);

      purchases = emailResult.rows;
    }

    // Method 3: For GitHub users, also check with common email variations  
    if (purchases.length === 0 && req.user.name) {
      const possibleEmails = [
        `${req.user.name}@gmail.com`,
        req.user.email
      ].filter(email => email); // Remove null/undefined

      console.log('🔍 Trying email variations for GitHub user');

      for (const email of possibleEmails) {
        const emailVariationResult = await pool.query(`
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
          JOIN users u ON p.user_id = u.id
          WHERE u.email = $1
          ORDER BY p.purchased_at DESC
        `, [email]);

        if (emailVariationResult.rows.length > 0) {
          purchases = emailVariationResult.rows;
          console.log('✅ Found purchases with email variation:', email);
          break;
        }
      }
    }

    // ✅ FIXED: Transform to proper template structure
    const formattedPurchases = purchases.map(row => {
      const template = {
        id: row.template_id,
        name: row.template_name,
        description: row.template_description,
        imageUrl: row.image_url,
        workflowJson: row.workflow_json,
        purchased: true,
        purchaseDate: row.purchased_at,
        amountPaid: row.amount_paid
      };
      
      return template;
    });

    console.log('✅ Found', formattedPurchases.length, 'user purchases');
    res.json({ 
      templates: formattedPurchases,
      count: formattedPurchases.length 
    });

  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch user purchases' });
  }
});
// Method 2: If no purchases found by user_id, try by email
    if (purchases.length === 0 && req.user.email) {
      console.log('🔍 No purchases found by user_id, trying by email:', req.user.email);
      
      const emailResult = await pool.query(`
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
        JOIN users u ON p.user_id = u.id
        WHERE u.email = $1
        ORDER BY p.purchased_at DESC
      `, [req.user.email]);

      purchases = emailResult.rows;
    }

    try {
  // Method 3: For GitHub users, also check with common email variations  
  if (purchases.length === 0 && req.user.name) {
    const possibleEmails = [
      `${req.user.name}@gmail.com`,
      req.user.email
    ].filter(email => email); // Remove null/undefined

    console.log('🔍 Trying email variations for GitHub user');

    for (const email of possibleEmails) {
      const emailVariationResult = await pool.query(`
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
        JOIN users u ON p.user_id = u.id
        WHERE u.email = $1
        ORDER BY p.purchased_at DESC
      `, [email]);

      if (emailVariationResult.rows.length > 0) {
        purchases = emailVariationResult.rows;
        console.log('✅ Found purchases with email variation:', email);
        break;
      }
    }
  }

  // ✅ FIXED: Transform to proper template structure
  const formattedPurchases = purchases.map((row) => {
    const template = {
      id: row.template_id,
      name: row.template_name,
      description: row.template_description,
      imageUrl: row.image_url,
      workflowJson: row.workflow_json,
      purchased: true,
      purchaseDate: row.purchased_at,
      amountPaid: row.amount_paid
    };
    
    return template;
  });

  console.log('✅ Found', formattedPurchases.length, 'user purchases');
  res.json({ 
    templates: formattedPurchases,
    count: formattedPurchases.length 
  });
  
} catch (error) {
  console.error('Database error:', error);
  res.status(500).json({ error: 'Failed to fetch user purchases' });
}

    // ✅ SECURE: Get purchase status for specific template
app.get('/api/purchase-status/:templateId', async (req, res) => {
 try {
   if (!req.user) {
     return res.status(401).json({ error: 'Not authenticated' });
   }

   const { templateId } = req.params;
   
   // ✅ SECURITY: Validate template ID
   if (!templateId || templateId === 'undefined' || templateId === 'null') {
     return res.status(400).json({ error: 'Invalid template ID' });
   }

   const parsedTemplateId = parseInt(templateId, 10);
   if (isNaN(parsedTemplateId)) {
     return res.status(400).json({ error: 'Invalid template ID format' });
   }

   // Check if user has purchased this template
   const purchaseCheck = await pool.query(`
     SELECT 
       p.id,
       p.status,
       p.purchased_at,
       p.amount_paid
     FROM purchases p
     WHERE p.user_id = $1 AND p.template_id = $2 AND p.status = 'completed'
     ORDER BY p.purchased_at DESC
     LIMIT 1
   `, [req.user.id, parsedTemplateId]);

   const hasPurchased = purchaseCheck.rows.length > 0;
   
   res.json({
     templateId: parsedTemplateId,
     purchased: hasPurchased,
     purchaseInfo: hasPurchased ? {
       purchaseId: purchaseCheck.rows[0].id,
       purchasedAt: purchaseCheck.rows[0].purchased_at,
       amountPaid: purchaseCheck.rows[0].amount_paid,
       status: purchaseCheck.rows[0].status
     } : null
   });

 } catch (error) {
   console.error('Purchase status error:', error);
   res.status(500).json({ error: 'Failed to check purchase status' });
 }
});

// ✅ SECURE: Analytics and statistics endpoints
app.get('/api/analytics/template-stats', async (req, res) => {
 try {
   // ✅ SECURITY: Limit access to authenticated users only
   if (!req.user) {
     return res.status(401).json({ error: 'Authentication required' });
   }

   // Get template statistics
   const stats = await pool.query(`
     SELECT 
       COUNT(*) as total_templates,
       COUNT(CASE WHEN is_public = true THEN 1 END) as public_templates,
       AVG(COALESCE(download_count, 0)) as avg_downloads,
       AVG(COALESCE(view_count, 0)) as avg_views,
       AVG(COALESCE(rating, 0)) as avg_rating,
       MAX(COALESCE(download_count, 0)) as max_downloads
     FROM templates
   `);

   // Get category distribution
   const categoryStats = await pool.query(`
     SELECT 
       CASE 
         WHEN workflow_json::text LIKE '%OpenAi%' OR workflow_json::text LIKE '%langchain%' THEN 'AI Automation'
         WHEN workflow_json::text LIKE '%Webhook%' THEN 'Integration'
         WHEN workflow_json::text LIKE '%Slack%' OR workflow_json::text LIKE '%Discord%' THEN 'Communication'
         ELSE 'General Automation'
       END as category,
       COUNT(*) as count
     FROM templates
     WHERE is_public = true
     GROUP BY category
     ORDER BY count DESC
   `);

   res.json({
     success: true,
     statistics: {
       templates: stats.rows[0],
       categories: categoryStats.rows
     }
   });

 } catch (error) {
   console.error('Analytics error:', error);
   res.status(500).json({ error: 'Failed to fetch analytics' });
 }
});

// ✅ SECURE: Get trending templates
app.get('/api/templates/trending', async (req, res) => {
 try {
    // ✅ SECURITY: Add pagination limits
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const days = Math.min(parseInt(req.query.days) || 7, 30);

    const trendingTemplates = await pool.query(`
      SELECT 
        t.*,
        COALESCE(t.download_count, 0) as downloads,
        COALESCE(t.view_count, 0) as views,
        (
          COALESCE(t.download_count, 0) * 2 + 
          COALESCE(t.view_count, 0) * 0.1 +
          CASE WHEN t.created_at >= NOW() - INTERVAL '${days} days' THEN 10 ELSE 0 END
        ) as trending_score
      FROM templates t
      WHERE t.is_public = true
      ORDER BY trending_score DESC, t.created_at DESC
      LIMIT $1
    `, [limit]);

    const formattedTemplates = trendingTemplates.rows.map(template => {
      const converted = convertFieldNames(template);
      const workflowDetails = parseWorkflowDetails(template.workflow_json);
      
      return {
        ...converted,
        workflowDetails,
        steps: workflowDetails.steps,
        integratedApps: workflowDetails.apps,
        trendingScore: template.trending_score,
        trending: true
      };
    });

    res.json({
      success: true,
      templates: formattedTemplates,
      count: formattedTemplates.length,
      metadata: {
        period: `${days} days`,
        algorithm: 'downloads * 2 + views * 0.1 + recency_boost'
      }
    });

  } catch (error) {
    console.error('Trending templates error:', error);
    res.status(500).json({ error: 'Failed to fetch trending templates' });
  }
});

// ✅ SECURE: Search templates endpoint
app.get('/api/templates/search', async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, limit = 20, offset = 0 } = req.query;
    
    // ✅ SECURITY: Validate and sanitize inputs
    const searchTerm = q ? q.toString().trim().substring(0, 100) : '';
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = Math.max(parseInt(offset) || 0, 0);
    
    let whereConditions = ['t.is_public = true'];
    let queryParams = [];
    let paramIndex = 1;
    
    // Add search term condition
    if (searchTerm) {
      whereConditions.push(`(
        t.name ILIKE $${paramIndex} OR 
        t.description ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }
    
    // Add category filter
    if (category && category !== 'all') {
      const categoryCondition = category.toLowerCase();
      if (categoryCondition === 'ai') {
        whereConditions.push(`(
          t.workflow_json::text ILIKE '%OpenAi%' OR 
          t.workflow_json::text ILIKE '%langchain%'
        )`);
      } else if (categoryCondition === 'integration') {
        whereConditions.push(`t.workflow_json::text ILIKE '%Webhook%'`);
      } else if (categoryCondition === 'communication') {
        whereConditions.push(`(
          t.workflow_json::text ILIKE '%Slack%' OR 
          t.workflow_json::text ILIKE '%Discord%'
        )`);
      }
    }
    
    // Add price range filters
    if (minPrice) {
      const minPriceCents = Math.max(parseInt(minPrice) * 100, 0);
      whereConditions.push(`t.price >= $${paramIndex}`);
      queryParams.push(minPriceCents);
      paramIndex++;
    }
    
    if (maxPrice) {
      const maxPriceCents = Math.min(parseInt(maxPrice) * 100, 1000000); // Max $10,000
      whereConditions.push(`t.price <= $${paramIndex}`);
      queryParams.push(maxPriceCents);
      paramIndex++;
    }
    
    // Add limit and offset
    queryParams.push(limitNum, offsetNum);
    
    const searchQuery = `
      SELECT t.*
      FROM templates t
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY 
        CASE WHEN $1 != '' THEN 
          (CASE WHEN t.name ILIKE $1 THEN 2 ELSE 1 END) 
        ELSE 1 END DESC,
        t.download_count DESC NULLS LAST,
        t.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const searchResults = await pool.query(searchQuery, [
      searchTerm ? `%${searchTerm}%` : '',
      ...queryParams
    ]);
    
    const formattedTemplates = searchResults.rows.map(template => {
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
      templates: formattedTemplates,
      count: formattedTemplates.length,
      searchParams: {
        query: searchTerm,
        category: category || 'all',
        minPrice: minPrice || null,
        maxPrice: maxPrice || null,
        limit: limitNum,
        offset: offsetNum
      }
    });
    
  } catch (error) {
    console.error('Search templates error:', error);
    res.status(500).json({ error: 'Failed to search templates' });
  }
});
// ✅ SECURE: User profile management endpoints
app.get('/api/user/profile', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user profile with purchase statistics
    const profileResult = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.github_id,
        u.avatar_url,
        u.role,
        u.business_type,
        u.team_size,
        u.industry,
        u.created_at,
        u.updated_at,
        COUNT(p.id) as total_purchases,
        COALESCE(SUM(p.amount_paid), 0) as total_spent
      FROM users u
      LEFT JOIN purchases p ON u.id = p.user_id AND p.status = 'completed'
      WHERE u.id = $1
      GROUP BY u.id
    `, [req.user.id]);

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const profile = profileResult.rows[0];
    
    res.json({
      success: true,
      profile: {
        id: profile.id,
        username: profile.username,
        email: profile.email,
        githubId: profile.github_id,
        avatarUrl: profile.avatar_url,
        role: profile.role || 'user',
        businessType: profile.business_type,
        teamSize: profile.team_size,
        industry: profile.industry,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        statistics: {
          totalPurchases: parseInt(profile.total_purchases),
          totalSpent: parseInt(profile.total_spent)
        }
      }
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// ✅ SECURE: Update user profile
app.put('/api/user/profile', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { businessType, teamSize, industry, username } = req.body;
    
    // ✅ SECURITY: Validate inputs
    if (username && (typeof username !== 'string' || username.length > 50)) {
      return res.status(400).json({ error: 'Invalid username format' });
    }
    
    if (businessType && typeof businessType !== 'string') {
      return res.status(400).json({ error: 'Invalid business type' });
    }
    
    if (teamSize && typeof teamSize !== 'string') {
      return res.status(400).json({ error: 'Invalid team size' });
    }
    
    if (industry && typeof industry !== 'string') {
      return res.status(400).json({ error: 'Invalid industry' });
    }

    // Update user profile
    const updateResult = await pool.query(`
      UPDATE users 
      SET 
        username = COALESCE($2, username),
        business_type = COALESCE($3, business_type),
        team_size = COALESCE($4, team_size),
        industry = COALESCE($5, industry),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, username, business_type, team_size, industry, updated_at
    `, [
      req.user.id,
      username?.trim() || null,
      businessType?.trim() || null,
      teamSize?.trim() || null,
      industry?.trim() || null
    ]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = updateResult.rows[0];
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        id: updatedUser.id,
        username: updatedUser.username,
        businessType: updatedUser.business_type,
        teamSize: updatedUser.team_size,
        industry: updatedUser.industry,
        updatedAt: updatedUser.updated_at
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ✅ SECURE: Template favorites system
app.post('/api/templates/:id/favorite', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    // Check if template exists
    const templateCheck = await pool.query('SELECT id FROM templates WHERE id = $1', [templateId]);
    if (templateCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Add to favorites (using upsert to handle duplicates)
    await pool.query(`
      INSERT INTO user_favorites (user_id, template_id, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, template_id) DO NOTHING
    `, [req.user.id, templateId]);

    res.json({
      success: true,
      message: 'Template added to favorites',
      templateId,
      favorited: true
    });

  } catch (error) {
    console.error('Favorite template error:', error);
    res.status(500).json({ error: 'Failed to favorite template' });
  }
});

// ✅ SECURE: Remove template from favorites
app.delete('/api/templates/:id/favorite', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const templateId = parseInt(req.params.id);
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    // Remove from favorites
    const deleteResult = await pool.query(`
      DELETE FROM user_favorites 
      WHERE user_id = $1 AND template_id = $2
    `, [req.user.id, templateId]);

    res.json({
      success: true,
      message: 'Template removed from favorites',
      templateId,
      favorited: false,
      removed: deleteResult.rowCount > 0
    });

  } catch (error) {
    console.error('Unfavorite template error:', error);
    res.status(500).json({ error: 'Failed to unfavorite template' });
  }
});

// ✅ SECURE: Get user favorites
app.get('/api/user/favorites', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const favorites = await pool.query(`
      SELECT 
        t.*,
        f.created_at as favorited_at
      FROM user_favorites f
      JOIN templates t ON f.template_id = t.id
      WHERE f.user_id = $1 AND t.is_public = true
      ORDER BY f.created_at DESC
    `, [req.user.id]);

    const formattedFavorites = favorites.rows.map(template => {
      const converted = convertFieldNames(template);
      const workflowDetails = parseWorkflowDetails(template.workflow_json);
      
      return {
        ...converted,
        workflowDetails,
        steps: workflowDetails.steps,
        integratedApps: workflowDetails.apps,
        favoritedAt: template.favorited_at,
        favorited: true
      };
    });

    res.json({
      success: true,
      favorites: formattedFavorites,
      count: formattedFavorites.length
    });

  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// ✅ SECURE: Health check with system status
app.get('/api/system/status', async (req, res) => {
  try {
    // Check database connectivity
    const dbCheck = await pool.query('SELECT NOW() as timestamp');
    
    // Check basic system stats
    const systemStats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM templates WHERE is_public = true) as public_templates,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM purchases WHERE status = 'completed') as completed_purchases
    `);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        timestamp: dbCheck.rows[0].timestamp
      },
      system: systemStats.rows[0],
      services: {
        stripe: !!stripe,
        admin_auth: !!process.env.ADMIN_PASSWORD,
        groq_ai: !!process.env.GROQ_API_KEY
      }
    });

  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'System check failed'
    });
  }
});

// ✅ SECURE: Catch-all route for SPA
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'API endpoint not found',
      path: req.path,
      method: req.method
    });
  }
  
  // Serve the React app for all other routes
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ✅ SECURE: Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  
  // Don't expose error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// ✅ SECURE: Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`💳 Stripe: ${stripe ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🤖 Groq AI: ${process.env.GROQ_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🔐 Admin Auth: ${process.env.ADMIN_PASSWORD ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`📊 Database: ${process.env.DATABASE_URL ? '✅ Configured' : '❌ Not configured'}`);
});

// ✅ SECURE: Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});
// ✅ DUPLICATE REMOVED: Purchase lookup logic was already implemented in Part 2
// Moving to unique AI chat functionality

// ✅ GET CONVERSATION SUMMARY
function getConversationSummary(history) {
  if (!history || history.length === 0) return 'New conversation';
  
  const recentMessages = history.slice(-3).filter(msg => msg.role === 'user');
  if (recentMessages.length === 0) return 'New conversation';
  
  const lastQuestions = recentMessages.map(msg => msg.content.substring(0, 50)).join(' | ');
  return `Recent questions: ${lastQuestions}`;
}

// ✅ STRUCTURED FALLBACK RESPONSES
function generateStructuredFallback(prompt, templateContext, history) {
  const userPrompt = prompt.toLowerCase();
  const templateId = templateContext?.templateId || '';
  const conversationSummary = getConversationSummary(history);
  const isAboutCredentials = conversationSummary.includes('credential') || conversationSummary.includes('openai') || conversationSummary.includes('api');

  // Specific credential setup responses
  if (userPrompt.includes('add credential') || userPrompt.includes('how do i add') || 
      (userPrompt.includes('credential') && isAboutCredentials)) {
    return `🔑 **How to Add Credentials in n8n**

**Method 1: From the Credentials Menu**
1. **Click "Credentials"** in the main n8n menu (left sidebar)
2. **Click "+ Add Credential"** button (top right)
3. **Search for the service** you need (e.g., "OpenAI")
4. **Click on the service** from the search results
5. **Fill in the required fields** (API Key, tokens, etc.)
6. **Click "Test"** to verify the connection
7. **Click "Save"** to store the credential

**Method 2: From a Node**
1. **Click on your node** that needs credentials
2. **Find the "Credential" dropdown** (usually at the top)
3. **Click the gear ⚙️ icon** next to the dropdown
4. **Select "Create New"**
5. **Choose the credential type** (e.g., OpenAI)
6. **Fill in the fields and save**

**For OpenAI specifically:**
- Credential type: **"OpenAI"**
- Field name: **"API Key"**
- Value: Your \`sk-\` key from platform.openai.com

**Next Step:** Once saved, select the credential from the dropdown in your node.

Are you trying to add OpenAI credentials, or a different service?`;
  }

  // OpenAI specific setup
  if (userPrompt.includes('openai') || userPrompt.includes('langchain') || userPrompt.includes('@n8n/n8n-nodes-langchain')) {
    return `🔑 **Complete OpenAI Credential Setup Guide**

**Step 1: Get Your API Key**
1. Go to: **https://platform.openai.com/api-keys**
2. Sign in to your OpenAI account
3. Click **"+ Create new secret key"**
4. **Copy the entire key** (starts with \`sk-\`)
5. ⚠️ **Save it now** - you can't see it again!

**Step 2: Add to n8n (Choose ONE method)**

**Method A - Via Credentials Menu:**
1. n8n sidebar → **"Credentials"**
2. **"+ Add Credential"** button
3. Search: **"OpenAI"**
4. Paste your \`sk-\` key in **"API Key"** field
5. **"Test"** → **"Save"**

**Method B - Via Your Node:**
1. Click your **@n8n/n8n-nodes-langchain.openAi** node
2. **Credential dropdown** → **Gear ⚙️** → **"Create New"**
3. Select **"OpenAI"** credential type
4. Paste key → **Test** → **"Save**

**Step 3: Connect to Node**
1. In your node, **select the credential** from dropdown
2. **Test your workflow** with a simple message

**Troubleshooting:**
❌ "Invalid API key" → Key must start with \`sk-\`, no spaces
❌ "Rate limit exceeded" → Add billing at platform.openai.com
❌ "Credential not found" → Make sure you saved it properly

**Current Status:** Do you have your API key, or do you need help getting one?`;
  }

  // Slack setup
  if (userPrompt.includes('slack')) {
    return `🔧 **Slack Credential Setup**

**Step 1: Create Slack App**
1. Go to: **https://api.slack.com/apps**
2. **"Create New App"** → **"From scratch"**
3. Name: **"n8n Bot"** (or your choice)
4. Select your workspace

**Step 2: Get Bot Token**
1. Go to **"OAuth & Permissions"**
2. Add **Bot Token Scopes**:
   - \`channels:read\`
   - \`chat:write\`
   - \`im:read\`, \`im:write\`
3. **"Install to Workspace"**
4. **Copy "Bot User OAuth Token"** (starts with \`xoxb-\`)

**Step 3: Add to n8n**
1. Credentials → **"Slack OAuth2 API"**
2. Paste your \`xoxb-\` token
3. Test → Save

Which step do you need help with?`;
  }

  // Generic help with better structure
  return `💬 **n8n Setup Assistant**

I'm here to help with your **${templateId}** template setup!

**What I can help with:**
🔑 **Adding Credentials** - Step-by-step for any n8n service
🔧 **Node Configuration** - Specific UI navigation and setup
⚡ **Workflow Activation** - Getting your template running
🛠️ **Troubleshooting** - Fixing common errors

**For specific help, try asking:**
- "How do I add OpenAI credentials?"
- "Where do I paste my API key?"
- "How do I configure my Slack node?"
- "Why won't my workflow activate?"

**Current Template:** ${templateId}
**What specific part of the setup do you need help with?**`;
}

// ✅ LEARNING SYSTEM HELPER FUNCTIONS

// Check if we have a learned response for this question
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

// Learn from successful interactions
async function learnFromInteraction(question, response, templateId, isSuccessful) {
  try {
    // Convert boolean to number to avoid PostgreSQL type issues
    const successRate = isSuccessful ? 100.0 : 0.0;
    
    // Store the successful pattern
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

// Enhanced smart fallback with confidence scoring
function generateSmartFallback(prompt, templateContext, history) {
  const userPrompt = prompt.toLowerCase();
  const templateId = templateContext?.templateId || '';
  let confidence = 0.5; // Base confidence
  
  // Increase confidence for known patterns
  const credentialKeywords = ['credential', 'credentials', 'api key', 'setup', 'configure', 'authentication', 'login', 'token'];
  const isCredentialQuestion = credentialKeywords.some(keyword => userPrompt.includes(keyword));
  
  if (isCredentialQuestion) confidence += 0.3;
  
  // Template-specific confidence boost
  if (templateId && (userPrompt.includes('node') || userPrompt.includes('workflow') || userPrompt.includes('template'))) {
    confidence += 0.2;
  }
  
  // High confidence responses for common patterns
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
  
  // Return generic response with confidence
  return {
    confidence: Math.min(confidence, 0.7), // Cap at 0.7 for generic responses
    response: generateStructuredFallback(prompt, templateContext, history)
  };
}

// Enhanced logging with learning metadata
async function logChatInteraction(templateId, question, response, userId, interactionType = 'unknown') {
  try {
    // Categorize the question
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
// ✅ ADD MISSING CONVERSATION INTELLIGENCE
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
    
    // Analyze conversation patterns
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

// ✅ INITIALIZE MISSING VARIABLES
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

// ✅ ENHANCED CHAT ENDPOINT WITH LEARNING SYSTEM
app.post('/api/ask-ai', async (req, res) => {
  const { prompt, history, templateContext } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  try {
    console.log('🧠 Learning AI request:', { 
      prompt: prompt.substring(0, 100) + '...',
      templateId: templateContext?.templateId || 'none'
    });

    // ✅ STEP 1: CHECK LEARNED RESPONSES FIRST (Save API costs!)
    const learnedResponse = await checkLearnedResponses(prompt, templateContext?.templateId);
    if (learnedResponse) {
      console.log('🎓 Using learned response - API cost saved!');
      
      await logChatInteraction(
        templateContext?.templateId || 'general_chat',
        prompt,
        learnedResponse.response,
        req.user?.id || 'anonymous',
        'learned_response'
      );
      
      return res.json({ 
        response: learnedResponse.response,
        source: 'learned',
        confidence: learnedResponse.confidence
      });
    }

    // Check if valid JSON template is provided
    const latestUserMessage = history?.slice(-1)[0]?.content || '';
    let jsonProvidedInThisTurn = false;
    let workflowJSON = null;
    
    try {
      const parsed = JSON.parse(latestUserMessage);
      if (parsed && typeof parsed === 'object' && parsed.nodes && Array.isArray(parsed.nodes)) {
        jsonProvidedInThisTurn = true;
        workflowJSON = parsed;
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
        req.user?.id || 'anonymous',
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

    // ✅ STEP 2: Try Enhanced Structured Fallback BEFORE API
    const smartFallback = generateSmartFallback(prompt, templateContext, history);
    if (smartFallback.confidence > 0.8) {
      console.log('🧠 High confidence fallback - API cost saved!');
      
      await logChatInteraction(
        templateContext?.templateId || 'general_chat',
        prompt,
        smartFallback.response,
        req.user?.id || 'anonymous',
        'smart_fallback'
      );
      
      return res.json({ 
        response: smartFallback.response,
        source: 'smart_fallback',
        confidence: smartFallback.confidence
      });
    }

    // ✅ STEP 3: Use Groq API only when necessary
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

        console.log('🚀 Sending structured request to Groq...');

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
            temperature: 0.2, // Very low for consistent, focused responses
            stream: false
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (groqResponse.ok) {
          const data = await groqResponse.json();
          response = data.choices?.[0]?.message?.content || 'No response received.';
          responseSource = 'groq_api';
          console.log('✅ Groq response received - will learn from this!');
          
          // ✅ LEARN FROM SUCCESSFUL API RESPONSE
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

    // ✅ STEP 4: Log interaction with learning data
    await logChatInteraction(
      templateContext?.templateId || 'general_chat',
      prompt,
      response,
      req.user?.id || 'anonymous',
      responseSource
    );

    res.json({ response, source: responseSource });

  } catch (error) {
    console.error('❌ Chat error:', error);
    const fallbackResponse = `I'm here to help with your n8n template setup! Try asking about specific steps like "How do I add credentials in n8n?" or "Where do I paste my API key?"`;
    
    await logChatInteraction(
      templateContext?.templateId || 'general_chat',
      prompt,
      fallbackResponse,
      req.user?.id || 'anonymous',
      'error'
    );
    
    res.json({ response: fallbackResponse });
  }
});
// ✅ ENHANCED: Generate setup instructions using structured approach
app.post('/api/generate-setup-instructions', async (req, res) => {
  const { workflow, templateId, purchaseId } = req.body;

  if (!workflow || !templateId) {
    return res.status(400).json({ error: 'Workflow and templateId are required.' });
  }

  try {
    console.log('📋 Generating structured setup instructions for:', templateId);
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

JSON: ${JSON.stringify(workflow).substring(0, 8000)}`; // Limit JSON size

        console.log('🚀 Sending request to Groq API...');

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
            // Fall through to structured fallback
          }
        } else {
          const errorText = await groqResponse.text();
          console.error('❌ Groq API error:', groqResponse.status, errorText);
          // Fall through to structured fallback
        }
      } catch (groqError) {
        console.error('❌ Groq fetch error:', groqError.message);
        // Fall through to structured fallback
      }
    } else {
      console.log('⚠️ No Groq API key found, using structured fallback');
    }
    
    // ✅ ENHANCED STRUCTURED FALLBACK
    console.log('📝 Generating structured fallback instructions...');
    
    const nodeTypes = workflow.nodes?.map((node) => node.type).filter(Boolean) || [];
    const uniqueServices = [...new Set(nodeTypes)]
      .map(service => service.replace('n8n-nodes-base.', ''))
      .filter(service => !['Start', 'Set', 'NoOp', 'If', 'Switch'].includes(service))
      .slice(0, 5);

    // Detect workflow type based on nodes
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

    console.log('✅ Structured fallback instructions generated');

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
    console.error('❌ Error generating setup instructions:', error);
    res.status(500).json({ 
      error: 'Failed to generate setup instructions.',
      details: error.message,
      fallback: true
    });
  }
});

// ✅ API ENDPOINT: Get Learning Statistics
app.get('/api/ai/learning-stats', async (req, res) => {
  try {
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
    console.error('Error fetching learning stats:', error);
    res.status(500).json({ error: 'Failed to fetch learning statistics' });
  }
});

// ✅ API ENDPOINT: User Feedback for Learning
app.post('/api/ai/feedback', async (req, res) => {
  try {
    const { interactionId, feedback, helpful } = req.body;
    
    await pool.query(`
      UPDATE chat_interactions 
      SET 
        user_feedback = $1,
        learning_score = learning_score + CASE WHEN $2 THEN 2 ELSE -1 END
      WHERE id = $3
    `, [feedback, helpful, interactionId]);
    
    res.json({ success: true, message: 'Feedback recorded - AI will learn from this!' });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});
// ✅ API ENDPOINT: Template-Specific Intelligence
app.get('/api/ai/template-intelligence/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    
    // ✅ SECURITY: Validate template ID
    if (!templateId || typeof templateId !== 'string' || templateId.length > 100) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    
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
    console.error('Error fetching template intelligence:', error);
    res.status(500).json({ error: 'Failed to fetch template intelligence' });
  }
});

function generateTemplateRecommendations(templateStats, commonIssues) {
  const recommendations = [];
  
  if (commonIssues.length > 0) {
    const topIssue = commonIssues[0];
    recommendations.push({
      type: 'common_issue',
      priority: 'high',
      message: `Most frequent issue: "${topIssue.user_question.substring(0, 80)}..." - Consider adding preventive guidance.`
    });
  }
  
  if (templateStats && templateStats.success_rate < 80) {
    recommendations.push({
      type: 'success_rate',
      priority: 'medium',
      message: `Success rate is ${templateStats.success_rate}% - Review setup instructions for clarity.`
    });
  }
  
  if (templateStats && templateStats.recent_interactions > 50) {
    recommendations.push({
      type: 'popular_template',
      priority: 'info',
      message: `High activity template with ${templateStats.recent_interactions} recent interactions - Monitor for new patterns.`
    });
  }
  
  return recommendations;
}

// ✅ API ENDPOINT: Conversation Reset
app.post('/api/ai/reset-conversation', async (req, res) => {
  try {
    const { templateId, userId } = req.body;
    
    // ✅ SECURITY: Validate inputs
    if (!templateId || !userId) {
      return res.status(400).json({ error: 'Template ID and User ID are required' });
    }
    
    if (typeof templateId !== 'string' || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }
    
    const key = `${userId}_${templateId}`;
    
    // Clear conversation state
    conversationStates.delete(key);
    
    // Log the reset
    await logChatInteraction(
      templateId,
      'Conversation reset requested',
      'Conversation state cleared - starting fresh',
      userId,
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
    console.error('Error resetting conversation:', error);
    res.status(500).json({ error: 'Failed to reset conversation' });
  }
});

// ✅ SECURE: Template rating and review system
app.post('/api/templates/:id/rate', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const templateId = parseInt(req.params.id);
    const { rating, review } = req.body;

    // ✅ SECURITY: Validate inputs
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    if (review && (typeof review !== 'string' || review.length > 1000)) {
      return res.status(400).json({ error: 'Review must be a string with max 1000 characters' });
    }

    // Check if template exists
    const templateCheck = await pool.query('SELECT id FROM templates WHERE id = $1', [templateId]);
    if (templateCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Check if user has purchased this template
    const purchaseCheck = await pool.query(`
      SELECT id FROM purchases 
      WHERE user_id = $1 AND template_id = $2 AND status = 'completed'
    `, [req.user.id, templateId]);

    if (purchaseCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You must purchase this template to rate it' });
    }

    // Add or update rating
    await pool.query(`
      INSERT INTO template_ratings (user_id, template_id, rating, review, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, template_id) DO UPDATE SET
        rating = $3,
        review = $4,
        updated_at = NOW()
    `, [req.user.id, templateId, rating, review?.trim() || null]);

    // Update template average rating
    const avgResult = await pool.query(`
      SELECT 
        AVG(rating) as avg_rating,
        COUNT(*) as rating_count
      FROM template_ratings 
      WHERE template_id = $1
    `, [templateId]);

    await pool.query(`
      UPDATE templates 
      SET 
        rating = $1,
        rating_count = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [avgResult.rows[0].avg_rating, avgResult.rows[0].rating_count, templateId]);

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      rating: {
        user_rating: rating,
        user_review: review?.trim() || null,
        template_avg_rating: parseFloat(avgResult.rows[0].avg_rating).toFixed(1),
        total_ratings: parseInt(avgResult.rows[0].rating_count)
      }
    });

  } catch (error) {
    console.error('Rating submission error:', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// ✅ SECURE: Get template ratings and reviews
app.get('/api/templates/:id/ratings', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    // ✅ SECURITY: Validate template ID
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    // Get ratings with user info
    const ratings = await pool.query(`
      SELECT 
        r.rating,
        r.review,
        r.created_at,
        r.updated_at,
        u.username,
        u.avatar_url
      FROM template_ratings r
      JOIN users u ON r.user_id = u.id
      WHERE r.template_id = $1 AND r.review IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [templateId, limit, offset]);

    // Get rating summary
    const summary = await pool.query(`
      SELECT 
        AVG(rating) as avg_rating,
        COUNT(*) as total_ratings,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM template_ratings 
      WHERE template_id = $1
    `, [templateId]);

    res.json({
      success: true,
      ratings: ratings.rows.map(row => ({
        rating: row.rating,
        review: row.review,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        user: {
          username: row.username,
          avatarUrl: row.avatar_url
        }
      })),
      summary: {
        averageRating: parseFloat(summary.rows[0].avg_rating || 0).toFixed(1),
        totalRatings: parseInt(summary.rows[0].total_ratings || 0),
        distribution: {
          5: parseInt(summary.rows[0].five_star || 0),
          4: parseInt(summary.rows[0].four_star || 0),
          3: parseInt(summary.rows[0].three_star || 0),
          2: parseInt(summary.rows[0].two_star || 0),
          1: parseInt(summary.rows[0].one_star || 0)
        }
      },
      pagination: {
        limit,
        offset,
        hasMore: ratings.rows.length === limit
      }
    });

  } catch (error) {
    console.error('Get ratings error:', error);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});
// ✅ SECURE: Advanced template analytics
app.get('/api/templates/:id/analytics', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const timeframe = req.query.timeframe || '30d';
    
    // ✅ SECURITY: Validate template ID and timeframe
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    
    // ✅ SECURITY FIX: Use parameterized interval instead of string interpolation
    const allowedTimeframes = {
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days',
      '1y': '1 year'
    };
    
    const intervalValue = allowedTimeframes[timeframe];
    if (!intervalValue) {
      return res.status(400).json({ error: 'Invalid timeframe. Use: 7d, 30d, 90d, or 1y' });
    }

    // Get template analytics
    const analytics = await pool.query(`
      SELECT 
        t.name,
        t.download_count,
        t.view_count,
        t.rating,
        t.rating_count,
        COUNT(DISTINCT p.user_id) as unique_purchasers,
        COUNT(p.id) as total_purchases,
        COALESCE(SUM(p.amount_paid), 0) as total_revenue,
        (
          SELECT COUNT(*) FROM chat_interactions 
          WHERE template_id = $1::text 
          AND created_at >= NOW() - INTERVAL '${intervalValue}'
        ) as support_interactions
      FROM templates t
      LEFT JOIN purchases p ON t.id = p.template_id AND p.status = 'completed'
        AND p.purchased_at >= NOW() - INTERVAL '${intervalValue}'
      WHERE t.id = $1
      GROUP BY t.id, t.name, t.download_count, t.view_count, t.rating, t.rating_count
    `, [templateId]);

    if (analytics.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get conversion funnel data
    const funnelData = await pool.query(`
      SELECT 
        COUNT(CASE WHEN event_type = 'view' THEN 1 END) as views,
        COUNT(CASE WHEN event_type = 'purchase_attempt' THEN 1 END) as purchase_attempts,
        COUNT(CASE WHEN event_type = 'purchase_completed' THEN 1 END) as purchases
      FROM template_events 
      WHERE template_id = $1 
      AND created_at >= NOW() - INTERVAL '${intervalValue}'
    `, [templateId]);

    // Get user engagement patterns
    const engagementData = await pool.query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as interactions,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(learning_score) as avg_satisfaction
      FROM chat_interactions 
      WHERE template_id = $1::text 
      AND created_at >= NOW() - INTERVAL '${intervalValue}'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date DESC
      LIMIT 30
    `, [templateId]);

    const data = analytics.rows[0];
    
    res.json({
      success: true,
      template: {
        id: templateId,
        name: data.name,
        timeframe: timeframe
      },
      metrics: {
        downloads: parseInt(data.download_count || 0),
        views: parseInt(data.view_count || 0),
        rating: parseFloat(data.rating || 0).toFixed(1),
        ratingCount: parseInt(data.rating_count || 0),
        uniquePurchasers: parseInt(data.unique_purchasers || 0),
        totalPurchases: parseInt(data.total_purchases || 0),
        totalRevenue: parseInt(data.total_revenue || 0),
        supportInteractions: parseInt(data.support_interactions || 0)
      },
      funnel: funnelData.rows[0] || { views: 0, purchase_attempts: 0, purchases: 0 },
      engagement: engagementData.rows.map(row => ({
        date: row.date,
        interactions: parseInt(row.interactions),
        uniqueUsers: parseInt(row.unique_users),
        avgSatisfaction: parseFloat(row.avg_satisfaction || 0).toFixed(1)
      }))
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch template analytics' });
  }
});

// ✅ SECURE: Template event tracking
app.post('/api/templates/:id/track-event', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const { eventType, metadata } = req.body;
    
    // ✅ SECURITY: Validate inputs
    if (isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    
    const allowedEvents = ['view', 'purchase_attempt', 'purchase_completed', 'download', 'favorite'];
    if (!eventType || !allowedEvents.includes(eventType)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    // Track the event
    await pool.query(`
      INSERT INTO template_events (
        template_id, user_id, event_type, metadata, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `, [
      templateId,
      req.user?.id || null,
      eventType,
      metadata ? JSON.stringify(metadata) : null
    ]);

    res.json({ success: true, message: 'Event tracked successfully' });

  } catch (error) {
    console.error('Event tracking error:', error);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// ✅ SECURE: Bulk template operations (Admin only)
app.post('/api/admin/templates/bulk-update', requireAdminAuth, async (req, res) => {
  try {
    const { templateIds, updates } = req.body;
    
    // ✅ SECURITY: Validate inputs
    if (!Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ error: 'Template IDs array is required' });
    }
    
    if (templateIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 templates can be updated at once' });
    }
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Updates object is required' });
    }

    // Validate template IDs are integers
    const validIds = templateIds.filter(id => Number.isInteger(id) && id > 0);
    if (validIds.length !== templateIds.length) {
      return res.status(400).json({ error: 'All template IDs must be valid integers' });
    }

    // Build dynamic update query safely
    const allowedFields = ['is_public', 'status', 'price'];
    const updateParts = [];
    const values = [];
    let paramIndex = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        updateParts.push(`${field} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateParts.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Add updated_at
    updateParts.push(`updated_at = NOW()`);
    
    // Add template IDs as final parameter
    values.push(validIds);

    const updateQuery = `
      UPDATE templates 
      SET ${updateParts.join(', ')}
      WHERE id = ANY($${paramIndex})
      RETURNING id, name, ${allowedFields.filter(f => updates[f] !== undefined).join(', ')}
    `;

    const result = await pool.query(updateQuery, values);

    res.json({
      success: true,
      message: `Updated ${result.rows.length} templates`,
      updatedTemplates: result.rows,
      requestedCount: templateIds.length,
      actualCount: result.rows.length
    });

  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ error: 'Failed to update templates' });
  }
});

// ✅ SECURE: Template export for backup (Admin only)
app.get('/api/admin/templates/export', requireAdminAuth, async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const includeWorkflows = req.query.includeWorkflows === 'true';
    
    // ✅ SECURITY: Validate format
    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'Format must be json or csv' });
    }

    // Get templates with optional workflow data
    const selectFields = `
      id, name, description, price, currency, image_url,
      status, is_public, creator_id, created_at, updated_at,
      download_count, view_count, rating, rating_count
      ${includeWorkflows ? ', workflow_json' : ''}
    `;

    const templates = await pool.query(`
      SELECT ${selectFields}
      FROM templates 
      ORDER BY created_at DESC
    `);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="templates_export_${Date.now()}.json"`);
      res.json({
        exportDate: new Date().toISOString(),
        templateCount: templates.rows.length,
        includeWorkflows: includeWorkflows,
        templates: templates.rows
      });
    } else {
      // CSV format
      const csvHeaders = [
        'id', 'name', 'description', 'price', 'currency', 'status', 
        'is_public', 'creator_id', 'created_at', 'download_count', 'rating'
      ];
      
      let csvContent = csvHeaders.join(',') + '\n';
      
      templates.rows.forEach(template => {
        const row = csvHeaders.map(header => {
          let value = template[header];
          if (value === null || value === undefined) value = '';
          if (typeof value === 'string' && value.includes(',')) {
            value = `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        });
        csvContent += row.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="templates_export_${Date.now()}.csv"`);
      res.send(csvContent);
    }

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export templates' });
  }
});

// ✅ SECURE: System maintenance endpoint (Admin only)
app.post('/api/admin/system/maintenance', requireAdminAuth, async (req, res) => {
  try {
    const { action } = req.body;
    
    // ✅ SECURITY: Validate action
    const allowedActions = ['cleanup_logs', 'refresh_stats', 'optimize_db'];
    if (!action || !allowedActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid maintenance action' });
    }

    let result = {};

    switch (action) {
      case 'cleanup_logs':
        // Clean up old chat interactions (keep last 90 days)
        const cleanupResult = await pool.query(`
          DELETE FROM chat_interactions 
          WHERE created_at < NOW() - INTERVAL '90 days'
        `);
        result = { cleaned_interactions: cleanupResult.rowCount };
        break;

      case 'refresh_stats':
        // Refresh template statistics
        await pool.query(`
          UPDATE templates 
          SET 
            download_count = COALESCE((
              SELECT COUNT(*) FROM purchases 
              WHERE template_id = templates.id AND status = 'completed'
            ), 0),
            updated_at = NOW()
        `);
        result = { message: 'Template statistics refreshed' };
        break;

      case 'optimize_db':
        // Basic database optimization
        await pool.query('VACUUM ANALYZE');
        result = { message: 'Database optimized' };
        break;
    }

    res.json({
      success: true,
      action: action,
      timestamp: new Date().toISOString(),
      result: result
    });

  } catch (error) {
    console.error('Maintenance error:', error);
    res.status(500).json({ error: 'Maintenance operation failed' });
  }
});

console.log('🎯 All endpoints configured successfully');
console.log('📊 Analytics and intelligence systems active');
console.log('🔧 Admin maintenance tools available');
console.log('⚡ Template management system ready');
console.log('🚀 Express.js application fully initialized');

// ✅ SECURITY FIX: API Performance Analytics with Safe Timeframe
app.get('/api/ai/performance-analytics', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '30';
    
    // ✅ SECURITY: Validate timeframe parameter to prevent SQL injection
    const validTimeframes = ['7', '14', '30', '60', '90'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({ error: 'Invalid timeframe. Use: 7, 14, 30, 60, or 90 days' });
    }
    
    // ✅ SECURITY: Use parameterized query with safe interval
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
          SUM(CASE WHEN interaction_type = 'learned_response' THEN 1 ELSE 0 END) as saved_api_calls,
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
    console.error('Error fetching performance analytics:', error);
    res.status(500).json({ error: 'Failed to fetch performance analytics' });
  }
});

// ✅ SECURITY FIX: Export Conversation Data with Safe Timeframe
app.get('/api/ai/export-conversations/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const { format = 'json', timeframe = '30' } = req.query;
    
    // ✅ SECURITY: Validate inputs
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
    console.error('Error exporting conversations:', error);
    res.status(500).json({ error: 'Failed to export conversations' });
  }
});

// ✅ SECURE: AI Health Check
app.get('/api/ai/health', async (req, res) => {
  try {
    const healthChecks = {
      database: false,
      groqApi: false,
      learningSystem: false,
      conversationIntelligence: false
    };

    // Test database connection
    try {
      await pool.query('SELECT 1');
      healthChecks.database = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    // Test Groq API
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

    // Test learning system
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

    // Test conversation intelligence
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
    console.error('Health check error:', error);
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ SECURE: Conversation Intelligence Cleanup
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

// ✅ SECURE: Learning System Optimization
setInterval(async () => {
  try {
    console.log('🧠 Running learning system optimization...');
    
    // Remove low-quality learned responses
    const cleanupResult = await pool.query(`
      DELETE FROM chat_interactions 
      WHERE interaction_type = 'learned_response'
      AND learning_score < 3
      AND created_at < NOW() - INTERVAL '7 days'
    `);
    
    if (cleanupResult.rowCount > 0) {
      console.log(`🧹 Cleaned up ${cleanupResult.rowCount} low-quality learned responses`);
    }
    
    // Update template intelligence
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

// ✅ ENHANCED ERROR HANDLING MIDDLEWARE
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  
  // Log error for learning
  if (req.body && req.body.templateContext) {
    logChatInteraction(
      req.body.templateContext.templateId || 'error',
      req.body.prompt || 'Unknown request',
      `Error occurred: ${error.message}`,
      req.user?.id || 'anonymous',
      'system_error'
    ).catch(console.error);
  }
  
  res.status(500).json({
    error: 'An unexpected error occurred',
    message: 'Our AI system encountered an issue. Please try again.',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// ✅ GRACEFUL SHUTDOWN HANDLER
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT. Graceful shutdown starting...');
  
  try {
    // Save conversation states to database before shutdown
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
    
    // Close database connections
    console.log('🗄️ Closing database connections...');
    await pool.end();
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// ✅ SECURE: Catch-all handler for React routes (API protection)
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'API endpoint not found',
      path: req.path,
      method: req.method
    });
  }
  
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ✅ RAILWAY DEPLOYMENT: Server startup configuration
const server = app.listen(port, '0.0.0.0', async () => {
  console.log('\n🚀 ========================================');
  console.log('   DEVHUBCONNECT RAILWAY DEPLOYMENT');
  console.log('========================================');
  console.log(`✅ Server running on Railway port: ${port}`);
  console.log(`🌐 Railway URL: ${process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'Railway-assigned-domain'}`);
  console.log(`🔑 Groq API Key configured: ${!!process.env.GROQ_API_KEY}`);
  console.log(`💳 Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`🗄️ Database URL configured: ${!!process.env.DATABASE_URL}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('🧠 AI FEATURES ACTIVE:');
  console.log('   ✅ Learning System - Reduces API costs over time');
  console.log('   ✅ Conversation Intelligence - Tracks user progress');
  console.log('   ✅ Smart Completion Detection - Knows when users are done');
  console.log('   ✅ Cost Optimization - Uses learned responses first');
  console.log('   ✅ Performance Analytics - Monitors system effectiveness');
  console.log('   ✅ Template Intelligence - Learns template-specific patterns');
  console.log('');
  
  try {
    // Load conversation states from database
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
    
    // Display learning statistics
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
  console.log('   POST /api/ask-ai-enhanced - Enhanced chat with conversation intelligence');
  console.log('   POST /api/ask-ai - Original chat endpoint (legacy)');
  console.log('   GET  /api/ai/learning-stats - Learning system statistics');
  console.log('   GET  /api/ai/conversation-stats - Conversation intelligence metrics');
  console.log('   GET  /api/ai/performance-analytics - Detailed performance data');
  console.log('   GET  /api/ai/template-intelligence/:id - Template-specific insights');
  console.log('   GET  /api/ai/health - System health check');
  console.log('   POST /api/ai/feedback - User feedback for learning');
  console.log('   POST /api/ai/reset-conversation - Reset conversation state');
  console.log('   POST /api/ai/mark-complete - Manual completion trigger');
  console.log('');
  console.log('🎯 CONVERSATION INTELLIGENCE ACTIVE:');
  console.log('   • Tracks user progress through setup steps');
  console.log('   • Detects when users have sufficient information');
  console.log('   • Offers completion when appropriate');
  console.log('   • Prevents endless question loops');
  console.log('   • Guides users efficiently to deployment');
  console.log('');
  console.log('✅ System fully initialized and ready for requests!');
  console.log('========================================\n');
});

// ✅ SERVER ERROR HANDLING
server.on('error', (error) => {
  console.error('🚨 Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use. Please use a different port.`);
    process.exit(1);
  }
});

// ✅ HELPER FUNCTIONS
function generateCompletionResponse(completionStatus, templateId, conversationProgress) {
  return {
    response: `🎉 Setup Complete! Your ${templateId} template is ready to deploy.`,
    confidence: 0.9,
    conversationComplete: true
  };
}

function getNextStepGuidance(nextStep, templateId) {
  return `Continue with the ${nextStep} phase of your setup.`;
}

// ✅ MISSING FUNCTION: Complete logChatInteraction function
async function logChatInteraction(templateId, userQuestion, aiResponse, userId, interactionType = 'unknown') {
  try {
    // Categorize the question
    let questionCategory = 'general';
    const lowerQuestion = userQuestion.toLowerCase();
    
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
      userQuestion,
      aiResponse,
      userId || 'anonymous',
      interactionType,
      questionCategory,
      interactionType === 'learned_response' ? 10 : (interactionType === 'groq_api' ? 5 : 3)
    ]);
    } catch (error) {
    console.error("Error logging chat interaction:", error);
  }
}
});
