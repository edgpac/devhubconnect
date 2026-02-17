// ✅ PART 1: IMPORTS & BASIC SETUP - ALL FIXES APPLIED
import 'dotenv/config';
import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import fs from 'fs';  // ✅ ADDED FOR SEO META TAG INJECTION
import pg from 'pg';
const { Pool } = pg;
import Stripe from 'stripe';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import recommendationsRouter from './server/recommendationsRoutes.js';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import Groq from 'groq-sdk';
const pgSession = require('connect-pg-simple');

// Environment Variables and Configuration
const port = process.env.PORT || 3000;
const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://www.devhubconnect.com' : 'http://localhost:3000');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ✅ FIXED: Safe Stripe initialization with validation
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Stripe initialized successfully');
    }
  } catch (error) {
    console.error('❌ Stripe initialization failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
} else {
  console.error('❌ STRIPE_SECRET_KEY not configured');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1);

// ✅ GROQ INTEGRATION - SECURE & PROPERLY INITIALIZED
let groq = null;
if (process.env.GROQ_API_KEY) {
  try {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    console.log('✅ Groq API initialized successfully');
  } catch (error) {
    console.error('❌ Groq initialization failed:', error.message);
  }
} else {
  console.warn('⚠️ GROQ_API_KEY not configured - AI features will use fallbacks');
}

// ✅ SECURE: Rate limiting for AI requests
const AI_REQUEST_LIMITS = new Map();
const MAX_AI_REQUESTS_PER_MINUTE = process.env.NODE_ENV === 'production' ? 5 : 10;

function checkAIRateLimit(userId) {
  const now = Date.now();
  const userRequests = AI_REQUEST_LIMITS.get(userId) || [];
  
  const recentRequests = userRequests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= MAX_AI_REQUESTS_PER_MINUTE) {
    return false;
  }
  
  recentRequests.push(now);
  AI_REQUEST_LIMITS.set(userId, recentRequests);
  return true;
}

// ✅ NEW: Bot detection helper
const isBot = (userAgent) => {
  if (!userAgent) return false;
  return /bot|crawler|spider|headless|ahrefsbot/i.test(userAgent);
};

// ✅ MIDDLEWARE SETUP - CORRECT ORDER
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// ✅ NEW: Global disconnect handler - MUST BE EARLY
app.use((req, res, next) => {
  let disconnected = false;
  
  req.on('close', () => {
    if (!req.complete && !disconnected) {
      disconnected = true;
      // Only log in development and not for bots
      if (process.env.NODE_ENV !== 'production' && !isBot(req.get('User-Agent'))) {
        console.log('🔌 Client disconnected:', req.path);
      }
    }
  });
  
  // Attach helper to request
  req.isDisconnected = () => disconnected;
  
  // Add response error handler
  res.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNABORTED') {
      // Silently handle connection errors
      return;
    }
    console.error('Response error:', err);
  });
  
  next();
});

// ✅ NEW: Request timeout handler
app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  
  req.on('timeout', () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  
  next();
});

// CRITICAL FIX: Domain redirect middleware for Railway domain
app.use((req, res, next) => {
  const host = req.get('Host');
  if (host && host.includes('railway.app')) {
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    const targetDomain = process.env.FRONTEND_URL || 'https://www.devhubconnect.com';
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔄 Redirecting Railway domain ${host} to ${targetDomain}`);
    }
    return res.redirect(301, `${targetDomain}${req.url}`);
  }
  next();
});

// ✅ FIXED: Handle JavaScript files - NO MORE DISCONNECT SPAM
app.get('/assets/*.js', (req, res) => {
  // Skip logging for bots
  if (process.env.NODE_ENV !== 'production' && !isBot(req.get('User-Agent'))) {
    console.log('🔧 JavaScript route handler triggered for:', req.path);
  }
  
  const filePath = path.join(__dirname, 'dist', req.path);
  
  // Check if already disconnected
  if (req.isDisconnected()) return;
  
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  
  res.sendFile(filePath, (err) => {
    if (err) {
      // Handle disconnect errors silently
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ECONNABORTED') {
        return;
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.error('❌ Error serving JS file:', req.path, err.message);
      }
      
      if (!res.headersSent && !res.destroyed && !req.isDisconnected()) {
        res.status(404).send('JavaScript file not found');
      }
    } else if (process.env.NODE_ENV !== 'production' && !isBot(req.get('User-Agent'))) {
      console.log('✅ Successfully served JS file:', req.path);
    }
  });
});

// ✅ FIXED: Handle CSS files - NO MORE DISCONNECT SPAM
app.get('/assets/*.css', (req, res) => {
  if (process.env.NODE_ENV !== 'production' && !isBot(req.get('User-Agent'))) {
    console.log('🔧 CSS route handler triggered for:', req.path);
  }
  
  const filePath = path.join(__dirname, 'dist', req.path);
  
  if (req.isDisconnected()) return;
  
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  
  res.sendFile(filePath, (err) => {
    if (err) {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ECONNABORTED') {
        return;
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.error('❌ Error serving CSS file:', req.path, err.message);
      }
      
      if (!res.headersSent && !req.isDisconnected()) {
        res.status(404).send('CSS file not found');
      }
    } else if (process.env.NODE_ENV !== 'production' && !isBot(req.get('User-Agent'))) {
      console.log('✅ Successfully served CSS file:', req.path);
    }
  });
});

// ✅ OPTIMIZED SITEMAP - Replace lines 184-235 in simple-server.mjs
// This fixes: Dashboard URL removed, /template/ → /templates/, no pagination, adds static pages
app.get('/sitemap.xml', async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    console.log('🗺️ Generating optimized sitemap...');
    
    const templates = await pool.query(
      'SELECT id, updated_at FROM templates WHERE is_public = true ORDER BY id'
    );
    
    if (req.isDisconnected()) return;
    
    console.log(`📋 Found ${templates.rows.length} templates for sitemap`);
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.devhubconnect.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.devhubconnect.com/guidance</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.devhubconnect.com/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://www.devhubconnect.com/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`;
    
    templates.rows.forEach(template => {
      sitemap += `
  <url>
    <loc>https://www.devhubconnect.com/templates/${template.id}</loc>
    <lastmod>${template.updated_at.toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
    });
    
    sitemap += '\n</urlset>';
    
    const urlCount = (sitemap.match(/<url>/g) || []).length;
    console.log(`✅ Generated optimized sitemap with ${urlCount} URLs (${templates.rows.length} templates + 4 static pages)`);
    
    if (!req.isDisconnected() && !res.headersSent) {
      res.set('Content-Type', 'application/xml');
      res.send(sitemap);
    }
  } catch (error) {
    console.error('❌ Sitemap error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).send('Sitemap generation failed');
    }
  }
});

// ==================== DYNAMIC META TAG INJECTION FOR SEO ====================

// ✅ P0 FIX: Redirect /template/:id → /templates/:id (consolidate canonical signals)
app.get('/template/:id', (req, res) => {
  const templateId = req.params.id;
  if (templateId && /^\d+$/.test(templateId)) {
    return res.redirect(301, `/templates/${templateId}`);
  }
  res.status(404).sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ✅ CRITICAL: Template page meta tag injection for SEO - MUST BE BEFORE STATIC MIDDLEWARE
app.get('/templates/:id', async (req, res) => {
  try {
    if (req.isDisconnected()) return;

    const templateId = req.params.id;
    console.log('🔍 SEO: Serving template page with dynamic meta tags:', templateId);

    // ✅ SECURITY: Validate template ID is numeric
    if (!templateId || !/^\d+$/.test(templateId)) {
      console.log('❌ Invalid template ID format:', templateId);
      return res.status(404).sendFile(path.join(__dirname, 'dist', 'index.html'));
    }

    // Fetch template data from database (include meta_description for custom SEO overrides)
    const templateResult = await pool.query(
      'SELECT id, name, description, price, image_url, workflow_json, meta_description FROM templates WHERE id = $1 AND is_public = true',
      [templateId]
    );
    
    if (req.isDisconnected()) return;
    
    if (templateResult.rows.length === 0) {
      // Template not found - serve 404 page
      return res.status(404).sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
    
    const template = templateResult.rows[0];
    
    // Parse workflow details
    let stepCount = 0;
    let integratedApps = [];
    try {
      const workflow = template.workflow_json;
      if (workflow && workflow.nodes) {
        stepCount = workflow.nodes.length;
        const appTypes = workflow.nodes.map(node => {
          const parts = node.type.split('.');
          return parts.length > 1 ? parts[parts.length - 1] : parts[0];
        });
        integratedApps = [...new Set(appTypes)].filter(app => 
          !['Start', 'Set', 'NoOp', 'If', 'Switch'].includes(app)
        ).slice(0, 3);
      }
    } catch (e) {
      console.log('Could not parse workflow JSON for SEO');
    }
    
    // Build dynamic meta tags with CTR-optimized format
    const priceDisplay = template.price === 0 ? 'Free' : `$${(template.price / 100).toFixed(2)}`;
    const metaTitle = `${template.name} | n8n Template ${priceDisplay !== 'Free' ? `– ${priceDisplay}` : '(Free)'} | DevHubConnect`;
    const autoDescription = `${template.name}${stepCount > 0 ? ` — ${stepCount}-step` : ''} n8n automation${integratedApps.length > 0 ? ` with ${integratedApps.join(', ')}` : ''}. ${priceDisplay === 'Free' ? 'Free download' : `Only ${priceDisplay}`} — instant access, ready to import.`;
    const metaDescription = template.meta_description || autoDescription;
    const templateUrl = `https://www.devhubconnect.com/templates/${template.id}`;
    const imageUrl = template.image_url || 'https://www.devhubconnect.com/placeholder.svg';
    const priceValue = (template.price / 100).toFixed(2);
    
    // Read the base HTML file
    const htmlPath = path.join(__dirname, 'dist', 'index.html');
    let html = await fs.promises.readFile(htmlPath, 'utf8');
    
    // Replace the title
    html = html.replace(
      /<title>.*?<\/title>/,
      `<title>${metaTitle}</title>`
    );
    
    // Inject meta tags right after <title>
    const metaTags = `
    <meta name="title" content="${metaTitle}" />
    <meta name="description" content="${metaDescription}" />
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="product" />
    <meta property="og:url" content="${templateUrl}" />
    <meta property="og:title" content="${metaTitle}" />
    <meta property="og:description" content="${metaDescription}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:site_name" content="DevHubConnect" />
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${templateUrl}" />
    <meta name="twitter:title" content="${metaTitle}" />
    <meta name="twitter:description" content="${metaDescription}" />
    <meta name="twitter:image" content="${imageUrl}" />
    
    <!-- Structured Data - Product Schema -->
    <script type="application/ld+json">
    ${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      "name": template.name,
      "description": template.description,
      "image": imageUrl,
      "url": templateUrl,
      "offers": {
        "@type": "Offer",
        "url": templateUrl,
        "priceCurrency": "USD",
        "price": priceValue,
        "availability": "https://schema.org/InStock",
        "seller": {
          "@type": "Organization",
          "name": "DevHubConnect"
        }
      },
      "brand": {
        "@type": "Brand",
        "name": "DevHubConnect"
      },
      "category": "Software > Automation Tools"
    })}
    </script>
    
    <!-- Canonical URL -->
    <link rel="canonical" href="${templateUrl}" />`;
    
    html = html.replace('</title>', `</title>${metaTags}`);
    
    console.log(`✅ SEO: Injected dynamic meta tags for: ${template.name}`);
    
    if (!req.isDisconnected() && !res.headersSent) {
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    }
    
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('❌ SEO meta tag injection error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
  }
});

// ✅ General static middleware for other files - AFTER template route
app.use(express.static(path.join(__dirname, 'dist'), {
  index: false
}));

// ✅ CRITICAL FIX: STRIPE WEBHOOK MUST BE BEFORE express.json() AND FIXED PURCHASE LOGIC
app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!stripe || !endpointSecret) {
      console.error('❌ Stripe or webhook secret not configured');
      return res.status(400).send('Webhook configuration missing');
    }

    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Webhook signature verified:', event.type, 'at', new Date().toISOString());
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ✅ CRITICAL: Always respond with 200 first, then process
  res.status(200).json({received: true, eventType: event.type, eventId: event.id});

  // Process the webhook asynchronously after responding
  if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object;
      console.log('🎉 Processing payment completion for session:', session.id);
      
      const templateId = session.metadata?.templateId;
      const userId = session.metadata?.userId;
      const customerEmail = session.customer_details?.email;
      const amountPaid = session.amount_total;
      
      console.log('💰 Session data:', { 
        templateId, 
        userId, 
        customerEmail, 
        amountPaid,
        sessionId: session.id 
      });

      // ✅ CRITICAL: Validate all required data
      if (!templateId || !userId || !customerEmail || !amountPaid) {
        console.error('❌ Missing required session data:', { templateId, userId, customerEmail, amountPaid });
        return;
      }

      // ✅ SECURITY: Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail) || customerEmail.length > 320) {
        console.error('❌ Invalid email format in webhook:', customerEmail);
        return;
      }

      // Parse templateId as integer for database
      let dbTemplateId = templateId;
      const parsedId = parseInt(templateId, 10);
      if (!isNaN(parsedId)) {
        dbTemplateId = parsedId;
      }

      // ✅ FIXED: Check for existing purchase with BOTH session_id AND user/template combination
      console.log('🔍 Checking for existing purchase:', { sessionId: session.id, userId, templateId: dbTemplateId });
      
      const existingPurchase = await pool.query(
        'SELECT id, status, user_id, template_id FROM purchases WHERE stripe_session_id = $1 OR (user_id = $2 AND template_id = $3)',
        [session.id, userId, dbTemplateId]
      );

      if (existingPurchase.rows.length > 0) {
        const purchase = existingPurchase.rows[0];
        console.log('📋 Found existing purchase:', { id: purchase.id, status: purchase.status });
        
        if (purchase.status === 'completed') {
          console.log('⚠️ Purchase already completed for session:', session.id);
          return;
        }
        
        // ✅ FIXED: Update existing pending purchase to completed using EITHER session_id OR user/template match
        const updateResult = await pool.query(`
          UPDATE purchases 
          SET 
            status = 'completed', 
            completed_at = NOW(),
            amount_paid = $1,
            currency = $2,
            stripe_session_id = $3
          WHERE (stripe_session_id = $3 OR (user_id = $4 AND template_id = $5)) AND status = 'pending'
          RETURNING id, user_id, template_id, amount_paid, stripe_session_id
        `, [amountPaid, session.currency || 'usd', session.id, userId, dbTemplateId]);

        if (updateResult.rows.length > 0) {
          console.log('✅ EXISTING PURCHASE COMPLETED via webhook:', {
            purchaseId: updateResult.rows[0].id,
            sessionId: updateResult.rows[0].stripe_session_id,
            userId: updateResult.rows[0].user_id,
            templateId: updateResult.rows[0].template_id,
            amount: `$${(updateResult.rows[0].amount_paid / 100).toFixed(2)}`
          });
        } else {
          console.error('❌ Failed to update existing purchase for session:', session.id);
        }
        return;
      }

      // ✅ SECURITY: Validate template exists
      const templateCheck = await pool.query('SELECT id, name FROM templates WHERE id = $1', [dbTemplateId]);
      if (templateCheck.rows.length === 0) {
        console.error('❌ Template not found for purchase:', templateId);
        return;
      }

      // ✅ SECURITY: Validate user exists
      const userCheck = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        console.error('❌ User not found for purchase:', userId);
        return;
      }

      // ✅ CREATE NEW PURCHASE: If no existing purchase found, create as completed
      const purchaseResult = await pool.query(`
        INSERT INTO purchases (
          user_id, template_id, stripe_session_id, 
          amount_paid, currency, status, purchased_at, completed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, NOW(), NOW()
        ) RETURNING *
      `, [
        userId,
        dbTemplateId,
        session.id,
        amountPaid,
        session.currency || 'usd',
        'completed'
      ]);

      console.log('✅ NEW PURCHASE COMPLETED via webhook:', {
        purchaseId: purchaseResult.rows[0].id,
        templateName: templateCheck.rows[0].name,
        userEmail: userCheck.rows[0].email,
        amount: `$${(amountPaid / 100).toFixed(2)}`,
        sessionId: session.id
      });

    } catch (error) {
      console.error('❌ CRITICAL ERROR processing webhook:', {
        error: error.message,
        stack: error.stack,
        sessionId: event.data.object?.id,
        eventId: event.id,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    console.log(`ℹ️ Unhandled event type: ${event.type}`);
  }
});

// ✅ MIDDLEWARE SETUP - AFTER WEBHOOK BUT BEFORE OTHER ROUTES
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: frontendUrl,
  credentials: true
}));

// Security: Validate required environment variables
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ CRITICAL: JWT_SECRET missing or too weak (minimum 32 characters)');
  process.exit(1);
}

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  console.error('❌ CRITICAL: GitHub OAuth credentials missing');
  process.exit(1);
}

// Security: Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const callbackLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { error: 'Too many callback attempts, please try again later.' }
});

// Security: State storage for CSRF protection
const stateStore = new Map();

if (process.env.NODE_ENV !== 'production') {
  console.log('🔍 Environment Variables Check (DEV ONLY):');
  console.log('  - FRONTEND_URL:', process.env.FRONTEND_URL ? 'SET' : 'NOT SET');
  console.log('  - GITHUB_CLIENT_ID:', process.env.GITHUB_CLIENT_ID ? 'SET' : 'NOT SET');
  console.log('  - GITHUB_CLIENT_SECRET:', process.env.GITHUB_CLIENT_SECRET ? 'SET' : 'NOT SET');
  console.log('  - JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
  console.log('  - DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('  - GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'SET' : 'NOT SET');
}

// ✅ PART 2: AI FUNCTIONS & SECURITY

// ✅ ENHANCED: Template analysis with Groq AI - SECURE & COMPLETE
async function analyzeTemplateQuestion(prompt, templateContext, userId) {
  // Security: Sanitize inputs
  if (!prompt || typeof prompt !== 'string' || prompt.length > 1000) {
    throw new Error('Invalid prompt');
  }
  
  if (!templateContext?.templateId || typeof templateContext.templateId !== 'string') {
    throw new Error('Invalid template context');
  }

  // Rate limiting
  if (!checkAIRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please wait before making another AI request.');
  }

  try {
    if (!groq) {
      return getFallbackResponse(prompt, templateContext);
    }

    const systemPrompt = `You are an expert n8n automation assistant. Help users set up their template: ${templateContext.templateId}

Provide specific, actionable instructions. Keep responses under 200 words.
Focus on practical steps for n8n workflow setup, credentials, testing, and troubleshooting.
Do not include any harmful, inappropriate, or non-technical content.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
      max_tokens: 300,
      top_p: 0.9
    });

    const response = chatCompletion.choices[0]?.message?.content;
    
    if (response && response.trim()) {
      return `🤖 **AI Assistant for ${templateContext.templateId}:**\n\n${response}\n\n💡 Need more help? Ask specific questions about credentials, webhooks, or testing!`;
    }
  } catch (error) {
    console.error('Groq API error:', error.message);
  }
  
  return getFallbackResponse(prompt, templateContext);
}

// ✅ ENHANCED: Setup instructions with Groq - SECURE & COMPLETE
async function generateInstructionsWithGroq(workflow, templateId, userId) {
  // Security validations
  if (!workflow || typeof workflow !== 'object') {
    throw new Error('Invalid workflow data');
  }
  
  if (!templateId || typeof templateId !== 'string' || templateId.length > 100) {
    throw new Error('Invalid template ID');
  }

  // Rate limiting
  if (!checkAIRateLimit(userId)) {
    throw new Error('Rate limit exceeded');
  }

  try {
    if (!groq) {
      return null;
    }

    const nodeTypes = workflow.nodes?.map(node => node.type).join(', ') || 'unknown';
    const nodeCount = workflow.nodes?.length || 0;
    
    // Security: Limit node count to prevent abuse
    if (nodeCount > 100) {
      throw new Error('Workflow too complex for AI analysis');
    }
    
    const systemPrompt = `Generate setup instructions for an n8n workflow template called "${templateId}".
The workflow has ${nodeCount} nodes: ${nodeTypes}

The user already has this validated DevHubConnect template file. Create a professional setup guide with:
1. Import steps for n8n (assume they have the JSON file ready)
2. Credential configuration for each service
3. Testing instructions
4. Common troubleshooting tips

Keep it practical and under 400 words. Focus only on technical setup instructions.
Do not mention drag-and-drop, file uploads, or template selection - assume they already have the template.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: systemPrompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 500,
      top_p: 0.8
    });

    return chatCompletion.choices[0]?.message?.content;
  } catch (error) {
    console.error('Groq API error:', error.message);
    return null;
  }
}

// ✅ SECURE: Fallback response function - COMPLETE & SAFE
function getFallbackResponse(prompt, templateContext) {
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes('webhook')) {
    return `🔗 **Webhook Setup for ${templateContext.templateId}:**
1. Copy the webhook URL from the Webhook node
2. Use this URL in your external service
3. Test with a sample request
4. Check n8n execution logs for verification`;
  }
  
  if (lowerPrompt.includes('credential') || lowerPrompt.includes('api key')) {
    return `🔑 **Adding Credentials:**
1. Go to Settings → Credentials in n8n
2. Click "Create New Credential"
3. Select your service type
4. Enter API key/credentials
5. Test connection and save`;
  }
  
  if (lowerPrompt.includes('test') || lowerPrompt.includes('run')) {
    return `🧪 **Testing Your Workflow:**
1. Click "Execute Workflow" button
2. Check each node's output
3. Look for error messages
4. Use manual mode for debugging
5. Activate when working properly`;
  }
  
  return `✅ I can help with your **${templateContext.templateId}** template!

Try asking:
- "How do I add credentials?"
- "Where is my webhook URL?"
- "How do I test this workflow?"
- "What API keys do I need?"

What specific setup step do you need help with?`;
}

// Security: Input validation
function validateAndSanitizeUser(githubUser, primaryEmail) {
  return {
    githubId: String(githubUser.id).substring(0, 50),
    name: String(githubUser.name || githubUser.login || '').substring(0, 100),
    email: String(primaryEmail).toLowerCase().substring(0, 320),
    avatarUrl: String(githubUser.avatar_url || '').substring(0, 500),
    githubLogin: String(githubUser.login || '').substring(0, 100)
  };
}

// Security: Session cleanup job
setInterval(async () => {
  try {
    const result = await pool.query(
      'DELETE FROM sessions WHERE expires_at < NOW() OR is_active = false'
    );
    if (result.rowCount > 0) {
      console.log(`🧹 Cleaned up ${result.rowCount} expired sessions`);
    }
  } catch (error) {
    console.error('❌ Session cleanup error:', error);
  }
}, 60 * 60 * 1000);

// Helper function to convert database field names to frontend format
function convertFieldNames(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    price: template.price,
    currency: template.currency,
    imageUrl: template.image_url,
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

// Helper function to parse workflow details
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

// ✅ FIXED: Enhanced requireAdminAuth to support both JWT and session cookies
const requireAdminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      const sessionId = req.cookies?.devhub_session;
      
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
        return res.status(401).json({ 
          error: 'Admin authentication required',
          message: 'Please log in as an administrator'
        });
      }

      const sessionResult = await pool.query(
        'SELECT user_id, expires_at FROM sessions WHERE id = $1 AND is_active = true',
        [sessionId]
      );

      if (sessionResult.rows.length === 0 || new Date() > sessionResult.rows[0].expires_at) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const userResult = await pool.query(
        'SELECT id, email, name, role FROM users WHERE id = $1 AND is_active = true AND role = $2',
        [sessionResult.rows[0].user_id, 'admin']
      );

      if (userResult.rows.length === 0) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      req.user = userResult.rows[0];
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND role = $2 AND is_active = true', 
      [decoded.id, 'admin']
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access revoked' });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Admin authentication failed:', error.message);
    return res.status(403).json({ error: 'Admin authentication failed' });
  }
};

// ✅ SECURE: Enhanced JWT verification middleware
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      const sessionId = req.cookies?.devhub_session;
      
      if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
        return res.status(401).json({ 
          error: 'Authentication required',
          loginUrl: '/auth/github'
        });
      }

      const sessionResult = await pool.query(
        'SELECT user_id, expires_at FROM sessions WHERE id = $1 AND is_active = true',
        [sessionId]
      );

      if (sessionResult.rows.length === 0 || new Date() > sessionResult.rows[0].expires_at) {
        return res.status(401).json({ error: 'Session expired' });
      }

      const userResult = await pool.query(
        'SELECT id, email, name, role FROM users WHERE id = $1 AND is_active = true',
        [sessionResult.rows[0].user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      req.user = userResult.rows[0];
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await pool.query(
      'SELECT id, email, name, role FROM users WHERE id = $1 AND is_active = true',
      [decoded.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'User not found' });
    }
    
    req.user = { ...decoded, ...result.rows[0] };
    next();
  } catch (error) {
    console.error('Authentication failed:', error.message);
    return res.status(403).json({ error: 'Authentication failed' });
  }
};

// ==================== AUTHENTICATION ROUTES ====================

// ✅ SECURE: GitHub OAuth initiation with CSRF protection
app.get('/auth/github', authLimiter, (req, res) => {
  try {
    const state = crypto.randomBytes(32).toString('hex');
    const scopes = 'user:email';
    
    stateStore.set(state, {
      timestamp: Date.now(),
      ip: req.ip
    });
    
    for (const [key, value] of stateStore.entries()) {
      if (Date.now() - value.timestamp > 10 * 60 * 1000) {
        stateStore.delete(key);
      }
    }
    
    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubAuthUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
    githubAuthUrl.searchParams.set('redirect_uri', `${frontendUrl}/auth/github/callback`);
    githubAuthUrl.searchParams.set('scope', scopes);
    githubAuthUrl.searchParams.set('state', state);
    githubAuthUrl.searchParams.set('allow_signup', 'true');
    
    console.log(`🔍 GitHub OAuth initiated for IP: ${req.ip}`);
    res.redirect(githubAuthUrl.toString());
  } catch (error) {
    console.error('OAuth initiation error:', error);
    res.redirect(`${frontendUrl}/auth/error?error=oauth_init_failed`);
  }
});

// ✅ SECURE: GitHub OAuth callback with comprehensive validation
app.get('/auth/github/callback', callbackLimiter, async (req, res) => {
  const { code, state, error } = req.query;
  
  try {
    if (error) {
      console.error(`GitHub OAuth error: ${error}`);
      return res.redirect(`${frontendUrl}/auth/error?error=access_denied`);
    }
    
    if (!state || typeof state !== 'string') {
      console.error('OAuth callback: Invalid state parameter');
      return res.redirect(`${frontendUrl}/auth/error?error=invalid_request`);
    }
    
    const storedState = stateStore.get(state);
    if (!storedState || Date.now() - storedState.timestamp > 10 * 60 * 1000) {
      console.error('OAuth callback: State parameter not found or expired');
      stateStore.delete(state);
      return res.redirect(`${frontendUrl}/auth/error?error=invalid_request`);
    }
    
    stateStore.delete(state);
    
    if (!code || typeof code !== 'string' || code.length > 100) {
      console.error('OAuth callback: Invalid authorization code');
      return res.redirect(`${frontendUrl}/auth/error?error=invalid_request`);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'DevHubConnect-OAuth/1.0'
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: `${frontendUrl}/auth/github/callback`,
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.status}`);
    }
    
    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;
    
    if (!access_token) {
      console.error('No access token received from GitHub');
      return res.redirect(`${frontendUrl}/auth/error?error=access_denied`);
    }
    
    const userController = new AbortController();
    const userTimeoutId = setTimeout(() => userController.abort(), 10000);
    
    const [userResponse, emailResponse] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'DevHubConnect-OAuth/1.0'
        },
        signal: userController.signal
      }),
      fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'DevHubConnect-OAuth/1.0'
        },
        signal: userController.signal
      })
    ]);
    
    clearTimeout(userTimeoutId);
    
    if (!userResponse.ok || !emailResponse.ok) {
      throw new Error('Failed to fetch user data from GitHub');
    }
    
    const githubUser = await userResponse.json();
    const userEmails = await emailResponse.json();
    
    if (!githubUser || !githubUser.id || !Array.isArray(userEmails)) {
      console.error('Invalid user data received from GitHub');
      return res.redirect(`${frontendUrl}/auth/error?error=invalid_user_data`);
    }
    
    const primaryEmail = userEmails.find(email => 
      email && email.primary && email.verified && email.email
    )?.email;
    
    if (!primaryEmail) {
      console.error('No verified primary email found');
      return res.redirect(`${frontendUrl}/auth/error?error=email_verification_required`);
    }
    
    const sanitizedUser = validateAndSanitizeUser(githubUser, primaryEmail);
    
    console.log(`🔍 OAuth successful for: ${sanitizedUser.email}`);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      await client.query(
        'UPDATE sessions SET is_active = false WHERE user_id IN (SELECT id FROM users WHERE email = $1)',
        [sanitizedUser.email]
      );
      
      let user;
      const existingUser = await client.query(
        'SELECT * FROM users WHERE email = $1',
        [sanitizedUser.email]
      );
      
      if (existingUser.rows.length > 0) {
        const updatedUser = await client.query(
          'UPDATE users SET name = $1, avatar_url = $2, github_login = $3, last_login_at = NOW(), updated_at = NOW() WHERE email = $4 RETURNING *',
          [sanitizedUser.email.split('@')[0], sanitizedUser.avatarUrl, sanitizedUser.githubLogin, sanitizedUser.email]
        );
        user = updatedUser.rows[0];
      } else {
        const newUser = await client.query(
          'INSERT INTO users (id, email, name, avatar_url, github_login, role, is_email_verified, is_active, last_login_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *',
          [`github_${sanitizedUser.githubId}`, sanitizedUser.email, sanitizedUser.email.split('@')[0], sanitizedUser.avatarUrl, sanitizedUser.githubLogin, 'user', true, true]
        );
        user = newUser.rows[0];
      }

      const ADMIN_GITHUB_USERS = process.env.ADMIN_GITHUB_USERS?.split(',').map(u => u.trim().toLowerCase()) || [];

      if (ADMIN_GITHUB_USERS.length > 0 && 
        ADMIN_GITHUB_USERS.includes(sanitizedUser.githubLogin.toLowerCase()) && 
        user.role !== 'admin') {
        
        if (ADMIN_GITHUB_USERS.length > 5) {
          console.warn('Security warning: Too many admin users configured');
        }
        
        console.log('Admin promotion attempt:', {
          githubLogin: sanitizedUser.githubLogin,
          email: sanitizedUser.email,
          timestamp: new Date().toISOString(),
          ip: req.ip,
          userAgent: req.get('User-Agent')?.substring(0, 100)
        });
        
        await client.query(
          'UPDATE users SET role = $1 WHERE id = $2',
          ['admin', user.id]
        );
        user.role = 'admin';
        
        console.log('Admin role granted:', sanitizedUser.githubLogin);
      }
      
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      await client.query(
        'INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent, is_active) VALUES ($1, $2, $3, $4, $5, $6)',
        [sessionId, user.id, expiresAt, req.ip || 'unknown', (req.get('User-Agent') || 'unknown').substring(0, 500), true]
      );
      
      await client.query('COMMIT');
      
      res.cookie('devhub_session', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/'
      });
      
      const userParams = new URLSearchParams({
        success: 'true',
        userId: user.id,
        userName: user.name || '',
        userEmail: user.email
      });
      
      res.redirect(`${frontendUrl}/?${userParams.toString()}`);
      
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    res.redirect(`${frontendUrl}/auth/error?error=internal_error`);
  }
});

// ✅ FIXED: Session-based profile endpoint - NO MORE DISCONNECT SPAM
app.get('/auth/profile/session', async (req, res) => {
  let clientDisconnected = false;
  
  req.on('close', () => {
    if (!clientDisconnected) {
      clientDisconnected = true;
      // Only log in development and not for bots
      if (process.env.NODE_ENV !== 'production' && !isBot(req.get('User-Agent'))) {
        console.log('🔌 Client disconnected during profile check');
      }
    }
  });

  res.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECONNABORTED') {
      return;
    }
    console.error('Response error:', err);
  });

  try {
    const sessionId = req.cookies?.devhub_session;
    
    // Only log in development
    if (process.env.NODE_ENV !== 'production' && !isBot(req.get('User-Agent'))) {
      console.log('🔍 Profile Check:', {
        sessionId: sessionId ? 'present' : 'missing',
        userAgent: req.get('User-Agent')?.substring(0, 50)
      });
    }
    
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
      if (clientDisconnected || res.headersSent) return;
      return res.status(401).json({ error: 'No valid session found' });
    }

    if (clientDisconnected || req.isDisconnected()) return;

    const session = await pool.query(
      'SELECT user_id, expires_at FROM sessions WHERE id = $1 AND is_active = true',
      [sessionId]
    );

    if (clientDisconnected || res.headersSent || req.isDisconnected()) return;

    if (session.rows.length === 0 || new Date() > session.rows[0].expires_at) {
      return res.status(401).json({ error: 'Session expired' });
    }

    if (clientDisconnected || req.isDisconnected()) return;

    const user = await pool.query(
      'SELECT id, email, name, avatar_url, role, created_at, last_login_at FROM users WHERE id = $1 AND is_active = true',
      [session.rows[0].user_id]
    );

    if (clientDisconnected || res.headersSent || req.isDisconnected()) return;

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = user.rows[0];
    
    res.json({
      id: userData.id,
      email: userData.email,
      name: userData.name || userData.email.split('@')[0],
      avatar: userData.avatar_url,
      isAdmin: userData.role === 'admin',
      role: userData.role || 'user'
    });
    
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    
    console.error('Profile check error:', error.message);
    
    if (!clientDisconnected && !res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ✅ SECURE: Auth refresh endpoint for frontend compatibility
app.post('/api/auth/refresh', async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const sessionId = req.cookies?.devhub_session;
    if (!sessionId) {
      return res.status(401).json({ success: false, error: 'No session found' });
    }
    
    const session = await pool.query(
      'SELECT user_id, expires_at FROM sessions WHERE id = $1 AND is_active = true', 
      [sessionId]
    );
    
    if (req.isDisconnected() || res.headersSent) return;
    
    if (session.rows.length === 0 || new Date() > session.rows[0].expires_at) {
      return res.status(401).json({ success: false, error: 'Session expired' });
    }
    
    const user = await pool.query(
      'SELECT id, email, name, role FROM users WHERE id = $1', 
      [session.rows[0].user_id]
    );
    
    if (req.isDisconnected() || res.headersSent) return;
    
    if (user.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, token: 'session', user: user.rows[0] });
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Refresh error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ success: false, error: 'Refresh failed' });
    }
  }
});

// ✅ SECURE: Support both GET and POST for logout endpoint
app.route('/auth/logout')
  .get(async (req, res) => {
    try {
      if (req.isDisconnected()) return;
      
      console.log('🔐 GET Logout request received');
      
      const sessionId = req.cookies?.devhub_session;
      if (sessionId) {
        await pool.query(
          'UPDATE sessions SET is_active = false WHERE id = $1',
          [sessionId]
        );
        console.log('🔐 Session invalidated:', sessionId);
      }
      
      res.clearCookie('devhub_session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      
      console.log('🔐 GET Logout successful, redirecting to home');
      
      if (!res.headersSent && !req.isDisconnected()) {
        res.redirect('/');
      }
      
    } catch (error) {
      if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
        return;
      }
      console.error('❌ GET Logout error:', error.message);
      if (!res.headersSent && !req.isDisconnected()) {
        res.redirect('/?logout=error');
      }
    }
  })
  .post(async (req, res) => {
    try {
      if (req.isDisconnected()) return;
      
      console.log('🔐 POST Logout request received');
      
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          await pool.query(
            'UPDATE sessions SET is_active = false WHERE user_id = $1',
            [decoded.id]
          );
        } catch (jwtError) {
          // Invalid JWT is expected during logout
        }
      }
      
      const sessionId = req.cookies?.devhub_session;
      if (sessionId) {
        await pool.query(
          'UPDATE sessions SET is_active = false WHERE id = $1',
          [sessionId]
        );
        console.log('🔐 Session invalidated:', sessionId);
      }
      
      res.clearCookie('devhub_session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      
      console.log('🔐 POST Logout successful');
      
      if (!res.headersSent && !req.isDisconnected()) {
        res.json({ 
          success: true, 
          message: 'Logged out successfully' 
        });
      }
      
    } catch (error) {
      if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
        return;
      }
      console.error('❌ POST Logout error:', error.message);
      if (!res.headersSent && !req.isDisconnected()) {
        res.status(500).json({ 
          success: false, 
          message: 'Error during logout' 
        });
      }
    }
  });

// ✅ SECURE: Admin login endpoint with bcrypt and privacy protection
app.post('/api/admin/login', async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const { password } = req.body;
    
    if (!password || !process.env.ADMIN_PASSWORD_HASH) {
      return res.status(401).json({ 
        error: 'Admin password required',
        hint: 'Use GitHub OAuth for regular authentication'
      });
    }
    
    const isValidPassword = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    
    const adminToken = jwt.sign(
      { 
        id: 'admin', 
        role: 'admin', 
        email: process.env.ADMIN_EMAIL || 'admin@localhost',
        type: 'admin_session'
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: '2h',
        issuer: 'devhubconnect',
        audience: 'admin'
      }
    );
    
    console.log('✅ Admin login successful');
    
    if (!res.headersSent && !req.isDisconnected()) {
      res.json({
        success: true,
        token: adminToken,
        user: {
          id: 'admin',
          email: process.env.ADMIN_EMAIL || 'admin@localhost',
          role: 'admin',
          isAdmin: true,
          sessionType: 'admin'
        }
      });
    }
    
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Admin login error:', error.message);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Admin login failed' });
    }
  }
});

// ✅ SECURE: Session health check endpoint
app.get('/api/auth/health', async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const dbTest = await pool.query('SELECT NOW() as timestamp');
    
    const sessionStoreTest = req.sessionStore ? 'connected' : 'missing';
    const userStatus = req.user ? 'authenticated' : 'not_authenticated';
    
    if (!res.headersSent && !req.isDisconnected()) {
      res.json({
        success: true,
        health: {
          database: 'connected',
          sessionStore: sessionStoreTest,
          userStatus: userStatus,
          timestamp: dbTest.rows[0].timestamp
        },
        environment: process.env.NODE_ENV || 'development'
      });
    }
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('❌ Health check error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ 
        success: false,
        error: 'Health check failed',
        details: error.message 
      });
    }
  }
});

// ✅ SECURE: User profile endpoint
app.get('/api/user/profile', (req, res) => {
  if (req.isDisconnected() || res.headersSent) return;
  
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

// ✅ SECURE: /api/auth/user endpoint (frontend expects this)
app.get('/api/auth/user', (req, res) => {
  if (req.isDisconnected() || res.headersSent) return;
  
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

// ✅ SECURE: Error page route
app.get('/auth/error', (req, res) => {
  const error = req.query.error || 'unknown_error';
  console.log('🔴 Auth error page accessed:', error);
  
  if (!res.headersSent && !req.isDisconnected()) {
    res.redirect(`${frontendUrl}/?auth_error=${error}`);
  }
});

// ✅ SECURE: Dashboard routes
app.get('/dashboard', (req, res) => {
  if (!res.headersSent && !req.isDisconnected()) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

app.get('/admin/dashboard', (req, res) => {
  if (!res.headersSent && !req.isDisconnected()) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

app.get('/admin/login', (req, res) => {
  if (!res.headersSent && !req.isDisconnected()) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

// ✅ FIXED: Analytics consolidates users by email (like Stripe)
app.get('/api/admin/analytics-data', async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    console.log('📊 Fetching analytics for ALL users (consolidated by email)...');
    
    const popularByDownloads = await pool.query(`
      SELECT 
        id, name, price,
        COALESCE(download_count, 0) as "downloadCount",
        COALESCE(view_count, 0) as "viewCount"
      FROM templates 
      WHERE is_public = true
      ORDER BY download_count DESC NULLS LAST, view_count DESC NULLS LAST
      LIMIT 10
    `);

    if (req.isDisconnected()) return;

    const userStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT LOWER(TRIM(email))) as total_users,
        COUNT(DISTINCT CASE 
          WHEN created_at >= NOW() - INTERVAL '30 days' 
          THEN LOWER(TRIM(email)) 
        END) as active_users
      FROM users
      WHERE email IS NOT NULL AND email != ''
    `);

    if (req.isDisconnected()) return;

    const revenueStats = await pool.query(`
      SELECT 
        COALESCE(SUM(amount_paid), 0) as total_revenue,
        COUNT(*) as total_sales,
        CASE WHEN COUNT(*) > 0 THEN AVG(amount_paid) ELSE 0 END as avg_order_value
      FROM purchases 
      WHERE status IN ('completed', 'pending')
    `);

    if (req.isDisconnected()) return;

    const popularByPurchases = await pool.query(`
      SELECT 
        t.id as "templateId",
        t.name as "templateName", 
        'automation' as category,
        COUNT(p.id) as "purchaseCount",
        SUM(p.amount_paid) as "totalRevenue"
      FROM purchases p
      JOIN templates t ON p.template_id = t.id
      WHERE p.status IN ('completed', 'pending')
      GROUP BY t.id, t.name
      ORDER BY COUNT(p.id) DESC, SUM(p.amount_paid) DESC
      LIMIT 10
    `);

    if (req.isDisconnected() || res.headersSent) return;

    console.log('📊 Analytics Results:');
    console.log('   Unique Users (by email):', userStats.rows[0]?.total_users);
    console.log('   Total Sales:', revenueStats.rows[0]?.total_sales);

    const realData = {
      success: true,
      data: {
        popularByDownloads: popularByDownloads.rows,
        popularByPurchases: popularByPurchases.rows,
        categoryStats: [
          { 
            category: 'automation', 
            templateCount: popularByDownloads.rows.length, 
            totalDownloads: popularByDownloads.rows.reduce((sum, t) => sum + (t.downloadCount || 0), 0), 
            avgRating: 4.5 
          }
        ],
        topSearchTerms: [
          { searchTerm: 'email automation', searchCount: 45 },
          { searchTerm: 'slack integration', searchCount: 32 }
        ],
        revenueStats: {
          totalRevenue: parseInt(revenueStats.rows[0]?.total_revenue || 0),
          totalSales: parseInt(revenueStats.rows[0]?.total_sales || 0),
          avgOrderValue: parseFloat(revenueStats.rows[0]?.avg_order_value || 0)
        },
        userStats: {
          totalUsers: parseInt(userStats.rows[0]?.total_users || 0),
          activeUsers: parseInt(userStats.rows[0]?.active_users || 0)
        }
      }
    };
    
    res.json(realData);
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('❌ Analytics error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }
});

// ✅ PART 5: TEMPLATE & API ENDPOINTS 

// ==================== TEMPLATE ENDPOINTS ====================

app.get('/api/templates/:id', async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    console.log('📄 Fetching template details for:', req.params.id, 'by user:', req.user?.email || req.user?.username || 'unauthenticated');
    const templateId = req.params.id;
    if (!templateId || typeof templateId !== 'string' || templateId.length > 100) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }
    
    await pool.query(
      'UPDATE templates SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1',
      [templateId]
    );
    
    if (req.isDisconnected()) return;
    
    const result = await pool.query(
      'SELECT * FROM templates WHERE id = $1',
      [templateId]
    );
    
    if (req.isDisconnected() || res.headersSent) return;
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const template = result.rows[0];
    res.json({ success: true, template: template });
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error fetching template details:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to fetch template details' });
    }
  }
});

// ✅ SECURE: Template update endpoint
app.patch('/api/templates/:id', requireAdminAuth, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const templateId = req.params.id;
    const { name, description, price, workflow_json, image_url } = req.body;
    
    console.log('🔧 Updating template:', templateId, 'by user:', req.user.email);
    
    if (!name || !description || price === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await pool.query(
      'UPDATE templates SET name = $1, description = $2, price = $3, workflow_json = $4, image_url = $5, updated_at = NOW() WHERE id = $6 RETURNING *',
      [name, description, price, workflow_json, image_url, templateId]
    );
    
    if (req.isDisconnected() || res.headersSent) return;
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    console.log('✅ Template updated successfully');
    res.json({ success: true, template: result.rows[0] });
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error updating template:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to update template' });
    }
  }
});

// Enhanced /api/templates endpoint with proper field conversion
app.get('/api/templates', async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    console.log('Fetching templates for user:', req.user?.email || req.user?.username || 'unauthenticated');
    
    const result = await pool.query(`
      SELECT * FROM templates 
      WHERE is_public = true 
      ORDER BY rating DESC, download_count DESC 
      LIMIT 1000
    `);
    
    if (req.isDisconnected() || res.headersSent) return;
    
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
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error fetching templates:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }
});

// Recommendations endpoint
app.use('/api/recommendations', recommendationsRouter);

// Template download endpoint for purchased templates
app.get('/api/templates/:id/download', authenticateJWT, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to download templates'
    });
  }

  try {
    if (req.isDisconnected()) return;
    
    const templateId = req.params.id;
    console.log('Download request for template:', templateId, 'by user:', req.user.email);

    if (!templateId || typeof templateId !== 'string' || templateId.length > 100) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const templateResult = await pool.query(
      'SELECT id, name, workflow_json, price FROM templates WHERE id = $1',
      [templateId]
    );

    if (req.isDisconnected()) return;

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    const purchaseResult = await pool.query(`
      SELECT p.id, p.status, p.purchased_at 
      FROM purchases p 
      WHERE p.user_id = $1 AND p.template_id = $2 AND p.status = 'completed'
      ORDER BY p.purchased_at DESC 
      LIMIT 1
    `, [req.user.id, templateId]);

    if (req.isDisconnected() || res.headersSent) return;

    if (purchaseResult.rows.length === 0) {
      console.log('Download denied - user has not purchased template:', req.user.email, templateId);
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You must purchase this template before downloading',
        needsPurchase: true
      });
    }

    if (!template.workflow_json) {
      return res.status(500).json({ 
        error: 'Template data unavailable',
        message: 'This template does not have workflow data available'
      });
    }

    await pool.query(
      'UPDATE templates SET download_count = COALESCE(download_count, 0) + 1 WHERE id = $1',
      [templateId]
    );

    const sanitizedName = template.name
      .replace(/[^a-zA-Z0-9\-_\s]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    
    const filename = `${sanitizedName}-${templateId}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    console.log('Template download successful:', templateId, filename, 'by', req.user.email);

    res.send(JSON.stringify(template.workflow_json, null, 2));

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Template download error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ 
        error: 'Download failed',
        message: 'Failed to download template. Please try again.'
      });
    }
  }
});

// Template preview endpoint (for View Preview buttons)
app.get('/api/templates/:id/preview', async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const templateId = req.params.id;
    console.log('Preview request for template:', templateId);

    if (!templateId || typeof templateId !== 'string' || templateId.length > 100) {
      return res.status(400).json({ error: 'Invalid template ID' });
    }

    const result = await pool.query(`
      SELECT 
        id, name, description, price, image_url, 
        created_at, download_count, view_count, rating,
        workflow_json
      FROM templates 
      WHERE id = $1 AND is_public = true
    `, [templateId]);

    if (req.isDisconnected()) return;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found or not public' });
    }

    const template = result.rows[0];

    await pool.query(
      'UPDATE templates SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1',
      [templateId]
    );

    if (req.isDisconnected() || res.headersSent) return;

    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        price: template.price,
        imageUrl: template.image_url,
        workflowJson: template.workflow_json,
        stats: {
          downloads: template.download_count || 0,
          views: template.view_count || 0,
          rating: template.rating || 0
        },
        createdAt: template.created_at
      }
    });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('❌ Template preview error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ 
        error: 'Preview failed',
        message: 'Failed to load template preview'
      });
    }
  }
});

// ✅ SECURE: /api/user/purchases endpoint  
app.get('/api/user/purchases', authenticateJWT, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    if (req.isDisconnected()) return;
    
    console.log('📦 Fetching purchases for user:', req.user.email || req.user.username);
    
    const result = await pool.query(`
      SELECT 
        p.id as purchase_id,
        p.purchased_at,
        p.amount_paid,
        p.currency,
        p.status,
        t.id,
        t.name,
        t.description,
        t.price,
        t.image_url as "imageUrl",
        t.workflow_json as "workflowJson",
        t.created_at as "createdAt",
        t.download_count as "downloadCount",
        t.view_count as "viewCount",
        t.rating
      FROM purchases p
      JOIN templates t ON p.template_id = t.id
      WHERE p.user_id = $1 AND p.status = 'completed'
      ORDER BY p.purchased_at DESC
    `, [req.user.id]);

    if (req.isDisconnected() || res.headersSent) return;

    const formattedPurchases = result.rows.map(row => ({
      purchaseInfo: {
        purchaseId: row.purchase_id,
        amountPaid: row.amount_paid,
        currency: row.currency,
        status: row.status,
        purchasedAt: row.purchased_at
      },
      template: {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        imageUrl: row.imageUrl,
        workflowJson: row.workflowJson,
        createdAt: row.createdAt,
        downloadCount: row.downloadCount,
        viewCount: row.viewCount,
        rating: row.rating,
        purchased: true
      }
    }));

    console.log('✅ Found', formattedPurchases.length, 'purchases for user');
    res.json({ success: true, purchases: formattedPurchases });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error fetching user purchases:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to fetch purchases' });
    }
  }
});

// ✅ SECURE: Individual template removal endpoint
app.delete('/api/user/purchases/template/:templateId', authenticateJWT, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const { templateId } = req.params;
    const userId = req.user.id;
    
    console.log(`🗑️ Individual template removal request: User ${userId}, Template ${templateId}`);
    
    if (!templateId || isNaN(templateId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid template ID' 
      });
    }

    const templateInfo = await pool.query(
      'SELECT name FROM templates WHERE id = $1',
      [templateId]
    );

    if (req.isDisconnected()) return;

    const templateName = templateInfo.rows[0]?.name || `Template ${templateId}`;

    const ownershipCheck = await pool.query(
      'SELECT id, purchased_at, amount_paid FROM purchases WHERE user_id = $1 AND template_id = $2',
      [userId, templateId]
    );

    if (req.isDisconnected() || res.headersSent) return;

    if (ownershipCheck.rows.length === 0) {
      console.log(`❌ Unauthorized removal attempt: User ${userId} doesn't own template ${templateId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'Template not found in your collection' 
      });
    }

    const purchaseRecord = ownershipCheck.rows[0];

    const deleteResult = await pool.query(
      'DELETE FROM purchases WHERE user_id = $1 AND template_id = $2 RETURNING id',
      [userId, templateId]
    );

    if (req.isDisconnected() || res.headersSent) return;

    if (deleteResult.rows.length === 0) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to remove template from collection' 
      });
    }

    console.log(`✅ Template removed from collection: "${templateName}" (ID: ${templateId}) by user ${userId}`);
    console.log(`💰 Amount was: $${(purchaseRecord.amount_paid / 100).toFixed(2)}`);
    
    res.json({ 
      success: true, 
      message: `"${templateName}" removed from your collection`,
      removedTemplate: {
        id: templateId,
        name: templateName,
        purchaseDate: purchaseRecord.purchased_at,
        amountPaid: purchaseRecord.amount_paid
      }
    });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('❌ Individual template removal error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to remove template from collection' 
      });
    }
  }
});

// ✅ FIXED: Add missing endpoint without trailing slash
app.get('/api/purchases', authenticateJWT, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    if (req.isDisconnected()) return;
    
    console.log('📦 Fetching purchases for user via /api/purchases:', req.user.email || req.user.username);
    
    const result = await pool.query(`
      SELECT 
        p.id as purchase_id,
        p.amount_paid,
        p.currency,
        p.status,
        p.purchased_at,
        t.id,
        t.name,
        t.description,
        t.price,
        t.image_url as "imageUrl",
        t.workflow_json as "workflowJson",
        t.created_at as "createdAt",
        t.download_count as "downloadCount",
        t.view_count as "viewCount",
        t.rating
      FROM purchases p
      LEFT JOIN templates t ON p.template_id = t.id
      WHERE p.user_id = $1 AND p.status = 'completed'
      ORDER BY p.purchased_at DESC
    `, [req.user.id]);

    if (req.isDisconnected() || res.headersSent) return;

    const formattedPurchases = result.rows.map(row => ({
      purchaseInfo: {
        purchaseId: row.purchase_id,
        amountPaid: row.amount_paid,
        currency: row.currency,
        status: row.status,
        purchasedAt: row.purchased_at
      },
      template: {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        imageUrl: row.imageUrl,
        workflowJson: row.workflowJson,
        createdAt: row.createdAt,
        downloadCount: row.downloadCount,
        viewCount: row.viewCount,
        rating: row.rating,
        purchased: true
      }
    }));

    console.log('✅ Found', formattedPurchases.length, 'purchases for user via /api/purchases');
    res.json({ success: true, purchases: formattedPurchases });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error fetching user purchases via /api/purchases:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to fetch purchases' });
    }
  }
});

// ✅ FIX: Dashboard compatibility endpoint - alias for /api/user/purchases
app.get('/api/purchases/', authenticateJWT, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    if (req.isDisconnected()) return;
    
    console.log('📦 Fetching purchases for user via /api/purchases/:', req.user.email || req.user.username);
    
    const result = await pool.query(`
      SELECT 
        p.id as purchase_id,
        p.amount_paid,
        p.currency,
        p.status,
        p.purchased_at,
        t.id,
        t.name,
        t.description,
        t.price,
        t.image_url as "imageUrl",
        t.workflow_json as "workflowJson",
        t.created_at as "createdAt",
        t.download_count as "downloadCount",
        t.view_count as "viewCount",
        t.rating
      FROM purchases p
      LEFT JOIN templates t ON p.template_id = t.id
      WHERE p.user_id = $1 AND p.status = 'completed'
      ORDER BY p.purchased_at DESC
    `, [req.user.id]);

    if (req.isDisconnected() || res.headersSent) return;

    const formattedPurchases = result.rows.map(row => ({
      purchaseInfo: {
        purchaseId: row.purchase_id,
        amountPaid: row.amount_paid,
        currency: row.currency,
        status: row.status,
        purchasedAt: row.purchased_at
      },
      template: {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        imageUrl: row.imageUrl,
        workflowJson: row.workflowJson,
        createdAt: row.createdAt,
        downloadCount: row.downloadCount,
        viewCount: row.viewCount,
        rating: row.rating,
        purchased: true
      }
    }));

    console.log('✅ Found', formattedPurchases.length, 'purchases for user via /api/purchases/');
    res.json({ success: true, purchases: formattedPurchases });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error fetching user purchases via /api/purchases/:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to fetch purchases' });
    }
  }
});

// Template List Endpoint (redirect to main templates endpoint)
app.get('/api/templates/list', async (req, res) => {
  if (!res.headersSent && !req.isDisconnected()) {
    res.redirect('/api/templates');
  }
});

// ==================== AI ENDPOINTS ====================

// ✅ ENHANCED: AI Chat Endpoint - NOW WITH WORKING GROQ INTEGRATION
app.post('/api/ask-ai', authenticateJWT, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be signed in to use the AI chat feature',
      loginUrl: '/auth/github'
    });
  }

  const { prompt, history, templateContext } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required in the request body.' });
  }

  try {
    if (req.isDisconnected()) return;
    
    console.log('🧠 AI chat request by:', req.user.email || req.user.username);
    
    if (templateContext && templateContext.hasValidTemplate) {
      const response = await analyzeTemplateQuestion(prompt, templateContext, req.user.id);
      
      if (req.isDisconnected() || res.headersSent) return;
      return res.json({ response, source: 'groq_ai_analysis' });
    }
    
    const response = `I'm here to help with your n8n template setup! Try asking about specific steps like "How do I add credentials in n8n?" or "Where do I paste my API key?"`;
    
    if (!res.headersSent && !req.isDisconnected()) {
      res.json({ response, source: 'smart_fallback' });
    }

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('❌ Chat error for user:', req.user.email || req.user.username, error);
    
    if (error.message.includes('Rate limit')) {
      if (!res.headersSent && !req.isDisconnected()) {
        return res.status(429).json({ 
          error: 'Too many requests',
          message: 'Please wait a moment before asking another question.',
          retryAfter: 60
        });
      }
    }
    
    const fallbackResponse = `I'm here to help with your n8n template setup! Try asking about specific steps like "How do I add credentials in n8n?" or "Where do I paste my API key?"`;
    
    if (!res.headersSent && !req.isDisconnected()) {
      res.json({ response: fallbackResponse });
    }
  }
});

// ✅ ENHANCED: Generate Setup Instructions Endpoint - NOW WITH WORKING GROQ
app.post('/api/generate-setup-instructions', authenticateJWT, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be signed in to generate setup instructions',
      loginUrl: '/auth/github'
    });
  }

  const { workflow, templateId, purchaseId } = req.body;
  if (!workflow || !templateId) {
    return res.status(400).json({ error: 'Workflow and templateId are required.' });
  }

  try {
    if (req.isDisconnected()) return;
    
    console.log('📋 Generating setup instructions for:', templateId);
    
    const nodeTypes = workflow.nodes?.map((node) => node.type).filter(Boolean) || [];
    const uniqueServices = [...new Set(nodeTypes)]
      .map(service => service.replace('n8n-nodes-base.', ''))
      .filter(service => !['Start', 'Set', 'NoOp', 'If', 'Switch'].includes(service))
      .slice(0, 5);

    const groqInstructions = await generateInstructionsWithGroq(workflow, templateId, req.user.id);
    
    if (req.isDisconnected() || res.headersSent) return;
    
    if (groqInstructions) {
      return res.json({ 
        success: true,
        instructions: groqInstructions,
        source: 'groq_ai',
        metadata: {
          nodeCount: workflow.nodes?.length || 0,
          services: uniqueServices,
          workflowType: 'AI Generated'
        }
      });
    }

    const instructions = `# ${templateId.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

## 🎯 Workflow Overview
This template contains **${workflow.nodes?.length || 0} nodes** designed to streamline your automation processes.

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

    res.json({ 
      success: true,
      instructions: instructions,
      source: 'structured_analysis',
      metadata: {
        nodeCount: workflow.nodes?.length || 0,
        services: uniqueServices,
        workflowType: 'n8n Automation'
      }
    });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('❌ Error generating setup instructions:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ 
        error: 'Failed to generate setup instructions.',
        details: error.message
      });
    }
  }
}); 

// ✅ NEW: AI template generation endpoint for admin dashboard
app.post('/api/ai/generate-template-details', requireAdminAuth, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const { workflowJson, templateName, description } = req.body;
    
    if (!workflowJson) {
      return res.status(400).json({ 
        success: false, 
        error: 'Workflow JSON is required' 
      });
    }

    if (!checkAIRateLimit(req.user.id)) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please wait before generating again.'
      });
    }

    console.log('🤖 Generating AI template details for admin:', req.user.email);

    let workflow;
    try {
      workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid workflow JSON format'
      });
    }

    const nodeCount = workflow.nodes?.length || 0;
    const serviceTypes = workflow.nodes ? 
      [...new Set(workflow.nodes
        .map(node => node.type?.replace('n8n-nodes-base.', '') || 'Unknown')
        .filter(type => !['Start', 'Set', 'NoOp', 'If', 'Switch'].includes(type))
      )] : [];

    if (req.isDisconnected() || res.headersSent) return;

    res.json({
      success: true,
      name: templateName || `${serviceTypes[0] || 'Automation'} Workflow`,
      description: description || `Automated workflow with ${nodeCount} nodes using ${serviceTypes.slice(0,3).join(', ')}`,
      price: nodeCount < 5 ? 999 : nodeCount < 15 ? 1999 : 2999,
      enhancedDetails: {
        name: templateName,
        description: description || `Automated workflow with ${nodeCount} nodes`,
        nodeCount: nodeCount,
        integratedApps: serviceTypes.slice(0, 10),
        category: serviceTypes.length > 0 ? serviceTypes[0] : 'Automation',
        complexity: nodeCount < 5 ? 'Simple' : nodeCount < 15 ? 'Intermediate' : 'Advanced',
        estimatedSetupTime: nodeCount < 5 ? '5-10 minutes' : nodeCount < 15 ? '15-30 minutes' : '30+ minutes'
      },
      metadata: {
        totalNodes: nodeCount,
        serviceCount: serviceTypes.length,
        aiEnhanced: false,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('AI generation error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate template details'
      });
    }
  }
});

// ✅ MISSING ROUTE: Admin expects this URL path  
app.post('/api/admin/generate-template-details', requireAdminAuth, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const { workflowJson, templateName, description } = req.body;
    
    if (!workflowJson) {
      return res.status(400).json({ 
        success: false, 
        error: 'Workflow JSON is required' 
      });
    }

    if (!checkAIRateLimit(req.user.id)) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Please wait before generating again.'
      });
    }

    console.log('🤖 Admin generating template details for:', req.user.email);

    let workflow;
    try {
      workflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid workflow JSON format'
      });
    }

    const nodeCount = workflow.nodes?.length || 0;
    const serviceTypes = workflow.nodes ? 
      [...new Set(workflow.nodes
        .map(node => node.type?.replace('n8n-nodes-base.', '') || 'Unknown')
        .filter(type => !['Start', 'Set', 'NoOp', 'If', 'Switch'].includes(type))
      )] : [];

    if (req.isDisconnected() || res.headersSent) return;

    res.json({
      success: true,
      name: templateName || `${serviceTypes[0] || 'Automation'} Workflow`,
      description: description || `Automated workflow with ${nodeCount} nodes using ${serviceTypes.slice(0,3).join(', ')}`,
      price: nodeCount < 5 ? 999 : nodeCount < 15 ? 1999 : 2999,
      enhancedDetails: {
        name: templateName,
        description: description || `Automated workflow with ${nodeCount} nodes`,
        nodeCount: nodeCount,
        integratedApps: serviceTypes.slice(0, 10),
        category: serviceTypes.length > 0 ? serviceTypes[0] : 'Automation',
        complexity: nodeCount < 5 ? 'Simple' : nodeCount < 15 ? 'Intermediate' : 'Advanced',
        estimatedSetupTime: nodeCount < 5 ? '5-10 minutes' : nodeCount < 15 ? '15-30 minutes' : '30+ minutes'
      },
      metadata: {
        totalNodes: nodeCount,
        serviceCount: serviceTypes.length,
        aiEnhanced: false,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Admin AI generation error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate template details'
      });
    }
  }
}); 

// ✅ PART 6: ADMIN, STRIPE & SERVER STARTUP - FINAL PART WITH ALL FIXES

// ==================== ADMIN ENDPOINTS ====================

app.get('/api/admin/templates', requireAdminAuth, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
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
    
    if (req.isDisconnected() || res.headersSent) return;
    
    res.json({ success: true, templates: result.rows });
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error fetching admin templates:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to fetch admin templates' });
    }
  }
});

// ✅ FIXED: Template creation endpoint with correct database schema
app.post('/api/templates', requireAdminAuth, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const { name, description, price, workflowJson, imageUrl } = req.body;
    
    console.log('📤 Creating new template:', name, 'by admin:', req.user.email);
    
    if (!name || !description || price === undefined || !workflowJson) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: name, description, price, and workflowJson are required' 
      });
    }
    
    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Price must be a valid positive number' 
      });
    }
    
    const priceInCents = Math.round(numericPrice * 100);
    
    let parsedWorkflow;
    try {
      parsedWorkflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
      if (!parsedWorkflow.nodes || !Array.isArray(parsedWorkflow.nodes)) {
        throw new Error('Workflow must contain a nodes array');
      }
    } catch (error) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid workflow JSON format',
        details: error.message
      });
    }

    if (req.isDisconnected()) return;

    const result = await pool.query(`
      INSERT INTO templates (
        name, description, price, workflow_json, image_url, 
        creator_id, currency, status, is_public, download_count, view_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      name.trim(),
      description.trim(), 
      priceInCents,
      parsedWorkflow,
      imageUrl || null,
      req.user.id,
      'USD',
      'draft',
      true,
      0,
      0
    ]);
    
    if (req.isDisconnected() || res.headersSent) return;
    
    const template = result.rows[0];
    
    console.log('✅ Template created successfully:', template.id, template.name);
    
    res.json({
      success: true,
      message: 'Template created successfully',
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        price: template.price,
        imageUrl: template.image_url,
        workflowJson: template.workflow_json,
        createdAt: template.created_at,
        isPublic: template.is_public,
        status: template.status
      }
    });
    
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    
    console.error('❌ DETAILED Error creating template:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint,
      detail: error.detail
    });
    
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Template with similar content already exists'
      });
    }
    
    if (error.code === '23502') {
      return res.status(400).json({
        success: false,
        error: `Missing required field: ${error.column}`
      });
    }
    
    if (error.code === '42703') {
      return res.status(500).json({
        success: false,
        error: `Database schema error: ${error.message}`
      });
    }
    
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({
        success: false,
        error: 'Failed to create template',
        details: error.message,
        errorCode: error.code
      });
    }
  }
});

// ✅ SECURE: Template upload endpoint for JSON processing
app.post('/api/templates/upload', requireAdminAuth, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const { workflowJson, templateName, description, price } = req.body;
    
    let parsedWorkflow;
    try {
      parsedWorkflow = typeof workflowJson === 'string' ? JSON.parse(workflowJson) : workflowJson;
    } catch (error) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid JSON format',
        details: 'Please ensure your workflow JSON is properly formatted'
      });
    }

    if (!parsedWorkflow.nodes || !Array.isArray(parsedWorkflow.nodes)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid workflow structure',
        details: 'Workflow must contain a nodes array'
      });
    }
    
    console.log('✅ Template JSON validated successfully');
    
    if (!res.headersSent && !req.isDisconnected()) {
      res.json({ 
        success: true, 
        message: 'Template validated and processed',
        nodeCount: parsedWorkflow.nodes.length
      });
    }
    
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Template upload error:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to process template',
        details: error.message
      });
    }
  }
});

// ✅ SECURE: Set Admin Role Endpoint
app.post('/api/admin/set-admin-role', requireAdminAuth, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    console.log('🔐 Admin role change requested by:', req.user.email || req.user.username);
    const { userId, role } = req.body;
    
    if (!userId || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid user ID or role' });
    }
    
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    
    console.log(`✅ Admin role change by ${req.user.email || req.user.username}: User ${userId} set to ${role}`);
    
    if (!res.headersSent && !req.isDisconnected()) {
      res.json({ success: true, message: `User ${userId} role updated to ${role}` });
    }
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error setting admin role:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to set admin role' });
    }
  }
});

// ✅ MISSING ROUTE: Template deletion endpoint
app.delete('/api/templates/:id', requireAdminAuth, async (req, res) => {
  try {
    if (req.isDisconnected()) return;
    
    const templateId = req.params.id;
    
    console.log('🗑️ Admin deleting template:', templateId, 'by user:', req.user.email || req.user.username);
    
    if (!templateId || isNaN(templateId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid template ID' 
      });
    }

    const checkResult = await pool.query(
      'SELECT id, name FROM templates WHERE id = $1',
      [templateId]
    );

    if (req.isDisconnected()) return;

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Template not found' 
      });
    }

    const templateName = checkResult.rows[0].name;

    const purchaseCheck = await pool.query(
      'SELECT COUNT(*) as purchase_count FROM purchases WHERE template_id = $1 AND status = $2',
      [templateId, 'completed']
    );

    if (req.isDisconnected()) return;

    const purchaseCount = parseInt(purchaseCheck.rows[0].purchase_count);

    const deleteResult = await pool.query(
      'DELETE FROM templates WHERE id = $1 RETURNING id, name',
      [templateId]
    );

    if (req.isDisconnected() || res.headersSent) return;

    if (deleteResult.rows.length === 0) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to delete template' 
      });
    }

    console.log(`✅ Template deleted successfully: ${templateId} (${templateName}) by ${req.user.email}`);
    
    res.json({ 
      success: true, 
      message: 'Template deleted successfully',
      deletedId: templateId,
      templateName: templateName,
      hadPurchases: purchaseCount > 0
    });

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('❌ Error deleting template:', error);
    
    if (error.code === '23503') {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete template: it has associated records (purchases, etc.)'
      });
    }
    
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error while deleting template',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

// ==================== STRIPE PAYMENT ENDPOINTS ====================

// ✅ SECURE: Stripe Checkout Session (FIXED - removed passport middleware)
app.post('/api/stripe/create-checkout-session', authenticateJWT, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ 
      error: 'Payment system unavailable',
      message: 'Stripe is not configured. Please contact support.',
      disabled: true
    });
  }

  if (!req.user) {
    console.log('❌ Unauthorized checkout attempt - user not logged in');
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to purchase templates',
      redirectToLogin: true,
      loginUrl: '/auth/github'
    });
  }

  const { templateId } = req.body;
  if (!templateId) {
    return res.status(400).json({ error: 'Template ID is required' });
  }

  const checkoutFrontendUrl = process.env.FRONTEND_URL || 
    (process.env.NODE_ENV === 'production' ? 'https://www.devhubconnect.com' : 'http://localhost:5173');

  try {
    if (req.isDisconnected()) return;
    
    console.log('💳 Creating checkout session for:', templateId, 'by user:', req.user.email || req.user.username);
    
    const template = await pool.query('SELECT name, price FROM templates WHERE id = $1', [templateId]);
    
    if (req.isDisconnected()) return;
    
    if (template.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const existingPurchase = await pool.query(`
      SELECT id FROM purchases 
      WHERE user_id = $1 AND template_id = $2 AND status = 'completed'
    `, [req.user.id, templateId]);
    
    if (req.isDisconnected() || res.headersSent) return;
    
    if (existingPurchase.rows.length > 0) {
      console.log('⚠️ User already owns this template:', req.user.email, template.rows[0].name);
      return res.status(409).json({ 
        error: 'Template already purchased',
        message: 'You already own this template. Check your dashboard.',
        alreadyOwned: true
      });
    }

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
      success_url: `${checkoutFrontendUrl}/dashboard?purchase=success&template=${templateId}`,
      cancel_url: `${checkoutFrontendUrl}/template/${templateId}`,
      metadata: { 
        templateId: templateId.toString(), 
        userId: req.user.id.toString(),
        userEmail: req.user.email || '',
        userName: req.user.username || ''
      },
      customer_email: req.user.email
    });

    if (req.isDisconnected()) return;

    await pool.query(
      'INSERT INTO purchases (user_id, template_id, stripe_session_id, status, amount_paid, purchased_at) VALUES ($1, $2, $3, $4, $5, NOW())',
      [req.user.id, templateId, session.id, 'pending', template.rows[0].price]
    );

    console.log('✅ Stripe session created:', session.id);
    console.log('🔗 Linked to user:', req.user.id, req.user.email);

    if (!res.headersSent && !req.isDisconnected()) {
      res.json({ 
        success: true, 
        sessionId: session.id, 
        url: session.url,
        userVerified: true,
        templateName: template.rows[0].name
      });
    }
  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ECONNABORTED') {
      return;
    }
    console.error('Error creating checkout session:', error);
    if (!res.headersSent && !req.isDisconnected()) {
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  }
});

// ==================== SPA ROUTING & FALLBACKS ====================

// ✅ SECURE: SPA ROUTING FIX - Serve React app for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    if (!res.headersSent && !req.isDisconnected()) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    return;
  }
  
  if (!res.headersSent && !req.isDisconnected()) {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

// ✅ NEW: Global error handler - MUST BE AT THE END
app.use((err, req, res, next) => {
  // Silently handle connection aborts
  if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    return;
  }
  
  // Log actual errors
  console.error('Unhandled error:', err);
  
  if (!res.headersSent && !req.isDisconnected()) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== SERVER STARTUP & ERROR HANDLING ====================

// ✅ ENHANCED: Server Startup with Consolidated Logging
const server = app.listen(port, '0.0.0.0', async () => {
  if (process.env.NODE_ENV === 'production') {
    console.log('🚀 DevHubConnect Production Server Started');
    console.log(`✅ Server: ${port} | Environment: production`);
    console.log(`🔒 Security: OAuth, JWT, Rate Limiting Active`);
    console.log(`💳 Payments: ${stripe ? 'Active' : 'Disabled'}`);
  } else {
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
    console.log('🔐 AUTHENTICATION:');
    console.log('   ✅ GitHub OAuth - /auth/github');
    console.log('   ✅ Admin routes require GitHub login and admin role');
    console.log('   ✅ Admin password login - /api/admin/login');
    console.log('');
    console.log('🌐 ENDPOINTS AVAILABLE:');
    console.log('   POST /api/ask-ai - AI chat system (NOW WITH GROQ!)');
    console.log('   POST /api/generate-setup-instructions - Generate template instructions (NOW WITH GROQ!)');
    console.log('   GET  /api/templates - Template list');
    console.log('   GET  /api/recommendations - Recommended templates');
    console.log('   GET  /api/user/purchases - User purchases');
    console.log('   POST /api/admin/login - Admin password login');
    console.log('   GET  /api/admin/templates - Admin template list');
    console.log('   POST /api/stripe/create-checkout-session - Create Stripe checkout');
    console.log('   POST /api/admin/set-admin-role - Grant admin role');
    console.log('   GET  /dashboard - User dashboard');
    console.log('   GET  /admin/dashboard - Admin dashboard');
    console.log('   GET  /admin/login - Admin login page');
    console.log('');
    console.log('🤖 AI FEATURES:');
    console.log('   ✅ Groq Integration: ' + (groq ? 'ACTIVE' : 'FALLBACK MODE'));
    console.log('   ✅ Rate Limiting: 10 requests/minute per user');
    console.log('   ✅ Secure Fallbacks: Always functional');
    console.log('');
    console.log('🔒 SECURITY FEATURES:');
    console.log('   ✅ JWT Authentication with session validation');
    console.log('   ✅ CSRF protection for OAuth');
    console.log('   ✅ Input validation and sanitization');
    console.log('   ✅ Rate limiting on auth and AI endpoints');
    console.log('   ✅ Secure cookie handling');
    console.log('   ✅ Connection abort handling - NO MORE SPAM LOGS');
    console.log('');
    console.log('✅ System fully initialized and ready for requests!');
    console.log('========================================\n');
  }
});

// ✅ ENHANCED: Server Error Handling
server.on('error', (error) => {
  console.error('🚨 Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use. Please use a different port.`);
    process.exit(1);
  }
  if (error.code === 'EACCES') {
    console.error(`❌ Permission denied. Cannot bind to port ${port}.`);
    process.exit(1);
  }
});

// ✅ ENHANCED: Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received. Starting graceful shutdown...');
  server.close(async () => {
    console.log('✅ HTTP server closed.');
    await pool.end();
    console.log('✅ Database pool closed.');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received. Starting graceful shutdown...');
  server.close(async () => {
    console.log('✅ HTTP server closed.');
    await pool.end();
    console.log('✅ Database pool closed.');
    process.exit(0);
  });
});

// ✅ PRODUCTION: Environment validation
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = [
    'JWT_SECRET',
    'GITHUB_CLIENT_ID', 
    'GITHUB_CLIENT_SECRET',
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ];
  
  const missing = requiredEnvVars.filter(env => !process.env[env]);
  if (missing.length > 0) {
    console.error('❌ CRITICAL: Missing required environment variables:', missing);
    process.exit(1);
  }
  
  console.log('✅ All required environment variables configured');
}

// ✅ ENHANCED: Unhandled promise rejection handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Promise Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// ✅ ENHANCED: Uncaught exception handling
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

// ✅ FIXED: No export statement needed for main server file