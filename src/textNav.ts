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
  const before = el.value.slice(0, start);
  const lineNumber = before.split("\n").length - 1;
  const target = lineNumber * lineHeight - el.clientHeight / 2 + lineHeight;
  el.scrollTop = Math.max(0, target);
}
