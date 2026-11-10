# Passport the AI can read (PLAN-passport-ai.md)

The user (2026-11-10): "can you make the passport detectable by an AI?", then chose
"Read the name on it" and said "passport passport" after the plan was shown.

## What it does

A PhilSys ID has a QR code the AI reads, and the name inside is compared with the
profile name (`id_qr.py`). A passport has no QR, but its photo page ends with two
lines of code (the MRZ, `P<PHLREYES<<MARIA<LUZ<<<<...`). The AI now reads the
first line, takes the name, and compares it with the profile name the same way.
The admin sees "Name matches the profile" or a warning in the AI summary.

It is a flag for the admin only: it never rejects anyone, and it cannot prove a
passport is real (that needs the chip's key). Only the name is kept; the passport
number, birthday and expiry date are never looked at.

## Files

- `ai-service/passport_mrz.py` (new): finds the first code line among the text rows
  read by the same pretrained reader as the resume and receipt checks
  (`resume_ocr.read_boxes`), takes the name, and uses `id_qr.names_match`.
  If the name does not match, the photo is read again at other sizes (1000 px,
  as it is, 700 px) and the admin is warned only when none match. A header with a
  dropped `<` is also tried.
- `ai-service/main.py`: a passport branch next to the PhilSys one in
  `handle_submission`; a crash only logs, it never blocks the user.
- `client/src/pages/admin/components/AiSummaryCard.jsx`: "Passport code lines" row.
- `client/src/lib/verification.js`: the "Check carefully" text names the code lines.
- `client/src/pages/dashboard/components/VerificationWizard.jsx`: a tip to keep the
  two code lines in the photo.
- `ai-service/test_passport_mrz.py` (new): 38 checks.

No database change: the existing `id_qr_status` (match / mismatch / unreadable /
not_found) and `id_qr_name` columns hold the result.

## Tested

- 38 of 38 in `test_passport_mrz.py` (rules on text, drawn passport pages read by
  the real reader, the re-reading at other sizes, and the submit step with a pretend
  database). `test_ephilid.py` 53 of 53 and `test_receipt_check.py` 66 of 66 still pass.
- By hand on 5 public specimen passport pages from Wikimedia Commons (Norwegian,
  Czech 2006 and 2005, Brazilian, Indonesian): the name was read and matched on 4.
  The Norwegian page only matched at the smaller size (at full size the reader dropped
  two `<` signs, which is why the re-reading exists). The Czech 2005 page, with a busy
  patterned background, was not found (the reader took `<` for K, S and A), which would
  be a "No code lines read" warning for the admin.

## Known limits

- Not yet tried on a real Philippine passport photo. Heavy blur or a busy background
  can turn `<` into letters, and the admin then gets a warning (never a rejection).
- A mismatch warning can also be the AI misreading small print; the admin card says so.
- A passport photographed sideways relies on the upright-turning step added for the
  ePhilID (it finds the face on the photo page).
