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
}

// Create object for our buy settings
export const defaultSettings: BuySettings = {
  solAmount: "0.01",
  slippage: "20",
  priorityType: "prio",
  priorityFee: "0.001",
};

// Save buy settings to localStorage
export function saveBuySettings(settings: BuySettings): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem("buySettings", JSON.stringify(settings));
}

// Get buy settings from localStorage
export function getBuySettings(): BuySettings {
  if (typeof window === "undefined") {
    return defaultSettings;
  }

  const storedSettings = localStorage.getItem("buySettings");
  if (!storedSettings) {
    return defaultSettings;
  }

  try {
    return JSON.parse(storedSettings) as BuySettings;
  } catch (error) {
    console.error("Failed to parse stored settings:", error);
    return defaultSettings;
  }
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

// Save a token purchase record to localStorage
export function saveTokenPurchase(purchase: TokenPurchase): void {
  if (typeof window === "undefined") {
    return;
  }

  // Get existing purchase history
  const purchases = getTokenPurchases();

  // Add new purchase to the beginning of the array (most recent first)
  purchases.unshift(purchase);

  // Save updated purchase history
  localStorage.setItem("tokenPurchases", JSON.stringify(purchases));
}

// Get token purchase history from localStorage
export function getTokenPurchases(): TokenPurchase[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedPurchases = localStorage.getItem("tokenPurchases");
  if (!storedPurchases) {
    return [];
  }

  try {
    return JSON.parse(storedPurchases) as TokenPurchase[];
  } catch (error) {
    console.error("Failed to parse stored token purchases:", error);
    return [];
  }
}

// Remove a token purchase from localStorage based on transaction ID
export function removeTokenPurchase(txId: string): boolean {
  if (typeof window === "undefined" || !txId) {
    return false;
  }

  // Get existing purchase history
  const purchases = getTokenPurchases();

  // Find the index of the purchase with the matching transaction ID
  const purchaseIndex = purchases.findIndex((purchase) => purchase.tx === txId);

  // If purchase not found, return false
  if (purchaseIndex === -1) {
    return false;
  }

  // Remove the purchase from the array
  purchases.splice(purchaseIndex, 1);

  // Save updated purchase history
  localStorage.setItem("tokenPurchases", JSON.stringify(purchases));

  return true;
}
