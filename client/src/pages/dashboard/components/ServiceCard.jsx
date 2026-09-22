import { getCategory } from "../../../lib/categories";

const mediaBox = { width: 64, height: 64 };

// One posted service as a row: its photo or video (or the category icon when it
// has none), title, category, price and date. Pass onDelete to show a Delete button.
export default function ServiceCard({ service, onDelete }) {
  const category = getCategory(service.category);

  return (
    <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 d-flex gap-3 align-items-center">
      {service.image_url ? (
        service.media_type === "video"
          ? <video src={`${service.image_url}#t=0.1`} muted preload="metadata" className="rounded-3 flex-shrink-0" style={{ ...mediaBox, objectFit: "cover" }} />
          : <img src={service.image_url} alt="" className="rounded-3 flex-shrink-0" style={{ ...mediaBox, objectFit: "cover" }} />
      ) : (
        <div className="rounded-3 flex-shrink-0 bg-role-subtle text-role d-flex align-items-center justify-content-center fs-3" style={mediaBox}>
          <i className={`bi ${category.icon}`}></i>
        </div>
      )}

      <div className="flex-grow-1 overflow-hidden">
        <h6 className="text-white fw-bold mb-1 text-truncate">{service.title}</h6>
        <span className="badge bg-role text-white fs-8 mb-2 d-inline-block text-truncate mw-100">{category.label}</span>
        <p className="text-secondary fs-8 mb-0">
          {service.price ? `Starting at ₱${Number(service.price).toLocaleString()}` : "Price on request"} • {new Date(service.created_at).toLocaleDateString()}
        </p>
      </div>

      {onDelete && (
        <button
          type="button"
          className="btn btn-sm btn-outline-danger rounded-circle flex-shrink-0 d-flex align-items-center justify-content-center"
          style={{ width: 36, height: 36 }}
          aria-label={`Delete ${service.title}`}
          onClick={() => onDelete(service)}
        >
          <i className="bi bi-trash3-fill"></i>
        </button>
      )}
    </div>
  );
}
