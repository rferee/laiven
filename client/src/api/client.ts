import axios from 'axios';

export const SESSION_EXPIRED_EVENT = 'laiven:session-expired';

const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const isPublicPage =
        currentPath === '/login' ||
        currentPath === '/setup';
      const requestUrl: string | undefined = error.config?.url;
      const isSetupCheck = requestUrl?.includes('/auth/setup-status');
      const isMeCheck = requestUrl?.includes('/auth/me');

      if (!isPublicPage && !isSetupCheck && !isMeCheck) {
        // Dispatch an event instead of doing `window.location.href = …`.
        // A listener in App.tsx uses react-router navigation so in-memory
        // React state (unsaved form input on e.g. the word editor) isn't
        // wiped by a full document reload.
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
