// server/recommendationsRoutes.js - FIXED VERSION
import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import jwt from 'jsonwebtoken';
import pg from 'pg';
const { Pool } = pg;

// Use the same database connection from your main server
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const router = express.Router();

// ANALYTICS-POWERED RECOMMENDATION ENGINE (Converted to JavaScript)
class SmartRecommendationEngine {
  
  // Calculate user's category preferences based on purchase history
  static async getUserCategoryPreferences(userId) {
    try {
      const userPurchases = await pool.query(`
        SELECT t.tags 
        FROM purchases p
        INNER JOIN templates t ON p.template_id = t.id
        WHERE p.user_id = $1 AND p.status = 'completed'
      `, [userId]);

      const categoryFrequency = {};
      
      userPurchases.rows.forEach(purchase => {
        if (purchase.tags && Array.isArray(purchase.tags)) {
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
  static async getUserPriceRange(userId) {
    try {
      const userPurchases = await pool.query(`
        SELECT t.price 
        FROM purchases p
        INNER JOIN templates t ON p.template_id = t.id
        WHERE p.user_id = $1 AND p.status = 'completed'
      `, [userId]);

      if (userPurchases.rows.length === 0) {
        return { min: 0, max: 10000 }; // Default range
      }

      const prices = userPurchases.rows.map(p => p.price);
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
  static async getTrendingTemplates(limit = 10) {
    try {
      // Get templates with high recent activity (last 30 days)
      const trending = await pool.query(`
        SELECT 
          tv.template_id,
          COUNT(tv.id) as recent_views,
          AVG(r.rating) as avg_rating
        FROM template_views tv
        LEFT JOIN reviews r ON tv.template_id = r.template_id
        WHERE tv.viewed_at >= NOW() - INTERVAL '30 days'
        GROUP BY tv.template_id
        ORDER BY COUNT(tv.id) DESC
        LIMIT $1
      `, [limit]);

      return trending.rows.map(t => t.template_id);
    } catch (error) {
      console.error('Error getting trending templates:', error);
      return [];
    }
  }

  // Calculate similarity score between templates based on tags and description
  static calculateSimilarity(template1, template2) {
    let score = 0;
    
    // Tag similarity (40% weight)
    if (template1.tags && template2.tags) {
      const commonTags = template1.tags.filter(tag => template2.tags.includes(tag));
      const totalTags = new Set([...template1.tags, ...template2.tags]).size;
      if (totalTags > 0) {
        score += (commonTags.length / totalTags) * 0.4;
      }
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
    if (totalWords > 0) {
      score += (commonWords.length / totalWords) * 0.4;
    }

    return Math.min(score, 1); // Cap at 1
  }

  // Advanced scoring algorithm
  static calculateRecommendationScore(template, context) {
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
        context.preferences.preferredCategories.includes(tag)
      );
      if (categoryMatch) score += 0.3;
    }

    // Price preference alignment
    if (context.preferences.maxPrice && template.price <= context.preferences.maxPrice) {
      score += 0.1;
    }

    // Avoid already purchased templates
    const alreadyPurchased = context.purchaseHistory.some(p => p.template_id === template.id);
    if (alreadyPurchased) {
      score *= 0.1; // Severely penalize already purchased
    }

    return Math.min(score, 1);
  }
}

// FIXED: Simplified authenticateJWT middleware using imported jwt
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

      // Security: Validate session with proper checks
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

    // FIXED: Use the imported jwt directly instead of require()
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

// ENHANCED RECOMMENDATIONS ENDPOINT
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const { 
      limit = 9,
      categories,
      maxPrice,
      minRating = 0,
      includePersonalized = 'true' 
    } = req.query;

    // Get userId from authenticated user
    const userId = req.user?.id;

    console.log('Fetching recommendations with params:', { 
      userId, limit, categories, maxPrice, minRating, includePersonalized 
    });

    // STEP 1: Get all published templates with analytics
    let baseQuery = `
      SELECT 
        id, name, description, price, image_url as "imageUrl", 
        workflow_json as "workflowJson", created_at as "createdAt",
        download_count as downloads, tags, view_count as "viewCount",
        creator_id as "creatorId", rating, rating_count as "ratingCount"
      FROM templates 
      WHERE is_public = true AND status = 'published'
    `;
    
    const queryParams = [];
    const conditions = [];
    
    // Apply filters
    if (maxPrice) {
      conditions.push(`price <= $${queryParams.length + 1}`);
      queryParams.push(Number(maxPrice));
    }
    
    if (minRating) {
      conditions.push(`rating >= $${queryParams.length + 1}`);
      queryParams.push(Number(minRating));
    }

    if (categories) {
      const categoryArray = Array.isArray(categories) ? categories : [categories];
      conditions.push(`tags && $${queryParams.length + 1}`);
      queryParams.push(categoryArray);
    }

    if (conditions.length > 0) {
      baseQuery += ' AND ' + conditions.join(' AND ');
    }

    baseQuery += ' ORDER BY rating DESC NULLS LAST, download_count DESC NULLS LAST';

    const allTemplates = await pool.query(baseQuery, queryParams);

    console.log(`Found ${allTemplates.rows.length} templates after filtering`);

    // STEP 2: Build recommendation context
    let context = {
      userId: userId,
      purchaseHistory: [],
      viewHistory: [],
      preferences: {
        userId: userId || '',
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        minRating: Number(minRating),
      },
      recentTrends: [],
    };

    // Get user's purchase and preference history if logged in
    if (userId && includePersonalized === 'true') {
      console.log('Fetching personalized data for user:', userId);
      
      // Get purchase history
      const purchaseHistory = await pool.query(
        'SELECT * FROM purchases WHERE user_id = $1',
        [userId]
      );
      
      // Get user's preferred categories
      const preferredCategories = await SmartRecommendationEngine.getUserCategoryPreferences(userId);
      
      // Get user's price range
      const priceRange = await SmartRecommendationEngine.getUserPriceRange(userId);
      
      context.purchaseHistory = purchaseHistory.rows;
      context.preferences.preferredCategories = preferredCategories;
      
      if (!maxPrice) {
        context.preferences.maxPrice = priceRange.max;
      }

      console.log('User preferences:', {
        preferredCategories,
        priceRange,
        purchaseCount: purchaseHistory.rows.length
      });
    }

    // STEP 3: Get trending templates
    const trendingTemplateIds = await SmartRecommendationEngine.getTrendingTemplates(20);
    context.recentTrends = trendingTemplateIds;

    // STEP 4: Calculate recommendation scores
    const enhancedTemplates = allTemplates.rows.map(template => ({
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

    // STEP 5: Sort by recommendation score and return top results
    const recommendations = scoredTemplates
      .sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0))
      .slice(0, Number(limit));

    console.log('Top recommendations with scores:');
    recommendations.slice(0, 3).forEach((template, index) => {
      console.log(`${index + 1}. "${template.name}" - Score: ${template.recommendationScore?.toFixed(3)}`);
    });

    // STEP 6: Return results in format matching your TemplateCard
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
      success: true,
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
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch recommendations',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Business Plan Preferences Endpoint
router.post('/preferences', async (req, res) => {
  try {
    const { userId, preferences } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // In a real app, you'd save these to a user_preferences table
    // For now, we'll return success and use them for recommendations
    
    console.log('Saving user preferences:', { userId, preferences });
    
    res.json({ 
      message: 'Preferences saved successfully',
      preferences 
    });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ message: 'Failed to save preferences' });
  }
});

// Get user's recommendation analytics
router.get('/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user's purchase history
    const purchases = await pool.query(`
      SELECT 
        p.template_id as "templateId",
        t.name as "templateName",
        p.purchased_at as "purchasedAt",
        p.amount_paid as "amountPaid",
        t.tags
      FROM purchases p
      INNER JOIN templates t ON p.template_id = t.id
      WHERE p.user_id = $1
      ORDER BY p.purchased_at DESC
    `, [userId]);

    // Calculate category preferences
    const preferredCategories = await SmartRecommendationEngine.getUserCategoryPreferences(userId);
    
    // Calculate spending patterns
    const priceRange = await SmartRecommendationEngine.getUserPriceRange(userId);
    
    const analytics = {
      purchase_history: purchases.rows,
      preferred_categories: preferredCategories,
      price_range: priceRange,
      total_spent: purchases.rows.reduce((sum, p) => sum + p.amountPaid, 0),
      templates_purchased: purchases.rows.length,
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

export default router;