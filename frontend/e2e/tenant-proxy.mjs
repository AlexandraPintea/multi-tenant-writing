import http from 'node:http';

/**
 * Stands in for nginx during e2e runs.
 *
 * The tenant is decided by the Host header, so testing two sites means issuing
 * requests with two different Hosts. A browser sets Host from the URL and will
 * not let a test override it, and the usual answer — hosts-file entries for
 * alexandrapintea.local and roamliterary.local — needs administrator rights,
 * which a checkout should not require to run its own test suite.
 *
 * So each tenant gets a local port that forwards to the one SSR server with the
 * right Host attached. That is precisely nginx's job in production
 * (architecture §6.3: "route by Host header, with the original Host preserved
 * so the SSR layer can resolve the correct Site"), which makes this a faithful
 * stand-in rather than a test-only shortcut.
 */

const TARGET_PORT = Number(process.env['SSR_PORT'] ?? 4000);
const TENANTS = [
  { port: 4101, host: 'alexandrapintea.eu' },
  { port: 4102, host: 'roamliterary.com' },
];

for (const tenant of TENANTS) {
  http
    .createServer((request, response) => {
      const proxied = http.request(
        {
          host: '127.0.0.1',
          port: TARGET_PORT,
          path: request.url,
          method: request.method,
          headers: { ...request.headers, host: tenant.host },
        },
        (upstream) => {
          response.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(response);
        },
      );
      proxied.on('error', (error) => {
        response.writeHead(502, { 'content-type': 'text/plain' });
        response.end(`tenant-proxy: SSR server unreachable — ${error.message}`);
      });
      request.pipe(proxied);
    })
    .listen(tenant.port, () => {
      console.log(`tenant-proxy: :${tenant.port} -> ${tenant.host}`);
    });
}