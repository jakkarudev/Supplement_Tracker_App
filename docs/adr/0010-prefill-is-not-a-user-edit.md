# A prefill is not a user edit

**Status**: Accepted

Opening Edit from Inventory loads a stored supplement into the form. The select component keeps a hidden native `<select>` inside its trigger and dispatches a bubbling `change` event whenever its controlled `value` prop changes, so that a surrounding native form sees the change. Until that select's content has been opened once, the hidden select has no options, the DOM write is a no-op, and the event carries an empty string. The form wired `onValueChange` straight to the field setter, so the prefill itself read back as an empty selection: Form blanked whenever the stored form differed from the default, Dosage blanked for solid forms, and a limited course's Course length blanked. A second path blanked Dosage for Liquid and Powder, where Dosage is a number input rather than a select: an effect compared the watched form value between renders and treated the prefill as a change of form.

The rule now is that a programmatic prefill is not a user edit. A control that writes to form state accepts only a value a user could have produced — the Form and Dosage selects ignore an empty value, because neither field can legitimately be blank — and behaviour that exists to react to a change of form lives in that control's change handler, where it only ever sees a real selection, rather than in an effect comparing successive renders. Stored values stay authoritative over form defaults, and a blank form field must never be saved over a stored value.

## Considered options

- **Guard the comparison effect instead of the controls**: rejected. The stray empty write still reaches form state for the other selects, and the effect still cannot tell a prefill from a user edit.
- **Rely on a newer version of the select library**: rejected as the only fix, though worth having. Upstream stopped bubbling a programmatic change in 2.4.0 (October 2026), which removes the event at its source for this repo's pinned 2.2.6. It is still not sufficient alone: a controlled value with no matching item can report empty upstream (radix-ui/primitives#2817, open), which is exactly the shape of a value set before its options are collected, and a fix for this form must not depend on library internals that carry no contract.
- **Replace the selects with native `<select>` elements or another component**: rejected. It trades the form's shared control rendering for a bug the guard closes, and the hazard would return with any component that mirrors a controlled value into a hidden input.

## Consequences

- Every select in the supplement form carries the same guard, so a future control that legitimately offers an empty choice cannot reuse the condition as-is.
- If the library stops dispatching the empty change, the guard stays correct and simply stops being load-bearing.
- The option list for a solid dosage is no longer closed: a stored dosage outside it is carried in as the current selection so the record can be saved unchanged, and dropped again once the user picks from the fixed list.
