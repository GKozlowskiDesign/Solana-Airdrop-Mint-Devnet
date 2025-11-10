import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import fs from 'fs';

const RPC = process.env.RPC_URL || 'https://api.devnet.solana.com';
const DECIMALS = 9;

// retry helper
async function airdropWithRetry(conn: Connection, pk: Uint8Array, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      const sig = await conn.requestAirdrop(pk as any, 0.2 * LAMPORTS_PER_SOL); // smaller request
      await conn.confirmTransaction(sig, 'confirmed');
      return true;
    } catch (e) {
      console.log(`[airdrop] attempt ${i} failed -> ${String((e as any)?.message || e)}`);
      await new Promise(r => setTimeout(r, 2500 * i));
    }
  }
  return false;
}

(async () => {
  const conn = new Connection(RPC, 'confirmed');

  // If we already created an authority once, reuse it so you can fund it manually if needed
  let mintAuthority: Keypair;
  const keyPath = './devnet-mint.json';

  if (fs.existsSync(keyPath)) {
    const raw = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as number[];
    mintAuthority = Keypair.fromSecretKey(Uint8Array.from(raw));
  } else {
    mintAuthority = Keypair.generate();
    fs.writeFileSync(keyPath, JSON.stringify(Array.from(mintAuthority.secretKey)));
  }

  console.log('Mint authority (DEVNET) pubkey:', mintAuthority.publicKey.toBase58());
  console.log('RPC:', RPC);

  // Try to fund automatically. If it still fails, let you fund manually and press Enter.
  const ok = await airdropWithRetry(conn, mintAuthority.publicKey.toBytes(), 5);
  if (!ok) {
    console.log('\n⚠️  Devnet faucet is rate-limited right now.');
    console.log('Fund this pubkey with devnet SOL using your wallet faucet, then press Enter:');
    console.log(mintAuthority.publicKey.toBase58());
    await new Promise<void>(r => {
      process.stdin.resume();
      process.stdin.once('data', () => r());
    });
  }

  // Create the mint
  const mint = await createMint(conn, mintAuthority, mintAuthority.publicKey, null, DECIMALS);
  console.log('MINT:', mint.toBase58());

  // Tiny sanity mint to the authority
  const ata = await getOrCreateAssociatedTokenAccount(conn, mintAuthority, mint, mintAuthority.publicKey);
  await mintTo(conn, mintAuthority, mint, ata.address, mintAuthority, 10n);
  console.log('Saved mint authority key to devnet-mint.json');
})();
