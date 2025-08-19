"use server";

import fs from "fs";
import path from "path";

/**
 * Prio:
 *    After we built and signed out transaction, the signed transaction is sent to the network via a SVS RPC node.
 *    Optional but you can send your transaction to a staked RPC endpoint also known as Stake-Weighted Quality of Service (SWQoS).
 * Jito:
 *    We can also broadcasting Through Jito and include Jito Tips in our Swap transaction (https://docs.jito.wtf/)
 *      - You need to submit to a Jito RPC endpoint for it to work.
 *      - You need to send an appropriate amount of Jito Tip to be included to be processed.
 */
export type PriorityType = "jito" | "prio";
export interface BuySettings {
  solAmount: string;
  slippage: string;
  priorityType: PriorityType;
  priorityFee: string;
  websocketAutoBuy?: boolean;
}

// Define the type for token purchase records
export interface TokenPurchase {
  tx: string | null;
  solAmount: string;
  amount: string | null;
  time: string;
  token: string;
  name: string | null;
  image: string | null;
}

interface Token {
  address: string;
  price: string;
  name: string | null;
  image: string | null;
}

// Create object for our buy settings
const defaultSettings: BuySettings = {
  solAmount: "0.01",
  slippage: "20",
  priorityType: "prio",
  priorityFee: "0.001",
  websocketAutoBuy: false,
};

// Define the paths to the JSON files
const SETTINGS_FILE_PATH = path.join(process.cwd(), "data", "buySettings.json");
const PURCHASES_FILE_PATH = path.join(process.cwd(), "data", "tokenPurchases.json");
const TRACKED_TOKENS_FILE_PATH = path.join(process.cwd(), "data", "trackedTokens.json");

// Ensure the data directory exists
async function ensureDirectoryExists() {
  const dir = path.dirname(SETTINGS_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Token Purchases
export async function saveTokenPurchasesToFile(purchase: TokenPurchase): Promise<void> {
  try {
    ensureDirectoryExists();

    // Get existing purchases
    const purchases = await getTokenPurchasesFromFile();

    // Add new purchase to the beginning of the array (most recent first)
    purchases.unshift(purchase);

    // Save updated purchase history
    await fs.promises.writeFile(PURCHASES_FILE_PATH, JSON.stringify(purchases, null, 2));
  } catch {
    throw new Error("Failed to save token purchase");
  }
}
export async function getTokenPurchasesFromFile(): Promise<TokenPurchase[]> {
  try {
    ensureDirectoryExists();

    // Check if file exists
    if (!fs.existsSync(PURCHASES_FILE_PATH)) {
      // Create file with empty array if it doesn't exist
      await fs.promises.writeFile(PURCHASES_FILE_PATH, JSON.stringify([], null, 2));
      return [];
    }

    // Read and parse the file
    const data = await fs.promises.readFile(PURCHASES_FILE_PATH, "utf8");
    return JSON.parse(data) as TokenPurchase[];
  } catch {
    return [];
  }
}
export async function removeTokenPurchaseFromFile(txId: string): Promise<boolean> {
  try {
    ensureDirectoryExists();

    // Check if file exists
    if (!fs.existsSync(PURCHASES_FILE_PATH)) {
      return false;
    }

    // Get existing purchases
    const purchases = await getTokenPurchasesFromFile();

    // Find the index of the purchase with the matching transaction ID
    const purchaseIndex = purchases.findIndex((purchase) => purchase.tx === txId);

    // If purchase not found, return false
    if (purchaseIndex === -1) {
      return false;
    }

    // Remove the purchase from the array
    purchases.splice(purchaseIndex, 1);

    // Save updated purchase history
    await fs.promises.writeFile(PURCHASES_FILE_PATH, JSON.stringify(purchases, null, 2));

    return true;
  } catch {
    return false;
  }
}

// tracked tokens
export async function saveTrackedTokenToFile(trackedToken: Token): Promise<void> {
  try {
    ensureDirectoryExists();

    // Get existing tracked tokens
    let trackedTokens: Token[] = [];

    // Check if file exists
    if (fs.existsSync(TRACKED_TOKENS_FILE_PATH)) {
      // Read and parse the file
      const data = await fs.promises.readFile(TRACKED_TOKENS_FILE_PATH, "utf8");
      trackedTokens = JSON.parse(data) as Token[];
    }

    // Check if token already exists in the list
    const tokenExists = trackedTokens.some((token) => token.address === trackedToken.address);

    // Only add if token doesn't already exist
    if (!tokenExists) {
      // Add new tracked token to the beginning of the array (most recent first)
      trackedTokens.unshift(trackedToken);

      // Save updated tracked tokens list
      await fs.promises.writeFile(TRACKED_TOKENS_FILE_PATH, JSON.stringify(trackedTokens, null, 2));
    }
  } catch {
    throw new Error("Failed to save tracked token");
  }
}
export async function updateTrackedTokenInFile(trackedToken: Token): Promise<void> {
  try {
    ensureDirectoryExists();

    // Get existing tracked tokens
    let trackedTokens: Token[] = [];

    // Check if file exists
    if (fs.existsSync(TRACKED_TOKENS_FILE_PATH)) {
      // Read and parse the file
      const data = await fs.promises.readFile(TRACKED_TOKENS_FILE_PATH, "utf8");
      trackedTokens = JSON.parse(data) as Token[];
    }

    // Find the index of the token with the matching address
    const tokenIndex = trackedTokens.findIndex((token) => token.address === trackedToken.address);

    // If token found, update it
    if (tokenIndex !== -1) {
      trackedTokens[tokenIndex] = trackedToken;
    } else {
      // If token not found, add it to the beginning of the array
      trackedTokens.unshift(trackedToken);
    }

    // Save updated tracked tokens list
    await fs.promises.writeFile(TRACKED_TOKENS_FILE_PATH, JSON.stringify(trackedTokens, null, 2));
  } catch {
    throw new Error("Failed to update tracked token");
  }
}
export async function getTrackedTokensFromFile(): Promise<Token[]> {
  try {
    ensureDirectoryExists();

    // Check if file exists
    if (!fs.existsSync(TRACKED_TOKENS_FILE_PATH)) {
      // Create file with empty array if it doesn't exist
      await fs.promises.writeFile(TRACKED_TOKENS_FILE_PATH, JSON.stringify([], null, 2));
      return [];
    }

    // Read and parse the file
    const data = await fs.promises.readFile(TRACKED_TOKENS_FILE_PATH, "utf8");
    return JSON.parse(data) as Token[];
  } catch {
    return [];
  }
}
export async function removeTrackedTokenFromFile(tokenAddress: string): Promise<boolean> {
  try {
    ensureDirectoryExists();

    // Check if file exists
    if (!fs.existsSync(TRACKED_TOKENS_FILE_PATH)) {
      return false;
    }

    // Get existing tracked tokens
    const trackedTokens = await getTrackedTokensFromFile();

    // Find the index of the token with the matching address
    const tokenIndex = trackedTokens.findIndex((token) => token.address === tokenAddress);

    // If token not found, return false
    if (tokenIndex === -1) {
      return false;
    }

    // Remove the token from the array
    trackedTokens.splice(tokenIndex, 1);

    // Save updated tracked tokens list
    await fs.promises.writeFile(TRACKED_TOKENS_FILE_PATH, JSON.stringify(trackedTokens, null, 2));

    return true;
  } catch {
    return false;
  }
}

// Buy Settings
export async function saveBuySettingsToFile(settings: BuySettings): Promise<void> {
  try {
    ensureDirectoryExists();
    await fs.promises.writeFile(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2));
  } catch {
    throw new Error("Failed to save buy settings");
  }
}
export async function getBuySettingsFromFile(): Promise<BuySettings> {
  try {
    ensureDirectoryExists();

    // Check if file exists
    if (!fs.existsSync(SETTINGS_FILE_PATH)) {
      await saveBuySettingsToFile(defaultSettings);
      return defaultSettings;
    }

    // Read and parse the file
    const data = await fs.promises.readFile(SETTINGS_FILE_PATH, "utf8");
    return JSON.parse(data) as BuySettings;
  } catch {
    return defaultSettings;
  }
}
