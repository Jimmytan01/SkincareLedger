-- Migration: Add is_active column to products table for catalog visibility control
-- Default value is true. Test products can be marked as false without deleting immutable ledger history.

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Update any synthetic test products to is_active = false
UPDATE public.products 
SET is_active = false 
WHERE sku LIKE 'SKU-EXP-TEST%' OR sku LIKE 'E2E-PROD%' OR sku LIKE 'SKU-FEFO%' OR sku LIKE 'SKU-MKT%';
