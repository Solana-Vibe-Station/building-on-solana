import fs from "fs";
import path from "path";

/**
 * Interface for benchmark record
 */
interface BenchmarkRecord {
  token: string;
  timestamp: number;
  source: string;
}

/**
 * Interface for token pair data
 */
interface TokenPair {
  token: string;
  grpcTimestamp?: number;
  wssTimestamp?: number;
  timeDifference?: number;
  fasterSource?: string;
}

/**
 * Interface for benchmark statistics
 */
interface BenchmarkStats {
  totalTokens: number;
  tokensPerSource: {
    grpc: number;
    wss: number;
  };
  averageTimeFaster: {
    source: string;
    milliseconds: number;
  };
  averageTimeDifference: number;
  maxTimeDifference: number;
  minTimeDifference: number;
  fastestSource: {
    source: string;
    count: number;
    percentage: number;
  };
  completePairs: number;
  incompletePairs: number;
  duration: {
    totalMs: number;
    startTimestamp: number;
    endTimestamp: number;
  };
}

/**
 * Saves benchmark data to a JSON file
 * @param source The source of the data (e.g., "grpc" or "wss")
 * @param timestamp The timestamp when the data was received
 * @param token The token address
 * @returns A promise that resolves when the data is saved
 */
export async function saveBenchmarkData(source: string, timestamp: number, token: string): Promise<void> {
  try {
    // Create the data object
    const data = {
      token,
      timestamp,
      source,
    };

    // Path to the output file
    const outputFilePath = path.resolve(process.cwd(), "benchmark-data.json");

    // Read existing data if file exists
    let existingData: any[] = [];
    if (fs.existsSync(outputFilePath)) {
      try {
        const fileContent = fs.readFileSync(outputFilePath, "utf-8");
        existingData = JSON.parse(fileContent);

        // Ensure existingData is an array
        if (!Array.isArray(existingData)) {
          existingData = [];
        }
      } catch (error) {
        console.error("Error reading existing benchmark data:", error);
        // Continue with empty array if file is corrupted
      }
    }

    // Add new data to existing data
    existingData.push(data);

    // Write the updated data back to the file
    await fs.promises.writeFile(outputFilePath, JSON.stringify(existingData, null, 2));

    // Output benchmark statistics after adding new data
    //await outputBenchmarkStats();
  } catch (error) {
    console.error("Error saving benchmark data:", error);
    throw error;
  }
}

/**
 * Analyzes benchmark data and outputs statistics
 * @returns A promise that resolves when the statistics are calculated and output
 */
export async function outputBenchmarkStats(): Promise<void> {
  try {
    // Path to the benchmark data file
    const dataFilePath = path.resolve(process.cwd(), "benchmark-data.json");

    // Check if the file exists
    if (!fs.existsSync(dataFilePath)) {
      console.log("No benchmark data found.");
      return;
    }

    // Read the benchmark data
    const fileContent = fs.readFileSync(dataFilePath, "utf-8");
    const benchmarkData: BenchmarkRecord[] = JSON.parse(fileContent);

    // Ensure we have data to analyze
    if (!Array.isArray(benchmarkData) || benchmarkData.length === 0) {
      console.log("No benchmark data found.");
      return;
    }

    // Exclude the last added record
    const dataToAnalyze = benchmarkData.slice(0, -1);

    // Group data by token
    const tokenMap = new Map<string, TokenPair>();

    dataToAnalyze.forEach((record) => {
      const { token, timestamp, source } = record;

      if (!tokenMap.has(token)) {
        tokenMap.set(token, { token });
      }

      const tokenPair = tokenMap.get(token)!;

      if (source === "grpc") {
        tokenPair.grpcTimestamp = timestamp;
      } else if (source === "wss") {
        tokenPair.wssTimestamp = timestamp;
      }

      // Calculate time difference if both timestamps are available
      if (tokenPair.grpcTimestamp !== undefined && tokenPair.wssTimestamp !== undefined) {
        tokenPair.timeDifference = Math.abs(tokenPair.wssTimestamp - tokenPair.grpcTimestamp);
        tokenPair.fasterSource = tokenPair.grpcTimestamp < tokenPair.wssTimestamp ? "grpc" : "wss";
      }
    });

    // Convert the map to an array of token pairs
    const tokenPairs = Array.from(tokenMap.values());

    // Calculate statistics

    // Find min and max timestamps for duration calculation
    let minTimestamp = Number.MAX_SAFE_INTEGER;
    let maxTimestamp = 0;

    dataToAnalyze.forEach((record) => {
      if (record.timestamp < minTimestamp) {
        minTimestamp = record.timestamp;
      }
      if (record.timestamp > maxTimestamp) {
        maxTimestamp = record.timestamp;
      }
    });

    const stats: BenchmarkStats = {
      totalTokens: tokenPairs.length,
      tokensPerSource: {
        grpc: tokenPairs.filter((pair) => pair.grpcTimestamp !== undefined).length,
        wss: tokenPairs.filter((pair) => pair.wssTimestamp !== undefined).length,
      },
      averageTimeFaster: {
        source: "",
        milliseconds: 0,
      },
      averageTimeDifference: 0,
      maxTimeDifference: 0,
      minTimeDifference: Number.MAX_SAFE_INTEGER,
      fastestSource: {
        source: "",
        count: 0,
        percentage: 0,
      },
      completePairs: 0,
      incompletePairs: 0,
      duration: {
        totalMs: maxTimestamp - minTimestamp,
        startTimestamp: minTimestamp,
        endTimestamp: maxTimestamp,
      },
    };

    // Filter complete pairs (pairs with both grpc and wss timestamps)
    const completePairs = tokenPairs.filter((pair) => pair.grpcTimestamp !== undefined && pair.wssTimestamp !== undefined);

    stats.completePairs = completePairs.length;
    stats.incompletePairs = tokenPairs.length - completePairs.length;

    if (completePairs.length > 0) {
      // Calculate time differences
      const timeDifferences = completePairs.map((pair) => pair.timeDifference!);
      stats.averageTimeDifference = timeDifferences.reduce((sum, diff) => sum + diff, 0) / timeDifferences.length;
      stats.maxTimeDifference = Math.max(...timeDifferences);
      stats.minTimeDifference = Math.min(...timeDifferences);

      // Count fastest sources
      const grpcFasterCount = completePairs.filter((pair) => pair.fasterSource === "grpc").length;
      const wssFasterCount = completePairs.filter((pair) => pair.fasterSource === "wss").length;

      if (grpcFasterCount > wssFasterCount) {
        stats.fastestSource.source = "grpc";
        stats.fastestSource.count = grpcFasterCount;
      } else {
        stats.fastestSource.source = "wss";
        stats.fastestSource.count = wssFasterCount;
      }

      stats.fastestSource.percentage = (stats.fastestSource.count / completePairs.length) * 100;

      // Calculate average time faster
      const grpcFasterDiffs = completePairs.filter((pair) => pair.fasterSource === "grpc").map((pair) => pair.timeDifference!);

      const wssFasterDiffs = completePairs.filter((pair) => pair.fasterSource === "wss").map((pair) => pair.timeDifference!);

      if (grpcFasterCount > 0 && grpcFasterCount >= wssFasterCount) {
        stats.averageTimeFaster.source = "grpc";
        stats.averageTimeFaster.milliseconds = grpcFasterDiffs.reduce((sum, diff) => sum + diff, 0) / grpcFasterCount;
      } else if (wssFasterCount > 0) {
        stats.averageTimeFaster.source = "wss";
        stats.averageTimeFaster.milliseconds = wssFasterDiffs.reduce((sum, diff) => sum + diff, 0) / wssFasterCount;
      }
    }

    // Output the statistics with clear formatting
    console.log("\n===== BENCHMARK STATISTICS =====");
    console.log(`Total tokens analyzed: ${stats.totalTokens}`);
    console.log(`Total tokens per source: gRPC: ${stats.tokensPerSource.grpc}, WSS: ${stats.tokensPerSource.wss}`);
    console.log(""); // Add extra line break

    if (stats.completePairs > 0) {
      console.log(`Complete pairs: ${stats.completePairs}`);
      console.log(`Incomplete pairs: ${stats.incompletePairs}`);
      console.log(""); // Add extra line break

      console.log(
        `Fastest source: ${stats.fastestSource.source.toUpperCase()} (${stats.fastestSource.count} times, ${stats.fastestSource.percentage.toFixed(2)}%)`
      );
      console.log(`Average time faster: ${stats.averageTimeFaster.source.toUpperCase()} is faster by ${stats.averageTimeFaster.milliseconds.toFixed(2)} ms`);
      console.log(""); // Add extra line break

      console.log(`Average time difference: ${stats.averageTimeDifference.toFixed(2)} ms`);
      console.log(`Maximum time difference: ${stats.maxTimeDifference.toFixed(2)} ms`);
      console.log(`Minimum time difference: ${stats.minTimeDifference.toFixed(2)} ms`);
      console.log(""); // Add extra line break

      // Format duration in a human-readable way
      const durationSeconds = stats.duration.totalMs / 1000;
      const durationMinutes = durationSeconds / 60;

      console.log(`Total benchmark duration: ${stats.duration.totalMs.toFixed(0)} ms (${durationSeconds.toFixed(2)} seconds)`);
      if (durationMinutes >= 1) {
        console.log(`                        ${durationMinutes.toFixed(2)} minutes`);
      }
      console.log(`Start time: ${new Date(stats.duration.startTimestamp).toISOString()}`);
      console.log(`End time: ${new Date(stats.duration.endTimestamp).toISOString()}`);
    } else {
      console.log("Not enough complete pairs to calculate time statistics.");
    }

    console.log("================================\n");
  } catch (error) {
    console.error("Error analyzing benchmark data:", error);
  }
}
