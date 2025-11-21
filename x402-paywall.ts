// Simple x402 paywall middleware (Express)
// Responds 402 with paymentRequirements unless a valid X-PAYMENT is provided,
// then verifies it with your facilitator and calls next().

import type { Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';

const FACILITATOR = process.env.X402_FACILITATOR || ""; // e.g. https://your-facilitator.example
const RECEIVER    = process.env.X402_RECEIVER    || ""; // your payout address (pubkey, email, etc.)

if (!FACILITATOR || !RECEIVER) {
  // Don’t crash the server, but warn loudly.
  // Without these set, all protected routes will 402.
  console.warn('[x402] X402_FACILITATOR or X402_RECEIVER not set');
}

type Price = { currency: "USD"; value: string };

export function paywall(pathId: string, price: Price = { currency: "USD", value: "0.01" }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const xPayment = req.headers['x-payment'] as string | undefined;

      if (!xPayment) {
        // Tell the client how to pay for this resource (x402 v1 shape)
        return res.status(402).json({
          version: "x402-1",
          paymentRequirements: [{
            scheme: "facilitator",
            facilitator: FACILITATOR,
            receiver: RECEIVER,
            amount: price,
            resourceId: pathId, // lets you price/routes differently
          }]
        });
      }

      // Verify/settle with facilitator
      const r = await fetch(`${FACILITATOR}/v1/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ xPayment, receiver: RECEIVER, resourceId: pathId })
      });

      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return res.status(402).json({ ok: false, error: "payment_verify_failed", detail });
      }

      // Optionally propagate facilitator response header for clients
      const payResp = await r.text().catch(() => '');
      if (payResp) res.setHeader('x-payment-response', payResp);

      return next();
    } catch (e: any) {
      console.error('[x402] middleware error', e?.message || e);
      return res.status(500).json({ ok: false, error: 'x402_internal' });
    }
  };
}
