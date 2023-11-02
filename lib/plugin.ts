import { Runner } from '../lib/blueprint/src/cli/cli';

export interface BlueprintPlugin {
    runners(): Runner[];
}
