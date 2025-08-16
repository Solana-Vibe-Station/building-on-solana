/**
 * TyteScript types for the Solana gRPC client reponses
 */
export interface CompiledInstruction {
  programIdIndex: number;
  accounts: Uint8Array;
  data: Uint8Array;
}
export interface TxMessage {
  header: TxMessageHeader | undefined;
  accountKeys: Uint8Array[];
  recentBlockhash: Uint8Array;
  instructions: CompiledInstruction[];
  versioned: boolean;
  addressTableLookups: TxMessageAddressTableLookups[];
}
export interface TxMessageHeader {
  numRequiredSignatures: number;
  numReadonlySignedAccounts: number;
  numReadonlyUnsignedAccounts: number;
}
export interface TxMessageAddressTableLookups {
  accountKey: Uint8Array;
  writableIndexes: Uint8Array;
  readonlyIndexes: Uint8Array;
}

type TokenAmount = {
  /** Raw amount of tokens as string ignoring decimals */
  amount: string;
  /** Number of decimals configured for token's mint */
  decimals: number;
  /** Token amount as float, accounts for decimals */
  uiAmount: number | null;
  /** Token amount as string, accounts for decimals */
  uiAmountString?: string;
};
export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount?: TokenAmount;
}
