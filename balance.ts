// balance.ts
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const RPC = 'https://api.devnet.solana.com';

// Base58 (no 0,O,I,l). Wallets/mints are usually 32–44 chars.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

(async () => {
  const [rawWallet, rawMint] = process.argv.slice(2);

  if (!rawWallet || !rawMint) {
    die('Usage: npx ts-node balance.ts <WALLET_BASE58> <MINT_BASE58>');
  }

  const walletStr = rawWallet.trim();
  const mintStr = rawMint.trim();

  if (!BASE58_RE.test(walletStr)) die(`Invalid wallet (not base58-ish): ${walletStr}`);
  if (!BASE58_RE.test(mintStr)) die(`Invalid mint (not base58-ish): ${mintStr}`);

  let wallet: PublicKey, mint: PublicKey;
  try {
    wallet = new PublicKey(walletStr);
    mint   = new PublicKey(mintStr);
  } catch {
    die('Invalid public key input. Double-check both wallet and mint.');
  }

  const conn = new Connection(RPC, 'confirmed');

  // Figure out which token program the mint uses (classic or 2022).
  // If the direct fetch under TOKEN_PROGRAM_ID fails, we’ll try TOKEN_2022.
  let program = TOKEN_PROGRAM_ID;
  let decimals = 9;
  try {
    const mintInfo = await getMint(conn, mint, undefined, program);
    decimals = mintInfo.decimals;
  } catch {
    try {
      const mintInfo2022 = await getMint(conn, mint, undefined, TOKEN_2022_PROGRAM_ID);
      program = TOKEN_2022_PROGRAM_ID;
      decimals = mintInfo2022.decimals;
    } catch {
      die('Failed to read mint info under both token programs. Is the mint correct / on devnet?');
    }
  }

  // Compute ATA for this (mint, wallet) pair
  const ata = await getAssociatedTokenAddress(mint, wallet, false, program);

  // Try to read the ATA; if it doesn’t exist yet, tell the user what to do.
  try {
    const info = await getAccount(conn, ata, 'confirmed', program);
    const raw = info.amount;                // bigint base units
    const ui  = Number(raw) / 10 ** decimals;

    console.log('RPC:', RPC);
    console.log('Wallet:', wallet.toBase58());
    console.log('Mint:', mint.toBase58());
    console.log('Program:', program.toBase58());
    console.log('ATA:', ata.toBase58());
    console.log('Decimals:', decimals);
    console.log('Raw amount (base units):', raw.toString());
    console.log('UI amount:', ui);
  } catch (e: any) {
    console.log('RPC:', RPC);
    console.log('Wallet:', wallet.toBase58());
    console.log('Mint:', mint.toBase58());
    console.log('Program:', program.toBase58());
    console.log('ATA (expected):', ata.toBase58());
    console.log('');
    console.log('No token account found yet for this (wallet, mint).');
    console.log('That usually means nothing has been minted/airdropped to this wallet for this mint.');
    console.log('Once your airdrop/mint succeeds, re-run this command.');
    if (e?.message) console.log('Note:', e.message);
    process.exit(0);
  }
})();
