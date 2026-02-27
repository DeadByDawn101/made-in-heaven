/**
 * swarm.js — 1000-Buy Swarm Engine for Made in Heaven 🖤
 *
 * Attack protocol:
 *  1. Generate N ephemeral wallets
 *  2. Fund each from master wallet
 *  3. Staggered Jupiter buys — looks organic
 *  4. Sweep tokens back → sell → recover SOL
 *  5. Recycle recovered SOL for next wave
 *  Repeat until 1000 buys hit or capital depleted
 *
 * RavenX AI — PROD — Camila Prime CFO/CTO 🖤
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC_URL =
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const TOKEN_MINT =
  process.env.TOKEN_CA ||
  "3G36hCsP5DgDT2hGxACivRvzWeuX56mU9DrFibbKpump"; // $STONEFREE default

const SOL_MINT = "So11111111111111111111111111111111111111112";

const JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP = "https://lite-api.jup.ag/swap/v1/swap";
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "1000"); // 10% for pump.fun

const SWARM_LOG = path.join(__dirname, "../logs/swarm.jsonl");

// ── Logging ────────────────────────────────────────────────────────────────

function log(data) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), ...data });
  console.log(entry);
  try {
    fs.mkdirSync(path.dirname(SWARM_LOG), { recursive: true });
    fs.appendFileSync(SWARM_LOG, entry + "\n");
  } catch {}
}

// ── Jupiter API ────────────────────────────────────────────────────────────

async function getQuote(inputMint, outputMint, amountLamports) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountLamports.toString(),
    slippageBps: SLIPPAGE_BPS.toString(),
  });
  const r = await fetch(`${JUPITER_QUOTE}?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Quote HTTP ${r.status}`);
  return r.json();
}

async function buildSwapTx(quote, userPublicKey) {
  const r = await fetch(JUPITER_SWAP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: 50000, // ~$0.002 — fast enough
      dynamicComputeUnitLimit: true,
      skipUserAccountsRpcCalls: true,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Swap build HTTP ${r.status}: ${text.slice(0, 200)}`);
  }
  const d = await r.json();
  if (!d.swapTransaction) throw new Error("No swapTransaction in response");
  return d.swapTransaction;
}

async function sendTx(connection, txBase64, keypair) {
  const { VersionedTransaction } = await import("@solana/web3.js");
  const txBuf = Buffer.from(txBase64, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);
  const sig = await connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "processed",
  });
  // Wait for confirmation
  const { value } = await connection.confirmTransaction(
    { signature: sig, ...(await connection.getLatestBlockhash()) },
    "confirmed"
  );
  if (value?.err) throw new Error(`TX failed on-chain: ${JSON.stringify(value.err)}`);
  return sig;
}

// ── Core Buy / Sell ────────────────────────────────────────────────────────

export async function jupiterBuy(connection, keypair, solAmount) {
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const pub = keypair.publicKey.toBase58();
  try {
    const quote = await getQuote(SOL_MINT, TOKEN_MINT, lamports);
    const tx = await buildSwapTx(quote, pub);
    const sig = await sendTx(connection, tx, keypair);
    const tokensOut = parseInt(quote.outAmount);
    log({ event: "buy", wallet: pub.slice(0, 8), sol: solAmount, tokensOut, sig: sig.slice(0, 20) });
    return { ok: true, sig, tokensOut };
  } catch (e) {
    log({ event: "buy_fail", wallet: pub.slice(0, 8), sol: solAmount, err: e.message.slice(0, 100) });
    return { ok: false, err: e.message };
  }
}

export async function jupiterSell(connection, keypair, tokenAmount) {
  const pub = keypair.publicKey.toBase58();
  try {
    const quote = await getQuote(TOKEN_MINT, SOL_MINT, tokenAmount.toString());
    const tx = await buildSwapTx(quote, pub);
    const sig = await sendTx(connection, tx, keypair);
    const solOut = parseInt(quote.outAmount) / LAMPORTS_PER_SOL;
    log({ event: "sell", wallet: pub.slice(0, 8), tokens: tokenAmount, solOut, sig: sig.slice(0, 20) });
    return { ok: true, sig, solOut };
  } catch (e) {
    log({ event: "sell_fail", wallet: pub.slice(0, 8), err: e.message.slice(0, 100) });
    return { ok: false, err: e.message };
  }
}

// ── SOL Transfer ───────────────────────────────────────────────────────────

async function sendSol(connection, fromKeypair, toPubkey, lamports) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: new PublicKey(toPubkey),
      lamports,
    })
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [fromKeypair], {
    commitment: "confirmed",
    maxRetries: 3,
  });
  return sig;
}

// ── Wallet Balance ─────────────────────────────────────────────────────────

async function getSolBalance(connection, pubkey) {
  const bal = await connection.getBalance(new PublicKey(pubkey), "confirmed");
  return bal / LAMPORTS_PER_SOL;
}

async function getTokenBalance(connection, walletPubkey) {
  try {
    const accts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletPubkey),
      { mint: new PublicKey(TOKEN_MINT) },
      "confirmed"
    );
    if (!accts.value.length) return 0;
    return accts.value[0].account.data.parsed.info.tokenAmount.amount;
  } catch {
    return 0;
  }
}

// ── Swarm Orchestrator ─────────────────────────────────────────────────────

/**
 * executeSwarm
 *
 * @param {object} config
 * @param {string}  config.masterKeyB58    - master wallet private key (bs58)
 * @param {number}  config.totalSol        - total SOL to deploy (default 3.0)
 * @param {number}  config.targetBuys      - total buy TXs to execute (default 1000)
 * @param {number}  config.walletsPerWave  - wallets per wave (default 100)
 * @param {number}  config.solPerWallet    - SOL per wallet per wave (default 0.03)
 * @param {number}  config.minDelayMs      - min delay between buys ms (default 3000)
 * @param {number}  config.maxDelayMs      - max delay between buys ms (default 12000)
 * @param {number}  config.waveDelayMs     - delay between waves ms (default 30000)
 * @param {boolean} config.recycleMode     - sell tokens and recycle SOL (default true)
 * @param {number}  config.sellBackPct     - % of tokens to sell back (default 90)
 * @param {boolean} config.dryRun          - log only, no real TXs (default false)
 */
export async function executeSwarm(config = {}) {
  const {
    masterKeyB58,
    totalSol = 3.0,
    targetBuys = 1000,
    walletsPerWave = 100,
    solPerWallet = 0.025,
    minDelayMs = 3000,
    maxDelayMs = 12000,
    waveDelayMs = 30000,
    recycleMode = true,
    sellBackPct = 90,
    dryRun = false,
  } = config;

  if (!masterKeyB58) throw new Error("masterKeyB58 required");

  const connection = new Connection(RPC_URL, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000,
  });

  const masterKp = Keypair.fromSecretKey(bs58.decode(masterKeyB58));
  const masterPub = masterKp.publicKey.toBase58();

  const masterBal = await getSolBalance(connection, masterPub);
  log({
    event: "swarm_start",
    master: masterPub.slice(0, 8),
    masterBalance: masterBal,
    config: { totalSol, targetBuys, walletsPerWave, solPerWallet, recycleMode, dryRun },
  });

  console.log(`\n🖤 DARK FLAME SWARM ACTIVATED`);
  console.log(`   Master: ${masterPub.slice(0, 8)}... | Balance: ${masterBal.toFixed(4)} SOL`);
  console.log(`   Target: ${targetBuys} buys | Deploy: ${totalSol} SOL | Recycle: ${recycleMode}`);
  console.log(`   Token: ${TOKEN_MINT}\n`);

  let totalBuys = 0;
  let waveNum = 0;
  let deployedSol = 0;
  const activeWallets = []; // {keypair, lamports funded}

  while (totalBuys < targetBuys && deployedSol < totalSol) {
    waveNum++;
    const remaining = targetBuys - totalBuys;
    const thisWave = Math.min(walletsPerWave, remaining);
    const solAvailable = Math.min(totalSol - deployedSol, thisWave * solPerWallet + thisWave * 0.005);

    if (solAvailable < 0.01) {
      console.log(`\n⚠️  Capital depleted. Total buys: ${totalBuys}. Stopping.`);
      break;
    }

    console.log(`\n⚡ WAVE ${waveNum} — ${thisWave} wallets | ${solAvailable.toFixed(4)} SOL`);

    // 1. Generate wallets
    const waveWallets = Array.from({ length: thisWave }, () => Keypair.generate());

    // 2. Fund wallets from master (batch or sequential)
    const fundLamports = Math.floor((solAvailable / thisWave) * LAMPORTS_PER_SOL);
    const actualSolEach = fundLamports / LAMPORTS_PER_SOL;

    console.log(`   Funding ${thisWave} wallets @ ${actualSolEach.toFixed(4)} SOL each...`);
    for (let i = 0; i < waveWallets.length; i++) {
      const wallet = waveWallets[i];
      if (dryRun) {
        console.log(`   [DRY] Fund ${wallet.publicKey.toBase58().slice(0, 8)}...`);
        deployedSol += actualSolEach;
        continue;
      }
      try {
        await sendSol(connection, masterKp, wallet.publicKey.toBase58(), fundLamports - 5000); // keep 5000 lamports for TX fees
        deployedSol += actualSolEach;
      } catch (e) {
        console.log(`   ⚠️  Fund fail for wallet ${i}: ${e.message.slice(0, 60)}`);
      }
      // Small delay between funds to avoid RPC rate limits
      await new Promise((r) => setTimeout(r, 500));
    }

    // 3. Staggered buys
    console.log(`   Executing ${thisWave} buys (staggered ${minDelayMs}-${maxDelayMs}ms)...`);
    const buyPromises = waveWallets.map(async (wallet, i) => {
      // Stagger with random delay
      const delay = minDelayMs + Math.random() * (maxDelayMs - minDelayMs) + i * 1200;
      await new Promise((r) => setTimeout(r, delay));

      if (dryRun) {
        console.log(`   [DRY] BUY wallet ${wallet.publicKey.toBase58().slice(0, 8)} ${actualSolEach.toFixed(4)} SOL`);
        return { ok: true, tokensOut: 1000000, dryRun: true };
      }

      const balance = await getSolBalance(connection, wallet.publicKey.toBase58());
      if (balance < 0.005) return { ok: false, err: "insufficient_balance" };

      return jupiterBuy(connection, wallet, balance - 0.004); // keep 0.004 for fees
    });

    const buyResults = await Promise.all(buyPromises);
    const successBuys = buyResults.filter((r) => r.ok).length;
    totalBuys += successBuys;

    log({
      event: "wave_complete",
      wave: waveNum,
      buysAttempted: thisWave,
      buysSuccess: successBuys,
      totalBuys,
      deployedSol,
    });

    console.log(`   ✅ Wave ${waveNum}: ${successBuys}/${thisWave} buys | Total: ${totalBuys}/${targetBuys}`);

    // 4. Recycle — sell back and sweep SOL to master
    if (recycleMode && !dryRun) {
      console.log(`   ♻️  Recycling — selling ${sellBackPct}% of tokens back...`);
      let recoveredSol = 0;

      for (let i = 0; i < waveWallets.length; i++) {
        const wallet = waveWallets[i];
        const tokenBal = await getTokenBalance(connection, wallet.publicKey.toBase58());
        if (tokenBal > 0) {
          const sellAmt = Math.floor((parseInt(tokenBal) * sellBackPct) / 100);
          if (sellAmt > 0) {
            const sellResult = await jupiterSell(connection, wallet, sellAmt);
            if (sellResult.ok) recoveredSol += sellResult.solOut;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        // Sweep remaining SOL back to master
        const remBal = await getSolBalance(connection, wallet.publicKey.toBase58());
        if (remBal > 0.002) {
          try {
            await sendSol(connection, wallet, masterPub, Math.floor((remBal - 0.001) * LAMPORTS_PER_SOL));
          } catch {}
        }
      }

      console.log(`   💰 Recovered: ~${recoveredSol.toFixed(4)} SOL → recycled to master`);
      // Recovered SOL is back in master — update deployedSol to account for recovery
      deployedSol = Math.max(0, deployedSol - recoveredSol * 0.9);
    }

    // 5. Wave delay before next wave
    if (totalBuys < targetBuys && deployedSol < totalSol) {
      const masterBal2 = dryRun ? totalSol - deployedSol : await getSolBalance(connection, masterPub);
      console.log(
        `\n⏳ Wave ${waveNum} done. Master balance: ${masterBal2.toFixed(4)} SOL. Waiting ${waveDelayMs / 1000}s before wave ${waveNum + 1}...`
      );
      await new Promise((r) => setTimeout(r, waveDelayMs));
    }
  }

  // Final summary
  const finalMasterBal = dryRun ? 0 : await getSolBalance(connection, masterPub);
  const summary = {
    event: "swarm_complete",
    totalBuys,
    targetBuys,
    totalWaves: waveNum,
    deployedSol: deployedSol.toFixed(4),
    finalMasterBalance: finalMasterBal.toFixed(4),
    token: TOKEN_MINT,
  };
  log(summary);

  console.log(`\n🖤 SWARM COMPLETE`);
  console.log(`   Total Buys:  ${totalBuys}`);
  console.log(`   Waves:       ${waveNum}`);
  console.log(`   SOL Deployed: ${deployedSol.toFixed(4)}`);
  console.log(`   Master Remaining: ${finalMasterBal.toFixed(4)} SOL`);

  return summary;
}

// ── CLI Entry Point ────────────────────────────────────────────────────────

// Run directly: node src/swarm.js --master <KEY_B58> --sol 3 --buys 1000
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : def;
  };

  const masterKeyB58 =
    get("--master", null) ||
    process.env.MASTER_WALLET_KEY ||
    process.env.SWARM_MASTER_KEY;

  if (!masterKeyB58) {
    console.error("❌ Need --master <PRIVATE_KEY_BS58> or env MASTER_WALLET_KEY");
    process.exit(1);
  }

  executeSwarm({
    masterKeyB58,
    totalSol: parseFloat(get("--sol", "3.0")),
    targetBuys: parseInt(get("--buys", "1000")),
    walletsPerWave: parseInt(get("--wave-size", "100")),
    solPerWallet: parseFloat(get("--sol-each", "0.025")),
    minDelayMs: parseInt(get("--min-delay", "3000")),
    maxDelayMs: parseInt(get("--max-delay", "12000")),
    waveDelayMs: parseInt(get("--wave-delay", "30000")),
    recycleMode: get("--no-recycle", null) === null,
    sellBackPct: parseInt(get("--sell-pct", "90")),
    dryRun: args.includes("--dry-run"),
  }).catch(console.error);
}
