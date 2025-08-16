import { outputBenchmarkStats } from ".";

// Call the function to output benchmark statistics
outputBenchmarkStats()
  .then(() => {
    console.log("✅ Benchmark statistics completed.");
  })
  .catch((error) => {
    console.error("❌ Error showing benchmark statistics:", error);
  });
