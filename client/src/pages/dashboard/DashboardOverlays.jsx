// Identical between the freelancer and client dashboards -- the image
// preview modal, the role-switch confirmation, and the toast notification --
// so both layouts share this instead of each keeping their own copy.
export default function DashboardOverlays({ preview, onClosePreview, toast, onCloseToast, roleConfirm, onResolveRoleConfirm }) {
  return (
    <>
      {roleConfirm.visible && (
        <div
          className="role-confirm-backdrop"
          style={{
            position: "fixed", inset: 0, zIndex: 1300,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
          }}
        >
          <div
            className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 text-center"
            style={{ maxWidth: 420, width: "100%" }}
          >
            <div className="role-confirm-icon bg-role-subtle text-role rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 56, height: 56 }}>
              <i className="bi bi-arrow-left-right fs-4"></i>
            </div>
            <h5 className="fw-bold mb-2">
              Switch to {roleConfirm.nextType === "client" ? "a Client" : "a Freelancer"} account?
            </h5>
            <p className="text-secondary fs-7 mb-4">
              {roleConfirm.nextType === "client"
                ? "You'll no longer be able to post new services, and your dashboard will change to the Client view."
                : "You'll no longer be able to post new projects, and your dashboard will change to the Freelancer view."}
            </p>
            <div className="d-flex gap-2 justify-content-center">
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={() => onResolveRoleConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" onClick={() => onResolveRoleConfirm(true)}>
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {preview.visible && (
        <div
          onClick={onClosePreview}
          style={{
            position: "fixed", inset: 0, zIndex: 1200,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
          }}
        >
          <div
            className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
            style={{ maxWidth: 640, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 pb-3 mb-3">
              <h5 className="fw-bold mb-0">{preview.title}</h5>
              <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={onClosePreview}></button>
            </div>
            <div className="text-center">
              <img src={preview.src} className="img-fluid rounded-3 shadow-2xl" style={{ maxHeight: 500 }} alt="Preview" />
            </div>
          </div>
        </div>
      )}

      <div className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1100 }}>
        <div className={`toast align-items-center text-white bg-orange border-0${toast.visible ? " show" : ""}`} role="alert">
          <div className="d-flex">
            <div className="toast-body fw-semibold fs-7">{toast.message}</div>
            <button type="button" className="btn-close btn-close-white me-2 m-auto" aria-label="Close" onClick={onCloseToast}></button>
          </div>
        </div>
      </div>
    </>
  );
}
