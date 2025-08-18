// shared/schema.ts
import { 
  pgTable, 
  serial, 
  text, 
  integer, 
  timestamp, 
  jsonb, 
  boolean,
  decimal,
  varchar,
  index,
  uniqueIndex,
  pgEnum
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ✅ SECURE: User role enum for proper RBAC
export const userRoleEnum = pgEnum('user_role', ['user', 'creator', 'admin']);

// ✅ SECURE: Purchase status enum for better tracking
export const purchaseStatusEnum = pgEnum('purchase_status', ['pending', 'completed', 'failed', 'refunded']);

// ✅ SECURE: Template status enum for moderation
export const templateStatusEnum = pgEnum('template_status', ['draft', 'published', 'rejected', 'archived']);

// ✅ SECURE: Enhanced users table with proper constraints and security fields
export const users = pgTable('users', {
  // Primary identification
  id: text('id').primaryKey(), // Keep as text for OAuth compatibility
  email: text('email').notNull().unique(), // Keep as text to avoid data loss
  
  // Profile information
  name: text('name'), // Keep as text to avoid data loss
  avatarUrl: text('avatar_url'),
  
  // Security and role management
  role: userRoleEnum('role').default('user').notNull(),
  isEmailVerified: boolean('is_email_verified').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  
  // Audit fields
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
  
  // Security tracking
  loginAttempts: integer('login_attempts').default(0).notNull(),
  lockedUntil: timestamp('locked_until'),
}, (table) => {
  return {
    // ✅ SECURE: Database indexes for performance and security
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    roleIdx: index('users_role_idx').on(table.role),
    activeIdx: index('users_active_idx').on(table.isActive),
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
  };
});

// ✅ SECURE: Enhanced templates table with validation and security constraints - FIXED TO MATCH DATABASE
export const templates = pgTable('templates', {
  // Primary identification
  id: serial('id').primaryKey(),
  
  // Template metadata with length constraints
  name: text('name').notNull(), // Keep as text to avoid data loss
  description: text('description').notNull(),
  
  // Pricing and financial data
  price: integer('price').notNull(), // Price in cents
  currency: varchar('currency', { length: 3 }).default('USD').notNull(), // ISO currency codes
  
  // Template content and assets
  workflowJson: jsonb('workflow_json').notNull(),
  imageUrl: text('image_url'),
  tags: text('tags').array(), // Array of tags for categorization
  
  // Status and moderation
  status: templateStatusEnum('status').default('draft').notNull(),
  isPublic: boolean('is_public').default(false).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  
  // Performance and analytics - FIXED FIELD NAMES
  downloadCount: integer('download_count').default(0).notNull(),
  viewCount: integer('view_count').default(0).notNull(),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('0.00'), // Average rating 0.00-5.00
  ratingCount: integer('rating_count').default(0).notNull(),
  
  // External service integration - FIXED FIELD NAME
  stripePriceId: text('stripe_price_id'), // Stripe Price ID
  stripeProductId: text('stripe_product_id'), // Stripe Product ID for management
  
  // Relationships with proper cascading - FIXED FIELD NAME
  creatorId: text('creator_id').references(() => users.id, { 
    onDelete: 'cascade', // Delete templates when user is deleted
    onUpdate: 'cascade' 
  }).notNull(),
  
  // Audit and timestamp fields - FIXED FIELD NAME
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  publishedAt: timestamp('published_at'), // When template was made public
  
  // SEO and discoverability
  slug: varchar('slug', { length: 250 }), // URL-friendly identifier
  metaDescription: varchar('meta_description', { length: 160 }), // SEO description
  category: text('category'), // ✅ ADDED: Missing category field to match database
}, (table) => {
  return {
    // ✅ SECURE: Performance and security indexes
    creatorIdx: index('templates_creator_idx').on(table.creatorId),
    statusIdx: index('templates_status_idx').on(table.status),
    publicIdx: index('templates_public_idx').on(table.isPublic),
    featuredIdx: index('templates_featured_idx').on(table.isFeatured),
    priceIdx: index('templates_price_idx').on(table.price),
    createdAtIdx: index('templates_created_at_idx').on(table.createdAt),
    slugIdx: uniqueIndex('templates_slug_idx').on(table.slug), // Unique slugs
    ratingIdx: index('templates_rating_idx').on(table.rating),
    downloadCountIdx: index('templates_download_count_idx').on(table.downloadCount),
  };
});

// ✅ SECURE: Enhanced purchases table with comprehensive tracking
export const purchases = pgTable('purchases', {
  // Primary identification
  id: serial('id').primaryKey(),
  
  // Core purchase relationship
  userId: text('user_id').references(() => users.id, { 
    onDelete: 'cascade', // Remove purchases when user deleted
    onUpdate: 'cascade' 
  }).notNull(),
  templateId: integer('template_id').references(() => templates.id, { 
    onDelete: 'cascade', // Remove purchases when template deleted
    onUpdate: 'cascade' 
  }).notNull(),
  
  // Financial tracking
  amountPaid: integer('amount_paid').notNull(), // Amount in cents
  currency: varchar('currency', { length: 3 }).default('USD').notNull(),
  
  // Purchase status and processing
  status: purchaseStatusEnum('status').default('pending').notNull(),
  
  // External payment processing
  stripeSessionId: text('stripe_session_id'), // Stripe Checkout Session ID
  stripePaymentIntentId: text('stripe_payment_intent_id'), // Stripe Payment Intent ID
  stripeCustomerId: text('stripe_customer_id'), // Stripe Customer ID
  
  // Audit and tracking
  purchasedAt: timestamp('purchased_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'), // When payment was confirmed
  refundedAt: timestamp('refunded_at'), // If purchase was refunded
  
  // Security and fraud prevention
  ipAddress: varchar('ip_address', { length: 45 }), // IPv4/IPv6 support
  userAgent: text('user_agent'), // Browser/device info
  
  // Download tracking for license compliance
  downloadCount: integer('download_count').default(0).notNull(),
  lastDownloadAt: timestamp('last_download_at'),
}, (table) => {
  return {
    // ✅ SECURE: Comprehensive indexing for performance and security
    userIdx: index('purchases_user_idx').on(table.userId),
    templateIdx: index('purchases_template_idx').on(table.templateId),
    statusIdx: index('purchases_status_idx').on(table.status),
    purchasedAtIdx: index('purchases_purchased_at_idx').on(table.purchasedAt),
    stripeSessionIdx: index('purchases_stripe_session_idx').on(table.stripeSessionId),
    
    // ✅ SECURE: Prevent duplicate purchases (one purchase per user per template)
    userTemplateIdx: uniqueIndex('purchases_user_template_unique').on(table.userId, table.templateId),
  };
});

// ✅ SECURE: Download tracking table for audit and compliance
export const downloads = pgTable('downloads', {
  id: serial('id').primaryKey(),
  
  // Relationship tracking
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  templateId: integer('template_id').references(() => templates.id, { onDelete: 'cascade' }).notNull(),
  purchaseId: integer('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
  
  // Download metadata
  downloadedAt: timestamp('downloaded_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  fileSize: integer('file_size'), // Size in bytes
  
  // Security tracking
  isValid: boolean('is_valid').default(true).notNull(), // Mark invalid downloads
}, (table) => {
  return {
    userIdx: index('downloads_user_idx').on(table.userId),
    templateIdx: index('downloads_template_idx').on(table.templateId),
    purchaseIdx: index('downloads_purchase_idx').on(table.purchaseId),
    downloadedAtIdx: index('downloads_downloaded_at_idx').on(table.downloadedAt),
  };
});

// ✅ SECURE: Template reviews/ratings table
export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  
  // Relationships
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  templateId: integer('template_id').references(() => templates.id, { onDelete: 'cascade' }).notNull(),
  purchaseId: integer('purchase_id').references(() => purchases.id, { onDelete: 'cascade' }),
  
  // Review content
  rating: integer('rating').notNull(), // 1-5 rating
  review: text('review'), // Optional text review
  
  // Moderation
  isApproved: boolean('is_approved').default(false).notNull(),
  isHelpful: integer('helpful_count').default(0).notNull(),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    userTemplateIdx: uniqueIndex('reviews_user_template_unique').on(table.userId, table.templateId),
    templateIdx: index('reviews_template_idx').on(table.templateId),
    ratingIdx: index('reviews_rating_idx').on(table.rating),
    approvedIdx: index('reviews_approved_idx').on(table.isApproved),
  };
});

// ✅ SECURE: Session management for enhanced security
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // Session token
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Session metadata
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  
  // Security tracking
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  isActive: boolean('is_active').default(true).notNull(),
}, (table) => {
  return {
    userIdx: index('sessions_user_idx').on(table.userId),
    expiresIdx: index('sessions_expires_idx').on(table.expiresAt),
    activeIdx: index('sessions_active_idx').on(table.isActive),
  };
});

// ✅ SECURE: AI requests table for audit and compliance
export const aiRequests = pgTable('ai_requests', {
  id: serial('id').primaryKey(),
  
  // User context for RLS
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Request data
  prompt: text('prompt').notNull(),
  response: text('response'),
  fileId: text('file_id'), // Reference to uploaded JSON files
  
  // Audit fields
  createdAt: timestamp('created_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
}, (table) => {
  return {
    userIdx: index('ai_requests_user_idx').on(table.userId),
    createdAtIdx: index('ai_requests_created_at_idx').on(table.createdAt),
    fileIdx: index('ai_requests_file_idx').on(table.fileId),
  };
});

// ✅ SECURE: User files table for AI feature
export const userFiles = pgTable('user_files', {
  id: text('id').primaryKey(),
  
  // User context for RLS
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // File metadata
  filename: varchar('filename', { length: 255 }).notNull(),
  content: jsonb('content').notNull(),
  fileSize: integer('file_size'), // Size in bytes
  mimeType: varchar('mime_type', { length: 100 }),
  
  // Audit fields
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastAccessedAt: timestamp('last_accessed_at'),
}, (table) => {
  return {
    userIdx: index('user_files_user_idx').on(table.userId),
    createdAtIdx: index('user_files_created_at_idx').on(table.createdAt),
    filenameIdx: index('user_files_filename_idx').on(table.filename),
  };
});

// ✅ ANALYTICS: Search analytics table
export const searchAnalytics = pgTable('search_analytics', {
  id: serial('id').primaryKey(),
  searchTerm: text('search_term').notNull(),
  userId: text('user_id'), // Optional - for logged in users
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent')
}, (table) => {
  return {
    timestampIdx: index('search_analytics_timestamp_idx').on(table.timestamp),
    searchTermIdx: index('search_analytics_search_term_idx').on(table.searchTerm),
    userIdx: index('search_analytics_user_idx').on(table.userId),
  };
});

// ✅ ANALYTICS: Template views tracking
export const templateViews = pgTable('template_views', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').references(() => templates.id).notNull(),
  userId: text('user_id'), // Optional - for logged in users
  viewedAt: timestamp('viewed_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent')
}, (table) => {
  return {
    templateIdx: index('template_views_template_idx').on(table.templateId),
    viewedAtIdx: index('template_views_viewed_at_idx').on(table.viewedAt),
    userIdx: index('template_views_user_idx').on(table.userId),
  };
});

// ✅ SECURE: Define proper relations for type safety
export const usersRelations = relations(users, ({ many }) => ({
  templates: many(templates),
  purchases: many(purchases),
  downloads: many(downloads),
  reviews: many(reviews),
  sessions: many(sessions),
  aiRequests: many(aiRequests),
  userFiles: many(userFiles),
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  creator: one(users, {
    fields: [templates.creatorId],
    references: [users.id],
  }),
  purchases: many(purchases),
  downloads: many(downloads),
  reviews: many(reviews),
  templateViews: many(templateViews),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  user: one(users, {
    fields: [purchases.userId],
    references: [users.id],
  }),
  template: one(templates, {
    fields: [purchases.templateId],
    references: [templates.id],
  }),
  downloads: many(downloads),
}));

export const downloadsRelations = relations(downloads, ({ one }) => ({
  user: one(users, {
    fields: [downloads.userId],
    references: [users.id],
  }),
  template: one(templates, {
    fields: [downloads.templateId],
    references: [templates.id],
  }),
  purchase: one(purchases, {
    fields: [downloads.purchaseId],
    references: [purchases.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  template: one(templates, {
    fields: [reviews.templateId],
    references: [templates.id],
  }),
  purchase: one(purchases, {
    fields: [reviews.purchaseId],
    references: [purchases.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const aiRequestsRelations = relations(aiRequests, ({ one }) => ({
  user: one(users, {
    fields: [aiRequests.userId],
    references: [users.id],
  }),
  file: one(userFiles, {
    fields: [aiRequests.fileId],
    references: [userFiles.id],
  }),
}));

export const userFilesRelations = relations(userFiles, ({ one, many }) => ({
  user: one(users, {
    fields: [userFiles.userId],
    references: [users.id],
  }),
  aiRequests: many(aiRequests),
}));

export const searchAnalyticsRelations = relations(searchAnalytics, ({ one }) => ({
  user: one(users, {
    fields: [searchAnalytics.userId],
    references: [users.id],
  }),
}));

export const templateViewsRelations = relations(templateViews, ({ one }) => ({
  template: one(templates, {
    fields: [templateViews.templateId],
    references: [templates.id],
  }),
  user: one(users, {
    fields: [templateViews.userId],
    references: [users.id],
  }),
}));

// ✅ SECURE: Export types for type safety
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type AiRequest = typeof aiRequests.$inferSelect;
export type NewAiRequest = typeof aiRequests.$inferInsert;
export type UserFile = typeof userFiles.$inferSelect;
export type NewUserFile = typeof userFiles.$inferInsert;
export type SearchAnalytic = typeof searchAnalytics.$inferSelect;
export type NewSearchAnalytic = typeof searchAnalytics.$inferInsert;
export type TemplateView = typeof templateViews.$inferSelect;
export type NewTemplateView = typeof templateViews.$inferInsert;

// ✅ RLS SECURITY POLICIES - PostgreSQL functions and policies
// These should be applied as a migration after your schema is created

export const rlsPolicies = `
-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Run these after your schema migrations
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_views ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPER FUNCTIONS FOR RLS
-- =====================================================

-- Function to get current user ID (with validation)
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS TEXT AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '');
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has specific role
CREATE OR REPLACE FUNCTION has_role(role_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_setting('app.current_user_roles', true) LIKE '%' || role_name || '%';
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- USERS TABLE POLICIES
-- =====================================================

-- Users can only see and modify their own profile
CREATE POLICY "users_own_profile" ON users
  FOR ALL 
  TO authenticated
  USING (id = get_current_user_id());

-- Admins can see all users (for user management)
CREATE POLICY "users_admin_access" ON users
  FOR ALL
  TO authenticated
  USING (has_role('admin'));

-- Public profile data for creators when viewing templates
CREATE POLICY "users_public_creator_info" ON users
  FOR SELECT
  TO authenticated
  USING (
    role = 'creator' AND 
    is_active = true AND
    id IN (
      SELECT creator_id FROM templates WHERE is_public = true
    )
  );

-- =====================================================
-- TEMPLATES TABLE POLICIES
-- =====================================================

-- Everyone can view published public templates
CREATE POLICY "templates_public_view" ON templates
  FOR SELECT
  TO authenticated
  USING (
    is_public = true AND 
    status = 'published'
  );

-- Creators can manage their own templates
CREATE POLICY "templates_creator_manage" ON templates
  FOR ALL
  TO authenticated
  USING (creator_id = get_current_user_id());

-- Admins can manage all templates (moderation)
CREATE POLICY "templates_admin_manage" ON templates
  FOR ALL
  TO authenticated
  USING (has_role('admin'));

-- =====================================================
-- PURCHASES TABLE POLICIES
-- =====================================================

-- Users can only see their own purchases
CREATE POLICY "purchases_own_only" ON purchases
  FOR ALL
  TO authenticated
  USING (user_id = get_current_user_id());

-- Template creators can see purchases of their templates
CREATE POLICY "purchases_creator_analytics" ON purchases
  FOR SELECT
  TO authenticated
  USING (
    template_id IN (
      SELECT id FROM templates 
      WHERE creator_id = get_current_user_id()
    )
  );

-- Admins can see all purchases
CREATE POLICY "purchases_admin_access" ON purchases
  FOR ALL
  TO authenticated
  USING (has_role('admin'));

-- =====================================================
-- DOWNLOADS TABLE POLICIES
-- =====================================================

-- Users can only see their own downloads
CREATE POLICY "downloads_own_only" ON downloads
  FOR ALL
  TO authenticated
  USING (user_id = get_current_user_id());

-- Template creators can see downloads of their templates
CREATE POLICY "downloads_creator_analytics" ON downloads
  FOR SELECT
  TO authenticated
  USING (
    template_id IN (
      SELECT id FROM templates 
      WHERE creator_id = get_current_user_id()
    )
  );

-- Admins can see all downloads
CREATE POLICY "downloads_admin_access" ON downloads
  FOR ALL
  TO authenticated
  USING (has_role('admin'));

-- =====================================================
-- REVIEWS TABLE POLICIES
-- =====================================================

-- Users can manage their own reviews
CREATE POLICY "reviews_own_manage" ON reviews
  FOR ALL
  TO authenticated
  USING (user_id = get_current_user_id());

-- Everyone can view approved reviews for public templates
CREATE POLICY "reviews_public_view" ON reviews
  FOR SELECT
  TO authenticated
  USING (
    is_approved = true AND
    template_id IN (
      SELECT id FROM templates WHERE is_public = true AND status = 'published'
    )
  );

-- Template creators can see all reviews for their templates
CREATE POLICY "reviews_creator_view" ON reviews
  FOR SELECT
  TO authenticated
  USING (
    template_id IN (
      SELECT id FROM templates 
      WHERE creator_id = get_current_user_id()
    )
  );

-- Admins can manage all reviews
CREATE POLICY "reviews_admin_manage" ON reviews
  FOR ALL
  TO authenticated
  USING (has_role('admin'));

-- =====================================================
-- SESSIONS TABLE POLICIES
-- =====================================================

-- Users can only see and manage their own sessions
CREATE POLICY "sessions_own_only" ON sessions
  FOR ALL
  TO authenticated
  USING (user_id = get_current_user_id());

-- Admins can see all sessions
CREATE POLICY "sessions_admin_access" ON sessions
  FOR SELECT
  TO authenticated
  USING (has_role('admin'));

-- =====================================================
-- AI_REQUESTS TABLE POLICIES
-- =====================================================

-- Users can only see their own AI requests
CREATE POLICY "ai_requests_own_only" ON ai_requests
  FOR ALL
  TO authenticated
  USING (user_id = get_current_user_id());

-- Admins can see all AI requests
CREATE POLICY "ai_requests_admin_access" ON ai_requests
  FOR ALL
  TO authenticated
  USING (has_role('admin'));

-- =====================================================
-- USER_FILES TABLE POLICIES
-- =====================================================

-- Users can only see and manage their own files
CREATE POLICY "user_files_own_only" ON user_files
  FOR ALL
  TO authenticated
  USING (user_id = get_current_user_id());

-- Admins can see all user files
CREATE POLICY "user_files_admin_access" ON user_files
  FOR SELECT
  TO authenticated
  USING (has_role('admin'));

-- =====================================================
-- ANALYTICS TABLE POLICIES - ADMIN ONLY ACCESS
-- =====================================================

-- Allow public insert for search analytics (anonymous tracking only)
CREATE POLICY "search_analytics_public_insert" ON search_analytics
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ONLY admins can view search analytics data
CREATE POLICY "search_analytics_admin_only" ON search_analytics
  FOR SELECT
  TO authenticated
  USING (has_role('admin'));

-- ONLY admins can manage search analytics
CREATE POLICY "search_analytics_admin_manage" ON search_analytics
  FOR ALL
  TO authenticated
  USING (has_role('admin'));

-- Allow public insert for template views (anonymous tracking only)
CREATE POLICY "template_views_public_insert" ON template_views
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ONLY admins can view template views data
CREATE POLICY "template_views_admin_only" ON template_views
  FOR SELECT
  TO authenticated
  USING (has_role('admin'));

-- ONLY admins can manage template views
CREATE POLICY "template_views_admin_manage" ON template_views
  FOR ALL
  TO authenticated
  USING (has_role('admin'));

-- =====================================================
-- INTEGRITY POLICIES
-- =====================================================

-- Prevent users from creating content for other users
CREATE POLICY "templates_creator_integrity" ON templates
  FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = get_current_user_id());

CREATE POLICY "purchases_user_integrity" ON purchases
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "downloads_user_integrity" ON downloads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "reviews_user_integrity" ON reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "ai_requests_user_integrity" ON ai_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "user_files_user_integrity" ON user_files
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_current_user_id());

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant usage on sequences to authenticated users
GRANT USAGE ON SEQUENCE templates_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE purchases_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE downloads_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE reviews_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE ai_requests_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE search_analytics_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE template_views_id_seq TO authenticated;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION get_current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION has_role(TEXT) TO authenticated;
`;