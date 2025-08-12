// server/templateRoutes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { db } from './db';
import { templates, purchases, users, searchAnalytics, templateViews, sessions } from '../shared/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const templateRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_for_devhubconnect';

// ✅ SECURE: Enhanced interface with proper typing
interface AuthenticatedRequest extends Request {
 user?: {
   id: string; // Using string to match your schema
   isAdmin: boolean;
   email?: string;
 };
}

// ✅ SECURE: Real JWT authentication middleware
const authenticateUser = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
 const authHeader = req.headers['authorization'];
 const token = authHeader && authHeader.split(' ')[1];

 if (!token) {
   return res.status(401).json({ 
     success: false, 
     message: 'Authentication token required.',
     action: 'Please log in to access this resource.' 
   });
 }

 try {
   const decoded = jwt.verify(token, JWT_SECRET) as { id: string; isAdmin?: boolean; email?: string };
   req.user = { 
     id: decoded.id, 
     isAdmin: decoded.isAdmin || false,
     email: decoded.email 
   };
   console.log(`DEBUG: User authenticated - ID: ${decoded.id}, Admin: ${decoded.isAdmin || false}`);
   next();
 } catch (error) {
   console.error('JWT verification failed:', error);
   res.status(403).json({ 
     success: false, 
     message: 'Invalid or expired authentication token.',
     action: 'Please log in again.' 
   });
 }
};

// ✅ SECURE: Enhanced optional authentication (supports both JWT tokens AND session cookies)
const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // First try JWT token
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; isAdmin?: boolean; email?: string };
      req.user = { 
        id: decoded.id, 
        isAdmin: decoded.isAdmin || false,
        email: decoded.email 
      };
      console.log(`DEBUG: User authenticated via JWT - ID: ${decoded.id}, Admin: ${decoded.isAdmin || false}`);
      return next();
    } catch (error) {
      console.log('JWT auth failed, trying session auth');
    }
  }

  // If no JWT token or JWT failed, try session cookie
  try {
    const sessionId = req.cookies?.devhub_session;
    if (sessionId) {
      console.log(`DEBUG: Attempting session auth with session ID: ${sessionId}`);
      
      // Check session in database
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

      if (session && new Date() <= session.expiresAt) {
        // Get user details including role
        const [user] = await db.select({
          id: users.id,
          email: users.email,
          role: users.role
        })
        .from(users)
        .where(eq(users.id, session.userId));

        if (user) {
          req.user = {
            id: user.id,
            isAdmin: user.role === 'admin',
            email: user.email
          };
          console.log(`DEBUG: User authenticated via session - ID: ${user.id}, Admin: ${user.role === 'admin'}`);
        }
      } else {
        console.log('DEBUG: Session expired or invalid');
      }
    }
  } catch (error) {
    console.log('Session auth failed:', error);
  }

  next();
};

// ✅ SECURE: Admin verification middleware
const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
 if (!req.user) {
   return res.status(401).json({ 
     success: false, 
     message: 'Authentication required for admin access.' 
   });
 }

 if (!req.user.isAdmin) {
   return res.status(403).json({ 
     success: false, 
     message: 'Forbidden: Admin privileges required.' 
   });
 }

 next();
};

// ✅ SECURE: Creator or admin verification middleware
const requireCreatorOrAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
 const templateId = parseInt(req.params.id);
 const userId = req.user?.id;

 if (!userId) {
   return res.status(401).json({ 
     success: false, 
     message: 'Authentication required to perform this action.' 
   });
 }

 try {
   const [template] = await db.select({ creatorId: templates.creatorId })
     .from(templates)
     .where(eq(templates.id, templateId));

   if (!template) {
     return res.status(404).json({ 
       success: false, 
       message: 'Template not found.' 
     });
   }

   // Check if user is creator or admin
   if (template.creatorId === userId || req.user?.isAdmin) {
     next();
   } else {
     res.status(403).json({ 
       success: false, 
       message: 'Forbidden: You do not have permission to modify this template.' 
     });
   }
 } catch (error) {
   console.error("Error during authorization check:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Internal server error during authorization.' 
   });
 }
};

// ✅ SECURE: Purchase verification middleware
const requirePurchase = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
 const templateId = parseInt(req.params.id);
 const userId = req.user?.id;

 if (!userId) {
   return res.status(401).json({ 
     success: false, 
     message: 'Authentication required to access this template.',
     action: 'Please log in to download this template.' 
   });
 }

 try {
   // Check if user is admin (admins can access everything)
   if (req.user?.isAdmin) {
     console.log(`DEBUG: Admin user ${userId} accessing template ${templateId}`);
     return next();
   }

   // Check if user is the creator of the template
   const [template] = await db.select({ creatorId: templates.creatorId })
     .from(templates)
     .where(eq(templates.id, templateId));

   if (template && template.creatorId === userId) {
     console.log(`DEBUG: Creator ${userId} accessing own template ${templateId}`);
     return next();
   }

   // Check if user purchased the template
   const [purchase] = await db.select()
     .from(purchases)
     .where(and(
       eq(purchases.templateId, templateId),
       eq(purchases.userId, userId)
     ));

   if (purchase) {
     console.log(`DEBUG: User ${userId} has valid purchase for template ${templateId}`);
     next();
   } else {
     console.log(`DEBUG: User ${userId} attempted unauthorized access to template ${templateId}`);
     res.status(403).json({ 
       success: false, 
       message: 'Purchase required to access this template.',
       action: 'Please purchase this template to download it.',
       templateId: templateId
     });
   }
 } catch (error) {
   console.error("Error verifying purchase:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Error verifying template access.' 
   });
 }
};

// ✅ ANALYTICS: Analytics route - ADMIN ONLY
templateRouter.get('/analytics/popular', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
 try {
   // Most downloaded templates
   const popularByDownloads = await db.select({
     id: templates.id,
     name: templates.name,
     downloadCount: templates.downloadCount,
     viewCount: templates.viewCount,
     rating: templates.rating,
     price: templates.price
   })
   .from(templates)
   .where(eq(templates.isPublic, true))
   .orderBy(desc(templates.downloadCount))
   .limit(10);

   // Most purchased templates (if you have purchases table)
   const popularByPurchases = await db.select({
     templateId: purchases.templateId,
     templateName: templates.name,
     purchaseCount: count(purchases.id),
     totalRevenue: sql<number>`SUM(${templates.price})`
   })
   .from(purchases)
   .innerJoin(templates, eq(purchases.templateId, templates.id))
   .groupBy(purchases.templateId, templates.name)
   .orderBy(desc(count(purchases.id)))
   .limit(10);

   // Category analytics
   const categoryStats = await db.select({
     templateCount: count(templates.id),
     totalDownloads: sql<number>`SUM(${templates.downloadCount})`,
     avgRating: sql<number>`AVG(${templates.rating})`
   })
   .from(templates)
   .where(eq(templates.isPublic, true))
   .orderBy(desc(sql<number>`SUM(${templates.downloadCount})`));

   // Revenue analytics
   const revenueStats = await db.select({
     totalRevenue: sql<number>`SUM(${templates.price})`,
     totalSales: count(purchases.id),
     avgOrderValue: sql<number>`AVG(${templates.price})`
   })
   .from(purchases)
   .innerJoin(templates, eq(purchases.templateId, templates.id));

   // User engagement stats
   const userStats = await db.select({
     totalUsers: count(users.id),
     activeUsers: sql<number>`COUNT(CASE WHEN ${users.lastLoginAt} > NOW() - INTERVAL '30 days' THEN 1 END)`
   })
   .from(users);

   // Search analytics - most searched terms (ADMIN ONLY)
   const topSearchTerms = await db.select({
     searchTerm: searchAnalytics.searchTerm,
     searchCount: count(searchAnalytics.id)
   })
   .from(searchAnalytics)
   .groupBy(searchAnalytics.searchTerm)
   .orderBy(desc(count(searchAnalytics.id)))
   .limit(10);

   res.json({
     success: true,
     data: {
       popularByDownloads,
       popularByPurchases,
       categoryStats,
       revenueStats: revenueStats[0] || { totalRevenue: 0, totalSales: 0, avgOrderValue: 0 },
       userStats: userStats[0] || { totalUsers: 0, activeUsers: 0 },
       topSearchTerms
     }
   });
 } catch (error) {
   console.error('Error fetching analytics:', error);
   res.status(500).json({ 
     success: false, 
     error: 'Failed to fetch analytics' 
   });
 }
});

// ✅ ANALYTICS: Search analytics tracking route - PUBLIC INSERT ONLY
templateRouter.post('/analytics/search', async (req: Request, res: Response) => {
 try {
   const { searchTerm } = req.body;
   
   // Store in searchAnalytics table
   await db.insert(searchAnalytics).values({
     searchTerm,
     timestamp: new Date(),
     ipAddress: req.ip,
     userAgent: req.get('User-Agent')
   });
   
   res.json({ success: true });
 } catch (error) {
   console.error('Error tracking search:', error);
   res.json({ success: false }); // Don't fail the search if analytics fail
 }
});

// ✅ ANALYTICS: Template view tracking - PUBLIC INSERT ONLY
templateRouter.post('/analytics/view/:templateId', async (req: Request, res: Response) => {
 try {
   const { templateId } = req.params;
   
   // Increment view count in templates table
   await db.update(templates)
     .set({ 
       viewCount: sql`${templates.viewCount} + 1` 
     })
     .where(eq(templates.id, parseInt(templateId)));
   
   // Store in templateViews table
   await db.insert(templateViews).values({
     templateId: parseInt(templateId),
     viewedAt: new Date(),
     ipAddress: req.ip,
     userAgent: req.get('User-Agent')
   });
   
   res.json({ success: true });
 } catch (error) {
   console.error('Error tracking view:', error);
   res.json({ success: false });
 }
});

// ✅ SECURE: Get all templates (public with optional user context)
templateRouter.get('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
 try {
   // Get only published and public templates
   const allTemplates = await db.select({
     id: templates.id,
     name: templates.name,
     description: templates.description,
     price: templates.price,
     imageUrl: templates.imageUrl,
     createdAt: templates.createdAt,
     creatorId: templates.creatorId,
     // Don't include workflowJson in public listing for security
   }).from(templates)
   .where(and(
     eq(templates.isPublic, true),
     eq(templates.status, 'published')
   ));

   // Add purchase status if user is authenticated
   if (req.user) {
     const templatesWithPurchaseStatus = await Promise.all(
       allTemplates.map(async (template) => {
         // Check if user purchased this template
         const [purchase] = await db.select()
           .from(purchases)
           .where(and(
             eq(purchases.templateId, template.id),
             eq(purchases.userId, req.user!.id)
           ));

         return {
           ...template,
           isPurchased: !!purchase || template.creatorId === req.user!.id || req.user!.isAdmin,
           isOwner: template.creatorId === req.user!.id
         };
       })
     );
     
     res.json({ 
       templates: templatesWithPurchaseStatus
     });
   } else {
     res.json({ 
       templates: allTemplates.map(template => ({ ...template, isPurchased: false, isOwner: false }))
     });
   }
 } catch (error) {
   console.error("Error fetching templates:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Failed to fetch templates.' 
   });
 }
});

// ✅ SECURE: Get single template (public metadata, workflow requires purchase)
templateRouter.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
 try {
   const id = parseInt(req.params.id);
if (isNaN(id)) {
  return res.status(400).json({ 
    success: false, 
    message: 'Invalid template ID provided.' 
  });
}
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
   
   if (!template) {
     return res.status(404).json({ 
       success: false, 
       message: 'Template not found.' 
     });
   }

   // Check if user has access to full workflow
   let hasAccess = false;
   let purchaseInfo = null;

   if (req.user) {
     // Admin access
     if (req.user.isAdmin) {
       hasAccess = true;
     }
     // Creator access
     else if (template.creatorId === req.user.id) {
       hasAccess = true;
     }
     // Purchase access
     else {
       const [purchase] = await db.select()
         .from(purchases)
         .where(and(
           eq(purchases.templateId, id),
           eq(purchases.userId, req.user.id)
         ));
       
       if (purchase) {
         hasAccess = true;
         purchaseInfo = purchase;
       }
     }
   }

   // Return template data based on access level
   const responseData = {
     ...template,
     workflowJson: (hasAccess || template.creatorId === 'admin_user_id') ? template.workflowJson : null, // Fixed: Always show workflow for admin templates
     hasAccess,
     isPurchased: !!purchaseInfo,
     isOwner: req.user?.id === template.creatorId,
     purchaseInfo: purchaseInfo ? { purchasedAt: purchaseInfo.purchasedAt } : null
   };

   res.json({ 
     template: responseData 
   });
 } catch (error) {
   console.error("Error fetching template:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Failed to fetch template.' 
   });
 }
});

// ✅ SECURE: Create template (authenticated users)
templateRouter.post('/', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
 try {
   const { name, description, price, workflowJson, imageUrl } = req.body;
   const userId = req.user!.id;

   if (!name || !description || price === undefined || !workflowJson) {
     return res.status(400).json({ 
       success: false, 
       message: "Missing required fields for template creation.",
       required: ["name", "description", "price", "workflowJson"]
     });
   }

   const [newTemplate] = await db.insert(templates)
     .values({
       name,
       description,
       price: Math.round(Number(price) * 100),
       workflowJson,
       imageUrl,
       creatorId: userId,
       status: 'published', // ✅ Auto-publish new templates
       isPublic: true,      // ✅ Auto-make public
     })
     .returning();

   console.log(`DEBUG: Template created by user ${userId}:`, newTemplate.id);
   res.status(201).json({ 
     success: true, 
     message: 'Template created successfully.',
     template: newTemplate 
   });
 } catch (error) {
   console.error("Error creating template:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Failed to create template.' 
   });
 }
});

// ✅ SECURE: Update template (creator or admin only)
templateRouter.patch('/:id', authenticateUser, requireCreatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
 try {
   const id = parseInt(req.params.id);
   const { name, description, price, workflowJson, imageUrl } = req.body;

   if (!name || !description || price === undefined || !workflowJson) {
     return res.status(400).json({ 
       success: false, 
       message: "Missing required fields for update.",
       required: ["name", "description", "price", "workflowJson"]
     });
   }

   const [updatedTemplate] = await db.update(templates)
     .set({
       name,
       description,
       price: Math.round(Number(price) * 100),
       workflowJson,
       imageUrl,
     })
     .where(eq(templates.id, id))
     .returning();

   if (updatedTemplate) {
     console.log(`DEBUG: Template ${id} updated by user ${req.user!.id}`);
     res.json({ 
       template: updatedTemplate 
     });
   } else {
     res.status(404).json({ 
       success: false, 
       message: 'Template not found to update.' 
     });
   }
 } catch (error) {
   console.error("Error updating template:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Failed to update template.' 
   });
 }
});

// ✅ SECURE: Delete template (creator or admin only)
templateRouter.delete('/:id', authenticateUser, requireCreatorOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
 try {
   const id = parseInt(req.params.id);
   
   // Also delete associated purchases
   await db.delete(purchases).where(eq(purchases.templateId, id));
   
   const [deletedTemplate] = await db.delete(templates)
     .where(eq(templates.id, id))
     .returning();

   if (deletedTemplate) {
     console.log(`DEBUG: Template ${id} deleted by user ${req.user!.id}`);
     res.status(200).json({ 
       message: 'Template deleted successfully', 
       template: deletedTemplate 
     });
   } else {
     res.status(404).json({ 
       success: false, 
       message: 'Template not found to delete.' 
     });
   }
 } catch (error) {
   console.error("Error deleting template:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Failed to delete template.' 
   });
 }
});

// ✅ SECURE: Download workflow (requires authentication AND purchase verification)
templateRouter.get('/:id/download-workflow', authenticateUser, requirePurchase, async (req: AuthenticatedRequest, res: Response) => {
 try {
   const id = parseInt(req.params.id);
   
   const [template] = await db.select({ 
     workflowJson: templates.workflowJson, 
     name: templates.name,
     creatorId: templates.creatorId 
   }).from(templates).where(eq(templates.id, id));

   if (!template || !template.workflowJson) {
     return res.status(404).json({ 
       success: false, 
       message: 'Workflow JSON not found for this template.' 
     });
   }

   // Log the download for audit purposes
   console.log(`DEBUG: User ${req.user!.id} downloading template ${id} workflow`);

   const filename = template.name ? 
     `${template.name.replace(/\s/g, '_').toLowerCase()}.json` : 
     `devhubconnect_template_${id}.json`;

   res.setHeader('Content-Type', 'application/json');
   res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
   res.setHeader('X-Template-ID', id.toString());
   res.setHeader('X-Downloaded-By', req.user!.id);
   
   res.send(template.workflowJson);
 } catch (error) {
   console.error("Error downloading workflow JSON:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Failed to download workflow JSON.' 
   });
 }
});

// ✅ SECURE: Get user's purchased templates
templateRouter.get('/user/purchases', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
 try {
   const userId = req.user!.id;

   const userPurchases = await db.select({
     templateId: purchases.templateId,
     purchasedAt: purchases.purchasedAt,
     templateName: templates.name,
     templateDescription: templates.description,
     templatePrice: templates.price,
     templateImageUrl: templates.imageUrl
   })
   .from(purchases)
   .innerJoin(templates, eq(purchases.templateId, templates.id))
   .where(eq(purchases.userId, userId));

   res.json({ 
     success: true, 
     purchases: userPurchases,
     count: userPurchases.length 
   });
 } catch (error) {
   console.error("Error fetching user purchases:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Failed to fetch user purchases.' 
   });
 }
});

// ✅ SECURE: Get user's created templates
templateRouter.get('/user/created', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
 try {
   const userId = req.user!.id;

   const userTemplates = await db.select()
     .from(templates)
     .where(eq(templates.creatorId, userId));

   res.json({ 
     success: true, 
     templates: userTemplates,
     count: userTemplates.length 
   });
 } catch (error) {
   console.error("Error fetching user templates:", error);
   res.status(500).json({ 
     success: false, 
     message: 'Failed to fetch user templates.' 
   });
 }
});

// DEBUG: Temporary debug endpoint
templateRouter.get('/debug', async (req: Request, res: Response) => {
  try {
    console.log('DEBUG: Starting debug query...');
    
    // Test basic database connection
    const allTemplatesRaw = await db.select().from(templates).limit(3);
    console.log('DEBUG: Raw templates from DB:', allTemplatesRaw);
    
    // Test the actual query used in main route
    const publishedTemplates = await db.select()
      .from(templates)
      .where(and(
        eq(templates.isPublic, true),
        eq(templates.status, 'published')
      ));
    console.log('DEBUG: Published templates:', publishedTemplates);
    
    res.json({ 
      debug: true,
      allTemplatesCount: allTemplatesRaw.length,
      publishedTemplatesCount: publishedTemplates.length,
      rawTemplates: allTemplatesRaw,
      publishedTemplates: publishedTemplates
    });
  } catch (error) {
    console.error('DEBUG: Error in debug route:', error);
    res.status(500).json({ error: error.message });
  }
});

export default templateRouter;