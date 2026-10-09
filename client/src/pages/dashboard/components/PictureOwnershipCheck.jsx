import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { checkOwnership } from "../../../lib/aiService";
import { shrinkImage } from "../../../lib/shrinkImage";
import { slideUrl } from "../../../lib/slides";
import VerifiedBadge from "../../../components/VerifiedBadge";
import MediaDropzone from "./MediaDropzone";

const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // shrunk before sending

// Stops the browser's "Save image as..." menu on the original.
const blockSaveMenu = (event) => event.preventDefault();

// The Picture tab of Check Ownership (watermarking step 4): upload a picture
// you found somewhere (a screenshot, a download, a repost) and the AI service
// reads the invisible code PhilFreela hides in every photo, to show whose
// work it is.
export default function PictureOwnershipCheck() {
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  // null = not checked yet; otherwise the AI service's answer.
  const [result, setResult] = useState(null);

  // A temporary link to the picture being checked, to show it next to the
  // original; freed when another picture is chosen.
  const pictureUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => {
    if (pictureUrl) URL.revokeObjectURL(pictureUrl);
  }, [pictureUrl]);

  const handleSelect = (picked) => {
    setResult(null);
    setError("");
    if (!picked) {
      setFile(null);
      setFileError("");
      return;
    }
    if (!PICTURE_TYPES.includes(picked.type)) {
      setFileError("Please choose a JPG, PNG, or WebP picture.");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFileError("Pictures must be 10 MB or smaller.");
      return;
    }
    setFileError("");
    setFile(picked);
  };

  const handleCheck = async () => {
    setChecking(true);
    setError("");
    setResult(null);
    try {
      setResult(await checkOwnership(await shrinkImage(file)));
    } catch (err) {
      setError(err.message);
    }
    setChecking(false);
  };

  const owner = result?.owner;
  const ownerName = owner?.full_name || (owner?.username ? `@${owner.username}` : "A freelancer");

  return (
    <>
      <div className="d-flex flex-column gap-3" style={{ maxWidth: 640 }}>
        <MediaDropzone
          file={file}
          onSelect={handleSelect}
          accept={PICTURE_TYPES.join(",")}
          prompt="Click to choose a picture"
          hint="JPG, PNG, or WebP, up to 10 MB."
          error={fileError}
        />
        <div>
          <button type="button" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white" onClick={handleCheck} disabled={!file || checking}>
            {checking ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Checking...</> : "Check Ownership"}
          </button>
          {checking && <p className="text-secondary fs-8 mb-0 mt-2">Reading the hidden code. This can take up to half a minute.</p>}
        </div>
        {error && <p className="text-danger fs-7 mb-0">{error}</p>}
      </div>

      {result && !result.found && (
        <div className="mt-4 p-4 rounded-4 border border-secondary border-opacity-25 bg-dark bg-opacity-50" style={{ maxWidth: 640 }}>
          <h5 className="text-white fw-bold mb-2"><i className="bi bi-question-circle text-warning me-2"></i>No PhilFreela watermark found</h5>
          <p className="text-secondary fs-7 mb-2">This could mean:</p>
          <ul className="text-secondary fs-7 mb-0">
            <li>it didn't come from PhilFreela, or</li>
            <li>it was changed too much (heavily cropped, edited, or filtered), or</li>
            <li>it's a very plain picture, or was posted before watermarks started, so it never had a code.</li>
          </ul>
        </div>
      )}

      {result?.found && (
        <div className="mt-4 p-4 rounded-4 border border-success border-opacity-50 bg-dark bg-opacity-50">
          <h5 className="text-white fw-bold mb-3">
            <i className="bi bi-patch-check-fill text-success me-2"></i>
            {result.is_you ? "This is your own work" : `This is ${ownerName}'s work`}
          </h5>

          <div className="d-flex flex-column flex-sm-row align-items-sm-center gap-3 mb-3">
            <div className="rounded-circle bg-success d-flex align-items-center justify-content-center text-white flex-shrink-0" style={{ width: 56, height: 56, fontSize: "1.6rem" }}>
              <i className="bi bi-person-fill"></i>
            </div>
            <div className="flex-grow-1">
              <p className="text-white fw-bold mb-0">
                {owner.full_name || "Freelancer"}
                <VerifiedBadge verified={owner.verified} showUnverified />
              </p>
              {owner.username && <p className="text-secondary fs-7 mb-0">@{owner.username}</p>}
            </div>
            <Link to={`/dashboard/freelancers/${owner.id}`} className="btn btn-outline-role rounded-pill px-4 fw-bold flex-shrink-0">
              <i className="bi bi-grid-3x3-gap-fill me-1"></i> View their portfolio
            </Link>
          </div>

          <ul className="list-unstyled text-secondary fs-7 mb-3">
            <li className="mb-1">
              <i className="bi bi-collection me-2"></i>
              {result.source
                ? <>From their {result.source.kind === "service" ? "service" : "portfolio project"} <strong className="text-white">"{result.source.title || "Untitled"}"</strong></>
                : "The post it came from has been deleted, but the hidden code still points to this freelancer."}
            </li>
            <li className="mb-1"><i className="bi bi-calendar3 me-2"></i>Posted on PhilFreela on {new Date(result.uploaded_at).toLocaleDateString()}</li>
            <li><i className="bi bi-fingerprint me-2"></i>{result.bits_matched} of the 48 hidden bits matched</li>
          </ul>

          <div className="row g-3">
            <div className="col-6">
              <p className="text-secondary fs-8 mb-1">Your picture</p>
              <img src={pictureUrl} alt="The picture you checked" className="w-100 rounded-3 border border-secondary border-opacity-25" style={{ maxHeight: 240, objectFit: "contain", background: "#000" }} />
            </div>
            {result.source?.file_path && (
              <div className="col-6">
                <p className="text-secondary fs-8 mb-1">The original on PhilFreela</p>
                <img
                  src={slideUrl(result.source.file_path)}
                  alt="The original on PhilFreela"
                  className="w-100 rounded-3 border border-secondary border-opacity-25"
                  style={{ maxHeight: 240, objectFit: "contain", background: "#000" }}
                  draggable={false}
                  onContextMenu={blockSaveMenu}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
