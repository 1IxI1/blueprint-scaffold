import { Plugin, PluginRunner } from '@ton/blueprint';
import { scaffold } from './scaffold';

export class ScaffoldPlugin implements Plugin {
  runners(): PluginRunner[] {
    return [
      {
        name: 'scaffold',
        runner: scaffold,
        help: `Usage: blueprint scaffold [flags]

Generates a dapp using the contracts described in the wrappers/ directory.

Flags:
--update - prevents regenerating whole dapp, and just updates the wrappers already present in the dapp/ directory. Does not affect if generating for the first time.`,
      },
    ];
  }
}
