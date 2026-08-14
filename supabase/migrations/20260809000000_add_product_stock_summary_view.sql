-- Migration: Add product_stock_summary view and get_product_availability RPC for SQL-side stock aggregation

-- 1. Create SQL View for product stock summary (Physical Qty, Reserved Qty, Available Qty)
CREATE OR REPLACE VIEW public.product_stock_summary AS
SELECT 
  p.id AS product_id,
  p.sku,
  p.name,
  COALESCE(s.physical_qty, 0)::INT AS physical_qty,
  COALESCE(r.reserved_qty, 0)::INT AS reserved_qty,
  GREATEST(0, COALESCE(s.physical_qty, 0) - COALESCE(r.reserved_qty, 0))::INT AS available_qty
FROM public.products p
LEFT JOIN (
  SELECT product_id, SUM(qty) AS physical_qty
  FROM public.stock_balance_cache
  GROUP BY product_id
) s ON s.product_id = p.id
LEFT JOIN (
  SELECT oi.product_id, SUM(oi.qty) AS reserved_qty
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.status = 'CREATED'
  GROUP BY oi.product_id
) r ON r.product_id = p.id;

-- Grant permissions to view
GRANT SELECT ON public.product_stock_summary TO authenticated, service_role, anon;

-- 2. Create RPC function for querying product availability directly
DROP FUNCTION IF EXISTS public.get_product_availability(uuid);
DROP FUNCTION IF EXISTS public.get_product_availability;

CREATE OR REPLACE FUNCTION public.get_product_availability(p_product_id UUID DEFAULT NULL)
RETURNS TABLE (
  product_id UUID,
  sku TEXT,
  name TEXT,
  physical_qty INT,
  reserved_qty INT,
  available_qty INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    v.product_id,
    v.sku,
    v.name,
    v.physical_qty,
    v.reserved_qty,
    v.available_qty
  FROM public.product_stock_summary v
  WHERE p_product_id IS NULL OR v.product_id = p_product_id
  ORDER BY v.sku;
$$;
