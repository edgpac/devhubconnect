// Create this as a separate utility file: /utils/authInterceptor.js

class AuthInterceptor {
  constructor() {
    this.isRefreshing = false;
    this.failedQueue = [];
  }

  // Process queued requests after token refresh
  processQueue(error, token = null) {
    this.failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(token);
      }
    });
    
    this.failedQueue = [];
  }

  // Enhanced fetch with automatic token refresh
  async fetch(url, options = {}) {
    const token = localStorage.getItem('token');
    
    // Add auth header if token exists
    if (token && !options.headers?.['Authorization']) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }

    // Ensure credentials are included for cookies
    options.credentials = options.credentials || 'include';

    let response = await fetch(url, options);

    // If unauthorized, try to refresh token
    if (response.status === 401 && token) {
      const authError = await response.json().catch(() => ({}));
      
      if (authError.code === 'TOKEN_EXPIRED') {
        if (this.isRefreshing) {
          // If already refreshing, wait for it to complete
          return new Promise((resolve, reject) => {
            this.failedQueue.push({ resolve, reject });
          }).then(() => {
            // Retry original request with new token
            const newToken = localStorage.getItem('token');
            if (newToken) {
              options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${newToken}`
              };
              return fetch(url, options);
            }
            throw new Error('No token after refresh');
          });
        }

        this.isRefreshing = true;

        try {
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            
            if (data.token) {
              localStorage.setItem('token', data.token);
              
              if (data.user) {
                localStorage.setItem('devhub_user', JSON.stringify(data.user));
              }

              this.processQueue(null, data.token);

              // Retry original request with new token
              options.headers = {
                ...options.headers,
                'Authorization': `Bearer ${data.token}`
              };
              
              return fetch(url, options);
            }
          }
          
          throw new Error('Token refresh failed');
          
        } catch (refreshError) {
          this.processQueue(refreshError, null);
          
          // Clear auth data
          localStorage.removeItem('token');
          localStorage.removeItem('devhub_user');
          localStorage.removeItem('admin_auth');
          
          // Redirect to GitHub OAuth - FIXED: Use absolute URL
          if (window.location.pathname !== '/auth') {
            window.location.href = 'https://www.devhubconnect.com/auth/github';
          }
          
          throw refreshError;
        } finally {
          this.isRefreshing = false;
        }
      }
    }

    return response;
  }

  // Method to manually refresh token
  async refreshToken() {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.token) {
          localStorage.setItem('token', data.token);
          
          if (data.user) {
            localStorage.setItem('devhub_user', JSON.stringify(data.user));
          }
          
          return data;
        }
      }
      
      throw new Error('Token refresh failed');
    } catch (error) {
      // Clear auth data on refresh failure
      localStorage.removeItem('token');
      localStorage.removeItem('devhub_user');
      localStorage.removeItem('admin_auth');
      throw error;
    }
  }

  // Check if token is expired (client-side check)
  isTokenExpired() {
    const token = localStorage.getItem('token');
    if (!token) return true;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  // Get current user from token
  getCurrentUser() {
    const token = localStorage.getItem('token');
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        userId: payload.userId,
        email: payload.email,
        isAdmin: payload.isAdmin
      };
    } catch (error) {
      return null;
    }
  }
}

// Create singleton instance
const authInterceptor = new AuthInterceptor();

export default authInterceptor;

// Usage in your components:
// import authInterceptor from '@/utils/authInterceptor';
// 
// // Instead of fetch:
// const response = await authInterceptor.fetch('/api/some-endpoint');
//
// // Manual token refresh:
// await authInterceptor.refreshToken();