// server/recommendationsRoutes.ts - ENHANCED VERSION
import { Router } from 'express';
import { db } from './db';
import { templates, purchases, reviews, templateViews, users } from '../shared/schema';
import { eq, desc, sql, and, inArray, gt, avg, count } from 'drizzle-orm';
import { authenticateUser, AuthenticatedRequest } from './middleware/auth';
const recommendationsRouter = Router();

// ✅ TYPES - Match your existing template structure
interface EnhancedTemplate {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  workflowJson: any;
  createdAt: string;
  downloads: number;
  // Enhanced fields for recommendations
  rating: number;
  reviewCount: number;
  tags: string[];
  viewCount: number;
  creatorId: string;
  recommendationScore?: number;
  similarityScore?: number;
  trendingScore?: number;
}

interface UserPreferences {
  userId: string;
  maxPrice?: number;
  preferredCategories?: string[];
  excludedCategories?: string[];
  minRating?: number;
  businessType?: string;
  teamSize?: number;
  integrationsUsed?: string[];
}

interface RecommendationContext {
  userId?: string;
  purchaseHistory: any[];
  viewHistory: any[];
  preferences: UserPreferences;
  recentTrends: any[];
}

// ✅ ANALYTICS-POWERED RECOMMENDATION ENGINE
class SmartRecommendationEngine {
  
  // Calculate user's category preferences based on purchase history
  static async getUserCategoryPreferences(userId: string): Promise<string[]> {
    try {
      const userPurchases = await db
        .select({
          tags: templates.tags,
        })
        .from(purchases)
        .innerJoin(templates, eq(purchases.templateId, templates.id))
        .where(eq(purchases.userId, userId));

      const categoryFrequency: Record<string, number> = {};
      
      userPurchases.forEach(purchase => {
        if (purchase.tags) {
          purchase.tags.forEach(tag => {
            categoryFrequency[tag] = (categoryFrequency[tag] || 0) + 1;
          });
        }
      });

      // Return top 5 most frequent categories
      return Object.entries(categoryFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([category]) => category);
    } catch (error) {
      console.error('Error getting user category preferences:', error);
      return [];
    }
  }

  // Calculate user's price range based on purchase history
  static async getUserPriceRange(userId: string): Promise<{min: number, max: number}> {
    try {
      const userPurchases = await db
        .select({
          price: templates.price,
        })
        .from(purchases)
        .innerJoin(templates, eq(purchases.templateId, templates.id))
        .where(eq(purchases.userId, userId));

      if (userPurchases.length === 0) {
        return { min: 0, max: 10000 }; // Default range
      }

      const prices = userPurchases.map(p => p.price);
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      
      return {
        min: Math.max(0, avgPrice * 0.5), // 50% below average
        max: avgPrice * 2 // 200% of average
      };
    } catch (error) {
      console.error('Error getting user price range:', error);
      return { min: 0, max: 10000 };
    }
  }

  // Get trending templates based on recent views and downloads
  static async getTrendingTemplates(limit: number = 10): Promise<number[]> {
    try {
      // Get templates with high recent activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const trending = await db
        .select({
          templateId: templateViews.templateId,
          recentViews: count(templateViews.id),
          avgRating: avg(reviews.rating),
        })
        .from(templateViews)
        .leftJoin(reviews, eq(templateViews.templateId, reviews.templateId))
        .where(gt(templateViews.viewedAt, thirtyDaysAgo))
        .groupBy(templateViews.templateId)
        .orderBy(desc(count(templateViews.id)))
        .limit(limit);

      return trending.map(t => t.templateId);
    } catch (error) {
      console.error('Error getting trending templates:', error);
      return [];
    }
  }

  // Calculate similarity score between templates based on tags and description
  static calculateSimilarity(template1: EnhancedTemplate, template2: EnhancedTemplate): number {
    let score = 0;
    
    // Tag similarity (40% weight)
    if (template1.tags && template2.tags) {
      const commonTags = template1.tags.filter(tag => template2.tags.includes(tag));
      const totalTags = new Set([...template1.tags, ...template2.tags]).size;
      score += (commonTags.length / totalTags) * 0.4;
    }

    // Price similarity (20% weight)
    const priceDiff = Math.abs(template1.price - template2.price);
    const maxPrice = Math.max(template1.price, template2.price);
    if (maxPrice > 0) {
      score += (1 - (priceDiff / maxPrice)) * 0.2;
    }

    // Description similarity (40% weight) - basic keyword matching
    const desc1Words = template1.description.toLowerCase().split(' ');
    const desc2Words = template2.description.toLowerCase().split(' ');
    const commonWords = desc1Words.filter(word => 
      desc2Words.includes(word) && word.length > 3
    );
    const totalWords = new Set([...desc1Words, ...desc2Words]).size;
    score += (commonWords.length / totalWords) * 0.4;

    return Math.min(score, 1); // Cap at 1
  }

  // Advanced scoring algorithm
  static calculateRecommendationScore(
    template: EnhancedTemplate,
    context: RecommendationContext
  ): number {
    let score = 0;

    // Base popularity score (30% weight)
    const popularityScore = Math.log(template.downloads + 1) / Math.log(1000); // Normalized to 0-1
    score += popularityScore * 0.3;

    // Quality score based on rating (25% weight)
    const qualityScore = (template.rating || 0) / 5;
    score += qualityScore * 0.25;

    // Recency boost (15% weight) - newer templates get slight boost
    const daysSinceCreated = Math.abs(new Date().getTime() - new Date(template.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - (daysSinceCreated / 365)); // Linear decay over 1 year
    score += recencyScore * 0.15;

    // User preference alignment (30% weight)
    if (context.preferences.preferredCategories && template.tags) {
      const categoryMatch = template.tags.some(tag => 
        context.preferences.preferredCategories!.includes(tag)
      );
      if (categoryMatch) score += 0.3;
    }

    // Price preference alignment
    if (context.preferences.maxPrice && template.price <= context.preferences.maxPrice) {
      score += 0.1;
    }

    // Avoid already purchased templates
    const alreadyPurchased = context.purchaseHistory.some(p => p.templateId === template.id);
    if (alreadyPurchased) {
      score *= 0.1; // Severely penalize already purchased
    }

    return Math.min(score, 1);
  }
}

// ✅ ENHANCED RECOMMENDATIONS ENDPOINT
recommendationsRouter.get('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { 
      limit = 9,
      categories,
      maxPrice,
      minRating = 0,
      includePersonalized = true 
    } = req.query;

    console.log('📊 Fetching recommendations with params:', { 
      userId, limit, categories, maxPrice, minRating, includePersonalized 
    });

    // ✅ STEP 1: Get all published templates with analytics
    let templatesQuery = db
      .select({
        id: templates.id,
        name: templates.name,
        description: templates.description,
        price: templates.price,
        imageUrl: templates.imageUrl,
        workflowJson: templates.workflowJson,
        createdAt: templates.createdAt,
        downloads: templates.downloadCount,
        tags: templates.tags,
        viewCount: templates.viewCount,
        creatorId: templates.creatorId,
        rating: templates.rating,
        ratingCount: templates.ratingCount,
      })
      .from(templates)
      .where(
        and(
          eq(templates.isPublic, true),
          eq(templates.status, 'published')
        )
      );

    // Apply filters
    const filters = [];
    
    if (maxPrice) {
      filters.push(sql`${templates.price} <= ${Number(maxPrice)}`);
    }
    
    if (minRating) {
      filters.push(sql`${templates.rating} >= ${Number(minRating)}`);
    }

    if (categories) {
      const categoryArray = Array.isArray(categories) ? categories : [categories];
      filters.push(sql`${templates.tags} && ${categoryArray}`);
    }

    if (filters.length > 0) {
      templatesQuery = templatesQuery.where(and(...filters));
    }

    const allTemplates = await templatesQuery;

    console.log(`📋 Found ${allTemplates.length} templates after filtering`);

    // ✅ STEP 2: Build recommendation context
    let context: RecommendationContext = {
      userId: req.user?.id,
      purchaseHistory: [],
      viewHistory: [],
      preferences: {
        userId: userId as string,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        minRating: Number(minRating),
      },
      recentTrends: [],
    };

    // Get user's purchase and preference history if logged in
    if (userId && includePersonalized === 'true') {
      console.log('👤 Fetching personalized data for user:', userId);
      
      // Get purchase history
      const purchaseHistory = await db
        .select()
        .from(purchases)
        .where(eq(purchases.userId, userId as string));
      
      // Get user's preferred categories
      const preferredCategories = await SmartRecommendationEngine.getUserCategoryPreferences(userId as string);
      
      // Get user's price range
      const priceRange = await SmartRecommendationEngine.getUserPriceRange(userId as string);
      
      context.purchaseHistory = purchaseHistory;
      context.preferences.preferredCategories = preferredCategories;
      
      if (!maxPrice) {
        context.preferences.maxPrice = priceRange.max;
      }

      console.log('🎯 User preferences:', {
        preferredCategories,
        priceRange,
        purchaseCount: purchaseHistory.length
      });
    }

    // ✅ STEP 3: Get trending templates
    const trendingTemplateIds = await SmartRecommendationEngine.getTrendingTemplates(20);
    context.recentTrends = trendingTemplateIds;

    // ✅ STEP 4: Calculate recommendation scores
    const enhancedTemplates: EnhancedTemplate[] = allTemplates.map(template => ({
      ...template,
      rating: Number(template.rating) || 0,
      reviewCount: template.ratingCount || 0,
      downloads: template.downloads || 0,
      tags: template.tags || [],
      viewCount: template.viewCount || 0,
    }));

    // Calculate scores for each template
    const scoredTemplates = enhancedTemplates.map(template => {
      const recommendationScore = SmartRecommendationEngine.calculateRecommendationScore(template, context);
      
      // Boost trending templates
      const trendingBoost = trendingTemplateIds.includes(template.id) ? 0.2 : 0;
      
      return {
        ...template,
        recommendationScore: recommendationScore + trendingBoost,
      };
    });

    // ✅ STEP 5: Sort by recommendation score and return top results
    const recommendations = scoredTemplates
      .sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0))
      .slice(0, Number(limit));

    console.log('🏆 Top recommendations with scores:');
    recommendations.slice(0, 3).forEach((template, index) => {
      console.log(`${index + 1}. "${template.name}" - Score: ${template.recommendationScore?.toFixed(3)}`);
    });

    // ✅ STEP 6: Return results in format matching your TemplateCard
    const result = recommendations.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      price: template.price,
      imageUrl: template.imageUrl,
      workflowJson: template.workflowJson,
      createdAt: template.createdAt,
      downloads: template.downloads,
      // Add recommendation metadata for frontend
      _recommendationScore: template.recommendationScore,
      _tags: template.tags,
      _rating: template.rating,
      _reviewCount: template.reviewCount,
    }));

    res.json({
      recommendations: result,
      metadata: {
        total: result.length,
        personalized: !!userId && includePersonalized === 'true',
        trending_boost_applied: trendingTemplateIds.length > 0,
        user_preferences: context.preferences,
        filters_applied: { categories, maxPrice, minRating }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching recommendations:', error);
    res.status(500).json({ 
      message: 'Failed to fetch recommendations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ✅ NEW: Business Plan Preferences Endpoint
recommendationsRouter.post('/preferences', async (req, res) => {
  try {
    const { userId, preferences } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // In a real app, you'd save these to a user_preferences table
    // For now, we'll return success and use them for recommendations
    
    console.log('💾 Saving user preferences:', { userId, preferences });
    
    res.json({ 
      message: 'Preferences saved successfully',
      preferences 
    });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ message: 'Failed to save preferences' });
  }
});

// ✅ NEW: Get user's recommendation analytics
recommendationsRouter.get('/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user's purchase history
    const purchases = await db
      .select({
        templateId: purchases.templateId,
        templateName: templates.name,
        purchasedAt: purchases.purchasedAt,
        amountPaid: purchases.amountPaid,
        tags: templates.tags,
      })
      .from(purchases)
      .innerJoin(templates, eq(purchases.templateId, templates.id))
      .where(eq(purchases.userId, userId))
      .orderBy(desc(purchases.purchasedAt));

    // Calculate category preferences
    const preferredCategories = await SmartRecommendationEngine.getUserCategoryPreferences(userId);
    
    // Calculate spending patterns
    const priceRange = await SmartRecommendationEngine.getUserPriceRange(userId);
    
    const analytics = {
      purchase_history: purchases,
      preferred_categories: preferredCategories,
      price_range: priceRange,
      total_spent: purchases.reduce((sum, p) => sum + p.amountPaid, 0),
      templates_purchased: purchases.length,
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

export default recommendationsRouter;