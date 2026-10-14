// The page numbers under a long list: Previous, 1 2 3 ... 12, Next.
// With many pages only the first, the last and the ones around the current page
// are shown, with "..." for the gaps, so the bar stays short on a phone.
// page starts at 1. onChange gets the page number that was clicked.
function pageItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  // Near either end, show a few more so the bar keeps the same width.
  if (page <= 3) [2, 3, 4].forEach((n) => wanted.add(n));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => wanted.add(n));

  const numbers = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const items = [];
  numbers.forEach((n, index) => {
    // A gap of one page is shown as the page itself instead of "...".
    if (index > 0 && n - numbers[index - 1] === 2) items.push(n - 1);
    else if (index > 0 && n - numbers[index - 1] > 2) items.push("gap");
    items.push(n);
  });
  return items;
}

export default function AdminPagination({ page, totalPages, onChange, label = "Pages" }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="admin-pagination" aria-label={label}>
      <button
        type="button"
        className="admin-page-btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <i className="bi bi-chevron-left"></i>
      </button>

      {pageItems(page, totalPages).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="admin-page-gap" aria-hidden="true">...</span>
        ) : (
          <button
            key={item}
            type="button"
            className={`admin-page-btn ${item === page ? "active" : ""}`}
            onClick={() => onChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        className="admin-page-btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <i className="bi bi-chevron-right"></i>
      </button>
    </nav>
  );
}
