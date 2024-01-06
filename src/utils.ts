import fs from "fs/promises";
import path from "path";
import { BUILD_DIR, WRAPPERS_DIR } from "./paths";

export const findWrappers = async () =>
  (await fs.readdir(WRAPPERS_DIR))
    .filter((f) => f.match(/^[A-Z][a-zA-Z0-9]*\.ts$/))
    .map((f) => ({ path: path.join(WRAPPERS_DIR, f), name: path.parse(f).name }));

export const readCompiled = async (name: string): Promise<string> => {
  const filePath = path.join(BUILD_DIR, name + ".compiled.json");
  return JSON.parse(await fs.readFile(filePath, "utf-8"))["hex"];
};
