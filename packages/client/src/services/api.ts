import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth.store';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
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

// "basicSalary" -> "Basic Salary", "fiscalYear" -> "Fiscal Year"
function humanizeField(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bId\b/g, '')
    .trim();
}

// If the response carries Zod field errors (error.details), fold them into the
// message fields the UI displays so "Invalid request data" becomes e.g.
// "Basic Salary: Number must be greater than 0". No-op for other errors.
function enrichValidationMessage(error: AxiosError): void {
  const data = error.response?.data as
    | { message?: string; error?: { message?: string; details?: Record<string, string[] | string> } }
    | undefined;
  const details = data?.error?.details;
  if (!data || !details || typeof details !== 'object') return;
  const parts = Object.entries(details)
    .map(([field, msgs]) => {
      const text = (Array.isArray(msgs) ? msgs : [msgs]).filter(Boolean).join(', ');
      return text ? `${humanizeField(field)}: ${text}` : '';
    })
    .filter(Boolean);
  if (parts.length === 0) return;
  const message = parts.join(' · ');
  if (data.error) data.error.message = message;
  data.message = message;
}

// Auto-refresh access token on 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Surface server-side validation detail. The API returns field-level errors in
    // error.details (e.g. { basicSalary: ["..."] }) but most forms only display the
    // generic error.message ("Invalid request data"). Rewrite the message fields the
    // UI reads so every form shows which field failed, without touching each form.
    enrichValidationMessage(error);

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
      // Use the same API_BASE as the app (the server origin), NOT a relative URL.
      // A relative URL resolves against the client origin, where the SPA rewrite
      // returns index.html — so the refresh silently fails and logs the user out
      // every time the 15-minute access token expires.
      const { data } = await axios.post<{
        data: { accessToken: string; refreshToken: string };
      }>(`${API_BASE}/auth/refresh`, { refreshToken });

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
