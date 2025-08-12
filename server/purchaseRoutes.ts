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

    const userPurchases = await db.select({
      id: purchases.id,
      templateId: purchases.templateId,
      amountPaid: purchases.amountPaid,
      currency: purchases.currency,
      status: purchases.status,
      purchasedAt: purchases.purchasedAt,
      templateName: templates.name,
      templateDescription: templates.description
    })
    .from(purchases)
    .leftJoin(templates, eq(purchases.templateId, templates.id))
    .where(eq(purchases.userId, session.userId));

    res.json({
      success: true,
      purchases: userPurchases
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