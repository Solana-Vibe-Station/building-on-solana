"use server";

import WebSocket from "ws";
import * as dotenv from "dotenv";
import { Connection, Finality, ParsedTransactionWithMeta, TokenBalance } from "@solana/web3.js";
import { getTokenPrices, SwapInformation, swapToken } from "./tokenService";
import { getBuySettingsFromFile, saveTokenPurchasesToFile, saveTrackedTokenToFile } from "./storageService";

// Get env variables
dotenv.config();

// WebSocket endpoint from environment variables
const RPC_URL_WSS = process.env.RPC_URL_WSS || "";
const RPC_URL = process.env.RPC_URL || "";
const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"; //LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
const PROGRAM_LOG = ["Program log: Instruction: InitializeMint2"]; //Program log: Instruction: MigrateToCpswap Program log: Instruction: InitializeMint2
const WSOL = "So11111111111111111111111111111111111111112";

// Global WebSocket client to track connection
let globalWsClient: WebSocket | null = null;

// Connection status
let isConnected = false;
let rpcConnection: Connection | null = null;

interface Token {
  address: string;
  price: string;
  name: string | null;
  image: string | null;
}
interface TokenInfoData {
  success: boolean;
  data: Token[] | null;
  message: string | null;
}

// Helper function to get parsed transaction with retry logic
async function getParsedTransactionWithRetry(
  connection: Connection,
  signature: string,
  options: { maxSupportedTransactionVersion: number; commitment: Finality },
  maxRetries = 5,
  initialDelayMs = 100
): Promise<ParsedTransactionWithMeta | null> {
  let retries = 0;
  let delay = initialDelayMs;

  while (retries < maxRetries) {
    const transaction = await connection.getParsedTransaction(signature, options);

    // If we got a valid transaction with metadata, return it
    if (transaction && transaction.meta) {
      return transaction;
    }

    // If we've reached max retries, return whatever we got (likely null)
    if (retries >= maxRetries - 1) {
      return transaction;
    }

    // Wait before trying again
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Increase delay for next retry
    delay += initialDelayMs;
    retries++;
  }

  return null;
}

// Function to create a subscription request
export async function returnSubscribeRequest() {
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

// Returns if the data is a Subscribe Update object with a transaction property
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isValidWssData(parsedData: any) {
  return (
    "jsonrpc" in parsedData &&
    "method" in parsedData &&
    parsedData.method === "logsNotification" &&
    "params" in parsedData &&
    typeof parsedData.params === "object"
  );
}

// Handle WebSocket data
async function handleWssData(data: WebSocket.Data) {
  try {
    const parsedData = JSON.parse(data.toString());

    // Handle subscription response
    if (parsedData.result !== undefined && !parsedData.error) {
      console.log("✅ Subscription request sent successfully.");
      return;
    }

    if (!isValidWssData(parsedData)) {
      return false;
    }

    // Safely access the nested structure
    const logMessages = parsedData?.params?.result?.value?.logs;
    const signature = parsedData?.params?.result?.value?.signature;

    // Validate `logs` is an array and if we have a signtature
    if (!Array.isArray(logMessages) || !signature) return;

    // Find event based on log or instruction
    if (!logMessages.includes(PROGRAM_LOG[0])) {
      return;
    }

    // Fetch transaction with minimal options
    if (!rpcConnection) return false;

    const options = {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed" as Finality,
    };

    // Use retry logic to get the parsed transaction
    const ptx: ParsedTransactionWithMeta | null = await getParsedTransactionWithRetry(rpcConnection, signature, options);

    // Get meta
    const meta = ptx?.meta;
    if (!ptx?.meta) return false;

    // Log Token balances mints
    const tokenBalances: TokenBalance[] | null | undefined = meta?.preTokenBalances?.length !== 0 ? meta?.preTokenBalances : meta?.postTokenBalances;
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

    // Get settings from server using our utility function
    const buySettings = await getBuySettingsFromFile();
    const autoBuy = buySettings.websocketAutoBuy;

    // Make Swap
    let swapped: SwapInformation | null = null;
    if (autoBuy) {
      console.log("Attempting to swap discovered token.");
      swapped = await swapToken(returnedMint, buySettings);
    }

    // Call the service to get updated price for this token
    const updatedToken: TokenInfoData = await getTokenPrices([returnedMint]);

    // Add to purchased tokens if swapped
    if (swapped?.success) {
      const { amount, time, token, tx } = swapped;

      // Create new purchased record
      const purchasedToken = {
        tx: tx,
        solAmount: buySettings.solAmount,
        amount: amount,
        time: time,
        token: token,
        name: updatedToken.data ? updatedToken.data[0].name : null,
        image: updatedToken.data ? updatedToken.data[0].image : null,
      };

      // Save the purchase to server
      await saveTokenPurchasesToFile(purchasedToken);
    } else if (swapped?.success === false) {
      console.log(swapped.message);
    }

    // Add to tracked tokens, if swap failed or if autobuy is on
    else {
      // Create new tracked token record
      const trackedToken: Token = {
        address: returnedMint,
        price: updatedToken.data ? updatedToken.data[0].price : "0.0000000 SOL",
        name: updatedToken.data ? updatedToken.data[0].name : null,
        image: updatedToken.data ? updatedToken.data[0].image : null,
      };

      // Save the tracked token to server
      await saveTrackedTokenToFile(trackedToken);
    }

    // Swap
  } catch (error) {
    console.error("❌ Error parsing WebSocket data:", error);
  }
}

// Establish a connection to the SVS Websocket server and subscribe to events.
export async function startWebSocketConnection(): Promise<{ success: boolean; message: string }> {
  if (!RPC_URL_WSS) {
    return { success: false, message: "Could not start Websocket stream. Missing endpoint." };
  }

  // If already connected, return early
  if (isConnected && globalWsClient) {
    return { success: true, message: "WebSocket already connected" };
  }

  // Close any existing connection
  if (globalWsClient) {
    try {
      globalWsClient.close();
    } catch (error) {
      console.error("Error closing existing connection:", error);
    }
  }

  // Create new connection
  globalWsClient = new WebSocket(RPC_URL_WSS);
  const wRequest = await returnSubscribeRequest();

  try {
    globalWsClient.on("message", handleWssData);

    globalWsClient.on("open", async () => {
      console.log("✅ WebSocket connection established");
      isConnected = true;
      const requestData = await wRequest;
      globalWsClient?.send(JSON.stringify(requestData));
    });

    globalWsClient.on("close", () => {
      console.log("🔐 Websocket closed.");
      isConnected = false;
    });

    globalWsClient.on("error", (error: Error) => {
      console.log("❌ An error occurred during Websocket data streaming: " + error);
      isConnected = false;
    });

    // Try to create a valid RPC connection
    if (rpcConnection === null) {
      try {
        rpcConnection = new Connection(RPC_URL, "confirmed");
      } catch {
        rpcConnection = null;
        return { success: false, message: "RPC connection could not be created" };
      }
    }

    return { success: true, message: "WebSocket connection initiated" };
  } catch (error) {
    console.error("❌ Error occurred during the subscription process", error);
    if (globalWsClient) {
      globalWsClient.close();
    }
    isConnected = false;
    return { success: false, message: "Failed to establish WebSocket connection" };
  }
}

// Stop the WebSocket connection
export async function stopWebSocketConnection(): Promise<{ success: boolean; message: string }> {
  if (!globalWsClient || !isConnected) {
    return { success: false, message: "No active WebSocket connection to stop" };
  }

  try {
    globalWsClient.close();
    globalWsClient = null;
    isConnected = false;

    // Unset RPC
    if (rpcConnection !== null) {
      rpcConnection = null;
    }

    return { success: true, message: "WebSocket connection stopped" };
  } catch (error) {
    console.error("Error stopping WebSocket connection:", error);
    return { success: false, message: "Error stopping WebSocket connection" };
  }
}

// Check if WebSocket is connected
export async function getWebSocketStatus(): Promise<{ connected: boolean }> {
  return { connected: isConnected && globalWsClient !== null };
}
