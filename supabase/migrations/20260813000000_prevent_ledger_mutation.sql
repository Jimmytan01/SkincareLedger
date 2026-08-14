-- Migration: Trigger Immutability Keras pada stock_ledger (Prevent UPDATE and DELETE)
-- Menolak SEMUA mutasi UPDATE/DELETE pada stock_ledger tanpa pengecualian, termasuk dari service_role

CREATE OR REPLACE FUNCTION public.prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'stock_ledger bersifat append-only. UPDATE/DELETE tidak diizinkan.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_ledger_update ON public.stock_ledger;
CREATE TRIGGER trg_prevent_ledger_update
BEFORE UPDATE ON public.stock_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_mutation();

DROP TRIGGER IF EXISTS trg_prevent_ledger_delete ON public.stock_ledger;
CREATE TRIGGER trg_prevent_ledger_delete
BEFORE DELETE ON public.stock_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_mutation();
