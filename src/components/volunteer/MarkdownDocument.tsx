import React, { Suspense, lazy, type ComponentProps } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

// react-markdown pulls in a parser and is only ever needed on the handful of
// screens that render a legal document — lazy, like the QR encoder and the
// Gemini SDK, so it stays out of the bundle everyone else downloads.
const ReactMarkdown = lazy(() => import('react-markdown'));

// Cached at module scope, outside any component's state, because this file
// gets mounted a second time for printing (see usePrintPortal): that second
// mount's own useState/useEffect would otherwise restart the "loading"
// window from null, even though the plugin was already fetched for the
// on-screen copy moments earlier. window.print() is called synchronously
// right after the print mount, with no tick left for a fresh effect's
// `.then()` to land — so the reprint showed the title and signed-by line
// (plain JSX) but a blank body where ReactMarkdown would have gone. Reading
// this cache in useState's initializer makes a second mount synchronous
// instead of suspended-on-nothing.
let cachedRemarkGfm: (() => unknown) | null = null;
const remarkGfmPromise = import('remark-gfm').then((m) => {
  cachedRemarkGfm = m.default;
  return m.default;
});

interface Props {
  markdown: string;
}

/**
 * A `> ### heading` blockquote is the one authoring pattern used across all
 * six documents that is NOT just an informational aside — see
 * legal/03-release-and-waiver.md, section 4. Texas requires a release from a
 * party's own negligence to be conspicuous (Dresser Industries v. Page
 * Petroleum, 853 S.W.2d 505), and rendering that paragraph in the same grey
 * body text as everything else would undo the drafting regardless of what
 * the markdown says. Every other blockquote in these documents is a plain
 * note, and gets the lighter treatment below.
 *
 * This is a structural check against text this project authored, not a
 * heuristic guess at arbitrary content — see legal/README.md.
 */
function hasHeadingChild(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && /^h[1-6]$/.test((child as React.ReactElement<unknown>).type as string)
  );
}

const components: ComponentProps<typeof ReactMarkdown>['components'] = {
  h2: ({ children }) => (
    <h2 className="text-xl font-serif font-bold text-graphite mt-8 mb-3 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold uppercase tracking-wide text-terracotta">{children}</h3>
  ),
  p: ({ children }) => <p className="text-sm leading-relaxed text-graphite mb-4">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 space-y-1.5 text-sm text-graphite mb-4">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 space-y-1.5 text-sm text-graphite mb-4">{children}</ol>
  ),
  strong: ({ children }) => <strong className="font-bold text-graphite">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      target={href?.startsWith('mailto:') ? undefined : '_blank'}
      rel={href?.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
      className="text-terracotta font-bold underline"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="border-warm-taupe my-6" />,
  code: ({ children }) => (
    <code className="bg-aged-paper px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4 border border-warm-taupe rounded-xl">
      <table className="w-full text-xs text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-aged-paper uppercase tracking-wider text-charcoal font-bold">
      {children}
    </thead>
  ),
  tr: ({ children }) => <tr className="border-t border-warm-taupe first:border-t-0">{children}</tr>,
  th: ({ children }) => <th className="p-3">{children}</th>,
  td: ({ children }) => <td className="p-3 align-top text-graphite">{children}</td>,

  blockquote: ({ children }) => {
    if (hasHeadingChild(children)) {
      // The conspicuous case. Bold, boxed, and warning-coloured — not a
      // subtlety, on purpose. This is the paragraph that Texas law requires
      // to catch a reasonable person's attention.
      return (
        <blockquote className="border-2 border-terracotta bg-terracotta/10 rounded-2xl px-5 py-4 my-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-6 h-6 text-terracotta shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm font-bold text-graphite leading-relaxed [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h3]:text-base [&_h3]:font-bold [&_h3]:uppercase [&_h3]:text-terracotta [&_h3]:mb-2">
              {children}
            </div>
          </div>
        </blockquote>
      );
    }

    // The ordinary case: a note, not a warning. Used for the "Draft — not
    // reviewed" guardrail and for plain informational asides.
    return (
      <blockquote className="border-l-4 border-olive/50 bg-olive/5 rounded-r-xl px-4 py-3 my-4">
        <div className="flex gap-2.5">
          <Info className="w-4 h-4 text-olive shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-graphite leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
            {children}
          </div>
        </div>
      </blockquote>
    );
  }
};

/**
 * Renders a legal document's body for reading on screen.
 *
 * Not a general-purpose Markdown viewer: the component list above exists
 * because this text was drafted with specific typographic weight in mind
 * (see legal/README.md on the express negligence doctrine), and a generic
 * renderer using the site's default paragraph styling for every element
 * would flatten that back out.
 */
export const MarkdownDocument: React.FC<Props> = ({ markdown }) => {
  const [remarkGfm, setRemarkGfm] = React.useState<
    (() => unknown) | null
  >(() => cachedRemarkGfm);

  React.useEffect(() => {
    if (remarkGfm) return;
    let cancelled = false;
    remarkGfmPromise.then((plugin) => {
      if (!cancelled) setRemarkGfm(() => plugin);
    });
    return () => {
      cancelled = true;
    };
  }, [remarkGfm]);

  return (
    <Suspense
      fallback={<p className="text-sm text-charcoal">Loading document…</p>}
    >
      {remarkGfm && (
        <ReactMarkdown remarkPlugins={[remarkGfm as never]} components={components}>
          {markdown}
        </ReactMarkdown>
      )}
    </Suspense>
  );
};
