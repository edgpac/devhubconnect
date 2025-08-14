import { Router, Request, Response } from "express";
import { db } from "./db";
import { purchases, templates, sessions } from "../shared/schema";
import { eq } from "drizzle-orm";

export const purchaseRouter = Router();

purchaseRouter.get("/", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.devhub_session;
    
    if (!sessionId) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }

    const [session] = await db.select()
      .from(sessions)
      .where(eq(sessions.id, sessionId));

    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid session" 
      });
    }

    // ✅ FIXED: Get all required template fields
    const userPurchases = await db.select({
      // Purchase info
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      currency: purchases.currency,
      status: purchases.status,
      purchasedAt: purchases.purchasedAt,
      
      // Template info (with correct field names for TemplateCard)
      id: templates.id,                    // ✅ Template ID as 'id'
      name: templates.name,                // ✅ Template name as 'name'
      description: templates.description,  // ✅ Template description as 'description'
      price: templates.price,
      imageUrl: templates.imageUrl,
      workflowJson: templates.workflowJson,
      createdAt: templates.createdAt,
      downloadCount: templates.downloadCount,
      viewCount: templates.viewCount,
      rating: templates.rating
    })
    .from(purchases)
    .leftJoin(templates, eq(purchases.templateId, templates.id))
    .where(eq(purchases.userId, session.userId));

    // ✅ FIXED: Transform to proper structure for TemplateCard
    const formattedPurchases = userPurchases.map(row => ({
      // Purchase metadata
      purchaseInfo: {
        purchaseId: row.purchaseId,
        amountPaid: row.amountPaid,
        currency: row.currency,
        status: row.status,
        purchasedAt: row.purchasedAt
      },
      // Template object (correctly structured for TemplateCard)
      template: {
        id: row.id,                    // ✅ Template ID
        name: row.name,                // ✅ Template name
        description: row.description,  // ✅ Template description
        price: row.price,
        imageUrl: row.imageUrl,
        workflowJson: row.workflowJson,
        createdAt: row.createdAt,
        downloadCount: row.downloadCount,
        viewCount: row.viewCount,
        rating: row.rating,
        purchased: true               // ✅ Mark as purchased
      }
    }));

    res.json({
      success: true,
      purchases: formattedPurchases
    });

  } catch (error) {
    console.error("Error fetching purchases:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching purchases"
    });
  }
});

export default purchaseRouter;