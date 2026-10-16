import React, { useCallback, useEffect, useRef } from 'react';

/**
 * The behaviour every overlay on this site needs and none of them had all of.
 *
 * Four overlays were written independently — the RSVP modal, the contact form,
 * the search palette and the gallery lightbox — and each ended up with a
 * different subset: search had Escape and click-outside, the lightbox had
 * Escape only, RSVP and contact had neither, and none of the four announced
 * itself as a dialog, trapped focus or stopped the page scrolling underneath.
 * Written four more times it would drift four more ways, so it lives here
 * once, the same way usePrintPortal owns the printing rules.
 *
 * This hook is deliberately behaviour-only and renders nothing: three of the
 * overlays share a panel and use ModalShell on top of it, but the lightbox is
 * full-bleed black with its controls outside the panel, and forcing it into
 * the same markup would buy nothing.
 */

interface UseDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  /** id of the element naming this dialog — its title, usually. */
  labelledBy?: string;
  /** Off while a submission is in flight, or on a confirmation screen. */
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /**
   * Whether to move focus into the panel on open. Leave it on unless the
   * consumer focuses something of its own (the search input, say).
   */
  moveFocus?: boolean;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/*
 * Scroll locking is refcounted because these overlays are mounted at the App
 * root and can genuinely overlap — the search palette opens over the gallery
 * lightbox via a result click. Without the count, closing the first one would
 * hand the page back its scrollbar while the second is still up.
 */
let openDialogs = 0;
let restoreOverflow = '';
let restorePaddingRight = '';

const lockBodyScroll = () => {
  if (openDialogs++ > 0) return;

  const {body} = document;
  restoreOverflow = body.style.overflow;
  restorePaddingRight = body.style.paddingRight;

  // Removing the scrollbar makes the viewport wider, which slides the fixed
  // navbar and every centred section sideways as the dialog opens. Pad by
  // exactly the width that disappeared.
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  body.style.overflow = 'hidden';
};

const unlockBodyScroll = () => {
  openDialogs = Math.max(0, openDialogs - 1);
  if (openDialogs > 0) return;

  document.body.style.overflow = restoreOverflow;
  document.body.style.paddingRight = restorePaddingRight;
};

/*
 * Which dialog is on top, for Escape.
 *
 * Every open dialog listens on `window`, so one press used to reach all of
 * them: opening an event's poster over its details and pressing Escape shut
 * both, landing the reader back on the page instead of the event they were
 * reading. Escape should undo one step, so only the last one opened answers.
 *
 * Dialogs that do not close on Escape still take their place in the stack —
 * being on top is what makes them shield the one underneath, whether or not
 * they choose to close themselves.
 */
const dialogStack: object[] = [];

export const useDialog = ({
  isOpen,
  onClose,
  labelledBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  moveFocus = true,
}: UseDialogOptions) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<Element | null>(null);
  // Identity only — this hook's seat in the stack above.
  const token = useRef({}).current;

  // Lock the page, remember where focus came from, and give it back on close.
  useEffect(() => {
    if (!isOpen) return;

    returnFocusTo.current = document.activeElement;
    lockBodyScroll();
    dialogStack.push(token);

    // Once, on open — not on every render. The RSVP modal re-renders on each
    // keystroke and changes step four times; re-focusing here would yank the
    // caret out of the field being typed into.
    if (moveFocus) panelRef.current?.focus({preventScroll: true});

    return () => {
      const seat = dialogStack.lastIndexOf(token);
      if (seat !== -1) dialogStack.splice(seat, 1);

      unlockBodyScroll();
      const target = returnFocusTo.current;
      if (target instanceof HTMLElement && document.contains(target)) {
        target.focus({preventScroll: true});
      }
    };
  }, [isOpen, moveFocus, token]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Read at press time, not at subscribe time: a dialog opened over this
      // one after the listener was attached is the one that should answer.
      if (dialogStack[dialogStack.length - 1] !== token) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeOnEscape, onClose, token]);

  // Tab and Shift+Tab wrap inside the panel. Without this, tabbing past the
  // last control walks into the page behind the dialog, which a sighted mouse
  // user never notices and a keyboard user cannot get back out of.
  const onPanelKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const onBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      // Only a click on the backdrop itself — not one that bubbled up from
      // inside the panel, and not the tail of a drag that started on a caption.
      if (closeOnBackdrop && event.target === event.currentTarget) onClose();
    },
    [closeOnBackdrop, onClose]
  );

  return {
    backdropProps: {
      onClick: onBackdropClick,
    },
    panelProps: {
      ref: panelRef,
      role: 'dialog' as const,
      'aria-modal': true,
      'aria-labelledby': labelledBy,
      // Lets the panel itself hold focus on open, so a screen reader announces
      // the dialog rather than starting inside its first form field.
      tabIndex: -1,
      onKeyDown: onPanelKeyDown,
    },
  };
};
