import { useEffect } from "react";
import { createPortal } from "react-dom";

// Styled "are you sure you want to delete?" popup, in the same look and
// animation as the role-switch popup (it reuses the role-confirm-* CSS classes).
// It is rendered straight into <body> so it always covers the whole screen.
export default function DeleteConfirmDialog({ open, title, message, busy, onConfirm, onCancel }) {
  // Escape closes the popup, unless a delete is already in progress.
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 text-center"
        style={{ maxWidth: 420, width: "100%" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="role-confirm-icon bg-danger bg-opacity-25 text-danger rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 56, height: 56 }}>
          <i className="bi bi-trash3-fill fs-4"></i>
        </div>
        <h5 id="delete-dialog-title" className="fw-bold mb-2">{title}</h5>
        <p className="text-secondary fs-7 mb-4">{message}</p>
        <div className="d-flex gap-2 justify-content-center">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger rounded-pill px-4 py-2 fw-bold" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
