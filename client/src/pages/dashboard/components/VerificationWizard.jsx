import { useState } from "react";
import { checkIdBack, checkIdFront } from "../../../lib/aiService";
import { ID_TYPES, idTypeHasBack } from "../../../lib/verification";
import FaceScan from "./FaceScan";
import PhotoPreview from "./PhotoPreview";
import WizardPhotoStep from "./WizardPhotoStep";

const EMPTY_SIDE = { file: null, status: "idle", message: "" };

// The identity verification form, one step per screen:
//   1. ID type  2. Front of ID  3. Back of ID (not for passports)
//   4. Face scan  5. Review and submit
// Each ID photo is checked by the AI service right away, and Next only works
// once the step passes. The AI service re-runs every check at Submit anyway.
//
//   mode:      "computer" (webcam or upload) or "phone" (phone camera)
//   token:     the QR link's token on the phone page (instead of a login)
//   onSubmit:  sends everything; throws an error with a readable message if it fails
//   phoneOption: shown next to Step 1 on a computer (the QR code for doing it on a phone)
export default function VerificationWizard({ mode, token, onSubmit, phoneOption }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [idType, setIdType] = useState("");
  const [front, setFront] = useState(EMPTY_SIDE);
  const [back, setBack] = useState(EMPTY_SIDE);
  // { straight, left, right } once the face scan is done.
  const [scan, setScan] = useState(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const needsBack = idTypeHasBack(idType);
  const isPassport = idType === "passport";
  const steps = ["type", "front", ...(needsBack ? ["back"] : []), "scan", "review"];
  const current = steps[stepIndex];
  const goTo = (name) => setStepIndex(steps.indexOf(name));

  const titles = {
    type: "Type of ID",
    front: isPassport ? "Photo page of your passport" : "Front of your ID",
    back: "Back of your ID",
    scan: "Face scan",
    review: "Review and submit"
  };

  const canGoNext = {
    type: Boolean(idType),
    front: front.status === "ok",
    back: back.status === "ok",
    scan: Boolean(scan)
  }[current];

  const handleTypeChange = (value) => {
    setIdType(value);
    // Passports have no card back, so a back photo taken earlier is dropped.
    if (!idTypeHasBack(value)) setBack(EMPTY_SIDE);
  };

  // Runs the instant check on the back (it needs the front, to make sure the
  // two aren't the same photo).
  const checkBack = async (frontFile, backFile) => {
    setBack({ file: backFile, status: "checking", message: "" });
    try {
      await checkIdBack(frontFile, backFile, token);
      setBack({ file: backFile, status: "ok", message: "" });
    } catch (err) {
      setBack({ file: backFile, status: "error", message: err.message });
    }
  };

  const handleFront = async (file) => {
    if (!file) return setFront(EMPTY_SIDE);
    setFront({ file, status: "checking", message: "" });
    try {
      await checkIdFront(file, token);
      setFront({ file, status: "ok", message: "" });
      // A new front means the back's "not the same photo" check must run again.
      if (back.file) checkBack(file, back.file);
    } catch (err) {
      setFront({ file, status: "error", message: err.message });
    }
  };

  const handleBack = (file) => (file ? checkBack(front.file, file) : setBack(EMPTY_SIDE));

  const handleScanDone = (frames) => {
    setScan(frames);
    goTo("review");
  };

  const handleSubmit = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      await onSubmit({
        idType,
        idPhoto: front.file,
        idBack: needsBack ? back.file : null,
        selfie: scan.straight,
        selfieLeft: scan.left,
        selfieRight: scan.right
      });
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  };

  // The review screen's photos, each with a way back to retake it.
  const reviewPhotos = [
    { label: titles.front, photo: front.file, step: "front" },
    ...(needsBack ? [{ label: titles.back, photo: back.file, step: "back" }] : []),
    { label: "Face scan: straight", photo: scan?.straight, step: "scan" },
    { label: "Face scan: turned", photo: scan?.left, step: "scan" },
    { label: "Face scan: turned", photo: scan?.right, step: "scan" }
  ];

  return (
    <div className="d-flex flex-column gap-4">
      {/* Progress: "Step 2 of 5" and a bar. */}
      <div>
        <div className="mb-2">
          <span className="text-secondary fs-8 fw-semibold">Step {stepIndex + 1} of {steps.length}</span>
        </div>
        <div className="progress bg-secondary bg-opacity-25" style={{ height: 6 }}>
          <div className="progress-bar bg-role" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}></div>
        </div>
      </div>

      <h5 className="text-white fw-bold mb-0">{titles[current]}</h5>

      {/* Step 1, with the phone option (QR code) beside it on a computer:
          below it on small screens. */}
      {current === "type" && (
        <div className="row g-4">
          <div className={phoneOption ? "col-md-7" : "col-12"}>
            <p className="text-secondary fs-7">Get a <span className="text-white fw-bold">Verified</span> badge by showing a government ID and doing a quick face scan. An admin reviews every request.</p>
            <label className="form-label text-white fw-semibold fs-7" htmlFor="wizardIdType">Which ID will you use?</label>
            <select
              id="wizardIdType"
              className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2"
              value={idType}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <option value="" disabled>Choose your ID</option>
              {ID_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          {phoneOption && <div className="col-md-5">{phoneOption}</div>}
        </div>
      )}

      {current === "front" && (
        <WizardPhotoStep
          mode={mode}
          instructions={isPassport
            ? "Take a photo of your passport's photo page. Let it fill most of the photo, keep it in focus, and avoid glare on your picture."
            : "Take a photo of the front of your ID. Let it fill most of the photo, keep it in focus, and avoid glare on your picture."}
          prompt={isPassport ? "Click to upload your passport's photo page" : "Click to upload the front of your ID"}
          cameraHint="Hold the ID close to the camera so your photo and name are clear."
          buttonText={isPassport ? "Take a photo of the photo page" : "Take a photo of the front"}
          side={front}
          onPhoto={handleFront}
        />
      )}

      {current === "back" && (
        <WizardPhotoStep
          mode={mode}
          instructions="Now turn your ID over and take a photo of the back. Make sure any QR code or barcode is clear."
          prompt="Click to upload the back of your ID"
          cameraHint="Turn the ID over and hold the back close to the camera."
          buttonText="Take a photo of the back"
          side={back}
          onPhoto={handleBack}
        />
      )}

      {current === "scan" && (
        scan ? (
          <div className="text-center">
            <p className="text-success fw-bold"><i className="bi bi-check-circle-fill me-1"></i>Face scan complete</p>
            <button type="button" className="btn btn-outline-role rounded-pill px-4 fw-bold" onClick={() => setScan(null)}>Scan again</button>
          </div>
        ) : (
          <>
            <p className="text-secondary fs-7 mb-0">Take off sunglasses, masks or hats, and find good light. Then follow the instructions: the scan takes the photos by itself.</p>
            <FaceScan onComplete={handleScanDone} />
          </>
        )
      )}

      {current === "review" && (
        <div className="d-flex flex-column gap-3">
          <p className="text-secondary fs-7 mb-0">Check your photos. Tap Retake on any that look wrong.</p>
          <div className="row g-3">
            {reviewPhotos.map((item, index) => (
              <div key={`${item.label}-${index}`} className="col-6 col-md-4">
                <div className="bg-dark bg-opacity-50 rounded-3 p-2 border border-secondary border-opacity-25 h-100 d-flex flex-column gap-2">
                  {item.photo && <PhotoPreview photo={item.photo} alt={item.label} />}
                  <span className="text-light-50 fs-8">{item.label}</span>
                  {/* One Retake button for the whole face scan. */}
                  {(item.step !== "scan" || index === reviewPhotos.findIndex((p) => p.step === "scan")) && (
                    <button type="button" className="btn btn-sm btn-outline-role rounded-pill fw-bold mt-auto" onClick={() => { if (item.step === "scan") setScan(null); goTo(item.step); }} disabled={submitting}>
                      Retake
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="form-check">
            <input id="wizardConsent" type="checkbox" className="form-check-input" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <label className="form-check-label text-light-50 fs-8" htmlFor="wizardConsent">
              I agree to let PhilFreela use my ID photos and face scan only to verify my identity, as allowed under the
              Data Privacy Act of 2012 (RA 10173). Only PhilFreela admins can see these photos.
            </label>
          </div>

          {submitError && <p className="text-warning fs-7 mb-0"><i className="bi bi-exclamation-triangle-fill me-1"></i>{submitError}</p>}
        </div>
      )}

      {/* Back / Next (or Submit on the last step). */}
      <div className="d-flex justify-content-between gap-2">
        <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 fw-bold" onClick={() => setStepIndex(stepIndex - 1)} disabled={stepIndex === 0 || submitting}>
          <i className="bi bi-arrow-left me-1"></i> Back
        </button>
        {current === "review" ? (
          <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white shadow-glow-role" onClick={handleSubmit} disabled={!consent || submitting}>
            {submitting ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Sending...</> : "Submit for verification"}
          </button>
        ) : (
          <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" onClick={() => setStepIndex(stepIndex + 1)} disabled={!canGoNext}>
            Next <i className="bi bi-arrow-right ms-1"></i>
          </button>
        )}
      </div>
    </div>
  );
}
