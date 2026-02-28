import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openApiSpecPath = join(__dirname, "..", "openapi.json");

/**
 * Extract the paths object from raw OpenAPI JSON.
 * When the file has "  ,\n  \"components\"" (paths not closed), we stop at the "  }" before that
 * so we get only path entries, not the stray "components" key.
 */
function extractPaths(raw: string): Record<string, unknown> | null {
  const idx = raw.indexOf('"paths"');
  if (idx === -1) return null;
  const start = raw.indexOf("{", idx);
  if (start === -1) return null;

  const commaMarker = raw.lastIndexOf('  ,\n  "components":');
  if (commaMarker !== -1) {
    const slice = raw.slice(start, commaMarker).trimEnd();
    const openCount = (slice.match(/{/g) || []).length;
    const closeCount = (slice.match(/}/g) || []).length;
    let best: Record<string, unknown> | null = null;
    for (let extra = 0; extra <= 5; extra++) {
      const missing = openCount - closeCount + extra;
      if (missing <= 0) continue;
      const toParse = slice + "\n" + "  }\n".repeat(missing).trimEnd();
      try {
        const parsed = JSON.parse(toParse) as Record<string, unknown>;
        const pathKeys = Object.keys(parsed).filter((k) => k.startsWith("/"));
        if (!best || pathKeys.length > Object.keys(best).filter((k) => k.startsWith("/")).length) {
          best = parsed;
        }
        if (pathKeys.length > 15) break;
      } catch {
        /* try next */
      }
    }
    if (best && Object.keys(best).length > 1) return best;
    const missing = openCount - closeCount;
    if (missing > 0) {
      try {
        return JSON.parse(slice + "\n" + "  }\n".repeat(missing).trimEnd()) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
  }

  let depth = 1;
  let i = start + 1;
  let inString = false;
  let escape = false;
  let quote = "";
  while (i < raw.length && depth > 0) {
    const c = raw[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  try {
    return JSON.parse(raw.slice(start, i)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Extract a JSON object value from raw string by finding "key": { ... } (brace-matched). */
function extractObject(raw: string, key: string): Record<string, unknown> | null {
  const idx = raw.indexOf(`"${key}"`);
  if (idx === -1) return null;
  const start = raw.indexOf("{", idx);
  if (start === -1) return null;
  let depth = 1;
  let i = start + 1;
  let inString = false;
  let escape = false;
  let quote = "";
  while (i < raw.length && depth > 0) {
    const c = raw[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  try {
    return JSON.parse(raw.slice(start, i)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Build a complete OpenAPI spec from raw file (handles malformed JSON). */
function buildFullSpec(raw: string): Record<string, unknown> {
  let spec: Record<string, unknown> = {};
  let fixed = raw;
  fixed = fixed.replace(/\s*,\s*\n\s*"components":\s*\{/, " },\n  \"components\": {");
  fixed = fixed.replace(/    \},\n  \}\n    "\//, "    },\n    \"");
  const openCount = (fixed.match(/{/g) || []).length;
  const closeCount = (fixed.match(/}/g) || []).length;
  if (closeCount < openCount) {
    fixed = fixed.trimEnd() + "\n" + "}".repeat(openCount - closeCount);
  }
  try {
    spec = JSON.parse(fixed) as Record<string, unknown>;
  } catch {
    try {
      spec = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* use empty and rely on extraction */
    }
  }

  if (spec.paths && typeof spec.paths === "object" && "components" in spec.paths) {
    const paths = spec.paths as Record<string, unknown>;
    spec.components = paths.components as Record<string, unknown>;
    delete paths.components;
  }

  const paths = extractPaths(raw);
  const components = extractObject(raw, "components");
  if (paths && Object.keys(paths).length > 1) {
    spec.paths = paths;
  }
  if (components) {
    spec.components = components;
  }

  if (!spec.openapi) spec.openapi = "3.0.3";
  if (!spec.info) spec.info = { title: "API", version: "1.0.0" };
  if (!spec.paths) spec.paths = {};
  return spec;
}

function getDocHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Enlace Group Loan API - Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
}

export function createDocRoutes(): Hono {
  const routes = new Hono();

  routes.get("/openapi.json", (c) => {
    const raw = readFileSync(openApiSpecPath, "utf-8");
    const spec = buildFullSpec(raw);
    return c.json(spec);
  });

  routes.get("/doc", (c) => {
    return c.html(getDocHtml());
  });

  routes.get("/", (c) => c.redirect("/doc"));
  return routes;
}
