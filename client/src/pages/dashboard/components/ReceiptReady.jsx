import { useState } from "react";
import { downloadPaymentReceipt, hasReceipt, receiptNumber } from "../../../lib/receiptPdf";
import { Busy } from "../../../components/Loaders";

// The "receipt ready" box under a confirmed payment (PLAN-payment-receipt.md).
// Shown to both the client and the freelancer, on the project page and on the
// chat payment card. Download PDF makes the receipt in the browser and saves it
// as a PDF file. Nothing shows for a payment that isn't confirmed yet.
//   payment: the row from the payments table
//   showToast(text): shows a problem if the receipt couldn't be made
export default function ReceiptReady({ payment, showToast }) {
  const [making, setMaking] = useState(false);
  if (!hasReceipt(payment)) return null;

  const handleDownload = async () => {
    setMaking(true);
    const problem = await downloadPaymentReceipt(payment);
    setMaking(false);
    showToast(problem || "Receipt downloaded. Look in your Downloads folder.");
  };

  return (
    <div
      className="d-flex flex-wrap align-items-center gap-3 p-3 rounded-3 border border-success border-opacity-50 bg-success bg-opacity-10 mt-2 mb-2"
      data-receipt-ready={receiptNumber(payment)}
    >
      <i className="bi bi-file-earmark-pdf-fill text-success fs-3 lh-1" aria-hidden="true"></i>
      <div className="flex-grow-1" style={{ minWidth: 170 }}>
        <strong className="text-white d-block fs-7">Receipt {receiptNumber(payment)} is ready</strong>
        <span className="text-white-50 fs-8">A PDF copy of this payment to keep, print or send.</span>
      </div>
      <button type="button" className="btn btn-success text-white rounded-pill px-3 fs-8 fw-bold" disabled={making} onClick={handleDownload}>
        {making ? <Busy>Making the PDF</Busy> : <><i className="bi bi-download me-1"></i> Download PDF</>}
      </button>
    </div>
  );
}
