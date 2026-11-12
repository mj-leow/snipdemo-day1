# Snip backend

A zero-dependency Bun API for creating and listing shortened links and redirecting
short codes. Links are kept in memory and are cleared when the server restarts.

Run with `bun start`. The server listens on port `3000` by default. Set `PORT` to
change it, `BASE_URL` to control generated short links, or
`RAILWAY_PUBLIC_DOMAIN` to use `https://<domain>` when `BASE_URL` is unset.
Setting `PUBLIC_DIR` also serves files from that directory, including
`index.html` at `/`.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link.
- `GET /api/links` lists links and hit counts.
- `GET /:code` redirects to the original URL and increments its hit count.
