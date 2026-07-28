import React from 'react';
import { useDialog } from '../lib/useDialog';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  /** id of this dialog's heading. Rendered by the caller, named here. */
  labelledBy: string;
  /** Off while a submission is in flight or on a confirmation screen. */
  closeOnBackdrop?: boolean;
  /** Leave off when the caller focuses a field of its own on open. */
  moveFocus?: boolean;
  /** Backdrop layout — where the panel sits. Defaults to centred. */
  backdropClassName?: string;
  /** Panel layout — width, height, overflow. The surface is fixed below. */
  panelClassName?: string;
  /** Runs after the focus trap, for panel-level keys of the caller's own. */
  onKeyDown?: (event: React.KeyboardEvent) => void;
  children: React.ReactNode;
}

/**
 * The parchment panel shared by the RSVP, contact and search dialogs.
 *
 * Its job is only the surface and the layout; every behaviour comes from
 * useDialog, so a fix there reaches all three. The gallery lightbox is not a
 * consumer — it is full-bleed black with its controls outside the panel, and
 * calls useDialog directly instead.
 *
 * The three used to drift: three backdrop opacities, two corner radii, two
 * shadows, and an entrance animation on one of them. They are settled here.
 * The shadow is the `--shadow-modal` token from index.css, which had been
 * declared since the theme was written and never used — the RSVP modal
 * carried its own near-identical copy inline.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  labelledBy,
  closeOnBackdrop = true,
  moveFocus = true,
  backdropClassName = 'items-center justify-center',
  panelClassName = 'max-w-lg w-full',
  onKeyDown,
  children,
}) => {
  const {backdropProps, panelProps} = useDialog({
    isOpen,
    onClose,
    labelledBy,
    closeOnBackdrop,
    moveFocus,
  });

  if (!isOpen) return null;

  return (
    <div
      {...backdropProps}
      className={`fixed inset-0 z-50 flex p-4 bg-black/70 backdrop-blur-sm animate-fadeIn ${backdropClassName}`}
    >
      <div
        {...panelProps}
        onKeyDown={(event) => {
          panelProps.onKeyDown(event);
          onKeyDown?.(event);
        }}
        className={`bg-[#FDFBF7] rounded-[28px] border border-[#E5E0D8] shadow-modal text-[#2A2A2A] relative outline-none animate-scaleUp ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
