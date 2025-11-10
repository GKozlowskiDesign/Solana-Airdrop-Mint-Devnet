/* Simple devnet airdrop server (with signed-claim + credits settlement) */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import fs from 'fs';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

const PORT        = Number(process.env.PORT || 8788);
const RPC_URL     = process.env.RPC_URL || 'https://api.devnet.solana.com';
const MINT_ADDR   = process.env.MINT_ADDR || '';                 // required
const AUTH_FILE   = process.env.MINT_AUTH_FILE || './devnet-mint.json';
const MIN_CLAIM   = Number(process.env.MIN_CLAIM || '100');      // UI threshold
const COORD       = (process.env.COORD || 'http://127.0.0.1:8787').replace(/\/$/, '');
const DEV_NO_VERIFY = process.env.DEV_NO_VERIFY === '1';
const DECIMALS    = 9n; // mint decimals (adjust if your mint differs)

if (!MINT_ADDR) {
  console.error('MINT_ADDR env required');
  process.exit(1);
}

const conn = new Connection(RPC_URL, 'confirmed');
const mint = new PublicKey(MINT_ADDR);
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')))
);

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/healthz', (_req, res) => res.json({ ok: true }));

/**
 * Expected payload (preferred):
 * { wallet, hostId, msg, sig }
 *   msg := "CLAIM|<HOST_ID>|<WALLET>|<ts>"
 *   sig := base58(signature_over_msg)
 *
 * Dev fallback (not recommended for prod):
 * { wallet }  with DEV_NO_VERIFY=1
 */
app.post('/claim', async (req, res) => {
  try {
    const wallet = String(req.body?.wallet || '');
    const hostId = String(req.body?.hostId || '');
    const msg    = String(req.body?.msg || '');
    const sigB58 = String(req.body?.sig || '');

    if (!wallet) return res.status(400).json({ ok: false, error: 'wallet_required' });

    // --- 1) Verify signed claim unless dev bypass is enabled ---
    if (!DEV_NO_VERIFY) {
      if (!hostId || !msg || !sigB58) {
        return res.status(400).json({ ok: false, error: 'claim_signature_required' });
      }
      // Expect exact shape: "CLAIM|<HOST_ID>|<WALLET>|<ts>"
      const expectedPrefix = `CLAIM|${hostId}|${wallet}|`;
      if (!msg.startsWith(expectedPrefix)) {
        return res.status(400).json({ ok: false, error: 'bad_claim_message' });
      }
      const pk = new PublicKey(wallet);
      const ok = nacl.sign.detached.verify(
        new TextEncoder().encode(msg),
        bs58.decode(sigB58),
        pk.toBytes()
      );
      if (!ok) return res.status(401).json({ ok: false, error: 'sig_verify_failed' });
    }

    // --- 2) Pull credits from coordinator, enforce threshold ---
    const rCredits = await fetch(`${COORD}/credits/${wallet}`);
    if (!rCredits.ok) {
      const t = await rCredits.text();
      return res.status(502).json({ ok: false, error: `credits_fetch_failed:${t}` });
    }
    const credits = (await rCredits.json()) as { wallet: string; total: number };
    const total = Math.max(0, Number(credits?.total ?? 0));
    if (total < MIN_CLAIM) {
      return res.status(400).json({ ok: false, error: 'not_enough_credits', total });
    }

    // --- 3) Mint exactly `total` tokens to recipient ---
    const recipient = new PublicKey(wallet);
    const ata = await getOrCreateAssociatedTokenAccount(conn, authority, mint, recipient);
    const baseUnits = BigInt(total) * 10n ** DECIMALS;
    const txSig = await mintTo(conn, authority, mint, ata.address, authority, baseUnits);

    // --- 4) Settle/decrement credits on coordinator ---
    const rSettle = await fetch(`${COORD}/credits/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet, amount: total, reason: 'claim' }),
    });
    if (!rSettle.ok) {
      const t = await rSettle.text();
      return res.status(502).json({ ok: false, error: `settle_failed:${t}` });
    }
    const settled = (await rSettle.json()) as { ok: boolean; total: number };

    // --- 5) Respond with tx and new total for UI to refresh immediately ---
    return res.json({
      ok: true,
      tx: txSig,
      minted: total,
      total: Math.max(0, Number(settled?.total ?? 0)),
    });
  } catch (e: any) {
    console.error('claim error:', e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || 'internal_error' });
  }
});

app.listen(PORT, () => {
  console.log(`airdrop listening on :${PORT}`);
  console.log(`RPC=${RPC_URL}`);
  console.log(`MINT=${MINT_ADDR}`);
  console.log(`COORD=${COORD}`);
  if (DEV_NO_VERIFY) console.log('⚠️ DEV_NO_VERIFY=1 (signature check disabled)');
});
