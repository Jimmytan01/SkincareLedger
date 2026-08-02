import { z } from 'zod'

export const MarketplaceEventSchema = z.object({
  event_id: z.string().min(1, 'event_id is required'),
  channel: z.enum(['SHOPEE', 'TIKTOK', 'OFFLINE', 'INTERNAL']),
  order_id: z.string().min(1, 'order_id is required'),
  event_type: z.enum(['ORDER_CREATED', 'STATUS_UPDATED', 'CANCELLED', 'RETURN_REQUESTED', 'DELIVERED']),
  status: z.string().optional(),
  items: z.array(
    z.object({
      sku: z.string().min(1, 'item sku is required'),
      qty: z.number().int().positive('qty must be a positive integer'),
    })
  ).optional().default([]),
  timestamp: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
})

export type MarketplaceEvent = z.infer<typeof MarketplaceEventSchema>
