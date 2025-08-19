"use server";

import { Address, createSolanaRpc } from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";
import axios from "axios";
import { Connection, Keypair, LAMPORTS_PER_SOL, VersionedTransaction, TransactionConfirmationStrategy } from "@solana/web3.js";
import * as dotenv from "dotenv";
import bs58 from "bs58";
import { BuySettings } from "./storageService";

// Get env variables
dotenv.config();

interface Token {
  address: string;
  price: string;
  name: string | null;
  image: string | null;
}
interface Price {
  base_mint: string;
  quote_mint: string;
  avg_price_1min: number;
  avg_price_15min: number;
  avg_price_1h: number;
  avg_price_24h: number;
  latest_price: number;
}
interface PriceData {
  prices: Price[];
}
interface MetaData {
  metas: {
    mint: string;
    name: string;
    symbol: string;
    uri: string;
    fungible: boolean;
    decimals: number;
    primary_creator: string;
    freeze_authority: string | null;
    off_chain_metadata: {
      description: string;
      image: string;
      name: string;
      symbol: string;
    };
  }[];
}
interface TokenInfoData {
  success: boolean;
  data: Token[] | null;
  message: string | null;
}

export async function getTokenPrices(tokens: string[]): Promise<TokenInfoData> {
  // Create an array to store the results
  const results: Token[] = [];

  try {
    // Fetch prices for all tokens in a single request
    const priceResponse = await axios.post(
      `https://beta-api.solanavibestation.com/price`,
      { mints: tokens },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
        },
      }
    );

    const priceData: PriceData = priceResponse.data;

    // Fetch metadata for all tokens in a single request
    const metadataResponse = await axios.post(
      `https://beta-api.solanavibestation.com/metadata`,
      { mints: tokens },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
        },
      }
    );

    const metaData: MetaData = metadataResponse.data;

    // Process each token
    for (const data of priceData.prices) {
      const tokenPrice = priceData.prices.find((p) => p.base_mint === data.base_mint);
      const metadata = metaData.metas.find((p) => p.mint === data.base_mint);

      if (!tokenPrice || !metadata) continue;

      // Format the price with SOL
      let formattedPrice = "0.0000000 SOL";
      if (tokenPrice && tokenPrice.latest_price) {
        formattedPrice = `${tokenPrice.latest_price.toFixed(7)} SOL`;
      }

      // Add the token data to results
      results.push({
        address: data.base_mint,
        price: formattedPrice,
        name: `${metadata.name} (${metadata.symbol})` || null,
        image: metadata.off_chain_metadata.image || null,
      });
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        data: null,
        message: `SVS Price API error (${error.response?.status || "unknown"}): ${error.message}`,
      };
    }
    console.error("Something went wrong while fetching the token information");
  }

  return {
    success: true,
    data: results,
    message: null,
  };
}
export async function isValidSolanaToken(mintAddress: string): Promise<boolean> {
  try {
    const rpc = createSolanaRpc("https://api.mainnet-beta.solana.com");
    const address = mintAddress as Address;
    await fetchMint(rpc, address);
    return true;
  } catch {
    return false;
  }
}

// Buy Token
export interface SwapInformation {
  success: boolean;
  message: string | null;
  tx: string | null;
  token: string;
  amount: string | null;
  time: string;
}
export interface JupiterSwapQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  platformFee: number | null;
  priceImpactPct: string;
  routePlan: {
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }[];
  contextSlot: number;
  timeTaken: number;
}
export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  prioritizationType: {
    computeBudget: {
      microLamports: number;
      estimatedMicroLamports: number;
    };
  };
  dynamicSlippageReport: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
    amplificationRatio: string;
    categoryName: string;
    heuristicMaxSlippageBps: number;
  };
  simulationError: string | null;
}

export async function swapToken(token: string, buySettings: BuySettings): Promise<SwapInformation> {
  try {
    // Verify if we received the required parameters
    if (!token || !buySettings) {
      return {
        success: false,
        message: "Required parameters token and/or buy settings not provided",
        tx: null,
        token: "",
        amount: null,
        time: "0.00",
      };
    }

    // Start timing the swap operation
    const startTime = performance.now();

    // Set required parameters
    const tokenMint = token;
    const { priorityFee, priorityType, slippage, solAmount } = buySettings;
    const privateKey = process.env.PRIVATE_KEY || "";
    const rpcUrl = process.env.RPC_URL || "";

    // Try to create a valid keypair
    let wallet = null;
    try {
      const secretKey = bs58.decode(privateKey);
      wallet = Keypair.fromSecretKey(secretKey);
    } catch {
      return {
        success: false,
        message: "Failed to create valid keypair. Make sure to set private key.",
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Try to create a valid RPC connection
    let rpcConnection = null;
    try {
      rpcConnection = new Connection(rpcUrl, "confirmed");
    } catch {
      return {
        success: false,
        message: "Failed to create valid RPC connection. Make sure to set private key.",
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Get quote
    let quoteResponse = null;
    try {
      quoteResponse = await axios.get<JupiterSwapQuoteResponse>(`https://lite-api.jup.ag/swap/v1/quote`, {
        params: {
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: token,
          amount: Number(solAmount) * LAMPORTS_PER_SOL,
          slippageBps: Number(slippage) * 100,
          onlyDirectRoutes: false, // In some cases, you may want to restrict the routing to only go through 1 market.
          asLegacyTransaction: false,
        },
      });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
      quoteResponse = await axios.get<JupiterSwapQuoteResponse>(`https://lite-api.jup.ag/swap/v1/quote`, {
        params: {
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: token,
          amount: Number(solAmount) * LAMPORTS_PER_SOL,
          slippageBps: Number(slippage) * 100,
          onlyDirectRoutes: false, // In some cases, you may want to restrict the routing to only go through 1 market.
          asLegacyTransaction: false,
        },
      });
    }

    if (!quoteResponse) {
      return {
        success: false,
        message: "Could not fetch quote for token",
        tx: null,
        token: "",
        amount: null,
        time: "0.00",
      };
    }

    // Set priority fee based on mode
    const feeLamports = Number(priorityFee) * LAMPORTS_PER_SOL;
    const prioritizationFeeLamports =
      priorityType === "jito"
        ? { jitoTipLamports: feeLamports }
        : {
            priorityLevelWithMaxLamports: {
              maxLamports: feeLamports,
              global: false,
              priorityLevel: "veryHigh",
            },
          };

    const swapResponse = await axios.post<JupiterSwapResponse>(`https://lite-api.jup.ag/swap/v1//swap`, {
      quoteResponse: quoteResponse.data,
      userPublicKey: wallet.publicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      skipUserAccountsRpcCalls: true,
      prioritizationFeeLamports,
    });

    if (!swapResponse || !swapResponse.data) {
      return {
        success: false,
        message: "Failed to get Jupiter swap transaction",
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Check simulation error
    if (swapResponse.data.simulationError !== null) {
      return {
        success: false,
        message: `Transaction simulation failed. Did not send transaction.`,
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Deserialize and sign transaction
    const transaction = VersionedTransaction.deserialize(Buffer.from(swapResponse.data.swapTransaction, "base64"));
    transaction.sign([wallet]);

    // Start timing the swap operation
    const startTimeTx = performance.now();

    // Send and confirm transaction
    const signature = await rpcConnection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 5,
    });

    // Setup comfirm transaction strategy
    const confirmationStrategy: TransactionConfirmationStrategy = {
      // The transaction signature we want to confirm
      signature,
      // The blockhash used in the transaction - needed to verify the transaction's validity window
      blockhash: transaction.message.recentBlockhash,
      // The last block height where this transaction's blockhash is valid
      // This helps prevent confirmation of transactions with expired blockhashes
      lastValidBlockHeight: swapResponse.data.lastValidBlockHeight,
    };

    // This approach replaces the deprecated method that only took signature and commitment level
    // A measure of the network confirmation for the block.
    // There are three specific commitment statuses:
    //    Processed
    //    Confirmed
    //    Finalized
    const confirmation = await rpcConnection.confirmTransaction(confirmationStrategy, "processed");
    if (confirmation.value.err) {
      return {
        success: false,
        message: `Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`,
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Calculate elapsed time in milliseconds and convert to seconds with 2 decimal places
    const endTime = performance.now();
    const elapsedTime = `Tx: ${((endTime - startTimeTx) / 1000).toFixed(2)}s (${((endTime - startTime) / 1000).toFixed(2)}s)`;

    return {
      success: true,
      message: null,
      tx: signature,
      token: tokenMint,
      amount: quoteResponse.data.outAmount,
      time: elapsedTime,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        message: `Axios API error (${error.response?.status || "unknown"}): ${error.message}`,
        tx: null,
        token: "",
        amount: null,
        time: "0.00",
      };
    }

    const err = error as { message?: string; response?: { status?: number } };
    return {
      success: false,
      message: `Swap error (${err.response?.status || "unknown"}): ${err.message || "Unknown error"}`,
      tx: null,
      token: "",
      amount: null,
      time: "0.00",
    };
  }
}
export async function unSwapToken(token: string, buySettings: BuySettings, amount: string): Promise<SwapInformation> {
  try {
    // Verify if we received the required parameters
    if (!token || !buySettings) {
      return {
        success: false,
        message: "Required parameters token and/or sell settings not provided",
        tx: null,
        token: "",
        amount: null,
        time: "0.00",
      };
    }

    // Start timing the swap operation
    const startTime = performance.now();

    // Set required parameters
    const tokenMint = token;
    const { priorityFee, priorityType, slippage } = buySettings;
    const privateKey = process.env.PRIVATE_KEY || "";
    const rpcUrl = process.env.RPC_URL || "";

    // Try to create a valid keypair
    let wallet = null;
    try {
      const secretKey = bs58.decode(privateKey);
      wallet = Keypair.fromSecretKey(secretKey);
    } catch {
      return {
        success: false,
        message: "Failed to create valid keypair. Make sure to set private key.",
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Try to create a valid RPC connection
    let rpcConnection = null;
    try {
      rpcConnection = new Connection(rpcUrl, "confirmed");
    } catch {
      return {
        success: false,
        message: "Failed to create valid RPC connection. Make sure to set private key.",
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Get quote
    const quoteResponse = await axios.get<JupiterSwapQuoteResponse>(`https://lite-api.jup.ag/swap/v1/quote`, {
      params: {
        outputMint: "So11111111111111111111111111111111111111112",
        inputMint: token,
        amount: Number(amount),
        slippageBps: Number(slippage) * 100,
        onlyDirectRoutes: false, // In some cases, you may want to restrict the routing to only go through 1 market.
        asLegacyTransaction: false,
      },
    });

    if (!quoteResponse) {
      return {
        success: false,
        message: "Could not fetch quote for token",
        tx: null,
        token: "",
        amount: null,
        time: "0.00",
      };
    }

    // Set priority fee based on mode
    const feeLamports = Number(priorityFee) * LAMPORTS_PER_SOL;
    const prioritizationFeeLamports =
      priorityType === "jito"
        ? { jitoTipLamports: feeLamports }
        : {
            priorityLevelWithMaxLamports: {
              maxLamports: feeLamports,
              global: false,
              priorityLevel: "veryHigh",
            },
          };

    const swapResponse = await axios.post<JupiterSwapResponse>(`https://lite-api.jup.ag/swap/v1//swap`, {
      quoteResponse: quoteResponse.data,
      userPublicKey: wallet.publicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      skipUserAccountsRpcCalls: true,
      prioritizationFeeLamports,
    });

    if (!swapResponse || !swapResponse.data) {
      return {
        success: false,
        message: "Failed to get Jupiter swap transaction",
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Check simulation error
    if (swapResponse.data.simulationError !== null) {
      return {
        success: false,
        message: `Transaction simulation failed. Did not send transaction.`,
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Deserialize and sign transaction
    const transaction = VersionedTransaction.deserialize(Buffer.from(swapResponse.data.swapTransaction, "base64"));
    transaction.sign([wallet]);

    // Start timing the swap operation
    const startTimeTx = performance.now();

    // Send and confirm transaction
    const signature = await rpcConnection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 5,
    });

    // Setup comfirm transaction strategy
    const confirmationStrategy: TransactionConfirmationStrategy = {
      // The transaction signature we want to confirm
      signature,
      // The blockhash used in the transaction - needed to verify the transaction's validity window
      blockhash: transaction.message.recentBlockhash,
      // The last block height where this transaction's blockhash is valid
      // This helps prevent confirmation of transactions with expired blockhashes
      lastValidBlockHeight: swapResponse.data.lastValidBlockHeight,
    };

    // This approach replaces the deprecated method that only took signature and commitment level
    // A measure of the network confirmation for the block.
    // There are three specific commitment statuses:
    //    Processed
    //    Confirmed
    //    Finalized
    const confirmation = await rpcConnection.confirmTransaction(confirmationStrategy, "processed");
    if (confirmation.value.err) {
      return {
        success: false,
        message: `Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`,
        tx: null,
        token: tokenMint,
        amount: null,
        time: "0.00",
      };
    }

    // Calculate elapsed time in milliseconds and convert to seconds with 2 decimal places
    const endTime = performance.now();
    const elapsedTime = `Tx: ${((endTime - startTimeTx) / 1000).toFixed(2)}s (${((endTime - startTime) / 1000).toFixed(2)}s)`;

    return {
      success: true,
      message: null,
      tx: signature,
      token: tokenMint,
      amount: quoteResponse.data.outAmount,
      time: elapsedTime,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        message: `Axios API error (${error.response?.status || "unknown"}): ${error.message}`,
        tx: null,
        token: "",
        amount: null,
        time: "0.00",
      };
    }

    const err = error as { message?: string; response?: { status?: number } };
    return {
      success: false,
      message: `Swap error (${err.response?.status || "unknown"}): ${err.message}`,
      tx: null,
      token: "",
      amount: null,
      time: "0.00",
    };
  }
}
