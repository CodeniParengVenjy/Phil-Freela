import { typeGcashNumber } from "../lib/payments";

// A GCash number box: it takes digits only, at most 11, spaced like 0917 123 4567
// as they are typed (lib/payments.js, typeGcashNumber). Letters and symbols never
// show up, and a pasted +63 917 123 4567 becomes 0917 123 4567. The caret stays
// after the digit it was after, so a digit in the middle can be fixed. Other props
// (id, className, placeholder, disabled...) go to the <input>.
//   value      what the box shows, kept by the parent
//   onChange   (value) => void, with the tidied value
export default function GcashNumberInput({ value, onChange, ...rest }) {
  const handleChange = (event) => {
    const input = event.target;
    const typed = input.value;
    const next = typeGcashNumber(typed, value);

    // How many digits were before the caret, less any the box did not keep.
    const digitsOf = (text) => text.replace(/\D/g, "").length;
    const dropped = digitsOf(typed) - digitsOf(next);
    const keep = Math.max(0, digitsOf(typed.slice(0, input.selectionStart ?? typed.length)) - dropped);
    let caret = 0;
    for (let seen = 0; caret < next.length && seen < keep; caret += 1) {
      if (/\d/.test(next[caret])) seen += 1;
    }

    // Writing the tidied value here (React then finds nothing to change) keeps the
    // caret where it is put, instead of jumping to the end.
    input.value = next;
    if (document.activeElement === input) input.setSelectionRange(caret, caret);
    onChange(next);
  };

  return <input type="text" inputMode="numeric" {...rest} value={value} onChange={handleChange} />;
}
