// server/stripeRoutes.ts
import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { db } from './db';
import { templates, purchases, users, sessions } from '../shared/schema';
import { eq, and } from 'drizzle-orm';

const stripeRouter = Router();

// ✅ SECURE: Environment validation
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_for_devhubconnect';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ✅ SECURE: Frontend URL based on environment
const FRONTEND_URL = NODE_ENV === 'production' 
  ? 'https://devhubconnect-production.up.railway.app' 
  : process.env.FRONTEND_URL || 'https://devhubconnect-production.up.railway.app';

// ✅ SECURE: Validate Stripe configuration
if (!STRIPE_SECRET_KEY) {
  console.error('❌ CRITICAL: STRIPE_SECRET_KEY missing in environment variables');
  process.exit(1);
}

if (!STRIPE_WEBHOOK_SECRET) {
  console.error('❌ WARNING: STRIPE_WEBHOOK_SECRET missing - webhooks will not work');
}

console.log(`✅ Stripe configured - Key length: ${STRIPE_SECRET_KEY.length}, Environment: ${NODE_ENV}`);

// ✅ SECURE: Initialize Stripe with proper configuration
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
  typescript: true,
  telemetry: false, // Disable telemetry for security
  appInfo: {
    name: 'DevHubConnect',
    version: '1.0.0',
  },
});

// ✅ SECURE: Authentication middleware
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    isAdmin: boolean;
    email?: string;
  };
}

const authenticateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // 🔍 DEBUG: Log all cookies
    console.log(`🔍 DEBUG: All cookies received:`, req.cookies);
    
    // Check for session cookie
    const sessionId = req.cookies?.devhub_session;
    
    console.log(`🔍 DEBUG: Session ID from cookie: ${sessionId}`);
    console.log(`🔍 DEBUG: Session ID type: ${typeof sessionId}`);
    
    if (!sessionId) {
      console.log(`🔍 DEBUG: No session cookie found`);
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required for payment operations.' 
      });
    }

    // 🔍 DEBUG: Check database for session
    console.log(`🔍 DEBUG: Looking for session in database: ${sessionId}`);
    
    // Verify session in database
    const [session] = await db.select({
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      isActive: sessions.isActive
    })
    .from(sessions)
    .where(and(
      eq(sessions.id, sessionId),
      eq(sessions.isActive, true)
    ));

    console.log(`🔍 DEBUG: Session found in database:`, session ? 'YES' : 'NO');
    if (session) {
      console.log(`🔍 DEBUG: Session details:`, {
        userId: session.userId,
        expiresAt: session.expiresAt,
        isActive: session.isActive,
        isExpired: new Date() > session.expiresAt
      });
    }

    if (!session || new Date() > session.expiresAt) {
      console.log(`🔍 DEBUG: Session invalid or expired`);
      return res.status(401).json({ 
        success: false, 
        message: 'Session expired. Please log in again.' 
      });
    }

    // Get user details
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, session.userId));

    if (!user) {
      console.log(`🔍 DEBUG: User not found for session`);
      return res.status(401).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    console.log(`🔍 DEBUG: Authentication successful for user: ${user.id}`);
    req.user = { 
      id: user.id, 
      isAdmin: user.role === 'admin',
      email: user.email 
    };
    
    next();
  } catch (error) {
    console.error('🔍 DEBUG: Session verification failed in payment:', error);
    res.status(403).json({ 
      success: false, 
      message: 'Invalid session.' 
    });
  }
};

// ✅ SECURE: Rate limiting for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each user to 10 payment attempts per windowMs
  message: {
    success: false,
    message: 'Too many payment attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ SECURE: Webhook rate limiting (separate from user payments)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Allow more webhook calls
  message: { error: 'Webhook rate limit exceeded' },
  skip: (req) => {
    // Skip rate limiting for Stripe IPs (you'd add actual Stripe IP ranges)
    return req.ip?.startsWith('54.187.') || req.ip?.startsWith('54.188.');
  }
});

// ✅ SECURE: Validate template access and prevent duplicate purchases
async function validateTemplateAccess(templateId: number, userId: string): Promise<{
  template: any;
  alreadyPurchased: boolean;
  canPurchase: boolean;
  reason?: string;
}> {
  try {
    // Get template details using Drizzle ORM
    const [template] = await db.select()
      .from(templates)
      .where(eq(templates.id, templateId));

    // ADD DEBUG LINES HERE:
    console.log(`🔍 DEBUG: Raw template object:`, JSON.stringify(template, null, 2));
    console.log(`🔍 DEBUG: template.stripePriceId:`, template?.stripePriceId);
    console.log(`🔍 DEBUG: template.stripe_price_id:`, (template as any)?.stripe_price_id);
    console.log(`🔍 DEBUG: All template keys:`, template ? Object.keys(template) : 'NO TEMPLATE');

    if (!template) {
      return { template: null, alreadyPurchased: false, canPurchase: false, reason: 'Template not found' };
    }

    // Check if template has stripe_price_id
    if (!template.stripePriceId) {
      return { template, alreadyPurchased: false, canPurchase: false, reason: 'Template missing Stripe Price ID' };
    }

    // Check if template is available for purchase (if you have status field)
    if (template.status && template.status !== 'published' && template.status !== 'draft') {
      return { template, alreadyPurchased: false, canPurchase: false, reason: 'Template not available for purchase' };
    }

    // Check if user is the creator (creators can't buy their own templates)
    if (template.creatorId === userId) {
      return { template, alreadyPurchased: true, canPurchase: false, reason: 'Cannot purchase your own template' };
    }

    // Check if user already purchased this template
    const [existingPurchase] = await db.select()
      .from(purchases)
      .where(and(
        eq(purchases.templateId, templateId),
        eq(purchases.userId, userId),
        eq(purchases.status, 'completed')
      ));

    if (existingPurchase) {
      return { template, alreadyPurchased: true, canPurchase: false, reason: 'Template already purchased' };
    }

    return { template, alreadyPurchased: false, canPurchase: true };
  } catch (error) {
    console.error('Error validating template access:', error);
    return { template: null, alreadyPurchased: false, canPurchase: false, reason: 'Database error' };
  }
}

// ✅ FIXED: URL params route (this is what your frontend is calling)
stripeRouter.post('/:templateId/purchase', authenticateUser, paymentLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.templateId); // Get from URL params
    const userId = req.user!.id;

    console.log(`DEBUG: Payment attempt - User: ${userId}, Template: ${templateId}`);

    // ✅ SECURE: Input validation
    if (!templateId || isNaN(templateId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid template ID is required.' 
      });
    }

    // ✅ SECURE: Validate template access
    const validation = await validateTemplateAccess(templateId, userId);
    
    if (!validation.canPurchase) {
      console.log(`DEBUG: Cannot purchase template ${templateId}: ${validation.reason}`);
      return res.status(400).json({
        success: false,
        message: validation.reason || 'Cannot purchase this template',
        alreadyPurchased: validation.alreadyPurchased
      });
    }

    const template = validation.template;

    console.log(`DEBUG: Found template: ${template.name}, Price: $${(template.price/100).toFixed(2)}, Price ID: ${template.stripePriceId}`);

    // ✅ SECURE: Get user details for Stripe
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User account not found.' 
      });
    }

    // ✅ SECURE: Create checkout session with comprehensive metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: template.stripePriceId, // Use the correct field name
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&template_id=${templateId}`,
      cancel_url: `${FRONTEND_URL}/template/${template.id}?payment=cancelled`,
      
      // ✅ SECURE: Comprehensive metadata for webhook processing
      metadata: {
        templateId: template.id.toString(),
        userId: userId,
        templateName: template.name,
        templatePrice: template.price.toString(),
        userEmail: user.email,
        timestamp: new Date().toISOString(),
      },
      
      // ✅ SECURE: Customer information
      customer_email: user.email,
      
      // ✅ SECURE: Payment intent options
      payment_intent_data: {
        metadata: {
          templateId: template.id.toString(),
          userId: userId,
          purchaseType: 'template_purchase'
        }
      },
      
      // ✅ SECURE: Session expiration
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      
      // ✅ SECURE: Automatic tax (if configured)
      automatic_tax: { enabled: false }, // Set to true if you have tax configured
      
      // ✅ SECURE: Invoice creation for records
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `DevHubConnect Template: ${template.name}`,
          metadata: {
            templateId: template.id.toString(),
            userId: userId
          }
        }
      }
    });

    // ✅ SECURE: Create pending purchase record
    await db.insert(purchases).values({
      userId: userId,
      templateId: template.id,
      amountPaid: template.price,
      currency: 'USD',
      status: 'pending',
      stripeSessionId: session.id,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    });

    console.log(`DEBUG: Created pending purchase - Session: ${session.id}, User: ${userId}, Template: ${templateId}`);

    res.json({ 
      success: true, 
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    
    // ✅ SECURE: Don't expose internal errors to frontend
    if (error instanceof Stripe.errors.StripeError) {
      console.error('Stripe Error:', {
        type: error.type,
        code: error.code,
        message: error.message
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Payment service error. Please try again.' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to initiate payment. Please try again.' 
      });
    }
  }
});

// ✅ SECURE: Create checkout session with comprehensive validation (KEEP BOTH ROUTES FOR COMPATIBILITY)
stripeRouter.post('/create-checkout-session', authenticateUser, paymentLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { templateId } = req.body;
    const userId = req.user!.id;

    console.log(`DEBUG: Payment attempt - User: ${userId}, Template: ${templateId}`);

    // ✅ SECURE: Input validation
    if (!templateId || typeof templateId !== 'number') {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid template ID is required.' 
      });
    }

    // ✅ SECURE: Validate template access
    const validation = await validateTemplateAccess(templateId, userId);
    
    if (!validation.canPurchase) {
      console.log(`DEBUG: Cannot purchase template ${templateId}: ${validation.reason}`);
      return res.status(400).json({
        success: false,
        message: validation.reason || 'Cannot purchase this template',
        alreadyPurchased: validation.alreadyPurchased
      });
    }

    const template = validation.template;

    console.log(`DEBUG: Found template: ${template.name}, Price: $${template.price/100}, Price ID: ${template.stripePriceId}`);

    // ✅ SECURE: Get user details for Stripe
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User account not found.' 
      });
    }

    // ✅ SECURE: Create checkout session with comprehensive metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: template.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/template/${template.id}?payment=cancelled`,
      
      // ✅ SECURE: Comprehensive metadata for webhook processing
      metadata: {
        templateId: template.id.toString(),
        userId: userId,
        templateName: template.name,
        templatePrice: template.price.toString(),
        userEmail: user.email,
        timestamp: new Date().toISOString(),
      },
      
      // ✅ SECURE: Customer information
      customer_email: user.email,
      
      // ✅ SECURE: Payment intent options
      payment_intent_data: {
        metadata: {
          templateId: template.id.toString(),
          userId: userId,
          purchaseType: 'template_purchase'
        }
      },
      
      // ✅ SECURE: Session expiration
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
      
      // ✅ SECURE: Automatic tax (if configured)
      automatic_tax: { enabled: false }, // Set to true if you have tax configured
      
      // ✅ SECURE: Invoice creation for records
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `DevHubConnect Template: ${template.name}`,
          metadata: {
            templateId: template.id.toString(),
            userId: userId
          }
        }
      }
    });

    // ✅ SECURE: Create pending purchase record
    await db.insert(purchases).values({
      userId: userId,
      templateId: template.id,
      amountPaid: template.price,
      currency: 'USD',
      status: 'pending',
      stripeSessionId: session.id,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    });

    console.log(`DEBUG: Created pending purchase - Session: ${session.id}, User: ${userId}, Template: ${templateId}`);

    res.json({ 
      success: true, 
      url: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    
    // ✅ SECURE: Don't expose internal errors to frontend
    if (error instanceof Stripe.errors.StripeError) {
      console.error('Stripe Error:', {
        type: error.type,
        code: error.code,
        message: error.message
      });
      
      res.status(500).json({ 
        success: false, 
        message: 'Payment service error. Please try again.' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to initiate payment. Please try again.' 
      });
    }
  }
});

// ✅ SECURE: Webhook endpoint for Stripe events (CRITICAL for security)
stripeRouter.post('/webhook', webhookLimiter, async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('Webhook secret not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  try {
    // ✅ SECURE: Verify webhook signature (CRITICAL)
    event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
    console.log(`DEBUG: Webhook received - Type: ${event.type}, ID: ${event.id}`);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  try {
    // ✅ SECURE: Handle payment events
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        await handleSuccessfulPayment(session);
        break;
        
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        await handleFailedPayment(failedPayment);
        break;
        
      case 'invoice.payment_succeeded':
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`Invoice payment succeeded: ${invoice.id}`);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ✅ SECURE: Handle successful payment
async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  try {
    const { templateId, userId } = session.metadata!;
    
    console.log(`DEBUG: Processing successful payment - Session: ${session.id}, User: ${userId}, Template: ${templateId}`);
    
    // ✅ SECURE: Update purchase record
    const [updatedPurchase] = await db.update(purchases)
      .set({
        status: 'completed',
        completedAt: new Date(),
        stripePaymentIntentId: session.payment_intent as string,
        stripeCustomerId: session.customer as string
      })
      .where(and(
        eq(purchases.stripeSessionId, session.id),
        eq(purchases.userId, userId),
        eq(purchases.templateId, parseInt(templateId))
      ))
      .returning();

    if (updatedPurchase) {
      console.log(`✅ Purchase completed - ID: ${updatedPurchase.id}, User: ${userId}, Template: ${templateId}`);
      
      // ✅ SECURE: Update template download count
      await db.update(templates)
        .set({ 
          downloadCount: templates.downloadCount + 1
        })
        .where(eq(templates.id, parseInt(templateId)));
        
    } else {
      console.error(`Failed to find purchase record for session: ${session.id}`);
    }
  } catch (error) {
    console.error('Error handling successful payment:', error);
  }
}

// ✅ SECURE: Handle failed payment
async function handleFailedPayment(paymentIntent: Stripe.PaymentIntent) {
  try {
    const { templateId, userId } = paymentIntent.metadata;
    
    console.log(`DEBUG: Processing failed payment - PaymentIntent: ${paymentIntent.id}, User: ${userId}, Template: ${templateId}`);
    
    // ✅ SECURE: Update purchase record to failed
    await db.update(purchases)
      .set({
        status: 'failed'
      })
      .where(and(
        eq(purchases.stripePaymentIntentId, paymentIntent.id),
        eq(purchases.userId, userId)
      ));
      
    console.log(`❌ Payment failed - User: ${userId}, Template: ${templateId}`);
  } catch (error) {
    console.error('Error handling failed payment:', error);
  }
}

// ✅ SECURE: Verify payment endpoint (for frontend confirmation)
stripeRouter.get('/verify-payment', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = req.query.session_id as string;
    const userId = req.user!.id;

    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Session ID is required.' 
      });
    }

    // ✅ SECURE: Verify session belongs to authenticated user
    const [purchase] = await db.select()
      .from(purchases)
      .where(and(
        eq(purchases.stripeSessionId, sessionId),
        eq(purchases.userId, userId)
      ));

    if (!purchase) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment session not found or unauthorized.' 
      });
    }

    // ✅ SECURE: Get session from Stripe for verification
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' && purchase.status === 'completed') {
      res.json({ 
        success: true,
        status: 'paid', 
        message: 'Payment successful!',
        purchase: {
          id: purchase.id,
          templateId: purchase.templateId,
          completedAt: purchase.completedAt
        }
      });
    } else {
      res.json({ 
        success: false,
        status: session.payment_status, 
        message: 'Payment not completed.',
        purchaseStatus: purchase.status
      });
    }
  } catch (error) {
    console.error('Error verifying payment session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to verify payment session.' 
    });
  }
});

// ✅ SECURE: Get user's purchase history
stripeRouter.get('/purchases', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const userPurchases = await db.select({
      id: purchases.id,
      templateId: purchases.templateId,
      templateName: templates.name,
      amountPaid: purchases.amountPaid,
      status: purchases.status,
      purchasedAt: purchases.purchasedAt,
      completedAt: purchases.completedAt
    })
    .from(purchases)
    .innerJoin(templates, eq(purchases.templateId, templates.id))
    .where(eq(purchases.userId, userId));

    res.json({ 
      success: true, 
      purchases: userPurchases 
    });
  } catch (error) {
    console.error('Error fetching user purchases:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch purchases.' 
    });
  }
});

console.log(`✅ Stripe routes configured for ${NODE_ENV}`);
console.log(`📍 Webhook endpoint: /api/stripe/webhook`);
console.log(`📍 Success URL: ${FRONTEND_URL}/payment/success`);

export default stripeRouter;