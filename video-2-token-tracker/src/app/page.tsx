"use client";

import { useState } from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTokenPrices, isValidSolanaToken } from "./server/services/tokenService";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon, Loader2 } from "lucide-react";
import Image from "next/image";
import { AppSidebar } from "@/components/app-sidebar";

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
  const [tokenAddress, setTokenAddress] = useState("");
  const [invalidToken, setInvalidToken] = useState<string | null>(null);
  const [isAddingToken, setIsAddingToken] = useState(false);
  const [isSyncingAllPrices, setIsSyncingAllPrices] = useState(false);
  const [syncingTokenAddress, setSyncingTokenAddress] = useState(false);

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
                <Button variant="outline" size="sm" onClick={syncTokens}>
                  Sync Tokens
                </Button>
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
                    <TableCaption>List of tracked tokens</TableCaption>
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
                              <Button variant="default" size="sm" onClick={() => syncToken(token.address)}>
                                💵 Sync Token
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
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
