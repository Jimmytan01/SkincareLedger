-- Migration: Full Database Schema, Indexes, Triggers, and RPC Functions for Sistem Rekonsiliasi Stok

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.reason_code_enum AS ENUM (
    'SALE', 'BONUS', 'PROMO', 'SAMPLE', 'DAMAGED', 'EXPIRED',
    'RETURN_IN', 'OPNAME_CORRECTION', 'MANUAL_CORRECTION',
    'CANCEL_REVERSAL', 'OPENING_BALANCE', 'STOCK_IN'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.channel_enum AS ENUM ('SHOPEE', 'TIKTOK', 'OFFLINE', 'INTERNAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.return_condition_enum AS ENUM ('LAYAK_JUAL', 'DAMAGED', 'LOST');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.return_status_enum AS ENUM ('PENDING_INSPECTION', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status_enum AS ENUM ('CREATED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.anomaly_type_enum AS ENUM ('STALE_ORDER', 'MISSING_LEDGER', 'NEGATIVE_BATCH');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ============================================================================
-- 2. TABLES DEFINITIONS
-- ============================================================================

-- Master Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Master Batches Table
CREATE TABLE IF NOT EXISTS public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_code TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Immutable Append-Only Stock Ledger
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_id UUID NOT NULL REFERENCES public.batches(id),
  qty_delta INT NOT NULL,
  reason_code public.reason_code_enum NOT NULL,
  channel public.channel_enum NOT NULL,
  source_type TEXT NOT NULL,
  source_ref_id TEXT NOT NULL,
  reference_note TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast O(1) Balance Cache Table
CREATE TABLE IF NOT EXISTS public.stock_balance_cache (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  qty INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, batch_id)
);

-- Marketplace Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_order_id TEXT UNIQUE NOT NULL,
  channel public.channel_enum NOT NULL,
  status public.order_status_enum NOT NULL DEFAULT 'CREATED',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Order Line Items
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty INT NOT NULL,
  is_bundle_component BOOLEAN DEFAULT false,
  parent_bundle_sku TEXT
);

-- Bundle Recipes Versioning Table
CREATE TABLE IF NOT EXISTS public.bundle_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_sku TEXT NOT NULL,
  version INT NOT NULL,
  component_product_id UUID NOT NULL REFERENCES public.products(id),
  qty INT NOT NULL,
  effective_from TIMESTAMPTZ DEFAULT now()
);

-- Master Bundles Entity (Active Status Flag)
CREATE TABLE IF NOT EXISTS public.bundles (
  bundle_sku TEXT PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Returns Table
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id),
  qty_requested INT NOT NULL,
  reason TEXT,
  status public.return_status_enum NOT NULL DEFAULT 'PENDING_INSPECTION',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Returns Physical Inspection Claims
CREATE TABLE IF NOT EXISTS public.returns_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  condition public.return_condition_enum NOT NULL,
  qty INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Stock Opname Sessions Table
CREATE TABLE IF NOT EXISTS public.opname_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_by UUID,
  started_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Stock Opname Physical Item Lines
CREATE TABLE IF NOT EXISTS public.opname_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opname_session_id UUID NOT NULL REFERENCES public.opname_sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_id UUID NOT NULL REFERENCES public.batches(id),
  physical_qty INT NOT NULL,
  system_qty INT NOT NULL,
  difference_qty INT NOT NULL,
  notes TEXT
);

-- Daily Reconciliation Anomaly Worklist Table
CREATE TABLE IF NOT EXISTS public.anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.anomaly_type_enum NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  reference_id TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Ingestion Event Idempotency Tracking Table
CREATE TABLE IF NOT EXISTS public.processed_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- 3. INDEXES FOR PERFORMANCE & SCALE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_stock_ledger_product ON public.stock_ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_batch ON public.stock_ledger(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_created_at ON public.stock_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_source_ref ON public.stock_ledger(source_ref_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_channel ON public.stock_ledger(channel);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_reason ON public.stock_ledger(reason_code);

CREATE INDEX IF NOT EXISTS idx_orders_marketplace_id ON public.orders(marketplace_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_bundle_recipes_sku ON public.bundle_recipes(bundle_sku);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON public.anomalies(status);


-- ============================================================================
-- 4. BALANCE CACHE TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_update_stock_balance_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.stock_balance_cache (product_id, batch_id, qty, updated_at)
  VALUES (NEW.product_id, NEW.batch_id, NEW.qty_delta, now())
  ON CONFLICT (product_id, batch_id)
  DO UPDATE SET
    qty = public.stock_balance_cache.qty + EXCLUDED.qty,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_stock_balance_cache ON public.stock_ledger;
CREATE TRIGGER trg_update_stock_balance_cache
  AFTER INSERT ON public.stock_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_stock_balance_cache();


-- ============================================================================
-- 5. RPC FUNCTIONS
-- ============================================================================

-- RPC 1: FEFO Stock Allocation (process_stock_out_fefo)
DROP FUNCTION IF EXISTS public.process_stock_out_fefo(uuid, integer, text, text, text, text, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS public.process_stock_out_fefo(uuid, integer, text, text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.process_stock_out_fefo;

CREATE OR REPLACE FUNCTION public.process_stock_out_fefo(
  p_product_id UUID,
  p_qty_needed INT,
  p_reason_code TEXT,
  p_channel TEXT,
  p_source_type TEXT,
  p_source_ref_id TEXT,
  p_created_by UUID DEFAULT NULL,
  p_reference_note TEXT DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining_qty INT := p_qty_needed;
  v_batch RECORD;
  v_take_qty INT;
  v_allocations JSONB := '[]'::jsonb;
  v_entry_timestamp TIMESTAMPTZ;
  v_reason_enum public.reason_code_enum;
  v_channel_enum public.channel_enum;
BEGIN
  IF p_qty_needed <= 0 THEN
    RAISE EXCEPTION 'qty_needed must be > 0';
  END IF;

  -- Validate reason_code for BONUS, PROMO, SAMPLE reference_note requirement (Rule #9)
  IF p_reason_code IN ('BONUS', 'PROMO', 'SAMPLE') THEN
    IF p_reference_note IS NULL OR trim(p_reference_note) = '' THEN
      RAISE EXCEPTION 'Catatan referensi (reference_note) wajib diisi untuk reason code %', p_reason_code;
    END IF;
  END IF;

  v_reason_enum := p_reason_code::public.reason_code_enum;
  v_channel_enum := p_channel::public.channel_enum;
  v_entry_timestamp := COALESCE(p_created_at, now());

  -- Iterate through available batches ordered by expiry_date ASC (FEFO)
  FOR v_batch IN 
    SELECT b.id AS batch_id, COALESCE(c.qty, 0) AS current_qty
    FROM public.batches b
    LEFT JOIN public.stock_balance_cache c ON c.batch_id = b.id AND c.product_id = p_product_id
    WHERE b.product_id = p_product_id AND COALESCE(c.qty, 0) > 0
    ORDER BY b.expiry_date ASC, b.created_at ASC
  LOOP
    IF v_remaining_qty <= 0 THEN
      EXIT;
    END IF;

    v_take_qty := LEAST(v_remaining_qty, v_batch.current_qty);

    -- Insert atomically into stock_ledger with v_entry_timestamp AT INSERT TIME
    INSERT INTO public.stock_ledger (
      product_id,
      batch_id,
      qty_delta,
      reason_code,
      channel,
      source_type,
      source_ref_id,
      created_by,
      reference_note,
      idempotency_key,
      created_at
    ) VALUES (
      p_product_id,
      v_batch.batch_id,
      -v_take_qty,
      v_reason_enum,
      v_channel_enum,
      p_source_type,
      p_source_ref_id,
      p_created_by,
      p_reference_note,
      p_source_ref_id || '-' || v_batch.batch_id || '-' || p_reason_code || '-' || extract(epoch from v_entry_timestamp)::text,
      v_entry_timestamp
    );

    v_allocations := v_allocations || jsonb_build_object('batch_id', v_batch.batch_id, 'qty', v_take_qty);
    v_remaining_qty := v_remaining_qty - v_take_qty;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    RAISE EXCEPTION 'Stok tidak mencukupi. Kurang % unit untuk produk %', v_remaining_qty, p_product_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'allocations', v_allocations);
END;
$$;


-- RPC 2: Marketplace Order Cancellation Reversal (process_marketplace_cancel)
DROP FUNCTION IF EXISTS public.process_marketplace_cancel(text, text, uuid, timestamptz);
DROP FUNCTION IF EXISTS public.process_marketplace_cancel(text, text, uuid);
DROP FUNCTION IF EXISTS public.process_marketplace_cancel;

CREATE OR REPLACE FUNCTION public.process_marketplace_cancel(
  p_order_id TEXT,
  p_channel TEXT,
  p_created_by UUID DEFAULT NULL,
  p_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry RECORD;
  v_entry_timestamp TIMESTAMPTZ;
  v_channel_enum public.channel_enum;
  v_reversed_count INT := 0;
BEGIN
  v_channel_enum := p_channel::public.channel_enum;
  v_entry_timestamp := COALESCE(p_created_at, now());

  FOR v_entry IN
    SELECT product_id, batch_id, qty_delta
    FROM public.stock_ledger
    WHERE source_type = 'MARKETPLACE_ORDER' 
      AND source_ref_id = p_order_id 
      AND reason_code = 'SALE'
  LOOP
    INSERT INTO public.stock_ledger (
      product_id,
      batch_id,
      qty_delta,
      reason_code,
      channel,
      source_type,
      source_ref_id,
      created_by,
      idempotency_key,
      created_at
    ) VALUES (
      v_entry.product_id,
      v_entry.batch_id,
      ABS(v_entry.qty_delta),
      'CANCEL_REVERSAL'::public.reason_code_enum,
      v_channel_enum,
      'MARKETPLACE_ORDER',
      p_order_id,
      p_created_by,
      'CANCEL-' || p_order_id || '-' || v_entry.batch_id || '-' || extract(epoch from v_entry_timestamp)::text,
      v_entry_timestamp
    );

    v_reversed_count := v_reversed_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'reversed_entries', v_reversed_count);
END;
$$;


-- RPC 3: Return Physical Inspection Processing (process_return_inspection)
DROP FUNCTION IF EXISTS public.process_return_inspection(uuid, uuid, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.process_return_inspection;

CREATE OR REPLACE FUNCTION public.process_return_inspection(
  p_return_id UUID,
  p_product_id UUID,
  p_channel TEXT,
  p_items JSONB,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_return RECORD;
  v_item JSONB;
  v_condition_text TEXT;
  v_condition_enum public.return_condition_enum;
  v_qty INT;
  v_total_qty INT := 0;
  v_ret_batch_code TEXT;
  v_ret_batch_id UUID;
  v_expiry_date DATE;
  v_channel_enum public.channel_enum;
  v_idemp_key TEXT;
BEGIN
  SELECT id, order_id, order_item_id, qty_requested, status
  INTO v_return
  FROM public.returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retur dengan ID % tidak ditemukan', p_return_id;
  END IF;

  IF v_return.status != 'PENDING_INSPECTION' THEN
    RAISE EXCEPTION 'Retur % sudah diproses sebelumnya (status: %)', p_return_id, v_return.status;
  END IF;

  v_channel_enum := p_channel::public.channel_enum;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := (v_item->>'qty')::INT;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Qty inspeksi harus > 0';
    END IF;
    v_total_qty := v_total_qty + v_qty;
  END LOOP;

  IF v_total_qty != v_return.qty_requested THEN
    RAISE EXCEPTION 'Total qty inspeksi (%) tidak cocok dengan qty retur (%)', v_total_qty, v_return.qty_requested;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_condition_text := v_item->>'condition';
    v_condition_enum := v_condition_text::public.return_condition_enum;
    v_qty := (v_item->>'qty')::INT;

    IF v_condition_text = 'LAYAK_JUAL' THEN
      v_ret_batch_code := 'RET-' || substring(p_return_id::text from 1 for 8) || '-' || extract(epoch from now())::bigint;

      IF (v_item->>'isUnknownExpiry')::boolean IS TRUE OR (v_item->>'expiryDate') IS NULL OR trim(v_item->>'expiryDate') = '' THEN
        v_expiry_date := (CURRENT_DATE + INTERVAL '1 year')::DATE;
      ELSE
        v_expiry_date := (v_item->>'expiryDate')::DATE;
      END IF;

      INSERT INTO public.batches (product_id, batch_code, expiry_date)
      VALUES (p_product_id, v_ret_batch_code, v_expiry_date)
      RETURNING id INTO v_ret_batch_id;

      v_idemp_key := 'RET-IN-' || p_return_id || '-' || v_ret_batch_id;
      
      INSERT INTO public.stock_ledger (
        product_id,
        batch_id,
        qty_delta,
        reason_code,
        channel,
        source_type,
        source_ref_id,
        created_by,
        idempotency_key,
        created_at
      ) VALUES (
        p_product_id,
        v_ret_batch_id,
        v_qty,
        'RETURN_IN'::public.reason_code_enum,
        v_channel_enum,
        'MARKETPLACE_RETURN',
        p_return_id::text,
        p_created_by,
        v_idemp_key,
        now()
      );

    ELSIF v_condition_text IN ('DAMAGED', 'LOST') THEN
      INSERT INTO public.returns_claims (
        return_id,
        condition,
        qty
      ) VALUES (
        p_return_id,
        v_condition_enum,
        v_qty
      );
    ELSE
      RAISE EXCEPTION 'Kondisi retur % tidak valid', v_condition_text;
    END IF;
  END LOOP;

  UPDATE public.returns
  SET status = 'COMPLETED'
  WHERE id = p_return_id;

  RETURN jsonb_build_object('success', true, 'message', 'Inspeksi retur berhasil diproses secara atomik');
END;
$$;


-- RPC 4: Opname Session Commit (process_opname_session)
DROP FUNCTION IF EXISTS public.process_opname_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.process_opname_session;

CREATE OR REPLACE FUNCTION public.process_opname_session(
  p_session_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_item RECORD;
  v_idemp_key TEXT;
  v_adjusted_count INT := 0;
BEGIN
  SELECT id, status INTO v_session
  FROM public.opname_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi opname % tidak ditemukan', p_session_id;
  END IF;

  IF v_session.status != 'OPEN' THEN
    RAISE EXCEPTION 'Sesi opname % sudah ditutup sebelumnya', p_session_id;
  END IF;

  FOR v_item IN 
    SELECT product_id, batch_id, difference_qty
    FROM public.opname_items
    WHERE opname_session_id = p_session_id AND difference_qty != 0
  LOOP
    v_idemp_key := 'OPNAME-' || p_session_id || '-' || v_item.batch_id;

    INSERT INTO public.stock_ledger (
      product_id,
      batch_id,
      qty_delta,
      reason_code,
      channel,
      source_type,
      source_ref_id,
      created_by,
      idempotency_key,
      created_at
    ) VALUES (
      v_item.product_id,
      v_item.batch_id,
      v_item.difference_qty,
      'OPNAME_CORRECTION'::public.reason_code_enum,
      'INTERNAL'::public.channel_enum,
      'STOCK_OPNAME',
      p_session_id::text,
      p_created_by,
      v_idemp_key,
      now()
    );

    v_adjusted_count := v_adjusted_count + 1;
  END LOOP;

  UPDATE public.opname_sessions
  SET status = 'CLOSED', closed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'adjusted_items', v_adjusted_count);
END;
$$;


-- RPC 5: Manual Entry Correction Reversal (process_manual_correction)
DROP FUNCTION IF EXISTS public.process_manual_correction(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.process_manual_correction;

CREATE OR REPLACE FUNCTION public.process_manual_correction(
  p_original_ledger_id UUID,
  p_correction_note TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orig RECORD;
  v_reversal_id UUID;
  v_idemp TEXT;
BEGIN
  SELECT id, product_id, batch_id, qty_delta, channel, source_type, source_ref_id
  INTO v_orig
  FROM public.stock_ledger
  WHERE id = p_original_ledger_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entri ledger % tidak ditemukan', p_original_ledger_id;
  END IF;

  v_idemp := COALESCE(p_idempotency_key, 'CORR-' || p_original_ledger_id || '-' || extract(epoch from now())::bigint);

  INSERT INTO public.stock_ledger (
    product_id,
    batch_id,
    qty_delta,
    reason_code,
    channel,
    source_type,
    source_ref_id,
    reference_note,
    created_by,
    idempotency_key,
    created_at
  ) VALUES (
    v_orig.product_id,
    v_orig.batch_id,
    -v_orig.qty_delta,
    'MANUAL_CORRECTION'::public.reason_code_enum,
    v_orig.channel,
    'MANUAL_CORRECTION',
    p_original_ledger_id::text,
    p_correction_note,
    p_created_by,
    v_idemp,
    now()
  )
  RETURNING id INTO v_reversal_id;

  RETURN jsonb_build_object('success', true, 'correction_id', v_reversal_id);
END;
$$;


-- RPC 6: Order Status Machine Updater (update_order_status)
DROP FUNCTION IF EXISTS public.update_order_status(text, text);
DROP FUNCTION IF EXISTS public.update_order_status;

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_marketplace_order_id TEXT,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status_enum public.order_status_enum;
BEGIN
  v_status_enum := p_new_status::public.order_status_enum;

  UPDATE public.orders
  SET status = v_status_enum
  WHERE marketplace_order_id = p_marketplace_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order dengan marketplace_order_id % tidak ditemukan', p_marketplace_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_new_status);
END;
$$;
