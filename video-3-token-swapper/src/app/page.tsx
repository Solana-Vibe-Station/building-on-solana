"use client";

import { useEffect, useState } from "react";
import { BuySettingsDialog } from "@/components/buy-settings-dialog";
import { getBuySettings, getTokenPurchases, removeTokenPurchase, saveTokenPurchase, TokenPurchase } from "@/utils/buy-settings";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTokenPrices, isValidSolanaToken, SwapInformation, swapToken } from "./server/services/tokenService";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon, CoinsIcon, Loader2 } from "lucide-react";
import Image from "next/image";
import { AppSidebar } from "@/components/app-sidebar";
import Link from "next/link";

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

    // Verify if this is a valid tken
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
    }

    const tokenData = updatedTokens.data;
    if (tokenData && tokenData.length > 0) {
      // Add the token with data from the API
      setTokens([...tokens, tokenData[0]]);
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
    }

    // Extract the token data
    const tokenData = updatedTokens.data;
    if (tokenData && tokenData.length > 0) {
      // Update the tokens state with the new prices
      setTokens(tokenData);
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
    }

    // Extract the token data
    const tokenData = updatedTokens.data;
    if (tokenData && tokenData.length > 0) {
      // Update only this token's price in the state
      setTokens((prevTokens) => prevTokens.map((token) => (token.address === tokenAddress ? { ...token, price: tokenData[0].price } : token)));
    }

    // Reset States
    setSyncingTokenAddress(false);
  };

  // Load settings from localStorage when dialog opens or when purchaseCounter changes
  useEffect(() => {
    const TokenPurchases = getTokenPurchases();
    setPurchases(TokenPurchases);
  }, [purchaseCounter]); // Add purchaseCounter as a dependency

  // Buy and remove Token
  const buyToken = async (tokenAddress: string) => {
    try {
      //Update States
      setFailedPurchase(null);

      // Get settings from localStorage using our utility function
      const buySettings = getBuySettings();

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

      // Save the purchase to localStorage
      saveTokenPurchase(purchasedToken);

      // Increment the purchase counter to trigger the useEffect
      setPurchaseCounter((prev) => prev + 1);
    } catch (error) {
      setFailedPurchase("An unexpected error occurred during the purchase");
    }
  };
  const removeToken = async (tx: string) => {
    try {
      //Update States
      setFailedPurchase(null);

      // Save the purchase to localStorage
      removeTokenPurchase(tx);

      // Decrease the purchase counter to trigger the useEffect
      setPurchaseCounter((prev) => prev - 1);
    } catch (error) {
      setFailedPurchase("An unexpected error occurred during the removal");
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
                <form onSubmit={addToken} className="flex items-end gap-2 mb-6">
                  <div className="flex-1">
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
                    />
                  </div>
                  <Button type="submit">Add Token</Button>
                </form>
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
                              <Button className="mr-2" variant="default" size="sm" onClick={() => syncToken(token.address)}>
                                💵 Sync
                              </Button>
                              <Button variant="default" size="sm" onClick={() => buyToken(token.address)}>
                                📦 Buy
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
                              🔎 {token.amount} {token.name} for {token.solAmount} SOL
                            </Link>
                          </TableCell>
                          <TableCell>{token.time}</TableCell>
                          <TableCell className="text-right">
                            {token.tx && (
                              <Button variant="default" size="sm" onClick={() => removeToken(token.tx as string)}>
                                ❌ Remove
                              </Button>
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
