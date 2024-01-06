import { WrappersData, WrappersConfig } from "./wrappersConfigTypes";

export const loadWrappersFromJSON = async (): Promise<[WrappersData, WrappersConfig]> => {
  const wrappers = await import("../config/wrappers.json");
  const config = await import("../config/config.json");
  return [wrappers.default, config.default];
};
