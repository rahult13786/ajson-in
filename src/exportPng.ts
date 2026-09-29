/**
 * Rasterizes a DOM node to a PNG and triggers a download — entirely client-side, no
 * dependency: wraps the node's outerHTML in an SVG <foreignObject>, draws that as an
 * <img>, then reads the pixels back out via <canvas>.
 */
export async function exportNodeAsPng(
  node: HTMLElement,
  filename: string,
  background: string,
  width: number,
  height: number
): Promise<void> {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));

  const clone = node.cloneNode(true) as HTMLElement;
  // The live node may be under a CSS zoom transform; the export should always be at the
  // layout's true (unscaled) size, which the caller passes in explicitly via width/height —
  // measuring the live (possibly scaled) node here instead was the actual bug: the
  // foreignObject/canvas would be sized from the zoomed bounding box while the clone's own
  // transform was reset to "none", so the two no longer agreed and the export silently failed.
  clone.style.transform = "none";
  clone.style.margin = "0";
  clone.style.width = `${w}px`;
  clone.style.height = `${h}px`;

  // Inline the computed styles that matter for a faithful export; the graph view uses only
  // CSS custom properties + simple box styling, so a shallow style copy is sufficient.
  const styleSheetText = collectStylesheetText();

  const serialized = new XMLSerializer().serializeToString(clone);
  const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="background:${background}; width:${w}px; height:${h}px;">` +
    `<style>${styleSheetText}</style>${serialized}` +
    `</div></foreignObject></svg>`;

  // A data URI (rather than a blob: URL) loads reliably as an <img> src across browsers/
  // headless contexts for SVG-wrapped foreignObject content.
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

  const img = await loadImage(svgDataUrl);
  const canvas = document.createElement("canvas");
  const scale = 2; // sharper export
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is not available");
  ctx.scale(scale, scale);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to encode PNG");

  const dlUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dlUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(dlUrl);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to rasterize the graph — the image source could not be loaded"));
    img.src = src;
  });
}

function collectStylesheetText(): string {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      for (const rule of Array.from(rules)) css += rule.cssText + "\n";
    } catch {
      // Cross-origin stylesheets (e.g. the Google Fonts <link>) can't be read; skip them.
    }
  }
  return css;
}
