import { Navbar } from '../components/Navbar';

export const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
          <div className="prose max-w-none">
            <p className="text-gray-600 mb-4">Last updated: {new Date().toLocaleDateString()}</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">1. Information We Collect</h2>
            <p>We collect information you provide directly to us, such as when you create an account, make a purchase, or contact us for support.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">2. Information Collected Automatically</h2>
            <p>We automatically collect certain information about your device and usage patterns, including:</p>
            <ul className="list-disc ml-6 mb-4">
              <li>IP address and browser information</li>
              <li>Pages visited and time spent on the site</li>
              <li>Search queries and template interactions</li>
            </ul>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc ml-6 mb-4">
              <li>Process transactions and deliver purchased content</li>
              <li>Improve our services and user experience</li>
              <li>Send important updates about your account</li>
              <li>Analyze usage patterns and marketplace trends</li>
            </ul>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">4. Information Sharing</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. We may share information with:</p>
            <ul className="list-disc ml-6 mb-4">
              <li>Payment processors (Stripe) to process transactions</li>
              <li>Service providers who assist in operating our platform</li>
              <li>Law enforcement when required by law</li>
            </ul>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">5. Data Security</h2>
            <p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">6. Cookies</h2>
            <p>We use cookies to enhance your experience, analyze site usage, and assist in our marketing efforts. You can control cookie settings through your browser.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">7. Your Rights</h2>
            <p>You have the right to access, update, or delete your personal information. Contact us to exercise these rights.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">8. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, contact us at: devhub.partners@gmail.com</p>
          </div>
        </div>
      </main>
    </div>
  );
};