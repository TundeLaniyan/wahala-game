/**
 * The purchase transaction states and the ONLY legal moves between them. Pure: the service asks `nextStatus` and refuses anything
 * else, so no code path can, for example, grant after a failure or fulfil an order that was never paid.
 *
 *   created --checkout started--> pending --verified payment--> paid --fulfilled--> fulfilled
 *      |                            |                             |                    |
 *      +--cancel / expire-----------+--> cancelled | failed        +--refund----------+--> refunded
 *                                                                   +--chargeback / fraud--> revoked
 *
 * `paid` is entered ONLY by a server-verified provider event (never by a client call). `fulfilled` is the moment the entitlement exists.
 */
import type { OrderStatus } from './types';

export type OrderEvent =
  | 'checkout_started'
  | 'payment_verified'
  | 'fulfilled'
  | 'payment_failed'
  | 'cancelled'
  | 'refunded'
  | 'revoked';

const TABLE: Readonly<Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>>> = {
  created: {
    checkout_started: 'pending',
    payment_verified: 'paid',
    payment_failed: 'failed',
    cancelled: 'cancelled',
  },
  pending: { payment_verified: 'paid', payment_failed: 'failed', cancelled: 'cancelled' },
  paid: { fulfilled: 'fulfilled', refunded: 'refunded', revoked: 'revoked' },
  fulfilled: { refunded: 'refunded', revoked: 'revoked' },
  failed: {},
  cancelled: {},
  refunded: {},
  revoked: {},
};

export function nextStatus(from: OrderStatus, event: OrderEvent): OrderStatus | null {
  return TABLE[from][event] ?? null;
}

export const isOpen = (s: OrderStatus): boolean => s === 'created' || s === 'pending';
export const isFinal = (s: OrderStatus): boolean => Object.keys(TABLE[s]).length === 0;
/** An order that has an entitlement attached (or is about to). */
export const grantsOwnership = (s: OrderStatus): boolean => s === 'paid' || s === 'fulfilled';
export const ALL_STATUSES = Object.keys(TABLE) as OrderStatus[];
export const ALL_EVENTS: readonly OrderEvent[] = [
  'checkout_started',
  'payment_verified',
  'fulfilled',
  'payment_failed',
  'cancelled',
  'refunded',
  'revoked',
];
