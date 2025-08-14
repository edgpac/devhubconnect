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

// ✅ FIXED CHAT ENDPOINT - No Body Stream Error
app.post('/api/ask-ai', async (req, res) => {
  const { prompt, history, templateContext } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  try {
    console.log('🗨️ Chat request:', { 
      prompt: prompt.substring(0, 100) + '...',
      templateId: templateContext?.templateId || 'none',
      groqAvailable: !!process.env.GROQ_API_KEY
    });

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

      // Simple logging
      try {
        await pool.query(`
          INSERT INTO chat_interactions (template_id, user_question, ai_response, user_id, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [
          templateContext?.templateId || 'json_validation',
          'JSON template provided',
          response,
          req.user?.id || 'anonymous'
        ]);
      } catch (logError) {
        console.error('Error logging chat:', logError);
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

    // ✅ USE YOUR STRUCTURED PROMPT APPROACH
    const groqApiKey = process.env.GROQ_API_KEY;
    let response = '';

    if (groqApiKey) {
      try {
        // ✅ YOUR PROVEN STRUCTURED PROMPT
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
            model: 'llama-3.1-70b-versatile',
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
          console.log('✅ Structured Groq response received');
        } else {
          // ✅ FIX: Don't read response body if already failed
          console.error('❌ Groq API error:', groqResponse.status);
          throw new Error(`Groq API failed with status ${groqResponse.status}`);
        }

      } catch (groqError) {
        console.error('❌ Groq error:', groqError.message);
        response = generateStructuredFallback(prompt, templateContext, history);
      }
    } else {
      console.log('⚠️ No Groq key, using structured fallbacks');
      response = generateStructuredFallback(prompt, templateContext, history);
    }

    // Simple logging
    try {
      await pool.query(`
        INSERT INTO chat_interactions (template_id, user_question, ai_response, user_id, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [
        templateContext?.templateId || 'general_chat',
        prompt,
        response,
        req.user?.id || 'anonymous'
      ]);
    } catch (logError) {
      console.error('Error logging chat:', logError);
    }

    res.json({ response });

  } catch (error) {
    console.error('❌ Chat error:', error);
    res.json({ 
      response: `I'm here to help with your n8n template setup! Try asking about specific steps like "How do I add credentials in n8n?" or "Where do I paste my API key?"`
    });
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
            model: 'llama-3.1-70b-versatile',
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

// Catch-all handler for React routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ✅ SERVER STARTUP - The part you were looking for!
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${port}`);
  console.log(`🔑 Groq API Key configured: ${!!process.env.GROQ_API_KEY}`);
  console.log(`💳 Stripe configured: ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`🗄️ Database URL configured: ${!!process.env.DATABASE_URL}`);
});