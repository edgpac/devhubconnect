// src/types/auth-types.d.ts
// TypeScript declarations for global authentication

interface AuthUser {
  id: string;
  github_id: string;
  username: string;
  email: string | null;
  avatar_url: string;
  created_at: string;
}

interface AuthChecker {
  user: AuthUser | null;
  isAuthenticated: boolean;
  checkingAuth: boolean;
  checkAuthStatus(): Promise<boolean>;
  updateUI(): void;
  logout(): Promise<void>;
  handleOAuthCallback(): void;
  initGitHubLogin(): void;
  init(): void;
}

declare global {
  interface Window {
    authChecker: AuthChecker;
  }
}

export {};