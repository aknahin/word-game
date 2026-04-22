import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import wordListPath from "word-list";

const outputDir = path.resolve("public");
const outputPath = path.join(outputDir, "word-directory.txt");

const source = await readFile(wordListPath, "utf8");
const words = source
  .split("\n")
  .map((word) => word.trim().toUpperCase())
  .filter((word) => /^[A-Z]+$/.test(word))
  .filter((word) => word.length >= 3 && word.length <= 30);

const uniqueSortedWords = Array.from(new Set(words)).sort();

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${uniqueSortedWords.join("\n")}\n`, "utf8");

console.log(`Wrote ${uniqueSortedWords.length} words to ${outputPath}`);
