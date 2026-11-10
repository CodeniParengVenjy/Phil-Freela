import { useEffect, useState } from "react";
import { listMyPurchases, purchaseNumber } from "../../../lib/purchases";
import { downloadPurchaseReceipt } from "../../../lib/receiptPdf";
import { formatPeso, receiptTime } from "../../../lib/payments";
import { Loader, Busy } from "../../../components/Loaders";

// Settings > Purchases (PLAN-payment-receipt.md, Step 4): what the person paid
// PhilFreela for online through Xendit (Premium, Featured posts, Community
// Billboard ads), newest first, each with a PDF receipt. Unpaid checkouts and
// free Featured posts are not listed, because nothing was charged.
//   userId: who is looking
//   showToast(text): says when a receipt couldn't be made
export default function PurchasesList({ userId, showToast }) {
  // undefined while loading, then the list.
  const [purchases, setPurchases] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  // The id of the purchase whose PDF is being made (one at a time).
  const [making, setMaking] = useState(null);

  useEffect(() => {
    let active = true;
    listMyPurchases(userId).then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError(error);
      else setPurchases(data);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const handleReceipt = async (purchase) => {
    setMaking(purchase.id);
    const problem = await downloadPurchaseReceipt(purchase, userId);
    setMaking(null);
    showToast(problem || "Receipt downloaded. Look in your Downloads folder.");
  };

  return (
    <>
      <p className="text-secondary fs-7 mb-3">
        What you paid PhilFreela for online: Premium, Featured posts and Community Billboard ads. Each one has a PDF receipt.
      </p>
      {loadError && <p className="text-danger fs-7 mb-0">{loadError}</p>}
      {!loadError && purchases === undefined && <Loader size="sm" label="Loading your purchases" />}
      {purchases?.length === 0 && (
        <p className="text-secondary fs-7 mb-0" data-no-purchases>
          No purchases yet. When you buy Premium, a Featured post or an ad, its receipt shows here.
        </p>
      )}
      {purchases?.length > 0 && (
        <div className="d-flex flex-column gap-2">
          {purchases.map((purchase) => (
            <div
              key={purchase.id}
              className="d-flex flex-wrap align-items-center gap-3 p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25"
              data-purchase={purchaseNumber(purchase)}
            >
              <i className={`bi ${purchase.icon} text-role fs-4 lh-1`} aria-hidden="true"></i>
              <div className="flex-grow-1" style={{ minWidth: 170 }}>
                <strong className="text-white d-block fs-7">{purchase.item}</strong>
                {purchase.detail && <span className="text-white-50 fs-8 d-block text-break">{purchase.detail[1]}</span>}
                <span className="text-secondary fs-8">
                  {formatPeso(purchase.amount)} · Paid {receiptTime(purchase.paid_at)}
                  {purchase.test_mode && <span className="badge bg-warning text-dark ms-2" title="Xendit test mode: no real money was charged">Test</span>}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-8 fw-bold"
                disabled={making !== null}
                onClick={() => handleReceipt(purchase)}
              >
                {making === purchase.id ? <Busy>Making the PDF</Busy> : <><i className="bi bi-file-earmark-pdf me-1"></i> Receipt (PDF)</>}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
