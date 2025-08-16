import WebSocket from "ws";
import dotenv from "dotenv";
import { config } from "./config";
import { Commitment, Connection, ParsedTransactionWithMeta, PublicKey, TokenBalance } from "@solana/web3.js";
import { saveBenchmarkData } from "./benchmark";

// Load environment variables from the .env file
dotenv.config();

// Set Constants
const WSS_ENDPOINT = process.env.SVS_SWQOS_WSS || null;
const RPC_ENDPOINT = process.env.SVS_SWQOS_RPC || null;
const PROGRAM_ID = config.program.id;
const PROGRAM_META_LOGS = config.program.meta_logs;
const WSOL = config.wsol_pc_mint;

let rpcConnection: Connection | null = null;
async function initializeRpcConnection(rpcUrl: string | null, commitment: Commitment): Promise<boolean> {
  if (!rpcUrl) {
    throw new Error("❌ Error initializing RPC connection: Missing RPC url.");
  }

  try {
    rpcConnection = new Connection(rpcUrl, commitment);
    return true;
  } catch (error) {
    throw new Error("❌ Error initializing RPC connection");
  }
}

// Wss specifc functions
function returnSubscribeRequest() {
  return {
    jsonrpc: "2.0",
    id: PROGRAM_ID,
    method: "logsSubscribe",
    params: [
      {
        mentions: [PROGRAM_ID],
      },
      {
        commitment: "processed", // Can use finalized to be more accurate.
      },
    ],
  };
}

// Handles the incoming data from the gRPC stream.
async function handleWssData(data: WebSocket.Data): Promise<boolean> {
  const jsonString = data.toString(); // Convert data to a string
  const parsedData = JSON.parse(jsonString); // Parse the JSON string

  // Handle subscription response
  if (parsedData.result !== undefined && !parsedData.error) {
    console.log("✅ Subscription request sent successfully.");
    return false;
  }

  if (!isValidWssData(parsedData)) {
    return false;
  }

  // Safely access the nested structure
  const logMessages = parsedData?.params?.result?.value?.logs;
  const signature = parsedData?.params?.result?.value?.signature;

  // Validate `logs` is an array and if we have a signtature
  if (!Array.isArray(logMessages) || !signature) return false;

  // Find event based on log or instruction
  if (!logMessages.includes(PROGRAM_META_LOGS[0])) {
    return false;
  }

  // Fetch transaction with minimal options
  if (!rpcConnection) return false;
  let tx: ParsedTransactionWithMeta | null = await rpcConnection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  // Get meta
  const meta = tx?.meta;
  if (!tx?.meta) return false;

  // Log Token balances mints
  const tokenBalances: TokenBalance[] | null | undefined = meta?.preTokenBalances?.length !== 0 ? meta?.preTokenBalances : meta?.postTokenBalances;
  if (tokenBalances) {
    if (!logViaTokenBalances(tokenBalances, signature)) {
      console.log("❌ Failed to log token balances.");
      return false;
    }
  }

  return true;
}

// Returns if the data is a Subscribe Update object with a transaction property
export function isValidWssData(parsedData: any) {
  return (
    "jsonrpc" in parsedData &&
    "method" in parsedData &&
    parsedData.method === "logsNotification" &&
    "params" in parsedData &&
    typeof parsedData.params === "object"
  );
}

// Log token mint via token balances
function logViaTokenBalances(tokenBalances: TokenBalance[], signature: string): boolean {
  try {
    if (!tokenBalances?.length) return false;

    // Fast path: If we have exactly 2 token balances, one is likely WSOL and the other is the token
    let returnedMint;
    if (tokenBalances.length === 2) {
      const mint1 = tokenBalances[0].mint;
      const mint2 = tokenBalances[1].mint;

      // If mint1 is WSOL, return mint2 (unless it's also WSOL)
      if (mint1 === WSOL) {
        returnedMint = mint2 === WSOL ? null : mint2;
      } else {
        // If mint2 is WSOL, return mint1
        if (mint2 === WSOL) {
          returnedMint = mint1;
        } else {
          for (const balance of tokenBalances) {
            if (balance.mint !== WSOL) {
              returnedMint = balance.mint;
            }
          }
        }
      }
    } else {
      // For more than 2 balances, find the first non-WSOL mint
      for (const balance of tokenBalances) {
        if (balance.mint !== WSOL) {
          returnedMint = balance.mint;
        }
      }
    }

    if (!returnedMint) return false;

    const mint = new PublicKey(returnedMint).toBase58();

    saveBenchmarkData("wss", Date.now(), mint);

    console.log("📄 Signature:", signature);
    console.log("📜 Token CA:", mint + `\n\n`);
    return true;
  } catch (err) {
    return false;
  }
}

// Establish a connection to the SVS Websocket server and subscribe to events.
async function wss(): Promise<void> {
  if (!WSS_ENDPOINT) {
    console.log("❌ Could not start Websocket stream. Missing endpoint.");
    return;
  }

  let wClient: WebSocket | null = new WebSocket(WSS_ENDPOINT);
  const wRequest = returnSubscribeRequest();

  try {
    wClient.on("message", handleWssData);
    wClient.on("open", async () => {
      wClient.send(JSON.stringify(wRequest));
    });
    wClient.on("close", () => {
      console.log("🔐 Websocket closed. Trying to open connection again in 5 seconds.");
      setTimeout(() => wss(), 5000);
    });
    wClient.on("error", (error: Error) => {
      console.log("❌ An error occured during Websocket data streaming" + error);
    });
  } catch (error) {
    console.error("❌ Error occured during the subscription process", error);
    wClient.close();
  }
}

initializeRpcConnection(RPC_ENDPOINT, "processed")
  .then(wss)
  .catch((err) => {
    console.error(err.message);
  });
