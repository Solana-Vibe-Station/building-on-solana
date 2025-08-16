import dotenv from "dotenv";
import { config } from "./config";
import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate, SubscribeUpdateTransaction } from "@triton-one/yellowstone-grpc";
import { ClientDuplexStream } from "@grpc/grpc-js";
import { PublicKey } from "@solana/web3.js";
import { CompiledInstruction, TokenBalance, TxMessage } from "./types";
import bs58 from "bs58";
import { saveBenchmarkData } from "./benchmark";

// Load environment variables from the .env file
dotenv.config();

// Set Constants
const GRPC_ENDPOINT = process.env.SVS_GRPC_HTTP || null;
const GRPC_XTOKEN = process.env.SVS_GRPC_XTOKEN || null;
const GRPC_COMMITMENT_LEVEL = CommitmentLevel.CONFIRMED;
const PROGRAM_ID = config.program.id;
const PROGRAM_META_LOGS = config.program.meta_logs;
const PROGRAM_INSTRUCTION = config.program.instruction;
const WSOL = config.wsol_pc_mint;

// gRPC specifc functions
function returnSubscribeRequest(): SubscribeRequest {
  return {
    accounts: {},
    slots: {},
    transactions: {
      svsgrpc: {
        accountInclude: [PROGRAM_ID],
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    commitment: GRPC_COMMITMENT_LEVEL,
    accountsDataSlice: [],
    ping: undefined,
  };
}
function sendSubscribeRequest(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>, request: SubscribeRequest): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream.write(request, (err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
function createGrpcStreamListeners(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    stream.on("data", handleGrpcData);
    stream.on("error", (error: Error) => {
      console.error("❌ An error occured during gRPC data streaming", error);
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      resolve();
    });
    stream.on("close", () => {
      resolve();
    });
  });
}
function matchesGrpcCreationData(ix: CompiledInstruction): boolean {
  return ix?.data && PROGRAM_INSTRUCTION.some((instruction) => Buffer.from(instruction).equals(ix.data.slice(0, 8)));
}

// Establish a connection to the Yellowstone gRPC server and subscribe to events.
async function grpc(): Promise<void> {
  if (!GRPC_ENDPOINT || !GRPC_XTOKEN) {
    console.log("❌ Could not start gRPC stream. Missing endpoint or x-token.");
    return;
  }

  // Initiate gRPC client and subscription
  const gClient = new Client(GRPC_ENDPOINT, GRPC_XTOKEN, {});
  const gStream = await gClient.subscribe();
  const gRequest = returnSubscribeRequest();

  try {
    /**
     *  Subscribe to the stream and send the subscribe request.
     *  The stream will emit events based on the subscription request.
     */
    await sendSubscribeRequest(gStream, gRequest);

    // Log the subscription request to the console.
    console.log("✅ Subscription request sent successfully.");

    /**
     * Handle stream events such as data, error, end, and close.
     * This function will process the incoming data and handle errors.
     */
    await createGrpcStreamListeners(gStream);
  } catch (error) {
    console.error("❌ Error occured during the subscription process", error);
    gStream.end();
  }
}

// Returns if the data is a Subscribe Update object with a transaction property
export function isValidGrpcData(data: SubscribeUpdate): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
  return (
    "transaction" in data &&
    typeof data.transaction === "object" &&
    data.transaction !== null &&
    "slot" in data.transaction &&
    "transaction" in data.transaction &&
    data.filters.includes("svsgrpc")
  );
}

// Handles the incoming data from the gRPC stream.
function handleGrpcData(data: SubscribeUpdate): void {
  if (!isValidGrpcData(data)) {
    return;
  }

  // Get required parameters
  const tx = data.transaction?.transaction;
  const message = tx?.transaction?.message;
  const meta = tx?.meta;
  const instructions = message?.instructions;
  const logMessages = meta?.logMessages;

  if (!tx || !message || !instructions || !logMessages) {
    return;
  }

  // Find event based on log or instruction
  if (!instructions.find(matchesGrpcCreationData) && !logMessages.includes(PROGRAM_META_LOGS[0])) {
    return;
  }

  // Convert the transaction signature to base58 format.
  const hrSignature = bs58.encode(Buffer.from(tx.signature));

  // Log Account Keys
  // if (message.instructions && message.accountKeys) {
  //   if (!logViaAccountKeys(message, hrSignature)) {
  //     console.log("❌ Failed to log account keys.");
  //   }
  // }

  // Log Token balances mints
  const tokenBalances: TokenBalance[] = meta?.preTokenBalances?.length !== 0 ? meta?.preTokenBalances : meta?.postTokenBalances;
  if (tokenBalances) {
    if (!logViaTokenBalances(tokenBalances, hrSignature)) {
      console.log("❌ Failed to log token balances.");
    }
  }
}

// Loggers
function logViaAccountKeys(message: TxMessage, signature: string): boolean {
  try {
    const matchingInstruction = message.instructions.find(matchesGrpcCreationData);
    if (!matchingInstruction) {
      return false;
    }

    // {
    //   programIdIndex: 8,
    //   accounts: <Buffer 01 09 02 03 0a 0b 04 00 0c 0d 0e 0f 10 08>,
    //   data: <Buffer 18 1e c8 28 05 1c 07 77 11 00 00 00 4d 6f 72 67 61 6e 20 57 61 6c 6c 65 6e 20 44 6f 67 0a 00 00 00 57 61 6c 6c 65 6e 20 44 6f 67 43 00 00 00 68 74 74 ... 96 more bytes>
    // }

    const accountKeys = message.accountKeys;

    // [
    //   <Buffer 0b 7e 08 fa 85 fb a4 1a 45 ff 0a bc c9 f2 da ae d1 d0 40 64 1f 7d f1 4b 69 a8 98 bc f3 1c d9 24>,
    //   <Buffer d6 55 c7 5a 21 00 9f 6a 1d 95 d2 13 45 ac cb d5 18 00 b1 7d 71 e3 9f 54 88 ff a4 05 78 6c 7a 3f>,
    //   <Buffer 48 97 6b d0 ca 5f dc da 34 c2 b3 74 83 0b 9a d5 8b fd b5 e7 64 52 78 7c 1d e8 7c 3e 0c c7 cf 43>,
    //   <Buffer a9 ad fd e9 35 d4 9d 25 2b 53 e1 bb e3 4c c3 33 c0 99 89 ea a9 ba 92 90 f3 f1 1b 4a 7e e8 32 04>,
    //   <Buffer cf 39 42 c4 a9 1d e6 67 c6 0f b0 f0 e0 f2 2a b2 98 57 1b 36 6e f5 30 50 6b e1 b4 2a 53 4a f1 6b>,
    //   <Buffer e1 bd 8e 56 23 83 54 26 5e ef 43 e5 39 a5 93 17 97 95 97 4a 34 c1 26 82 0d 8f 3e e9 e0 7e e3 fb>,
    //   <Buffer 63 83 73 00 0e a2 2c b2 64 d3 4a ff 64 a0 4b 5e fa bf bb 74 dd cd 04 89 97 b1 98 15 47 d7 d1 10>,
    //   <Buffer 03 06 46 6f e5 21 17 32 ff ec ad ba 72 c3 9b e7 bc 8c e5 bb c5 f7 12 6b 2c 43 9b 3a 40 00 00 00>,
    //   <Buffer 01 56 e0 f6 93 66 5a cf 44 db 15 68 bf 17 5b aa 51 89 cb 97 f5 d2 ff 3b 65 5d 2b b6 fd 6d 18 b0>,
    //   <Buffer 06 c5 c1 ce 63 8d 25 67 d2 64 68 b0 5e b9 51 d1 a2 8d cc 6e 12 34 82 b5 c6 75 14 97 70 e6 2b f2>,
    //   <Buffer 3a 86 5e 69 ee 0f 54 80 ca bc f6 63 57 e4 dc 2f 18 d5 8d 45 c1 ea 74 89 fb 37 23 d9 79 3c 72 a6>,
    //   <Buffer 0b 70 65 b1 e3 d1 7c 45 38 9d 52 7f 6b 04 c3 cd 58 b8 6c 73 1a a0 fd b5 49 b6 d1 bc 03 f8 29 46>,
    //   <Buffer 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00>,
    //   <Buffer 06 dd f6 e1 d7 65 a1 93 d9 cb e1 46 ce eb 79 ac 1c b4 85 ed 5f 5b 37 91 3a 8c f5 85 7e ff 00 a9>,
    //   <Buffer 8c 97 25 8f 4e 24 89 f1 bb 3d 10 29 14 8e 0d 83 0b 5a 13 99 da ff 10 84 04 8e 7b d8 db e9 f8 59>,
    //   <Buffer 06 a7 d5 17 19 2c 5c 51 21 8c c9 4c 3d 4a f1 7f 58 da ee 08 9b a1 fd 44 e3 db d9 8a 00 00 00 00>,
    //   <Buffer ac f1 36 eb 01 fc 1c 4e 88 3d 23 c8 b5 84 4a b5 9a 37 f6 6a dd 57 c5 e9 ac 3b 53 e0 59 d3 5c 64>
    // ]

    const publicKey = accountKeys[config.program.mint_index];
    const mint = new PublicKey(publicKey).toBase58();

    saveBenchmarkData("grpc", Date.now(), mint);

    console.log("📄 Signature:", signature);
    console.log("📜 Token CA:", mint + `\n\n`);
    return true;
  } catch (err) {
    return false;
  }
}
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

    saveBenchmarkData("grpc", Date.now(), mint);

    console.log("📄 Signature:", signature);
    console.log("📜 Token CA:", mint + `\n\n`);
    return true;
  } catch (err) {
    return false;
  }
}

grpc().catch((err) => {
  console.error("Unhandled error in grpc:", err);
  process.exit(1);
});
