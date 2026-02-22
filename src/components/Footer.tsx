import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="w-full text-sm text-white py-6 px-4 mt-10 bg-gradient-to-br from-gray-950 via-teal-950 to-gray-900 border-none">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-4">
        <div>
          <p>&copy; {new Date().getFullYear()} DevHubConnect. All rights reserved.</p>
        </div>
        <div className="max-w-xl">
          <p className="mb-4">
            <strong>Disclaimer:</strong> DevHubConnect provides n8n workflow templates and AI-assisted tools for productivity purposes only. AI-generated content is produced by Claude (Anthropic) and provided "as-is" without warranties. Users are solely responsible for reviewing and testing all workflows before deployment. DevHubConnect is not liable for any damages or disruption resulting from their use.
          </p>
          
          {/* Legal Links */}
          <div className="flex flex-wrap gap-4">
            <Link 
              to="/terms" 
              className="text-teal-400 hover:text-white underline transition-colors"
            >
              Terms of Service
            </Link>
            <Link 
              to="/privacy" 
              className="text-teal-400 hover:text-white underline transition-colors"
            >
              Privacy Policy
            </Link>
            <a 
              href="mailto:devhub.partners@gmail.com" 
              className="text-teal-400 hover:text-white underline transition-colors"
            >
              Contact Us
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;