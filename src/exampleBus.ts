/**
 * Lets the "Try this example" buttons on the landing sections hand sample data to whichever tool
 * page is mounted, without the tool pages having to know about the SEO content.
 */
export type ExampleTarget = "inspect" | "compare" | "search";

export interface ExampleRequest {
  target: ExampleTarget;
  sample?: string;
  left?: string;
  right?: string;
  action?: "tree" | "minify" | "repair" | "graph";
  query?: string;
}

const EVENT = "ajson:example";

export function requestExample(req: ExampleRequest) {
  window.dispatchEvent(new CustomEvent<ExampleRequest>(EVENT, { detail: req }));
}

export function onExample(target: ExampleTarget, handler: (req: ExampleRequest) => void): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<ExampleRequest>).detail;
    if (detail.target === target) handler(detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
