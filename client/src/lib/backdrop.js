// Closing a popup with a click on the dark layer around it (the backdrop).
//
// It only counts when the press starts AND ends on that dark layer itself. A
// press inside the box that was let go outside it (say, while selecting text
// to fix a typo) used to count as a click on the dark layer, and the popup
// closed with what was typed (the user's report, 2026-11-18).
//
// Use it on the backdrop element in place of its onClick:
//   <div className="role-confirm-backdrop" {...closeOnBackdrop(busy ? undefined : onClose)}>
// No onClose (while the popup is busy) = a click there does nothing.
//
// Mouse events, not pointer events: a tap on a phone fires all three at the
// spot that was tapped, so a tap on the dark layer still closes the popup.

// The backdrop the current press started on (only one press at a time).
let pressedOn = null;

export function closeOnBackdrop(onClose) {
  return {
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) pressedOn = event.currentTarget;
      // Pressed inside the box: forget an older press on this backdrop.
      // (A press in a popup opened over this one leaves this one alone.)
      else if (pressedOn === event.currentTarget) pressedOn = null;
    },
    onMouseUp: (event) => {
      // Let go inside the box after pressing on the dark layer: not a close.
      if (event.target !== event.currentTarget && pressedOn === event.currentTarget) pressedOn = null;
    },
    onClick: (event) => {
      const outside = event.target === event.currentTarget && pressedOn === event.currentTarget;
      if (pressedOn === event.currentTarget) pressedOn = null;
      if (outside && onClose) onClose(event);
    }
  };
}
