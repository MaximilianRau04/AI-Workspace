/**
 * Builds a sandboxed HTML document (for an <iframe srcDoc>) that renders
 * AI-generated html/svg/jsx/tsx code as a live preview.
 */

const BASE_STYLE = `
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; background: #fff; }
`;

const REACT_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js";
const REACT_DOM_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js";
const BABEL_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js";

export function isArtifactLanguage(language: string): boolean {
  return ["html", "svg", "jsx", "tsx", "react"].includes(
    language.toLowerCase(),
  );
}

export function buildArtifactHtml(code: string, language: string): string {
  const lang = language.toLowerCase();

  if (lang === "html") {
    if (/<html[\s>]/i.test(code)) return code;
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLE}</style></head><body>${code}</body></html>`;
  }

  if (lang === "svg") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_STYLE}
      body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      svg { max-width: 100%; max-height: 100vh; }
    </style></head><body>${code}</body></html>`;
  }

  // jsx / tsx / react
  // Support both `export default ...` and a bare `App`/`function App` component.
  // The snippet runs as a plain (non-module) script, so any `export` keyword
  // — default or named — must be stripped first or Babel's script-mode parser
  // will reject it as a syntax error.
  const withoutDefault = code.replace(
    /export\s+default\s+/,
    "const __Artifact__ = ",
  );
  const hasDefault = withoutDefault !== code;
  const transformed = withoutDefault.replace(
    /^export\s+(?=const\s|function\s|class\s|let\s|var\s)/gm,
    "",
  );
  const mountExpr = hasDefault
    ? "__Artifact__"
    : "typeof App !== 'undefined' ? App : null";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${BASE_STYLE}
  #root { padding: 1rem; }
  #artifact-error { display:none; padding: 1rem; font-family: monospace; white-space: pre-wrap; color: #c0392b; background: #fdf0ef; }
</style>
<script src="${REACT_CDN}"></script>
<script src="${REACT_DOM_CDN}"></script>
<script src="${BABEL_CDN}"></script>
</head>
<body>
<div id="root"></div>
<div id="artifact-error"></div>
<script type="text/babel" data-presets="react,typescript">
try {
  ${transformed}
  const Component = ${mountExpr};
  if (!Component) throw new Error("No default export or App component found.");
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(React.createElement(Component));
} catch (err) {
  const el = document.getElementById("artifact-error");
  el.textContent = "Preview error: " + err.message;
  el.style.display = "block";
}
</script>
</body>
</html>`;
}
