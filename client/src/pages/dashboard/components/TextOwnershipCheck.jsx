import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { checkTextOwnership } from "../../../lib/aiService";
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_CHARACTERS } from "../../../lib/portfolio";
import VerifiedBadge from "../../../components/VerifiedBadge";

// The Text tab of Check Ownership (watermarking step 6): paste text you found,
// or upload a TXT, DOCX or PDF file. The AI service first looks for the
// invisible code hidden in every sentence of PhilFreela documents; if it was
// removed (retyped, pasted as plain text), a text model looks for a document
// with nearly the same meaning.
export default function TextOwnershipCheck() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  // null = not checked yet; otherwise the AI service's answer.
  const [result, setResult] = useState(null);

  const handlePick = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still counts
    if (!picked) return;
    setResult(null);
    if (picked.size > MAX_DOCUMENT_BYTES) {
      setError("That file is too big (max 4 MB).");
      return;
    }
    setError("");
    setFile(picked);
  };

  const handleCheck = async () => {
    setChecking(true);
    setError("");
    setResult(null);
    try {
      setResult(await checkTextOwnership(file ? { file } : { text }));
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
        {file ? (
          <div className="d-flex align-items-center gap-2 p-3 rounded-3 border border-secondary border-opacity-25 bg-secondary bg-opacity-10">
            <i className="bi bi-file-earmark-text fs-4 text-info"></i>
            <span className="flex-grow-1 text-truncate fs-7 text-white">{file.name}</span>
            <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3" onClick={() => { setFile(null); setResult(null); }}>Remove</button>
          </div>
        ) : (
          <div>
            <textarea
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
              rows="7"
              placeholder="Paste the text you found here (even one sentence is enough)..."
              maxLength={MAX_DOCUMENT_CHARACTERS}
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); }}
            ></textarea>
            <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
              <span className="text-secondary fs-8">or</span>
              <input ref={fileInputRef} type="file" className="d-none" accept={DOCUMENT_ACCEPT} onChange={handlePick} />
              <button type="button" className="btn btn-sm btn-outline-info rounded-pill px-3" onClick={() => fileInputRef.current?.click()}>
                <i className="bi bi-upload me-1"></i> Upload a TXT, DOCX or PDF
              </button>
            </div>
          </div>
        )}
        <div>
          <button type="button" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white" onClick={handleCheck} disabled={(!file && !text.trim()) || checking}>
            {checking ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Checking...</> : "Check Ownership"}
          </button>
        </div>
        {error && <p className="text-danger fs-7 mb-0">{error}</p>}
      </div>

      {result && !result.found && (
        <div className="mt-4 p-4 rounded-4 border border-secondary border-opacity-25 bg-dark bg-opacity-50" style={{ maxWidth: 640 }}>
          <h5 className="text-white fw-bold mb-2"><i className="bi bi-question-circle text-warning me-2"></i>No PhilFreela document found</h5>
          <p className="text-secondary fs-7 mb-2">This could mean:</p>
          <ul className="text-secondary fs-7 mb-0">
            <li>it didn't come from PhilFreela, or</li>
            <li>it was rewritten heavily in other words, or</li>
            <li>the document it came from was deleted.</li>
          </ul>
        </div>
      )}

      {result?.found && (
        <div className="mt-4 p-4 rounded-4 border border-success border-opacity-50 bg-dark bg-opacity-50" style={{ maxWidth: 760 }}>
          <h5 className="text-white fw-bold mb-3">
            <i className="bi bi-patch-check-fill text-success me-2"></i>
            {result.is_you ? "This is your own writing" : `This is ${ownerName}'s writing`}
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
              <i className="bi bi-file-earmark-text me-2"></i>
              {result.document
                ? <>From their document <strong className="text-white">"{result.document.title}"</strong></>
                : "The document it came from has been deleted, but the hidden code still points to this freelancer."}
            </li>
            {result.uploaded_at && <li className="mb-1"><i className="bi bi-calendar3 me-2"></i>Posted on PhilFreela on {new Date(result.uploaded_at).toLocaleDateString()}</li>}
            <li>
              <i className="bi bi-fingerprint me-2"></i>
              {result.how === "code"
                ? "Found by its invisible code"
                : `No invisible code (it was removed), but the text is ${Math.round(result.similarity * 100)}% similar in meaning`}
            </li>
          </ul>
        </div>
      )}
    </>
  );
}
