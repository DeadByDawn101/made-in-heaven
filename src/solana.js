/**
 * solana.js — Direct Solana RPC integration for Made in Heaven 🖤
 *
 * Plugs into the agent tool loop as native Solana tools.
 * Uses QuickNode RPC endpoint (or any Solana JSON-RPC compatible node).
 *
 * Docs: https://solana.com/docs/rpc
 * QuickNode: https://dashboard.quicknode.com/endpoints/new/SOL/solana-mainnet
 */

const RPC_URL = process.env.QUICKNODE_SOLANA_RPC || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// ── Core RPC Call ─────────────────────────────────────────────────────────────

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Solana RPC error [${method}]: ${json.error.message}`);
  return json.result;
}

// ── Solana Tool Functions ─────────────────────────────────────────────────────

/**
 * Get SOL balance for a wallet address (in SOL, not lamports)
 */
export async function getBalance(address) {
  const result = await rpc("getBalance", [address, { commitment: "confirmed" }]);
  const sol = result.value / 1e9;
  return { address, sol, lamports: result.value };
}

/**
 * Get all SPL token accounts owned by a wallet
 */
export async function getTokenAccounts(owner) {
  const result = await rpc("getTokenAccountsByOwner", [
    owner,
    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  return result.value.map((acc) => {
    const info = acc.account.data.parsed.info;
    return {
      mint: info.mint,
      owner: info.owner,
      amount: info.tokenAmount.uiAmount,
      decimals: info.tokenAmount.decimals,
      address: acc.pubkey,
    };
  });
}

/**
 * Get token supply for a mint address
 */
export async function getTokenSupply(mint) {
  const result = await rpc("getTokenSupply", [mint, { commitment: "confirmed" }]);
  return {
    mint,
    supply: result.value.uiAmount,
    decimals: result.value.decimals,
    raw: result.value.amount,
  };
}

/**
 * Get recent transaction signatures for an address
 */
export async function getRecentTransactions(address, limit = 10) {
  const result = await rpc("getSignaturesForAddress", [
    address,
    { limit, commitment: "confirmed" },
  ]);
  return result.map((sig) => ({
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime,
    blockTimeHuman: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : null,
    err: sig.err,
    memo: sig.memo,
  }));
}

/**
 * Get transaction details by signature
 */
export async function getTransaction(signature) {
  const result = await rpc("getTransaction", [
    signature,
    { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ]);
  if (!result) return { error: "Transaction not found" };
  return {
    signature,
    slot: result.slot,
    blockTime: result.blockTime,
    blockTimeHuman: result.blockTime ? new Date(result.blockTime * 1000).toISOString() : null,
    fee: result.meta?.fee / 1e9,
    status: result.meta?.err ? "failed" : "success",
    logs: result.meta?.logMessages?.slice(0, 10) || [],
  };
}

/**
 * Get account info for any address (wallet, program, token mint, etc.)
 */
export async function getAccountInfo(address) {
  const result = await rpc("getAccountInfo", [
    address,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  if (!result?.value) return { address, exists: false };
  return {
    address,
    exists: true,
    lamports: result.value.lamports,
    sol: result.value.lamports / 1e9,
    owner: result.value.owner,
    executable: result.value.executable,
    data: result.value.data,
  };
}

/**
 * Get current slot (latest confirmed block)
 */
export async function getSlot() {
  const slot = await rpc("getSlot", [{ commitment: "confirmed" }]);
  return { slot };
}

/**
 * Get network health + version
 */
export async function getHealth() {
  const [version, slot] = await Promise.all([
    rpc("getVersion"),
    rpc("getSlot", [{ commitment: "confirmed" }]),
  ]);
  return {
    rpc_url: RPC_URL,
    solana_core: version["solana-core"],
    feature_set: version["feature-set"],
    current_slot: slot,
  };
}

/**
 * Get multiple balances at once (batch)
 */
export async function getBatchBalances(addresses) {
  const results = await Promise.all(addresses.map(getBalance));
  return results;
}

// ── Agent Tool Definitions (for LLM tool_use) ─────────────────────────────────

export const SOLANA_TOOLS = [
  {
    name: "solana_get_balance",
    description: "Get SOL balance for a Solana wallet address",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet address (base58)" },
      },
      required: ["address"],
    },
  },
  {
    name: "solana_get_token_accounts",
    description: "Get all SPL token accounts (balances) owned by a Solana wallet",
    input_schema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Solana wallet address (base58)" },
      },
      required: ["owner"],
    },
  },
  {
    name: "solana_get_token_supply",
    description: "Get total supply for a Solana SPL token mint address",
    input_schema: {
      type: "object",
      properties: {
        mint: { type: "string", description: "Token mint address (base58)" },
      },
      required: ["mint"],
    },
  },
  {
    name: "solana_get_recent_transactions",
    description: "Get recent transaction signatures for a Solana address",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana wallet or program address" },
        limit: { type: "number", description: "Number of transactions to fetch (default 10, max 1000)" },
      },
      required: ["address"],
    },
  },
  {
    name: "solana_get_transaction",
    description: "Get full details of a Solana transaction by signature",
    input_schema: {
      type: "object",
      properties: {
        signature: { type: "string", description: "Transaction signature (base58)" },
      },
      required: ["signature"],
    },
  },
  {
    name: "solana_get_account_info",
    description: "Get account info for any Solana address (wallet, program, mint, etc.)",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Solana address (base58)" },
      },
      required: ["address"],
    },
  },
  {
    name: "solana_health",
    description: "Check Solana RPC connection health and current slot",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ── Tool Dispatcher ───────────────────────────────────────────────────────────

export async function dispatchSolanaTool(name, input) {
  switch (name) {
    case "solana_get_balance":
      return await getBalance(input.address);
    case "solana_get_token_accounts":
      return await getTokenAccounts(input.owner);
    case "solana_get_token_supply":
      return await getTokenSupply(input.mint);
    case "solana_get_recent_transactions":
      return await getRecentTransactions(input.address, input.limit || 10);
    case "solana_get_transaction":
      return await getTransaction(input.signature);
    case "solana_get_account_info":
      return await getAccountInfo(input.address);
    case "solana_health":
      return await getHealth();
    default:
      throw new Error(`Unknown Solana tool: ${name}`);
  }
}
