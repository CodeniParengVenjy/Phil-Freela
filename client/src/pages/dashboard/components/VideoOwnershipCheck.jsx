import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { checkVideoOwnership } from "../../../lib/aiService";
import { MAX_VIDEO_BYTES, VIDEO_TYPES, isVideoFile, stageVideo, unstageVideo } from "../../../lib/slides";
import VerifiedBadge from "../../../components/VerifiedBadge";
import MediaDropzone from "./MediaDropzone";

// The Video tab of Check Ownership (watermarking step 7): upload a video you
// found. Every frame of a PhilFreela video carries the same invisible code,
// so the AI service reads 16 frames together to find it.
export default function VideoOwnershipCheck() {
  const { currentUserId } = useOutletContext();
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  // null = not checked yet; otherwise the AI service's answer.
  const [result, setResult] = useState(null);

  const handleSelect = (picked) => {
    setResult(null);
    setError("");
    if (!picked) {
      setFile(null);
      setFileError("");
      return;
    }
    if (!isVideoFile(picked)) {
      setFileError("Please choose an MP4, MOV or WebM video.");
      return;
    }
    if (picked.size > MAX_VIDEO_BYTES) {
      setFileError("Videos must be 50 MB or smaller.");
      return;
    }
    setFileError("");
    setFile(picked);
  };

  const handleCheck = async () => {
    setChecking(true);
    setError("");
    setResult(null);
    let videoPath = null;
    try {
      videoPath = await stageVideo(file, currentUserId);
      setResult(await checkVideoOwnership(videoPath));
    } catch (err) {
      if (videoPath) await unstageVideo(videoPath);
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
          accept={[...VIDEO_TYPES, ".mov"].join(",")}
          prompt="Click to choose a video"
          hint="MP4, MOV or WebM, up to 50 MB. Tip: a screenshot of any frame works with the Picture check too."
          error={fileError}
        />
        <div>
          <button type="button" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white" onClick={handleCheck} disabled={!file || checking}>
            {checking ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Checking...</> : "Check Ownership"}
          </button>
          {checking && <p className="text-secondary fs-8 mb-0 mt-2">Uploading the video and reading its hidden code. This can take up to a minute.</p>}
        </div>
        {error && <p className="text-danger fs-7 mb-0">{error}</p>}
      </div>

      {result && !result.found && (
        <div className="mt-4 p-4 rounded-4 border border-secondary border-opacity-25 bg-dark bg-opacity-50" style={{ maxWidth: 640 }}>
          <h5 className="text-white fw-bold mb-2"><i className="bi bi-question-circle text-warning me-2"></i>No PhilFreela watermark found</h5>
          <p className="text-secondary fs-7 mb-2">This could mean:</p>
          <ul className="text-secondary fs-7 mb-0">
            <li>it didn't come from PhilFreela, or</li>
            <li>it was changed too much (heavily edited, cropped, or filmed off a screen), or</li>
            <li>it was posted before video watermarks started, so it never had a code.</li>
          </ul>
        </div>
      )}

      {result?.found && (
        <div className="mt-4 p-4 rounded-4 border border-success border-opacity-50 bg-dark bg-opacity-50" style={{ maxWidth: 760 }}>
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
          <ul className="list-unstyled text-secondary fs-7 mb-0">
            <li className="mb-1">
              <i className="bi bi-collection me-2"></i>
              {result.source
                ? <>From their {result.source.kind === "service" ? "service" : "portfolio project"} <strong className="text-white">"{result.source.title || "Untitled"}"</strong></>
                : "The post it came from has been deleted, but the hidden code still points to this freelancer."}
            </li>
            <li className="mb-1"><i className="bi bi-calendar3 me-2"></i>Posted on PhilFreela on {new Date(result.uploaded_at).toLocaleDateString()}</li>
            <li><i className="bi bi-fingerprint me-2"></i>{result.bits_matched} of the 48 hidden bits matched (read from 16 frames together)</li>
          </ul>
        </div>
      )}
    </>
  );
}
