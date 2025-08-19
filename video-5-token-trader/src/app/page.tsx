"use client";

import { useEffect, useState } from "react";
import { BuySettingsDialog } from "@/components/buy-settings-dialog";
import { startWebSocketConnection, stopWebSocketConnection, getWebSocketStatus } from "./server/services/websocketService";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTokenPrices, isValidSolanaToken, SwapInformation, swapToken, unSwapToken } from "./server/services/tokenService";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon, CoinsIcon, Loader2 } from "lucide-react";
import Image from "next/image";
import { AppSidebar } from "@/components/app-sidebar";
import Link from "next/link";
import {
  getBuySettingsFromFile,
  getTokenPurchasesFromFile,
  removeTokenPurchaseFromFile,
  saveTokenPurchasesToFile,
  TokenPurchase,
  getTrackedTokensFromFile,
  saveTrackedTokenToFile,
  updateTrackedTokenInFile,
  removeTrackedTokenFromFile,
} from "./server/services/storageService";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

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

export default function Page() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [purchases, setPurchases] = useState<TokenPurchase[]>([]);
  const [tokenAddress, setTokenAddress] = useState("");
  const [invalidToken, setInvalidToken] = useState<string | null>(null);
  const [failedPurchase, setFailedPurchase] = useState<string | null>(null);
  const [isAddingToken, setIsAddingToken] = useState(false);
  const [isSyncingAllPrices, setIsSyncingAllPrices] = useState(false);
  const [syncingTokenAddress, setSyncingTokenAddress] = useState(false);
  const [purchaseCounter, setPurchaseCounter] = useState(0); // Add a counter to trigger re-renders
  // Websocket
  const [isConnectingWebSocket, setIsConnectingWebSocket] = useState(false);
  const [isStoppingWebSocket, setIsStoppingWebSocket] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);

  // Load purchased tokens from file
  useEffect(() => {
    const fetchPurchases = async () => {
      const tokenPurchases = await getTokenPurchasesFromFile();
      if (tokenPurchases) setPurchases(tokenPurchases);
    };

    fetchPurchases();

    // Check every 1 second
    const intervalSwaps = setInterval(fetchPurchases, 1000);

    // Clean up on unmount
    return () => clearInterval(intervalSwaps);
  }, [purchaseCounter]);

  // Load tracked tokens from file
  useEffect(() => {
    const fetchAndFormatTrackedTokens = async () => {
      const tracked = await getTrackedTokensFromFile();
      if (tracked && tracked.length !== 0) setTokens(tracked);
    };

    fetchAndFormatTrackedTokens();

    // Check every 1 second
    const intervalTracked = setInterval(fetchAndFormatTrackedTokens, 1000);

    // Clean up on unmount
    return () => clearInterval(intervalTracked);
  }, []);

  // Check WebSocket connection status periodically
  useEffect(() => {
    const checkWebSocketStatus = async () => {
      try {
        const status = await getWebSocketStatus();
        setIsWebSocketConnected(status.connected);
      } catch {
        setIsWebSocketConnected(false);
      }
    };

    checkWebSocketStatus();

    // Check every 5 seconds
    const intervalId = setInterval(checkWebSocketStatus, 5000);

    // Clean up on unmount
    return () => clearInterval(intervalId);
  }, []);

  // Add a new token
  const addToken = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tokenAddress.trim()) {
      setInvalidToken("Please provide a valid token mint!");
      return;
    }

    // Update states
    setIsAddingToken(true);
    setInvalidToken(null);

    // Verify if this is a valid token
    const isValidToken = await isValidSolanaToken(tokenAddress.trim());
    if (!isValidToken) {
      setInvalidToken("Token validation using fetchMint failed! Cannot add token to list.");
      setIsAddingToken(false);
      return;
    }

    const tokenMint = tokenAddress.trim();

    const updatedTokens = await getTokenPrices([tokenMint]);
    if (!updatedTokens.success) {
      setInvalidToken(updatedTokens.message);
      setIsAddingToken(false);
      return;
    }

    const tokenData = updatedTokens.data;
    if (tokenData && tokenData.length > 0) {
      // Add the token with data from the API
      setTokens([...tokens, tokenData[0]]);

      // Create tracked token object and save to file
      try {
        await saveTrackedTokenToFile({
          address: tokenMint,
          price: tokenData[0].price,
          name: tokenData[0].name,
          image: tokenData[0].image,
        });
      } catch {
        setInvalidToken("Failed to save token to tracked tokens");
      }
    }

    // Reset States
    setTokenAddress("");
    setIsAddingToken(false);
  };

  // Sync token, and tokens, actions
  const syncTokens = async () => {
    // Set the states
    setIsSyncingAllPrices(true);
    setInvalidToken(null);

    // Verify if we have tokens to update
    if (tokens.length === 0) return;

    // Get all token addresses
    const addresses = tokens.map((token) => token.address);

    // Call the service to get updated prices
    const updatedTokens = await getTokenPrices(addresses);
    if (!updatedTokens.success) {
      setInvalidToken(updatedTokens.message);
      setIsSyncingAllPrices(false);
      return;
    }

    // Extract the token data
    const tokenData = updatedTokens.data;
    if (tokenData && tokenData.length > 0) {
      // Update the tokens state with the new prices
      setTokens(tokenData);

      // Update each token in the tracked tokens file
      try {
        for (const token of tokenData) {
          // Create token object with the correct interface and update it
          await updateTrackedTokenInFile({
            address: token.address,
            price: token.price,
            name: token.name,
            image: token.image,
          });
        }
      } catch {
        setInvalidToken("Failed to update tracked tokens file");
      }
    }

    setIsSyncingAllPrices(false);
  };
  const syncToken = async (tokenAddress: string) => {
    // Update states
    setSyncingTokenAddress(true);
    setInvalidToken(null);

    // Call the service to get updated price for this token
    const updatedTokens: TokenInfoData = await getTokenPrices([tokenAddress]);
    if (!updatedTokens.success) {
      setInvalidToken(updatedTokens.message);
      setSyncingTokenAddress(false);
      return;
    }

    // Extract the token data
    const tokenData = updatedTokens.data;
    if (tokenData && tokenData.length > 0) {
      // Update only this token's price in the state
      setTokens((prevTokens) => prevTokens.map((token) => (token.address === tokenAddress ? { ...token, price: tokenData[0].price } : token)));

      // Update the token in the tracked tokens file
      try {
        // Create token object with the correct interface and update it
        await updateTrackedTokenInFile({
          address: tokenData[0].address,
          price: tokenData[0].price,
          name: tokenData[0].name,
          image: tokenData[0].image,
        });
      } catch {
        setInvalidToken("Failed to update tracked token file");
      }
    }

    // Reset States
    setSyncingTokenAddress(false);
  };

  // Buy and remove Token
  const buyToken = async (tokenAddress: string) => {
    try {
      //Update States
      setFailedPurchase(null);

      // Get settings from server using our utility function
      const buySettings = await getBuySettingsFromFile();

      // Make Swap
      const swapped: SwapInformation = await swapToken(tokenAddress, buySettings);
      if (!swapped.success) {
        setFailedPurchase(swapped.message);
        return;
      }

      const { amount, time, token, tx } = swapped;

      // Call the service to get updated price for this token
      const updatedToken: TokenInfoData = await getTokenPrices([tokenAddress]);

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

      // Increment the purchase counter to trigger the useEffect
      setPurchaseCounter((prev) => prev + 1);
    } catch {
      setFailedPurchase("An unexpected error occurred during the purchase");
    }
  };
  const sellToken = async (tokenAddress: string, swapTransaction: string, amount: string) => {
    try {
      //Update States
      setFailedPurchase(null);

      // Get settings from server using our utility function
      const buySettings = await getBuySettingsFromFile();

      // Unswap Token
      const swapped: SwapInformation = await unSwapToken(tokenAddress, buySettings, amount);
      if (!swapped.success) {
        setFailedPurchase(swapped.message);
        return;
      }

      // Remove tracked purchase
      await removeTokenPurchaseFromFile(swapTransaction);

      setPurchaseCounter((prev) => prev - 1);
    } catch {
      setFailedPurchase("An unexpected error occurred during the sell");
    }
  };
  const removeToken = async (tx: string) => {
    try {
      //Update States
      setFailedPurchase(null);

      // Remove the purchase from server
      await removeTokenPurchaseFromFile(tx);

      // Decrease the purchase counter to trigger the useEffect
      setPurchaseCounter((prev) => prev - 1);
    } catch {
      setFailedPurchase("An unexpected error occurred during the removal");
    }
  };

  // Remove tracked token
  const removeTrackedToken = async (tokenAddress: string) => {
    try {
      setInvalidToken(null);

      // Remove the token from tracked tokens file
      const result = await removeTrackedTokenFromFile(tokenAddress);

      if (result) {
        // Update the tokens state by filtering out the removed token
        setTokens((prevTokens) => prevTokens.filter((token) => token.address !== tokenAddress));
      } else {
        setInvalidToken("Failed to remove tracked token");
      }
    } catch {
      setInvalidToken("An unexpected error occurred during token removal");
    }
  };

  // Start WebSocket connection
  const handleStartWebSocket = async () => {
    try {
      setIsConnectingWebSocket(true);
      const result = await startWebSocketConnection();
      setIsConnectingWebSocket(false);

      if (result.success) {
        setIsWebSocketConnected(true);
      }
    } catch {
      setIsConnectingWebSocket(false);
    }
  };

  // Stop WebSocket connection
  const handleStopWebSocket = async () => {
    try {
      setIsStoppingWebSocket(true);
      const result = await stopWebSocketConnection();
      setIsStoppingWebSocket(false);

      if (result.success) {
        setIsWebSocketConnected(false);
      }
    } catch {
      setIsStoppingWebSocket(false);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">SVS Token Tracker</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min p-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle>Token Tracker</CardTitle>
                  <CardDescription>Add token addresses to track their prices</CardDescription>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={syncTokens}>
                    Sync Tokens
                  </Button>
                  <BuySettingsDialog />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap justify-between mb-6 w-full">
                  <form onSubmit={addToken} className="flex items-end gap-2 flex-grow max-w">
                    <div className="flex-1 w-full">
                      <label htmlFor="tokenAddress" className="block text-sm font-medium mb-2">
                        Token Address
                      </label>
                      <Input
                        id="tokenAddress"
                        placeholder="Enter token address"
                        value={tokenAddress}
                        onChange={(e) => {
                          setInvalidToken(null);
                          setTokenAddress(e.target.value);
                        }}
                        className="w-full"
                      />
                    </div>
                    <Button type="submit">Add Token</Button>
                  </form>
                  {/* Websocket Buttons */}
                  <div className="flex ml-2 items-end">
                    {!isWebSocketConnected ? (
                      <Button variant="outline" className="border-2 border-green-600" onClick={handleStartWebSocket} disabled={isConnectingWebSocket}>
                        {isConnectingWebSocket ? "Connecting..." : "Start WebSocket"}
                      </Button>
                    ) : (
                      <Button variant="destructive" onClick={handleStopWebSocket} disabled={isStoppingWebSocket}>
                        {isStoppingWebSocket ? "Stopping..." : "Stop WebSocket"}
                      </Button>
                    )}
                  </div>
                </div>
                {invalidToken && (
                  <Alert variant={"destructive"}>
                    <AlertCircleIcon />
                    <AlertTitle>Invalid Token</AlertTitle>
                    <AlertDescription>{invalidToken}</AlertDescription>
                  </Alert>
                )}
                {isAddingToken || isSyncingAllPrices || syncingTokenAddress ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                    <p className="text-muted-foreground">
                      {isAddingToken && "Adding token..."}
                      {isSyncingAllPrices && "Syncing all token prices..."}
                      {syncingTokenAddress && "Syncing token price..."}
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Token Address</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokens.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center">
                            No tokens added yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        tokens.map((token, index) => (
                          <TableRow key={index}>
                            {token.image !== null && (
                              <TableCell>
                                <Image alt={"svs Logo"} height={45} width={45} src={token.image}></Image>
                              </TableCell>
                            )}
                            {token.image === null && (
                              <TableCell>
                                <Image alt={"svs Logo"} height={45} width={45} src={"/svs_logo.png"}></Image>
                              </TableCell>
                            )}
                            <TableCell>{token.name}</TableCell>
                            <TableCell className="font-mono">{token.address}</TableCell>
                            <TableCell>{token.price}</TableCell>
                            <TableCell className="text-right">
                              <Button className="mr-2" variant="default" size="sm" onClick={() => buyToken(token.address)}>
                                📦 Buy
                              </Button>
                              <Button className="mr-2" variant="default" size="sm" onClick={() => syncToken(token.address)}>
                                💵 Sync
                              </Button>
                              <Button variant="default" size="sm" onClick={() => removeTrackedToken(token.address)}>
                                ❌ Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
                {/* Purchased Token errors */}
                {failedPurchase && (
                  <Alert className="mt-4" variant={"destructive"}>
                    <AlertCircleIcon />
                    <AlertDescription>{failedPurchase}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
            {/* Purchased Tokens */}
            <Card className="mt-5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle>Swapped Tokens</CardTitle>
                  <CardDescription>Overview of all swapped tokens</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {purchases.length < 1 ? (
                  <div className="flex h-[250px] shrink-0 items-center justify-center rounded-md border bg-card">
                    <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
                      <CoinsIcon className="h-10 w-10 text-purple-600 animate-spin" />
                      <h3 className="mt-4 text-lg font-semibold">Waiting for Tokens</h3>
                      <p className="mb-4 mt-2 text-sm text-muted-foreground">No tokens have been bought yet!</p>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Token Address</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Cost/Token</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map((token, index) => (
                        <TableRow key={index}>
                          {token.image !== null && (
                            <TableCell>
                              <Image alt={"svs Logo"} height={45} width={45} src={token.image}></Image>
                            </TableCell>
                          )}
                          {token.image === null && (
                            <TableCell>
                              <Image alt={"svs Logo"} height={45} width={45} src={"/svs_logo.png"}></Image>
                            </TableCell>
                          )}
                          <TableCell>{token.name}</TableCell>
                          <TableCell className="font-mono">{token.token}</TableCell>
                          <TableCell>
                            <Link className="text-purple-600" href={"https://solscan.io/tx/" + token.tx}>
                              🔎{" "}
                              {(Number(token.amount) / 1_000_000).toLocaleString(undefined, {
                                minimumFractionDigits: 6,
                                maximumFractionDigits: 6,
                              })}{" "}
                              {token.name} for {token.solAmount} SOL
                            </Link>
                          </TableCell>
                          <TableCell>{token.solAmount && token.amount && (Number(token.solAmount) * LAMPORTS_PER_SOL) / Number(token.amount)}</TableCell>
                          <TableCell>{token.time}</TableCell>
                          <TableCell className="text-right">
                            {token.token && token.tx && token.amount && (
                              <>
                                <Button
                                  className="mr-2"
                                  variant="default"
                                  size="sm"
                                  onClick={() => sellToken(token.token, token.tx as string, token.amount as string)}
                                >
                                  👋 Sell
                                </Button>
                                <Button variant="default" size="sm" onClick={() => removeToken(token.tx as string)}>
                                  ❌ Remove
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
