import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth.store';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// Attach access token to every request
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

// Auto-refresh access token on 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const { refreshToken, setTokens, logout } = useAuthStore.getState();

    if (!refreshToken) {
      logout();
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post<{
        data: { accessToken: string; refreshToken: string };
      }>('/api/v1/auth/refresh', { refreshToken });

      const { accessToken: newAccess, refreshToken: newRefresh } = data.data;
      setTokens(newAccess, newRefresh);
      processQueue(null, newAccess);
      originalRequest.headers.Authorization = `Bearer ${newAccess}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
