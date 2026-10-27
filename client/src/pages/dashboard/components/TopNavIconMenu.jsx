import { useEffect, useRef } from "react";

// One round icon button in the top bar (the bell, the chat bubble) with its red
// number and the drop-down panel under it. Bootstrap opens and closes the panel
// (data-bs-toggle="dropdown", like the account menu beside it): a click outside
// it or on an item closes it, so does Escape, and opening one closes the other.
// onOpenChange(true / false) tells the list inside when it opens, so it loads
// the newest items only then.
export default function TopNavIconMenu({ icon, label, count, tour, onOpenChange, children }) {
  const buttonRef = useRef(null);

  // Bootstrap tells the button with its own events ("show.bs.dropdown" just
  // before the panel opens, "hidden.bs.dropdown" once it is closed).
  useEffect(() => {
    const button = buttonRef.current;
    const opened = () => onOpenChange(true);
    const closed = () => onOpenChange(false);
    button.addEventListener("show.bs.dropdown", opened);
    button.addEventListener("hidden.bs.dropdown", closed);
    return () => {
      button.removeEventListener("show.bs.dropdown", opened);
      button.removeEventListener("hidden.bs.dropdown", closed);
    };
  }, [onOpenChange]);

  return (
    <div className="dropdown">
      {/* (data-tour = the part the opening tour points at, components/WelcomeGuide.jsx) */}
      <button
        ref={buttonRef}
        type="button"
        data-tour={tour}
        className="topbar-icon-btn"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        aria-label={count > 0 ? `${label} (${count} unread)` : label}
        title={label}
      >
        <i className={`bi ${icon}`}></i>
        {/* Like Facebook: past 9 it just says 9+. */}
        {count > 0 && <span className="topbar-count">{count > 9 ? "9+" : count}</span>}
      </button>
      <div className="dropdown-menu dropdown-menu-end dropdown-menu-dark topbar-panel border border-secondary border-opacity-25 shadow-lg p-0">
        {children}
      </div>
    </div>
  );
}
