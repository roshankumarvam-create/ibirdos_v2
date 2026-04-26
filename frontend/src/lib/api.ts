import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// ================= REQUEST =================
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('ibirdos-auth');

    if (stored) {
      try {
        const parsed = JSON.parse(stored);

        // 🔥 FIXED: handle both storage formats
        const token = parsed?.token || parsed?.state?.token;

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          console.warn('⚠️ No token found in storage');
        }

      } catch (e) {
        console.warn('Invalid auth storage');
      }
    } else {
      console.warn('⚠️ No auth data in localStorage');
    }
  }

  return config;
});

// ================= RESPONSE =================
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('ibirdos-auth');
      window.location.href = '/auth/login';
    }

    return Promise.reject(error);
  }
);

export default api;