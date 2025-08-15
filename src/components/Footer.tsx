import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="w-full text-sm text-white py-6 px-4 mt-10 bg-gradient-to-r from-blue-600 to-purple-600 border-none">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-4">
        <div>
          <p>&copy; {new Date().getFullYear()} DevHubConnect. All rights reserved.</p>
        </div>
        <div className="max-w-xl">
          <p className="mb-4">
            <strong>Disclaimer:</strong> The automation templates provided by DevHubConnect are made available for informational and productivity purposes only. DevHubConnect does not guarantee the accuracy, reliability, completeness, or suitability of these templates for any particular purpose. Templates are provided "as-is" without any warranties. Users are responsible for testing and validating templates before deployment. Use is at your own risk. DevHubConnect is not liable for any damages, losses, security breaches, or issues resulting from their use.
          </p>
          
          {/* Legal Links */}
          <div className="flex flex-wrap gap-4">
            <Link 
              to="/terms" 
              className="text-blue-200 hover:text-white underline transition-colors"
            >
              Terms of Service
            </Link>
            <Link 
              to="/privacy" 
              className="text-blue-200 hover:text-white underline transition-colors"
            >
              Privacy Policy
            </Link>
            <a 
              href="mailto:devhub.partners@gmail.com" 
              className="text-blue-200 hover:text-white underline transition-colors"
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