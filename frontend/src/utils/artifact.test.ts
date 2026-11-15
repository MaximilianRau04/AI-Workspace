import { describe, expect, it } from "vitest";
import { buildArtifactHtml, isArtifactLanguage } from "./artifact";

describe("isArtifactLanguage", () => {
  it("accepts previewable languages case-insensitively", () => {
    for (const lang of ["html", "SVG", "jsx", "tsx", "React"]) {
      expect(isArtifactLanguage(lang)).toBe(true);
    }
  });

  it("rejects other languages", () => {
    expect(isArtifactLanguage("python")).toBe(false);
    expect(isArtifactLanguage("")).toBe(false);
  });
});

describe("buildArtifactHtml", () => {
  it("returns full HTML documents unchanged", () => {
    const doc = "<html><body>hi</body></html>";
    expect(buildArtifactHtml(doc, "html")).toBe(doc);
  });

  it("wraps HTML fragments in a document", () => {
    const out = buildArtifactHtml("<p>hi</p>", "html");
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("<body><p>hi</p></body>");
  });

  it("embeds SVG in a centered document", () => {
    const out = buildArtifactHtml("<svg></svg>", "svg");
    expect(out).toContain("<svg></svg>");
    expect(out).toContain("justify-content: center");
  });

  it("loads React and Babel for JSX", () => {
    const out = buildArtifactHtml("function App() { return <div/>; }", "jsx");
    expect(out).toContain("react.production.min.js");
    expect(out).toContain("babel.min.js");
  });
});
