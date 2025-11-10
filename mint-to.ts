// mint-to.ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import fs from 'fs';

const RPC = 'https://api.devnet.solana.com';
const DECIMALS = 9; // match your mint

function loadAuthority(): Keypair {
  const raw = JSON.parse(fs.readFileSync('./devnet-mint.json', 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

(async () => {
  const [recipientBase58, amountStr, mintArg] = process.argv.slice(2);
  if (!recipientBase58 || !amountStr) {
    console.error('Usage: npx ts-node mint-to.ts <RECIPIENT_WALLET> <AMOUNT> [MINT_ADDRESS]');
    process.exit(1);
  }
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error('Amount must be a positive number.');
    process.exit(1);
  }

  const conn = new Connection(RPC, 'confirmed');
  const authority = loadAuthority();

  // Resolve mint address: use arg if provided, else auto-create (not typical)
  let mint = mintArg ? new PublicKey(mintArg) : null;

  if (!mint) {
    // If user didn’t pass a mint, we’ll create a fresh one (mostly for testing)
    mint = await createMint(conn, authority, authority.publicKey, null, DECIMALS);
    console.log('Created NEW MINT:', mint.toBase58());
  }

  const recipient = new PublicKey(recipientBase58);

  // Ensure recipient has an ATA
  const ata = await getOrCreateAssociatedTokenAccount(conn, authority, mint, recipient);

  // Convert UI amount -> base units
  const baseUnits = BigInt(Math.round(amount * 10 ** DECIMALS));

  await mintTo(conn, authority, mint, ata.address, authority, baseUnits);
  console.log(`Minted ${amount} tokens to ${recipientBase58}`);
  console.log(`ATA: ${ata.address.toBase58()}`);
  console.log(`Mint: ${mint.toBase58()}`);
})();
