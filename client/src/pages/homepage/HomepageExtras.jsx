import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import CensoredText from "../../components/CensoredText";

// Two homepage sections added for the panel's revisions list
// (PLAN-panel-revisions.md, items 9 and 11).

// "How hiring works": the real hiring steps on PhilFreela, in order. Each line
// matches what the site does (job posts, AI best-fit ranking, projects, GCash
// payment records, blind ratings).
const HIRING_STEPS = [
  { icon: "bi-megaphone-fill", color: "orange", title: "Post a job", text: "A verified client posts the work, the budget, the start and due dates, and how many freelancers they need." },
  { icon: "bi-person-lines-fill", color: "cyan", title: "Freelancers apply", text: "Verified Filipino freelancers apply with a resume. PhilFreela's AI ranks them by best fit, but the client decides." },
  { icon: "bi-hand-thumbs-up-fill", color: "amber", title: "Hire", text: "The client hires one or more applicants, and a project starts for each. A client can also book a freelancer's offer directly." },
  { icon: "bi-chat-dots-fill", color: "emerald", title: "Work and chat", text: "Message, call and share files on the project. The freelancer sends the work by the due date." },
  { icon: "bi-wallet2", color: "orange", title: "Pay and confirm", text: "The client pays the freelancer directly and records it with the receipt. The freelancer confirms, and the work unlocks." },
  { icon: "bi-star-fill", color: "cyan", title: "Rate each other", text: "Both rate each other. Ratings stay hidden until both have rated, then build each person's track record." }
];

export function HowHiringWorks() {
  return (
    <section className="py-5" id="how-hiring-works">
      <div className="container">
        <div className="text-center mb-4">
          <h2 className="display-6 fw-bold text-white mb-2">How Hiring Works</h2>
          <p className="text-secondary mb-0">From a job post to a finished, paid and rated project, in six steps.</p>
        </div>
        <ol className="row g-4 list-unstyled mb-0">
          {HIRING_STEPS.map((step, index) => (
            <li key={step.title} className="col-12 col-md-6 col-lg-4">
              <div className="glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 d-flex gap-3">
                <div className={`category-icon ${step.color} flex-shrink-0`}>
                  <i className={`bi ${step.icon} fs-4`}></i>
                </div>
                <div>
                  <p className="text-secondary fs-8 fw-semibold text-uppercase mb-1">Step {index + 1}</p>
                  <h6 className="text-white fw-bold mb-1">{step.title}</h6>
                  <p className="text-secondary fs-7 mb-0">{step.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// "What clients say": up to 6 real ratings from clients who let PhilFreela show
// them (database function homepage_testimonials: 4-5 stars, 20+ characters,
// after the blind rating ends, first name only). Hidden until there is one.
export function ClientTestimonials() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let active = true;
    supabase.rpc("homepage_testimonials").then(({ data, error }) => {
      if (active && !error && Array.isArray(data)) setItems(data);
    });
    return () => { active = false; };
  }, []);

  if (!items.length) return null;

  return (
    <section className="py-5" id="client-testimonials">
      <div className="container">
        <div className="text-center mb-4">
          <h2 className="display-6 fw-bold text-white mb-2">What Clients Say</h2>
          <p className="text-secondary mb-0">Real ratings from clients after a finished project, shown with their permission.</p>
        </div>
        <div className="row g-4">
          {items.map((item, index) => (
            <div key={`${item.rated_at}-${index}`} className="col-12 col-md-6 col-lg-4">
              <figure className="glass-card rounded-4 p-4 h-100 border border-secondary border-opacity-25 mb-0 d-flex flex-column">
                <div className="text-warning mb-2" aria-label={`${item.stars} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((n) => <i key={n} className={`bi ${n <= item.stars ? "bi-star-fill" : "bi-star"} me-1`}></i>)}
                </div>
                <blockquote className="text-light fs-7 mb-3 flex-grow-1 text-break" style={{ whiteSpace: "pre-line" }}>
                  "<CensoredText text={item.feedback} />"
                </blockquote>
                <figcaption className="text-secondary fs-8">{item.first_name}, client</figcaption>
              </figure>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
