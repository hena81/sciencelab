const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dataFile = path.join(root, "data.json");
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";
const maxBodySize = 25 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodySize) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    send(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(response, 404, "Not found");
      return;
    }
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    send(response, 200, content, contentType);
  });
}

async function handleApi(request, response) {
  if (request.method === "GET") {
    fs.readFile(dataFile, "utf8", (error, content) => {
      if (error) {
        send(response, 500, JSON.stringify({ error: "Cannot read data.json" }), "application/json; charset=utf-8");
        return;
      }
      send(response, 200, content, "application/json; charset=utf-8");
    });
    return;
  }

  if (request.method === "POST") {
    try {
      const body = await readRequestBody(request);
      const parsed = JSON.parse(body);
      const tempFile = `${dataFile}.tmp`;
      fs.writeFileSync(tempFile, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      fs.renameSync(tempFile, dataFile);
      send(response, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
    } catch (error) {
      send(response, 400, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
    }
    return;
  }

  send(response, 405, JSON.stringify({ error: "Method not allowed" }), "application/json; charset=utf-8");
}

const server = http.createServer((request, response) => {
  if (request.url === "/healthz" || request.url === "/health") {
    send(response, 200, JSON.stringify({ status: "ok", app: "sciencelab" }), "application/json; charset=utf-8");
    return;
  }
  if (request.url.startsWith("/api/data")) {
    handleApi(request, response);
    return;
  }
  serveStatic(request, response);
});

server.listen(port, host, () => {
  console.log(`Lab cabinets app is running at http://localhost:${port}`);
  console.log("Open this computer's local network IP from phones on the same Wi-Fi.");
});
