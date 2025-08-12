import { Navbar } from '../components/Navbar';

export const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
          <div className="prose max-w-none">
            <p className="text-gray-600 mb-4">Last updated: {new Date().toLocaleDateString()}</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">1. Acceptance of Terms</h2>
            <p>By accessing and using DevHubConnect ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">2. Description of Service</h2>
            <p>DevHubConnect is a marketplace for n8n automation workflow templates. Users can purchase and download JSON workflow files for use in their n8n instances.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">3. User Accounts</h2>
            <p>To use certain features of the Service, you must register for an account. You are responsible for maintaining the confidentiality of your account credentials.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">4. Purchases and Payments</h2>
            <p>All purchases are processed through Stripe. Payments are final and non-refundable except as required by law. Digital products are delivered immediately upon successful payment.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">5. Intellectual Property</h2>
            <p>Workflow templates remain the intellectual property of their creators. Purchase grants you a non-exclusive license to use the workflows for your personal or commercial projects.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">6. Prohibited Uses</h2>
            <p>You may not:</p>
            <ul className="list-disc ml-6 mb-4">
              <li>Resell or redistribute purchased workflows</li>
              <li>Use the service for illegal purposes</li>
              <li>Attempt to reverse engineer or hack the platform</li>
            </ul>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">7. Disclaimers</h2>
            <p>Workflows are provided "as is" without warranty. DevHubConnect is not liable for any damages resulting from the use of purchased workflows.</p>
            
            <h2 className="text-xl font-semibold mt-6 mb-3">8. Contact Information</h2>
            <p>For questions about these Terms, contact us at: devhub.partners@gmail.com</p>
          </div>
        </div>
      </main>
    </div>
  );
};