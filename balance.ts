// balance.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';

const RPC = 'https://api.devnet.solana.com';

(async () => {
  const [walletStr, mintStr] = process.argv.slice(2);
  if (!walletStr || !mintStr) {
    console.error('Usage: npx ts-node balance.ts <WALLET> <MINT>');
    process.exit(1);
  }
  const conn = new Connection(RPC, 'confirmed');
  const wallet = new PublicKey(walletStr);
  const mint = new PublicKey(mintStr);

  const ata = await getAssociatedTokenAddress(mint, wallet);
  const info = await getAccount(conn, ata);
  console.log('ATA:', ata.toBase58());
  console.log('Raw amount (base units):', info.amount.toString());
})();
