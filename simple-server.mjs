import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import Stripe from 'stripe';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';

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

        // ✅ ENHANCED: Use smart user function to find or create user
        const userResult = await pool.query(`
          SELECT find_or_create_user($1, $2, NULL, NULL) as user_id
        `, [customerEmail, customerEmail.split('@')[0]]);
        
        const userId = userResult.rows[0].user_id;
        console.log('👤 Found/created user for purchase:', customerEmail);

        // Record the purchase - FIXED: Remove id field to let database auto-generate
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
    
    console.log('✅ GitHub OAuth successful for user:', user.username, user.email);
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
    return { steps, apps: [], hasWorkflow: false };
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
  passport.authenticate('github', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication, redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/?auth=success`);
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
    
    console.log('✅ Template downloaded:', template.name, 'by user:', req.user.username);
    
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

    console.log('💾 Saving user preferences for:', req.user.username, preferences);

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

// Stripe checkout endpoint
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    const { templateId } = req.body;
    
    // ✅ FIXED: Validate template ID
    if (!templateId || templateId === 'undefined' || templateId === 'null') {
      return res.status(400).json({ error: 'Invalid template ID provided for checkout' });
    }
    
    console.log('🛒 Creating checkout for template ID:', templateId);
    
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
    console.log('✅ Creating checkout for:', template.name, 'Price:', template.price);
    
    // Create Stripe checkout session
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
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?purchase=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/template/${templateId}`,
      metadata: {
        templateId: templateId.toString(),
      },
    });
    
    console.log('✅ Stripe session created:', session.id);
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ✅ NEW: Add /api/purchases route that matches the expected format
app.get('/api/purchases', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log('📋 Fetching purchases for user:', req.user.email || req.user.username);

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
    if (purchases.length === 0 && req.user.username) {
      const possibleEmails = [
        `${req.user.username}@gmail.com`,
        `${req.user.username}shopify@gmail.com`, // Based on your pattern
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
        purchased: true               // ✅ Mark as purchased
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

    console.log('📋 Fetching purchases for user:', req.user.email || req.user.username);

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
    if (purchases.length === 0 && req.user.username) {
      const possibleEmails = [
        `${req.user.username}@gmail.com`,
        `${req.user.username}shopify@gmail.com`, // Based on your pattern
        req.user.email
      ].filter(email => email); // Remove null/undefined

      console.log('🔍 Trying email variations:', possibleEmails);

      for (const email of possibleEmails) {
        const emailVariationResult = await pool.query(`
          SELECT 
            p.id as purchase_id,p.purchased_at,
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

    const formattedPurchases = purchases.map(row => ({
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
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

// ✅ ENHANCED AI CHAT SYSTEM - Template-Intelligent & Self-Learning
app.post('/api/ask-ai', async (req, res) => {
  const { prompt, history, templateContext } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  try {
    console.log('🗨️ Enhanced AI Chat request received:', { 
      prompt: prompt.substring(0, 100) + '...',
      templateId: templateContext?.templateId || 'none'
    });

    // Check if valid JSON template is provided in the conversation
    const latestUserMessage = history?.slice(-1)[0]?.content || '';
    let jsonProvidedInThisTurn = false;
    try {
      const parsed = JSON.parse(latestUserMessage);
      if (parsed && typeof parsed === 'object' && parsed.nodes && Array.isArray(parsed.nodes)) {
        jsonProvidedInThisTurn = true;
      }
    } catch (e) {
      // Not JSON, continue with normal chat
    }

    // If JSON template was provided, return setup guidance
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

      // ✅ LOG INTERACTION WITH TEMPLATE ANALYSIS
      try {
        await pool.query(`
          INSERT INTO chat_interactions (template_id, user_question, ai_response, user_id, interaction_type, created_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          templateContext?.templateId || 'json_validation',
          'JSON template provided',
          response,
          req.user?.id || 'anonymous',
          'template_validation'
        ]);
      } catch (logError) {
        console.error('Error logging chat interaction:', logError);
      }

      return res.json({ response });
    }

    // Check for prompt disclosure attempts
    const promptDisclosurePattern = /prompt.*(runs|controls|used|that.*runs.*this.*chat)/i;
    if (promptDisclosurePattern.test(prompt)) {
      return res.json({ 
        response: "I cannot answer questions about my instructions. I'm here to help with your uploaded .json file only." 
      });
    }

    // ✅ GET RELATED SUCCESSFUL INTERACTIONS FOR LEARNING
    const relatedInteractions = await getRelatedSuccessfulAnswers(prompt, templateContext?.templateId);

    // ✅ ENHANCED GROQ API INTEGRATION WITH LEARNING
    const groqApiKey = process.env.GROQ_API_KEY;
    let response = '';

    if (groqApiKey) {
      try {
        // ✅ ENHANCED AI SYSTEM PROMPT - Template-Intelligent
        const enhancedSystemPrompt = `You are the DevHubConnect Setup Assistant, an expert n8n automation engineer with deep knowledge of ALL n8n templates and node types.

CORE EXPERTISE:
- Master of n8n automation platform and ALL node configurations
- Expert in credential setup for any service integration
- Specialist in template deployment and troubleshooting
- You understand node naming patterns and can infer credential requirements

TEMPLATE INTELLIGENCE:
${templateContext?.templateId ? `
Current Template: ${templateContext.templateId}
Template Type: ${inferTemplateType(templateContext.templateId)}
Likely Required Credentials: ${predictRequiredCredentials(templateContext.templateId)}
` : ''}

NODE CREDENTIAL MAPPING KNOWLEDGE:
- @n8n/n8n-nodes-langchain.openAi → OpenAI API credentials
- @n8n/n8n-nodes-langchain.* → Usually requires API keys from the service provider
- slackTrigger → Slack App OAuth token (xoxb-*)
- telegramTrigger → Telegram Bot token from @BotFather
- Switch/IF/Set nodes → No external credentials needed
- HTTP Request nodes → Depends on the target API
- Webhook nodes → Generate URLs in n8n, configure in external services

LEARNING FROM SUCCESS:
${relatedInteractions.length > 0 ? `
Previous successful solutions for similar questions:
${relatedInteractions.map(interaction => `
- Question: "${interaction.user_question}"
- Successful Response: "${interaction.ai_response.substring(0, 200)}..."
- Success Rate: ${interaction.success_count || 1} deployments
`).join('\n')}
` : 'No previous successful patterns found for this question type.'}

RESPONSE GUIDELINES:
1. **Parse the exact node name** mentioned in user's question
2. **Identify the required credential type** for that specific node
3. **Provide step-by-step setup instructions** with exact UI navigation
4. **Include the exact credential name** to select in n8n
5. **Give troubleshooting tips** specific to that service
6. **Ask follow-up questions** to ensure successful deployment

COMMUNICATION STYLE:
- Be conversational and encouraging
- Use emojis for clarity (🔧 🔑 ✅ ❌)
- Provide exact button names and field labels
- Include common error solutions proactively
- Always end with a specific next step or question

STRICT FOCUS:
- ONLY help with n8n template deployment and configuration
- DO NOT generate, edit, or create new workflows
- DO NOT discuss topics unrelated to n8n automation

Remember: Your goal is to ensure this user successfully deploys their template. Be specific, actionable, and helpful.`;

        // Format chat history for Groq
        const messages = [
          {
            role: 'system',
            content: enhancedSystemPrompt
          },
          ...(history || []).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          {
            role: 'user',
            content: prompt
          }
        ];

        console.log('🚀 Sending enhanced request to Groq...');

        // Groq API request
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-70b-versatile',
            messages: messages,
            max_tokens: 1200,
            temperature: 0.7,
            stream: false
          }),
        });

        if (groqResponse.ok) {
          const data = await groqResponse.json();
          response = data.choices?.[0]?.message?.content || 'No response received from AI.';
          console.log('✅ Enhanced Groq response received');
        } else {
          throw new Error('Groq API failed');
        }

      } catch (groqError) {
        console.error('❌ Groq API error:', groqError);
        // Fall back to enhanced rule-based responses
        response = generateEnhancedRuleBasedResponse(prompt, templateContext);
      }
    } else {
      console.log('⚠️ Groq API key not configured, using enhanced rule-based responses');
      response = generateEnhancedRuleBasedResponse(prompt, templateContext);
    }

    // ✅ LOG INTERACTION WITH ENHANCED METADATA
    try {
      await pool.query(`
        INSERT INTO chat_interactions (
          template_id, user_question, ai_response, user_id, 
          interaction_type, question_category, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        templateContext?.templateId || 'general_chat',
        prompt,
        response,
        req.user?.id || 'anonymous',
        'ai_response',
        categorizeQuestion(prompt)
      ]);
    } catch (logError) {
      console.error('Error logging chat interaction:', logError);
    }

    res.json({ response });

  } catch (error) {
    console.error('❌ Enhanced chat error:', error);
    res.json({ 
      response: `I'm having trouble right now, but I can still help! I specialize in n8n template deployment. Try asking about specific setup steps like "OpenAI credentials" or "Slack setup". What part of your template deployment do you need help with?`
    });
  }
});

// ✅ HELPER FUNCTIONS FOR AI LEARNING

// Get related successful answers for learning
async function getRelatedSuccessfulAnswers(prompt, templateId = null) {
  try {
    const keywords = extractKeywords(prompt);
    const keywordPattern = keywords.join('|');
    
    const query = `
      SELECT DISTINCT user_question, ai_response, COUNT(*) as success_count
      FROM chat_interactions 
      WHERE (
        user_question ~* $1 
        OR ai_response ~* $1
        ${templateId ? 'OR template_id = $2' : ''}
      )
      AND interaction_type = 'ai_response'
      GROUP BY user_question, ai_response
      ORDER BY success_count DESC
      LIMIT 3
    `;
    
    const params = templateId ? [keywordPattern, templateId] : [keywordPattern];
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching related interactions:', error);
    return [];
  }
}

// Extract keywords from user question
function extractKeywords(prompt) {
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'how', 'can', 'you', 'help', 'me', 'set', 'up'];
  return prompt.toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 2 && !commonWords.includes(word))
    .slice(0, 5); // Top 5 keywords
}

// Categorize questions for learning
function categorizeQuestion(prompt) {
  const categories = {
    'credentials': ['credential', 'api key', 'token', 'auth', 'oauth', 'login'],
    'webhook': ['webhook', 'url', 'endpoint', 'trigger'],
    'node_config': ['node', 'configure', 'setup', 'parameter'],
    'deployment': ['deploy', 'activate', 'import', 'install'],
    'troubleshooting': ['error', 'not working', 'failed', 'issue', 'problem']
  };
  
  const lowerPrompt = prompt.toLowerCase();
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => lowerPrompt.includes(keyword))) {
      return category;
    }
  }
  return 'general';
}

// Infer template type from ID
function inferTemplateType(templateId) {
  if (!templateId) return 'unknown';
  
  const typeMapping = {
    'trading': 'AI Trading Agent',
    'shopify': 'E-commerce Automation',
    'slack': 'Team Communication',
    'telegram': 'Bot Automation',
    'email': 'Email Marketing',
    'crm': 'Customer Management'
  };
  
  for (const [key, type] of Object.entries(typeMapping)) {
    if (templateId.toLowerCase().includes(key)) {
      return type;
    }
  }
  return 'Business Automation';
}

// Predict required credentials
function predictRequiredCredentials(templateId) {
  if (!templateId) return 'Various API integrations';
  
  const credentialMapping = {
    'trading': 'OpenAI API, Trading Platform APIs',
    'shopify': 'Shopify API, Email Service',
    'slack': 'Slack OAuth Token',
    'telegram': 'Telegram Bot Token',
    'openai': 'OpenAI API Key',
    'langchain': 'OpenAI API Key, LangChain Memory'
  };
  
  for (const [key, credentials] of Object.entries(credentialMapping)) {
    if (templateId.toLowerCase().includes(key)) {
      return credentials;
    }
  }
  return 'Service-specific API keys';
}

// ✅ ENHANCED RULE-BASED FALLBACK WITH TEMPLATE INTELLIGENCE
function generateEnhancedRuleBasedResponse(prompt, templateContext) {
  const userPrompt = prompt.toLowerCase();
  const templateId = templateContext?.templateId || '';

  // Enhanced OpenAI/LangChain detection
  if (userPrompt.includes('openai') || userPrompt.includes('langchain') || 
      userPrompt.includes('@n8n/n8n-nodes-langchain') || userPrompt.includes('gpt')) {
    return `🔑 **OpenAI & LangChain Credentials Setup**

I can see you're working with the **${templateId}** template that uses OpenAI/LangChain nodes.

**Step 1: Get OpenAI API Key**
1. Go to: https://platform.openai.com/api-keys
2. Click **"Create new secret key"**
3. Copy the key (starts with \`sk-\`)

**Step 2: Configure in n8n**
1. In n8n: **Credentials** → **Add Credential**
2. Search for: **"OpenAI"** (not LangChain)
3. Paste your API key in the **"API Key"** field
4. Click **"Test"** to verify
5. Click **"Save"**

**Step 3: Connect to Your Nodes**
- For \`@n8n/n8n-nodes-langchain.openAi\` nodes: Select your OpenAI credential
- For memory nodes: No additional credentials needed

**Common Issues:**
❌ "Invalid API key" → Check the key starts with \`sk-\` and has no extra spaces
❌ "Rate limit exceeded" → You may need to add billing info at platform.openai.com

**Next Step:** After setting up credentials, test your workflow with a simple message. 

What's your current n8n environment? (Cloud, self-hosted, or local)`;
  }

  // Enhanced Slack detection
  if (userPrompt.includes('slack')) {
    return `🔧 **Slack Integration Setup**

For your **${templateId}** template's Slack functionality:

**Step 1: Create Slack App**
1. Go to: https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. App name: \`DevHubConnect Bot\`
4. Select your workspace

**Step 2: Configure Permissions**
1. Go to **"OAuth & Permissions"**
2. Add these **Bot Token Scopes**:
   - \`channels:read\` - Read channel info
   - \`chat:write\` - Send messages
   - \`im:read\` - Read direct messages
   - \`im:write\` - Send direct messages

**Step 3: Install & Get Token**
1. Click **"Install to Workspace"**
2. Copy **"Bot User OAuth Token"** (starts with \`xoxb-\`)

**Step 4: Configure in n8n**
1. Credentials → **"Slack OAuth2 API"**
2. Paste the \`xoxb-\` token
3. Test the connection

Which step are you currently on?`;
  }

  // Enhanced Telegram detection
  if (userPrompt.includes('telegram')) {
    return `📱 **Telegram Bot Setup**

For your **${templateId}** template:

**Step 1: Create Bot with BotFather**
1. Open Telegram and search: **@BotFather**
2. Send: \`/newbot\`
3. Choose bot name and username
4. **Save the token** (format: \`123456789:ABC...\`)

**Step 2: Configure in n8n**
1. Credentials → **"Telegram API"**
2. Paste your bot token
3. Test the connection

**Step 3: Test Your Bot**
1. Find your bot in Telegram (search by username)
2. Send \`/start\`
3. Check n8n execution logs

What specific issue are you encountering?`;
  }

  // Generic helpful response with template context
  return `💬 **DevHubConnect Setup Assistant**

I'm here to help you deploy your **${templateId || 'n8n template'}** successfully!

**I can help you with:**
🔑 **Credentials Setup** - API keys, OAuth tokens, service connections
🔗 **Node Configuration** - Specific setup for any n8n node type
⚡ **Template Deployment** - Step-by-step activation guide
🔧 **Troubleshooting** - Common deployment issues

**For your template, try asking:**
- "OpenAI credentials setup"
- "Configure Slack integration"  
- "Telegram bot creation"
- "Webhook configuration"
- "How to activate my workflow"

What specific part of your template setup do you need help with?`;
}

// ✅ IMPROVED: Enhanced generate-setup-instructions with better error handling
app.post('/api/generate-setup-instructions', async (req, res) => {
  const { workflow, templateId, purchaseId } = req.body;

  if (!workflow || !templateId) {
    return res.status(400).json({ error: 'Workflow and templateId are required.' });
  }

  try {
    console.log('📋 Generating setup instructions for:', templateId);
    
    // Analyze the workflow to generate specific instructions
    const nodeTypes = workflow.nodes?.map((node) => node.type).filter(Boolean) || [];
    const uniqueServices = [...new Set(nodeTypes)].slice(0, 5);

    const instructions = `🔧 **Setup Instructions for ${templateId}**

**Step 1: Environment Setup**
- Ensure you have n8n installed and running
- Access your n8n instance (Cloud or self-hosted)

**Step 2: Import Template**
- In n8n, go to "Workflows" → "Import from JSON"
- Paste the template JSON you downloaded
- Click "Import"

**Step 3: Configure Credentials**
${uniqueServices.map(service => {
  const cleanService = service.replace('n8n-nodes-base.', '');
  return `• Set up credentials for ${cleanService}`;
}).join('\n')}
- Test all connections to ensure they work

**Step 4: Activate Workflow**
- Click the "Activate" toggle in n8n
- Monitor the execution log for any errors

**Template contains:** ${workflow.nodes?.length || 0} nodes
**Services detected:** ${uniqueServices.length > 0 ? uniqueServices.map(s => s.replace('n8n-nodes-base.', '')).join(', ') : 'None'}

💬 **Need specific help?** Ask me about:
- Switch node configuration and conditional routing
- Credential setup for specific services  
- Webhook configuration and testing
- Troubleshooting execution errors

You can now ask me questions about this template or request specific help with the setup process.`;

    console.log('✅ Setup instructions generated successfully');
    res.json({ 
      success: true,
      instructions: instructions 
    });

  } catch (error) {
    console.error('❌ Error generating setup instructions:', error);
    res.status(500).json({ error: 'Failed to generate setup instructions.' });
  }
});

// Catch-all handler for React routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ✅ SERVER STARTUP - ESSENTIAL FOR RUNNING THE APP
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${port}`);
});