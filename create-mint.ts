// create-mint.ts
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import fs from 'fs';

(async () => {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Mint authority lives on server only (do NOT ship this to clients)
  const mintAuthority = Keypair.generate();

  // Fund it for fees (airdrop)
  const sig = await conn.requestAirdrop(mintAuthority.publicKey, 1 * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, 'confirmed');

  // Create a new mint (9 decimals is typical)
  const mint = await createMint(conn, mintAuthority, mintAuthority.publicKey, null, 9);
  console.log('MINT:', mint.toBase58());

  // Optional: mint 10 units to the authority to prove it works
  const ata = await getOrCreateAssociatedTokenAccount(conn, mintAuthority, mint, mintAuthority.publicKey);
  await mintTo(conn, mintAuthority, mint, ata.address, mintAuthority, 10n);

  // Save the authority keypair to disk (server-only secret)
  fs.writeFileSync('./devnet-mint.json', JSON.stringify(Array.from(mintAuthority.secretKey)));
  console.log('Saved mint authority key to devnet-mint.json');
})();
