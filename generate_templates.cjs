const fs = require('fs');

// Your existing Stripe Price IDs
const priceMapping = {
  349: "price_1Rue1OBS72lorg0VDeDNJ5E7",  // $3.49
  549: "price_1Rue2BBS72lorg0VyoSJ4Gz",  // $5.49
  699: "price_1Rue2QBS72lorg0VaabYaaU"   // $6.99
};

const categories = [
  'automation', 'ai', 'productivity', 'marketing', 'sales', 'development',
  'analytics', 'integration', 'webhook', 'email', 'social-media', 'crm'
];

const templateNames = [
  "Advanced Email Marketing Automation",
  "AI-Powered Content Generation System", 
  "Customer Support Ticket Management",
  "Sales Pipeline Automation Workflow",
  "Social Media Publishing Scheduler",
  "Inventory Management & Alerts",
  "Lead Generation & Qualification",
  "Document Processing Automation",
  "Payment Processing Integration",
  "Project Management Sync Tool",
  "Data Analytics Dashboard Builder",
  "Multi-Platform Notification System",
  "E-commerce Order Processing",
  "Customer Onboarding Workflow",
  "Marketing Campaign Automation",
  "Performance Monitoring System",
  "File Backup & Synchronization",
  "Team Collaboration Tools",
  "Invoice Generation & Tracking",
  "Quality Assurance Testing Bot",
  "Security Monitoring Alerts",
  "Content Moderation System",
  "Subscription Management Tool",
  "Event Planning Automation",
  "Survey Collection & Analysis"
];

const descriptions = [
  "Streamline your workflow with intelligent automation and real-time processing capabilities.",
  "Advanced integration system with comprehensive analytics and monitoring features.",
  "Powerful automation tool designed for efficiency and scalability in modern workflows.",
  "Professional-grade solution with enterprise features and seamless integration options.",
  "Cutting-edge automation platform with AI-driven insights and optimization tools."
];

function generateTemplates(count = 50) {
  const templates = [];
  const prices = [349, 549, 699];
  
  for (let i = 1; i <= count; i++) {
    const price = prices[Math.floor(Math.random() * prices.length)];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const baseName = templateNames[Math.floor(Math.random() * templateNames.length)];
    const description = descriptions[Math.floor(Math.random() * descriptions.length)];
    
    const template = {
      id: i,
      name: `${baseName} ${i}`,
      description: description,
      category: category,
      tags: [category, "automation", "workflow"],
      price: price,
      stripePriceId: priceMapping[price],
      createdAt: `2024-0${Math.floor(Math.random() * 9) + 1}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
      rating: +(Math.random() * 2 + 3).toFixed(1),
      downloads: Math.floor(Math.random() * 1000) + 50,
      workflow: {
        nodes: [],
        connections: {},
        version: "1.0"
      }
    };
    
    templates.push(template);
  }
  
  return templates;
}

// Generate templates
const allTemplates = generateTemplates(100);

// Create TypeScript content
const content = `// Auto-generated mock templates for DevHubConnect
// Generated: ${new Date().toISOString()}

export interface Template {
  id: number;
  name: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  stripePriceId: string;
  createdAt: string;
  rating: number;
  downloads: number;
  workflow: any;
}

export const mockTemplates: Template[] = ${JSON.stringify(allTemplates, null, 2)};

export default mockTemplates;
`;

// Write to file
fs.writeFileSync('mockTemplates.ts', content);
console.log(`✅ Generated ${allTemplates.length} templates with real Stripe Price IDs!`);
console.log('📁 File created: mockTemplates.ts');
console.log('💰 Price distribution:');

const priceCount = allTemplates.reduce((acc, t) => {
  acc[t.price] = (acc[t.price] || 0) + 1;
  return acc;
}, {});

Object.entries(priceCount).forEach(([price, count]) => {
  console.log(`   $${(price/100).toFixed(2)}: ${count} templates`);
});
