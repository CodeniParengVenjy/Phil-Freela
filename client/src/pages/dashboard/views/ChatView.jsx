import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

const initialMessages = [
  { from: "them", author: "Juan Cruz", time: "10:15 AM", text: "Hello Keanne! I reviewed your portfolio and video editing samples. We're very impressed!" },
  { from: "me", time: "10:18 AM", text: "Thank you so much! I'd love to help you edit your promotional advertisement." },
  { from: "them", author: "Juan Cruz", time: "10:20 AM", text: "Awesome! Do we have a deal?" }
];

export default function ChatView() {
  const { chatRecipient } = useOutletContext();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const streamRef = useRef(null);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { from: "me", time: timeStr, text }]);
    setDraft("");

    setTimeout(() => {
      setMessages((prev) => [...prev, {
        from: "them",
        author: chatRecipient,
        time: "Just now",
        text: "Got your message! Let's proceed with the project parameters."
      }]);
    }, 1200);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 border border-secondary border-opacity-25 overflow-hidden d-flex flex-column" style={{ height: 680 }}>
        <div className="chat-header p-3 bg-dark border-bottom border-secondary border-opacity-25 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-3">
            <button className="btn btn-sm btn-dark text-secondary" onClick={() => navigate("/dashboard/inbox")}>
              <i className="bi bi-arrow-left fs-5"></i>
            </button>
            <div className="avatar-circle bg-success text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: 40, height: 40 }}>
              <i className="bi bi-person-fill fs-5"></i>
            </div>
            <div>
              <h6 className="text-white fw-bold mb-0">{chatRecipient}</h6>
              <small className="text-success"><i className="bi bi-circle-fill fs-8"></i> Active Now</small>
            </div>
          </div>
          <div>
            <button className="btn btn-sm btn-outline-secondary text-white border-0"><i className="bi bi-telephone-fill fs-5"></i></button>
            <button className="btn btn-sm btn-outline-secondary text-white border-0"><i className="bi bi-camera-video-fill fs-5"></i></button>
          </div>
        </div>

        <div ref={streamRef} className="chat-body flex-grow-1 p-4 overflow-y-auto d-flex flex-column gap-3 bg-black bg-opacity-40">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`chat-bubble ${m.from === "me" ? "outgoing align-self-end bg-orange" : "incoming align-self-start bg-secondary bg-opacity-25"} p-3 rounded-4 max-w-500 text-white`}
            >
              <div className={`d-flex align-items-center gap-2 mb-1 ${m.from === "me" ? "justify-content-end" : ""}`}>
                {m.from === "them" && <strong className="fs-8 text-orange">{m.author}</strong>}
                <small className="fs-8 text-white-50">{m.time}</small>
              </div>
              <p className="mb-0 fs-7">{m.text}</p>
            </div>
          ))}
        </div>

        <div className="chat-footer p-3 bg-dark border-top border-secondary border-opacity-25">
          <form className="d-flex align-items-center gap-2" onSubmit={handleSubmit}>
            <button type="button" className="btn btn-dark text-secondary p-2"><i className="bi bi-paperclip fs-5"></i></button>
            <button type="button" className="btn btn-dark text-secondary p-2"><i className="bi bi-image fs-5"></i></button>
            <button type="button" className="btn btn-dark text-secondary p-2"><i className="bi bi-mic fs-5"></i></button>

            <input
              type="text"
              className="form-control bg-secondary bg-opacity-25 border-0 text-white rounded-pill px-4 py-2"
              placeholder="Type a message..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              required
            />

            <button type="submit" className="btn btn-gradient-orange rounded-circle p-2 text-white d-flex align-items-center justify-content-center" style={{ width: 42, height: 42 }}>
              <i className="bi bi-send-fill fs-5"></i>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
