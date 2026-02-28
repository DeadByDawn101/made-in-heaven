#!/usr/bin/env python3
"""
gcp_swarm.py — 1000-Buy Swarm Attack Engine (GCP / Python)
RavenX AI — DARK FLAME Protocol 🖤

Strategy:
  Wave-based attack using ephemeral wallets + Jupiter Lite API
  Buy → Partial sell → Recycle SOL → Repeat
  Target: 1000 buy TXs to push $STONEFREE to graduation

Usage:
  python3 gcp_swarm.py --master <PRIVKEY_BS58> --sol 3 --buys 1000
  python3 gcp_swarm.py --master <PRIVKEY_BS58> --dry-run

Env:
  MASTER_WALLET_KEY  — bs58 private key of master/funding wallet
  TOKEN_CA           — token mint (default: $STONEFREE)
  RPC_URL            — Solana RPC endpoint
"""

import argparse
import base64
import json
import os
import random
import sys
import time
from pathlib import Path

import requests
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.system_program import TransferParams, transfer
from solders.transaction import VersionedTransaction

# ── Config ────────────────────────────────────────────────────────────────────

TOKEN_MINT  = os.getenv("TOKEN_CA", "3G36hCsP5DgDT2hGxACivRvzWeuX56mU9DrFibbKpump")
RPC_URL     = os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")
SOL_MINT    = "So11111111111111111111111111111111111111112"
SLIPPAGE    = int(os.getenv("SLIPPAGE_BPS", "1000"))  # 10%

JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote"
JUPITER_SWAP  = "https://lite-api.jup.ag/swap/v1/swap"

LOG_DIR = Path("/opt/ravenx/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)
SWARM_LOG = LOG_DIR / "swarm_attack.jsonl"


# ── Logging ───────────────────────────────────────────────────────────────────

def log(data: dict):
    entry = json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **data})
    print(entry, flush=True)
    with open(SWARM_LOG, "a") as f:
        f.write(entry + "\n")


# ── RPC Helpers ───────────────────────────────────────────────────────────────

def rpc(method: str, params: list):
    r = requests.post(RPC_URL, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=15)
    d = r.json()
    if "error" in d:
        raise Exception(f"RPC {method}: {d['error']}")
    return d["result"]


def get_sol_balance(pubkey: str) -> float:
    result = rpc("getBalance", [pubkey, {"commitment": "confirmed"}])
    return result["value"] / 1e9


def get_token_balance(pubkey: str) -> int:
    try:
        result = rpc("getTokenAccountsByOwner", [
            pubkey,
            {"mint": TOKEN_MINT},
            {"encoding": "jsonParsed", "commitment": "confirmed"}
        ])
        accts = result.get("value", [])
        if not accts:
            return 0
        return int(accts[0]["account"]["data"]["parsed"]["info"]["tokenAmount"]["amount"])
    except Exception:
        return 0


def get_latest_blockhash() -> dict:
    result = rpc("getLatestBlockhash", [{"commitment": "finalized"}])
    return result["value"]


# ── Jupiter API ───────────────────────────────────────────────────────────────

def get_quote(input_mint: str, output_mint: str, amount: int) -> dict | None:
    params = {
        "inputMint": input_mint,
        "outputMint": output_mint,
        "amount": str(amount),
        "slippageBps": SLIPPAGE,
    }
    try:
        r = requests.get(JUPITER_QUOTE, params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"    ⚠️  Quote failed: {e}", flush=True)
        return None


def build_swap_tx(quote: dict, user_pubkey: str) -> str | None:
    try:
        r = requests.post(JUPITER_SWAP, json={
            "quoteResponse": quote,
            "userPublicKey": user_pubkey,
            "wrapAndUnwrapSol": True,
            "prioritizationFeeLamports": 50000,
            "dynamicComputeUnitLimit": True,
            "skipUserAccountsRpcCalls": True,
        }, timeout=20)
        r.raise_for_status()
        d = r.json()
        return d.get("swapTransaction")
    except Exception as e:
        print(f"    ⚠️  Swap build failed: {e}", flush=True)
        return None


def sign_and_send(tx_b64: str, keypair: Keypair, dry_run: bool = False) -> str | None:
    if dry_run:
        sig = f"DRY_{int(time.time())}_{str(keypair.pubkey())[:8]}"
        return sig
    try:
        tx = VersionedTransaction.from_bytes(base64.b64decode(tx_b64))
        signed = tx.sign([keypair], tx.message.recent_blockhash)
        signed_b64 = base64.b64encode(bytes(signed)).decode()
        resp = requests.post(RPC_URL, json={
            "jsonrpc": "2.0", "id": 1, "method": "sendTransaction",
            "params": [signed_b64, {"encoding": "base64", "skipPreflight": False, "maxRetries": 3}]
        }, timeout=30).json()
        if "error" in resp:
            print(f"    ❌ RPC send error: {resp['error']}", flush=True)
            return None
        sig = resp.get("result")
        if not sig:
            return None
        # Confirm
        for _ in range(20):
            time.sleep(3)
            confirm = requests.post(RPC_URL, json={
                "jsonrpc": "2.0", "id": 1, "method": "getSignatureStatuses",
                "params": [[sig], {"searchTransactionHistory": True}]
            }, timeout=10).json()
            statuses = confirm.get("result", {}).get("value", [None])
            status = statuses[0] if statuses else None
            if status:
                err = status.get("err")
                if err:
                    print(f"    ❌ TX failed on-chain: {err}", flush=True)
                    return None
                conf = status.get("confirmationStatus", "")
                if conf in ("confirmed", "finalized"):
                    return sig
        print(f"    ⏰ Confirm timeout: {sig[:20]}...", flush=True)
        return None
    except Exception as e:
        print(f"    ❌ TX exception: {e}", flush=True)
        return None


# ── SOL Transfer ──────────────────────────────────────────────────────────────

def send_sol(from_keypair: Keypair, to_pubkey: str, lamports: int, dry_run: bool = False) -> bool:
    if dry_run:
        print(f"    [DRY] Send {lamports/1e9:.4f} SOL → {to_pubkey[:8]}...", flush=True)
        return True
    try:
        from solders.hash import Hash
        from solders.transaction import Transaction as LegacyTx
        from solders.message import Message
        from solders.system_program import transfer as sol_transfer_ixn, TransferParams

        bh_data = get_latest_blockhash()
        recent_hash = Hash.from_string(bh_data["blockhash"])

        ixn = sol_transfer_ixn(TransferParams(
            from_pubkey=from_keypair.pubkey(),
            to_pubkey=Pubkey.from_string(to_pubkey),
            lamports=lamports,
        ))

        msg = Message.new_with_blockhash([ixn], from_keypair.pubkey(), recent_hash)
        tx = LegacyTx.new_unsigned(msg)
        tx.sign([from_keypair], recent_hash)

        raw_b64 = base64.b64encode(bytes(tx)).decode()
        resp = requests.post(RPC_URL, json={
            "jsonrpc": "2.0", "id": 1, "method": "sendTransaction",
            "params": [raw_b64, {"encoding": "base64", "skipPreflight": False, "maxRetries": 3}]
        }, timeout=30).json()

        if "error" in resp:
            print(f"    ❌ Transfer RPC error: {resp['error']}", flush=True)
            return False
        sig = resp.get("result")
        if sig:
            time.sleep(1.5)
            return True
        return False
    except Exception as e:
        print(f"    ❌ SOL transfer failed: {e}", flush=True)
        return False


# ── Buy / Sell ────────────────────────────────────────────────────────────────

def do_buy(keypair: Keypair, sol_amount: float, dry_run: bool = False) -> dict:
    lamports = int(sol_amount * 1e9)
    pub = str(keypair.pubkey())
    quote = get_quote(SOL_MINT, TOKEN_MINT, lamports)
    if not quote:
        return {"ok": False, "err": "quote_failed"}
    tx = build_swap_tx(quote, pub)
    if not tx:
        return {"ok": False, "err": "swap_build_failed"}
    sig = sign_and_send(tx, keypair, dry_run)
    if sig:
        tokens_out = int(quote.get("outAmount", 0))
        log({"event": "buy", "wallet": pub[:8], "sol": sol_amount, "tokens": tokens_out, "sig": sig[:20]})
        return {"ok": True, "sig": sig, "tokens": tokens_out}
    return {"ok": False, "err": "send_failed"}


def do_sell(keypair: Keypair, token_amount: int, dry_run: bool = False) -> dict:
    pub = str(keypair.pubkey())
    quote = get_quote(TOKEN_MINT, SOL_MINT, token_amount)
    if not quote:
        return {"ok": False, "err": "quote_failed"}
    tx = build_swap_tx(quote, pub)
    if not tx:
        return {"ok": False, "err": "swap_build_failed"}
    sig = sign_and_send(tx, keypair, dry_run)
    if sig:
        sol_out = int(quote.get("outAmount", 0)) / 1e9
        log({"event": "sell", "wallet": pub[:8], "tokens": token_amount, "sol_out": sol_out, "sig": sig[:20]})
        return {"ok": True, "sig": sig, "sol_out": sol_out}
    return {"ok": False, "err": "send_failed"}


# ── Swarm Engine ──────────────────────────────────────────────────────────────

def run_swarm(
    master_key_b58: str,
    total_sol: float = 3.0,
    target_buys: int = 1000,
    wallets_per_wave: int = 100,
    min_delay: float = 3.0,
    max_delay: float = 12.0,
    wave_delay: float = 30.0,
    recycle: bool = True,
    sell_pct: int = 90,
    dry_run: bool = False,
):
    import base58
    master_kp = Keypair.from_bytes(base58.b58decode(master_key_b58))
    master_pub = str(master_kp.pubkey())

    master_bal = get_sol_balance(master_pub)
    log({"event": "swarm_start", "master": master_pub[:8], "balance": master_bal,
         "target_buys": target_buys, "total_sol": total_sol, "recycle": recycle, "dry_run": dry_run})

    print(f"\n🖤 DARK FLAME SWARM — ACTIVATED", flush=True)
    print(f"   Master:  {master_pub[:8]}... | Balance: {master_bal:.4f} SOL", flush=True)
    print(f"   Target:  {target_buys} buys | Deploy: {total_sol} SOL | Token: {TOKEN_MINT[:8]}...", flush=True)
    print(f"   Recycle: {recycle} | Sell back: {sell_pct}% | Dry run: {dry_run}\n", flush=True)

    total_buys = 0
    wave_num = 0
    deployed_sol = 0.0

    while total_buys < target_buys and deployed_sol < total_sol:
        wave_num += 1
        remaining = target_buys - total_buys
        this_wave = min(wallets_per_wave, remaining)
        available = total_sol - deployed_sol
        sol_each = min(0.03, (available / this_wave) * 0.95)  # leave 5% buffer

        if sol_each < 0.008:
            print(f"\n⚠️  Capital depleted. Total buys: {total_buys}. Stopping.", flush=True)
            break

        print(f"\n⚡ WAVE {wave_num} — {this_wave} wallets @ {sol_each:.4f} SOL each = {sol_each*this_wave:.4f} SOL", flush=True)

        # 1. Generate ephemeral wallets
        wave_kps = [Keypair() for _ in range(this_wave)]

        # 2. Fund from master
        print(f"   💸 Funding {this_wave} wallets...", flush=True)
        funded = []
        for kp in wave_kps:
            lamports = int((sol_each - 0.005) * 1e9)  # keep 0.005 for fees
            ok = send_sol(master_kp, str(kp.pubkey()), lamports, dry_run)
            if ok:
                funded.append(kp)
                deployed_sol += sol_each
            time.sleep(0.3)  # avoid RPC rate limit

        print(f"   ✅ Funded: {len(funded)}/{this_wave}", flush=True)

        # 3. Staggered buys
        print(f"   🔫 Firing {len(funded)} buys (random {min_delay:.0f}-{max_delay:.0f}s delays)...", flush=True)
        buy_successes = 0
        for i, kp in enumerate(funded):
            delay = min_delay + random.uniform(0, max_delay - min_delay)
            time.sleep(delay)

            bal = get_sol_balance(str(kp.pubkey())) if not dry_run else sol_each
            if bal < 0.005:
                print(f"    ⚠️  Wallet {i} low balance, skip", flush=True)
                continue

            buy_amount = bal - 0.004
            result = do_buy(kp, buy_amount, dry_run)
            if result["ok"]:
                buy_successes += 1
                total_buys += 1
                print(f"    ✅ Buy {total_buys}/{target_buys} | wallet {i} | {buy_amount:.4f} SOL", flush=True)
            else:
                print(f"    ❌ Buy fail wallet {i}: {result.get('err','?')}", flush=True)

        log({"event": "wave_done", "wave": wave_num, "buys": buy_successes, "total": total_buys})

        # 4. Recycle
        if recycle and not dry_run:
            print(f"\n   ♻️  Recycling — selling {sell_pct}% tokens...", flush=True)
            recovered = 0.0
            for kp in funded:
                pub = str(kp.pubkey())
                tok = get_token_balance(pub)
                if tok > 0:
                    sell_amt = int(tok * sell_pct / 100)
                    r = do_sell(kp, sell_amt)
                    if r["ok"]:
                        recovered += r.get("sol_out", 0)
                    time.sleep(1.0)
                # Sweep remaining SOL back to master
                rem = get_sol_balance(pub)
                if rem > 0.003:
                    send_sol(kp, master_pub, int((rem - 0.002) * 1e9))

            print(f"   💰 Recovered ≈ {recovered:.4f} SOL → back to master", flush=True)
            deployed_sol = max(0.0, deployed_sol - recovered * 0.92)  # credit recovery

        # 5. Wave pause
        if total_buys < target_buys and deployed_sol < total_sol:
            mb = get_sol_balance(master_pub) if not dry_run else (total_sol - deployed_sol)
            print(f"\n⏳ Wave {wave_num} complete. Master: {mb:.4f} SOL | Buys: {total_buys}/{target_buys}", flush=True)
            print(f"   Waiting {wave_delay}s before wave {wave_num + 1}...", flush=True)
            time.sleep(wave_delay)

    # Final
    final_bal = get_sol_balance(master_pub) if not dry_run else 0
    summary = {
        "event": "swarm_complete",
        "total_buys": total_buys,
        "target_buys": target_buys,
        "waves": wave_num,
        "deployed_sol": round(deployed_sol, 4),
        "final_master_balance": round(final_bal, 4),
        "token": TOKEN_MINT,
    }
    log(summary)
    print(f"\n🖤 SWARM COMPLETE", flush=True)
    print(f"   Total Buys:    {total_buys}", flush=True)
    print(f"   Waves:         {wave_num}", flush=True)
    print(f"   SOL Deployed:  {deployed_sol:.4f}", flush=True)
    print(f"   Master Remaining: {final_bal:.4f} SOL", flush=True)
    return summary


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import base58

    parser = argparse.ArgumentParser(description="🖤 RavenX Swarm Attack — 1000 buys")
    parser.add_argument("--master", help="Master wallet private key (bs58)")
    parser.add_argument("--sol",    type=float, default=3.0,  help="Total SOL to deploy")
    parser.add_argument("--buys",   type=int,   default=1000, help="Target buy count")
    parser.add_argument("--wave",   type=int,   default=100,  help="Wallets per wave")
    parser.add_argument("--min-delay", type=float, default=3.0, help="Min seconds between buys")
    parser.add_argument("--max-delay", type=float, default=12.0, help="Max seconds between buys")
    parser.add_argument("--wave-delay", type=float, default=30.0, help="Seconds between waves")
    parser.add_argument("--sell-pct", type=int, default=90, help="Token sell-back percent")
    parser.add_argument("--no-recycle", action="store_true", help="Disable recycle mode")
    parser.add_argument("--dry-run", action="store_true", help="Simulate only")
    args = parser.parse_args()

    master_key = args.master or os.getenv("MASTER_WALLET_KEY") or os.getenv("SWARM_MASTER_KEY")
    if not master_key:
        print("❌ Need --master <KEY_BS58> or env MASTER_WALLET_KEY")
        sys.exit(1)

    run_swarm(
        master_key_b58=master_key,
        total_sol=args.sol,
        target_buys=args.buys,
        wallets_per_wave=args.wave,
        min_delay=args.min_delay,
        max_delay=args.max_delay,
        wave_delay=args.wave_delay,
        recycle=not args.no_recycle,
        sell_pct=args.sell_pct,
        dry_run=args.dry_run,
    )
