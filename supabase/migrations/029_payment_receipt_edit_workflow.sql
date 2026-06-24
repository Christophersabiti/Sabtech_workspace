-- Payment receipt/edit workflow hardening
-- Reversed payments must not participate in invoice total calculations.
-- The invoice trigger sums payments where is_confirmed = true.

UPDATE payments
SET    is_confirmed = false
WHERE  status = 'reversed'
AND    is_confirmed = true;

UPDATE payments
SET    is_confirmed = true
WHERE  status = 'confirmed'
AND    is_confirmed = false;
