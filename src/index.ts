import { BlueprintPlugin } from '../lib/plugin';
import { scaffold } from './scaffold';

export class ScaffoldPlugin implements BlueprintPlugin {
    runners() {
        return [scaffold];
    }
}
