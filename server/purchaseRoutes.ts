import { Router } from 'express';
import pg from 'pg';
const { Pool } = pg;

// Use the same pool configuration as your main server
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const purchaseRouter = Router();

// Helper function to validate session using PostgreSQL
async function validateSession(sessionId) {
  try {
    const result = await pool.query(`
      SELECT user_id, expires_at 
      FROM sessions 
      WHERE id = $1 AND is_active = true AND expires_at > NOW()
    `, [sessionId]);
    
    if (result.rows.length > 0) {
      const session = result.rows[0];
      console.log(`Valid session found for user: ${session.user_id}`);
      return session.user_id;
    } else {
      console.log(`Session ${sessionId} expired or invalid`);
      return null;
    }
  } catch (error) {
    console.error("Error validating session:", error);
    return null;
  }
}

// Helper function to refresh session expiry after successful purchase
async function refreshSession(sessionId) {
  try {
    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + 7); // Extend by 7 days
    
    await pool.query(`
      UPDATE sessions 
      SET expires_at = $1, updated_at = NOW() 
      WHERE id = $2
    `, [newExpiryDate, sessionId]);
      
    console.log(`Session ${sessionId} refreshed until ${newExpiryDate.toISOString()}`);
  } catch (error) {
    console.error("Error refreshing session:", error);
  }
}

// Helper function to refresh ALL sessions for a user (for post-purchase)
async function refreshUserSessions(userId) {
  try {
    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + 7); // Extend by 7 days
    
    const result = await pool.query(`
      UPDATE sessions 
      SET expires_at = $1, updated_at = NOW() 
      WHERE user_id = $2 AND is_active = true
      RETURNING id
    `, [newExpiryDate, userId]);
      
    console.log(`Refreshed ${result.rows.length} sessions for user ${userId} after purchase`);
  } catch (error) {
    console.error("Error refreshing user sessions:", error);
  }
}

// GET /dashboard-purchases - Enhanced endpoint for dashboard redirects
purchaseRouter.get("/dashboard-purchases", async (req, res) => {
  try {
    const sessionId = req.cookies?.devhub_session;
    let userId = null;
    
    console.log(`Dashboard purchase request with session: ${sessionId ? 'present' : 'missing'}`);
    
    // Primary: Validate session-based auth
    if (sessionId) {
      userId = await validateSession(sessionId);
      
      if (userId) {
        // Always refresh session on dashboard access to ensure continuity
        await refreshSession(sessionId);
      } else {
        // Session expired - clear the cookie and redirect to login
        res.clearCookie('devhub_session', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/'
        });
        console.log(`Cleared expired session cookie for dashboard access`);
        
        return res.status(401).json({ 
          error: "Session expired",
          success: false, 
          message: "Your session has expired. Please sign in again.",
          redirectToLogin: true,
          loginUrl: '/auth/github'
        });
      }
    }

    if (!userId) {
      console.log(`No valid authentication for dashboard access`);
      return res.status(401).json({ 
        error: "Authentication required",
        success: false, 
        message: "Please sign in to view your dashboard",
        redirectToLogin: true,
        loginUrl: '/auth/github'
      });
    }

    console.log(`Fetching dashboard purchases for user: ${userId}`);

    // Get user info and purchases in one transaction
    const client = await pool.connect();
    try {
      // Get user details
      const userResult = await client.query(`
        SELECT id, email, name, role, avatar_url, created_at 
        FROM users 
        WHERE id = $1 AND is_active = true
      `, [userId]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({ 
          error: "User not found",
          success: false 
        });
      }

      const user = userResult.rows[0];

      // Get purchases with template data
      const purchaseResult = await client.query(`
        SELECT 
          p.id as purchase_id,
          p.amount_paid,
          p.currency,
          p.status,
          p.purchased_at,
          p.completed_at,
          t.id,
          t.name,
          t.description,
          t.price,
          t.image_url,
          t.workflow_json,
          t.created_at,
          t.download_count,
          t.view_count,
          t.rating
        FROM purchases p
        LEFT JOIN templates t ON p.template_id = t.id
        WHERE p.user_id = $1 AND p.status = 'completed'
        ORDER BY p.purchased_at DESC
      `, [userId]);

      console.log(`Found ${purchaseResult.rows.length} purchases for dashboard user ${userId}`);

      // Format response optimized for dashboard display
      const formattedPurchases = purchaseResult.rows.map(row => ({
        purchaseInfo: {
          purchaseId: row.purchase_id,
          amountPaid: row.amount_paid,
          currency: row.currency,
          status: row.status,
          purchasedAt: row.purchased_at,
          completedAt: row.completed_at
        },
        template: {
          id: row.id,
          name: row.name,
          description: row.description,
          price: row.price,
          imageUrl: row.image_url,
          workflowJson: row.workflow_json,
          createdAt: row.created_at,
          downloadCount: row.download_count,
          viewCount: row.view_count,
          rating: row.rating,
          purchased: true,
          canDownload: true
        }
      }));

      res.json({
        success: true,
        purchases: formattedPurchases,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar_url,
          memberSince: user.created_at
        },
        sessionValid: true,
        dashboardReady: true
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error("Error fetching dashboard purchases:", error);
    res.status(500).json({
      success: false,
      message: "Error loading dashboard",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /refresh-after-purchase - Specific endpoint for post-Stripe session refresh
purchaseRouter.post("/refresh-after-purchase", async (req, res) => {
  try {
    const sessionId = req.cookies?.devhub_session;
    const { templateId, purchaseSuccess } = req.body;
    
    console.log(`Post-purchase refresh request: template ${templateId}, session ${sessionId ? 'present' : 'missing'}`);
    
    if (!sessionId) {
      return res.status(401).json({ 
        error: "No session found",
        success: false,
        message: "Session missing after purchase" 
      });
    }

    const userId = await validateSession(sessionId);
    
    if (!userId) {
      return res.status(401).json({ 
        error: "Invalid session",
        success: false,
        message: "Session expired during purchase process" 
      });
    }

    // Refresh ALL sessions for this user to ensure dashboard access works
    await refreshUserSessions(userId);
    
    // Verify the purchase exists
    if (templateId) {
      const purchaseCheck = await pool.query(`
        SELECT p.id, t.name 
        FROM purchases p
        LEFT JOIN templates t ON p.template_id = t.id
        WHERE p.user_id = $1 AND p.template_id = $2 AND p.status = 'completed'
        ORDER BY p.purchased_at DESC
        LIMIT 1
      `, [userId, templateId]);

      if (purchaseCheck.rows.length > 0) {
        console.log(`Confirmed purchase: ${purchaseCheck.rows[0].name} for user ${userId}`);
      }
    }

    res.json({
      success: true,
      message: "Session refreshed after purchase",
      sessionValid: true,
      dashboardReady: true,
      userId: userId
    });

  } catch (error) {
    console.error("Error refreshing session after purchase:", error);
    res.status(500).json({
      success: false,
      message: "Error refreshing session",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /session-check - Quick session validation for frontend
purchaseRouter.get("/session-check", async (req, res) => {
  try {
    const sessionId = req.cookies?.devhub_session;
    
    if (!sessionId) {
      return res.status(401).json({ 
        sessionValid: false,
        message: "No session cookie found"
      });
    }

    const userId = await validateSession(sessionId);
    
    if (!userId) {
      // Clear invalid session cookie
      res.clearCookie('devhub_session', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      
      return res.status(401).json({ 
        sessionValid: false,
        message: "Session expired or invalid"
      });
    }

    // Get basic user info
    const userResult = await pool.query(`
      SELECT id, email, name, role 
      FROM users 
      WHERE id = $1 AND is_active = true
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        sessionValid: false,
        message: "User not found"
      });
    }

    res.json({
      sessionValid: true,
      user: userResult.rows[0],
      dashboardReady: true
    });

  } catch (error) {
    console.error("Error checking session:", error);
    res.status(500).json({
      sessionValid: false,
      message: "Session check failed"
    });
  }
});

export default purchaseRouter;