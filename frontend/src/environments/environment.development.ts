export const environment = {
  production: false,
  // 127.0.0.1, not localhost: Node's fetch resolves localhost to ::1 first,
  // while `manage.py runserver` binds IPv4 only, so every SSR-side API call
  // died with ECONNREFUSED. The browser is unaffected either way.
  API_BASE_URL: 'http://127.0.0.1:8001/api',
};
