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
            <strong>Disclaimer:</strong> DevHubConnect provides n8n workflow templates, AI-assisted customization tools, and expert prompt products ("Prompt + JSON combos") for informational and productivity purposes only. All AI-generated workflows and modifications are produced by Claude (Anthropic) and are provided "as-is" without warranties of any kind. DevHubConnect does not guarantee the accuracy, reliability, completeness, or fitness for any particular purpose of any template, generated workflow, or prompt output. Users are solely responsible for reviewing, testing, and validating all workflows before deployment in any environment. Use of our tools and templates is at your own risk. DevHubConnect is not liable for any damages, data loss, security breaches, or business disruption resulting from their use. Purchased prompt products activate as invisible AI system instructions — the underlying prompt text is not displayed or transferred to users.
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