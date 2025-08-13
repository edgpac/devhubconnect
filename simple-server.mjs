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

// GitHub OAuth Strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: `${process.env.FRONTEND_URL}/api/auth/github/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists
    const userQuery = await pool.query('SELECT * FROM users WHERE github_id = $1', [profile.id]);
    
    if (userQuery.rows.length > 0) {
      // User exists, return user
      return done(null, userQuery.rows[0]);
    } else {
      // Create new user with UUID for id
      const newUserQuery = await pool.query(`
        INSERT INTO users (id, github_id, username, email, avatar_url, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
        RETURNING *
      `, [
        profile.id,
        profile.username,
        profile.emails?.[0]?.value || null,
        profile.photos?.[0]?.value || null
      ]);
      
      return done(null, newUserQuery.rows[0]);
    }
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
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [parseInt(id)]);
    
    if (result.rows.length === 0) {
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
    
    res.json({ 
      template: enhancedTemplate,
      ...enhancedTemplate
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Stripe checkout endpoint
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    const { templateId } = req.body;
    
    // Get template details
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [templateId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    
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
      success_url: `${process.env.FRONTEND_URL}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/templates/${templateId}`,
      metadata: {
        templateId: templateId.toString(),
      },
    });
    
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Catch-all handler for React routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${port}`);
});