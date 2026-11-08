-- AI reads the GCash receipt, the last database part (see PLAN-receipt-ai.md).
-- Run this ONLY after the new website (the record window without a reference
-- box) is live: from then on a payment can be recorded only from a receipt the
-- AI service read, through record_receipt_payment() and
-- record_chat_receipt_payment() (supabase_receipt_check_schema.sql).
--
-- The browser may no longer call the old functions that take a typed amount and
-- reference number. They are not removed: the two new functions call the
-- five-value ones themselves (a function of the database owner may still use
-- them), so the short-payment rules (what is left to pay, tips) stay in one place.

revoke execute on function public.record_payment(uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.record_payment(uuid, numeric, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.record_chat_payment(uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.record_chat_payment(uuid, numeric, numeric, text, text) from public, anon, authenticated;
