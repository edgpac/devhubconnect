import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import { Navbar } from '../components/Navbar'; // Adjust path if necessary
import { Button } from '../components/ui/button'; // Adjust path if necessary

export const SuccessPage = () => {
  const location = useLocation();
  const [paymentStatus, setPaymentStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('Verifying your payment...');

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const sessionId = query.get('session_id');

    const verifyPayment = async (id: string) => {
      try {
        // ✅ Replace the simulated call with an actual fetch to your backend
        const response = await fetch(`/api/stripe/verify-payment?session_id=${id}`);
        const data = await response.json();

        if (response.ok && data.status === 'paid') {
          setPaymentStatus('success');
          setMessage('Payment successful! Your template is now available for download.');
          // You might want to trigger a re-fetch of user's purchased templates here
          // if your app state doesn't automatically update (e.g., using react-query invalidate)
        } else {
          setPaymentStatus('failed');
          setMessage(data.message || 'Payment could not be verified. Please contact support.');
        }
      } catch (error) {
        console.error("Payment verification error:", error);
        setPaymentStatus('failed');
        setMessage('An error occurred during payment verification.');
      }
    };

    if (sessionId) {
      console.log("Stripe Session ID:", sessionId);
      verifyPayment(sessionId);
    } else {
      setPaymentStatus('failed');
      setMessage('No payment session ID found. Payment status cannot be determined.');
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <main className="flex-grow container mx-auto px-4 py-12 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md w-full">
          {paymentStatus === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Processing Payment...</h2>
              <p className="text-gray-600">{message}</p>
            </>
          )}
          {paymentStatus === 'success' && (
            <>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-green-700 mb-2">Success!</h2>
              <p className="text-gray-700 mb-6">{message}</p>
              <Link to="/dashboard">
                <Button className="bg-blue-600 hover:bg-blue-700">Go to Dashboard</Button>
              </Link>
            </>
          )}
          {paymentStatus === 'failed' && (
            <>
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-red-700 mb-2">Payment Failed</h2>
              <p className="text-gray-700 mb-6">{message}</p>
              <Link to="/">
                <Button variant="outline">Back to Home</Button>
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
