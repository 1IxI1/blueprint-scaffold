import { WrappersConfig, WrappersData } from './wrappersConfigTypes';

export const loadWrappersFromJSON = async (): Promise<[WrappersData, WrappersConfig]> => {
    const responseWrappers = await fetch(`${import.meta.env.VITE_PUBLIC_URL}/wrappers.json`);
    const responseConfig = await fetch(`${import.meta.env.VITE_PUBLIC_URL}/config.json`);
    const jsonWrappers = await responseWrappers.json();
    const jsonConfig = await responseConfig.json();
    return [jsonWrappers, jsonConfig];
};
