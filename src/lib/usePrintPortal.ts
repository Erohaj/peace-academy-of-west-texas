import { useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Printing exactly one thing on a page that may have several printable
 * things on it — a signed document, a certificate — each with its own Print
 * button.
 *
 * Two failure modes this avoids, both found by hand rather than anticipated:
 *
 * A `@media print` rule keyed on a class every instance shares makes every
 * currently-expanded instance visible at once the moment any one of them
 * prints, since CSS has no notion of "the one that was clicked".
 *
 * Even scoped to a single instance via a ref, `position: fixed` is the wrong
 * tool for anything that might run longer than one page: fixed elements are
 * re-anchored to the same spot on EVERY printed page, so a two-page document
 * had its second page's content stamped directly over the first's rather
 * than continuing below it.
 *
 * The fix for both: render the printable content into `#print-root` (a
 * plain sibling of `#root` — see index.html) via a portal, only while this
 * instance is actually printing, while `#root` itself is hidden in print
 * (src/index.css). Nothing else on the page is a candidate to be shown, and
 * the portalled content sits in normal document flow, free to paginate.
 *
 * `flushSync` matters here specifically: `window.print()` is called in the
 * same event handler as the state flip, and by the time it runs the portal's
 * content has to already be in the DOM — an ordinary `setState` is batched
 * and would not have re-rendered yet.
 */
export function usePrintPortal() {
  const [isPrinting, setIsPrinting] = useState(false);

  const print = () => {
    flushSync(() => setIsPrinting(true));
    window.print();
    flushSync(() => setIsPrinting(false));
  };

  const printRoot = typeof document !== 'undefined' ? document.getElementById('print-root') : null;

  return { isPrinting, print, printRoot };
}
