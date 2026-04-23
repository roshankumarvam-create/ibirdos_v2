import axios from 'axios';

const api = axios.create({
baseURL: process.env.NEXT_PUBLIC_API_URL,
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
const token = parsed?.state?.token;


    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    console.warn('Invalid auth storage');
  }
}


}
return config;
});

// ================= RESPONSE =================
api.interceptors.response.use(
(response) => {
// 🔥 MAIN FIX → always return clean data
return response.data;
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
