"use server";

import { Address, createSolanaRpc } from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";
import axios from "axios";

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
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      return {
        success: false,
        data: null,
        message: `SVS Price API error (${error.response?.status || "unknown"}): ${error.message}`,
      };
    }
    console.error("Something went wrong while fetching the token information.");
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
  } catch (err) {
    return false;
  }
}
