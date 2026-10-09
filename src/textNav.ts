/**
 * Real vertical position (px from the top of the scrollable content) of the row containing
 * `index` in a textarea.
 *
 * `line number * line height` is NOT good enough: textareas soft-wrap long lines, so one logical
 * line can occupy several visual rows, and the error grows with every wrapped line above the
 * target. In a large payload (tens of thousands of lines, many of them long) that put the
 * computed scroll position tens of thousands of pixels away from the real one, which is why
 * clicking a node near the end of a big document appeared to do nothing on the input side.
 *
 * So the text is laid out once in a hidden mirror element with the same wrapping rules, and the
 * position is read from there with a Range. The mirror is cached while the text and width stay
 * the same (repeated clicks on a multi-megabyte payload are then instant) and discarded shortly
 * after. Browsers lay out a textarea's rows a hair differently from a plain element (about
 * 0.07% taller in Chromium, enough to drift ~1,300px over 85k lines), so the result is scaled by
 * the ratio of the textarea's real scrollHeight to the mirror's.
 */
interface MirrorCache {
  value: string;
  width: number;
  mirror: HTMLDivElement;
  text: Text;
  timer: number;
}
let mirrorCache: MirrorCache | null = null;

function disposeMirror() {
  if (!mirrorCache) return;
  window.clearTimeout(mirrorCache.timer);
  mirrorCache.mirror.remove();
  mirrorCache = null;
}

function getMirror(el: HTMLTextAreaElement): MirrorCache {
  const width = el.clientWidth; // excludes the scrollbar: exactly the width text wraps at
  if (mirrorCache && mirrorCache.value === el.value && mirrorCache.width === width) {
    window.clearTimeout(mirrorCache.timer);
    mirrorCache.timer = window.setTimeout(disposeMirror, 10_000);
    return mirrorCache;
  }
  disposeMirror();

  const cs = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  const s = mirror.style;
  s.position = "absolute";
  s.visibility = "hidden";
  s.pointerEvents = "none";
  s.top = "-99999px";
  s.left = "0";
  s.boxSizing = "border-box";
  s.whiteSpace = "pre-wrap";
  s.overflowWrap = "break-word";
  s.wordWrap = "break-word";
  s.fontFamily = cs.fontFamily;
  s.fontSize = cs.fontSize;
  s.fontWeight = cs.fontWeight;
  s.fontStyle = cs.fontStyle;
  s.letterSpacing = cs.letterSpacing;
  s.wordSpacing = cs.wordSpacing;
  s.textTransform = cs.textTransform;
  s.lineHeight = cs.lineHeight;
  s.tabSize = cs.tabSize;
  s.paddingTop = cs.paddingTop;
  s.paddingBottom = cs.paddingBottom;
  s.paddingLeft = cs.paddingLeft;
  s.paddingRight = cs.paddingRight;
  s.width = `${width}px`;

  const text = document.createTextNode(el.value);
  mirror.appendChild(text);
  document.body.appendChild(mirror);
  mirrorCache = { value: el.value, width, mirror, text, timer: window.setTimeout(disposeMirror, 10_000) };
  return mirrorCache;
}

function measureOffsetTop(el: HTMLTextAreaElement, index: number): number {
  const { mirror, text } = getMirror(el);
  const cs = window.getComputedStyle(el);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const len = text.length;
  if (len === 0) return padTop;

  // Measure a real (non-newline) character on the target row: a lone "\n" has no useful box.
  let at = Math.min(index, len - 1);
  while (at > 0 && text.data[at] === "\n") at--;
  const range = document.createRange();
  range.setStart(text, at);
  range.setEnd(text, at + 1);
  const rect = range.getBoundingClientRect();
  const mirrorTop = mirror.getBoundingClientRect().top;
  const mirrorY = rect.top - mirrorTop;

  const contentMirror = mirror.scrollHeight - padTop - padBottom;
  const contentReal = el.scrollHeight - padTop - padBottom;
  // Only calibrate when the textarea actually scrolls (otherwise scrollHeight is just its height).
  const scale = el.scrollHeight > el.clientHeight && contentMirror > 0 ? contentReal / contentMirror : 1;
  return padTop + (mirrorY - padTop) * scale;
}

/** Selects [start, end) in a textarea, scrolling so the selection sits roughly mid-viewport. */
export function selectTextareaRange(
  el: HTMLTextAreaElement,
  start: number,
  end: number,
  wholeLine = false
) {
  el.focus();
  let selStart = start;
  let selEnd = end;
  if (wholeLine) {
    const text = el.value;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;
    selStart = lineStart;
    selEnd = lineEnd;
  }
  el.setSelectionRange(selStart, selEnd);

  const cs = window.getComputedStyle(el);
  const lineHeight = parseFloat(cs.lineHeight) || 20;
  const top = measureOffsetTop(el, selStart);
  const target = top - el.clientHeight / 2 + lineHeight;
  el.scrollTop = Math.max(0, target);
}
