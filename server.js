import { resolve, sep } from "node:path";

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const port = Number(process.env.PORT || 3000);
const publicDir = process.env.PUBLIC_DIR
  ? resolve(process.cwd(), process.env.PUBLIC_DIR)
  : null;
const baseUrl = (
  process.env.BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`)
).replace(/\/+$/, "");

new URL(baseUrl);

function createCode() {
  let code;
  do {
    code = "";
    while (code.length < 6) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      for (const byte of bytes) {
        if (byte < 248) code += alphabet[byte % alphabet.length];
        if (code.length === 6) break;
      }
    }
  } while (links.has(code));
  return code;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function staticFilePath(pathname) {
  if (!publicDir) return null;
  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return null;
  }
  const filePath = resolve(publicDir, `.${relativePath}`);
  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${sep}`)) {
    return null;
  }
  return filePath;
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const url = new URL(request.url);
    let response;

    if (request.method === "OPTIONS") {
      response = new Response(null, { status: 204 });
    } else if (request.method === "POST" && url.pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        response = json({ error: "Invalid JSON" }, 400);
      }
      if (!response) {
        let parsedUrl;
        try {
          if (typeof body?.url !== "string") throw new Error("Invalid URL");
          parsedUrl = new URL(body.url);
          if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            throw new Error("Invalid URL");
          }
        } catch {
          response = json({ error: "URL must use http or https" }, 400);
        }
        if (!response) {
          const code = createCode();
          const link = {
            code,
            url: body.url,
            shortUrl: `${baseUrl}/${code}`,
            hits: 0,
            createdAt: new Date().toISOString(),
          };
          links.set(link.code, link);
          response = json(link, 201);
        }
      }
    } else if (request.method === "GET" && url.pathname === "/api/links") {
      response = json(Array.from(links.values()));
    } else if (request.method === "GET" && publicDir) {
      const filePath = staticFilePath(url.pathname);
      if (filePath && await Bun.file(filePath).exists()) {
        response = new Response(Bun.file(filePath));
      }
    }

    if (!response && request.method === "GET") {
      const match = url.pathname.match(/^\/([^/]+)$/);
      if (match) {
        let code;
        try {
          code = decodeURIComponent(match[1]);
        } catch {
          code = null;
        }
        const link = code ? links.get(code) : null;
        if (link) {
          link.hits += 1;
          response = new Response(null, {
            status: 302,
            headers: { Location: link.url },
          });
        }
      }
    }

    response ||= new Response("Not Found", { status: 404 });
    for (const [name, value] of Object.entries(corsHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  },
});

console.log(`Snip backend listening on ${server.url}`);
