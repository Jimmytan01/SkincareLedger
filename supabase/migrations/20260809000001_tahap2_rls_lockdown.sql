-- Migration Tahap 2: Strict RLS & Privilege Lockdown
-- 1. Total lockout for role `anon` on all 14 core tables
-- 2. Restrict role `authenticated` to SELECT-only (no direct INSERT, UPDATE, or DELETE on tables)
-- 3. Ensure service_role and SECURITY DEFINER RPCs maintain full access

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'products',
    'batches',
    'stock_ledger',
    'stock_balance_cache',
    'orders',
    'order_items',
    'bundle_recipes',
    'bundles',
    'returns',
    'returns_claims',
    'opname_sessions',
    'opname_items',
    'anomalies',
    'processed_events'
  ];
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- 1. Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

    -- 2. Drop all existing RLS policies on the table to start clean
    FOR pol IN 
      SELECT policyname 
      FROM pg_policies 
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, tbl);
    END LOOP;

    -- 3. Revoke all privileges from anon role (Total Lockout for unauthenticated access)
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon;', tbl);

    -- 4. Grant SELECT-only to authenticated role
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated;', tbl);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated;', tbl);

    -- 5. Grant full access to service_role (used by Server Actions)
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', tbl);

    -- 6. Create RLS Policy for authenticated SELECT-only access
    EXECUTE format('
      CREATE POLICY "Allow authenticated SELECT only"
        ON public.%I
        FOR SELECT
        TO authenticated
        USING (true);
    ', tbl);

  END LOOP;
END $$;


-- Revoke all privileges on view product_stock_summary from anon, grant to authenticated and service_role
REVOKE ALL ON public.product_stock_summary FROM anon;
GRANT SELECT ON public.product_stock_summary TO authenticated, service_role;


-- Revoke execute on all functions from anon (Total RPC lockout for unauthenticated users)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Grant EXECUTE on all functions in schema public to authenticated and service_role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
