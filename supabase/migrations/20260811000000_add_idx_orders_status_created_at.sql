-- Migration: Add composite index on public.orders (status, created_at) for STALE_ORDER detection performance

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at 
ON public.orders (status, created_at);

-- Helper RPC function to run EXPLAIN ANALYZE on the exact STALE_ORDER query
CREATE OR REPLACE FUNCTION public.explain_stale_order_query(p_cutoff TEXT)
RETURNS TABLE (query_plan TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  SET LOCAL enable_seqscan = off;
  RETURN QUERY EXECUTE 'EXPLAIN ANALYZE SELECT id, marketplace_order_id, created_at, status FROM public.orders WHERE status = ''SHIPPED_IN_TRANSIT'' AND created_at < ' || quote_literal(p_cutoff);
END;
$$;

GRANT EXECUTE ON FUNCTION public.explain_stale_order_query TO authenticated, service_role;
