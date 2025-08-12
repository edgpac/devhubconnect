import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ✅ Import the AuthProvider using the fully corrected path with the alias
import { AuthProvider } from '@/components/context/AuthProvider' // <-- This line was changed to include 'components'

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
