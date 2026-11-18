import CallDialog from "./CallDialog";
import MissingNameDialog from "./MissingNameDialog";
import WelcomeGuide from "./WelcomeGuide";
import { Busy } from "../../../components/Loaders";
import { closeOnBackdrop } from "../../../lib/backdrop";

// Identical between the freelancer and client dashboards -- the image
// preview modal, the toast notification, the
// opening guide, and the voice/video call window -- so both layouts share this
// instead of each keeping their own copy.
export default function DashboardOverlays({ preview, onClosePreview, toast, onCloseToast, nameMissing, userId, accountType, onNameSaved, onSignOut }) {
  return (
    <>
      {/* Ringing and call screens (the call itself lives in lib/calls.js). */}
      <CallDialog />

      {/* Someone with no name must add one before using the dashboard. */}
      {nameMissing && userId && <MissingNameDialog userId={userId} onSaved={onNameSaved} onSignOut={onSignOut} />}

      {/* The opening tour: opens by itself for a new account (after the name pop-up, if there is one). */}
      {userId && <WelcomeGuide userId={userId} accountType={accountType} blocked={nameMissing} />}

      {preview.visible && (
        <div
          {...closeOnBackdrop(onClosePreview)}
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
            <div className="toast-body fw-semibold fs-7">{toast.kind ? <Busy kind={toast.kind}>{toast.message}</Busy> : toast.message}</div>
            <button type="button" className="btn-close btn-close-white me-2 m-auto" aria-label="Close" onClick={onCloseToast}></button>
          </div>
        </div>
      </div>
    </>
  );
}
