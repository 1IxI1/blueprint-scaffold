import { Runner, Args, UIProvider, buildAll } from '@ton/blueprint';
import arg from 'arg';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { findImportsOfList } from './parse/findImports';
import { parseWrappersToJSON } from './parse/wrappersToJSON';
import { platform } from 'os';
import { DAPP_DIR } from './paths';

const WRAPPERS_JSON = path.join(DAPP_DIR, 'public', 'wrappers.json');
const CONFIG_JSON = path.join(DAPP_DIR, 'public', 'config.json');

export const scaffold: Runner = async (args: Args, ui: UIProvider) => {
    const localArgs = arg({
        '--update': Boolean,
    });

    ui.write(`Scaffold script running, ${localArgs['--update'] ? 'updating' : 'generating'} dapp...\n\n`);

    ui.setActionPrompt('⏳ Compiling contracts...');
    try {
        await buildAll(ui);
    } catch (e) {
        ui.clearActionPrompt();
        ui.write((e as any).toString());
        ui.write(`\n❌ Failed to compile one of the files`);
        ui.write('Please make sure you can run `blueprint build --all` successfully before scaffolding.');
        process.exit(1);
    }
    ui.clearActionPrompt();
    ui.write('✅ Compiled.\n');

    let dappExisted = false;
    try {
        // try to access directories we will be working with
        await fs.access(DAPP_DIR);
        await fs.access(path.join(DAPP_DIR, 'public'));
        await fs.access(path.join(DAPP_DIR, 'src'));
        dappExisted = true;
    } catch (e) {}

    if (!localArgs['--update'] || !dappExisted) {
        if (localArgs['--update']) {
            ui.write('⚠️ Warning: no dapp found, a new one will be created.\n');
        }
        ui.setActionPrompt('📁 Creating dapp directory...');
        await fs.cp(path.join(__dirname, 'dapp'), DAPP_DIR, { recursive: true, force: true });
        // wrappersConfigTypes.ts is imported in blueprint, to parse wrappers,
        // we remove the compiled files from the destination.
        await fs.rm(path.join(DAPP_DIR, 'src', 'utils', 'wrappersConfigTypes.d.ts'));
        await fs.rm(path.join(DAPP_DIR, 'src', 'utils', 'wrappersConfigTypes.js'));
        ui.clearActionPrompt();
        ui.write('✅ Created dapp directory.\n');

        ui.setActionPrompt('📝 Setting title...');
        // convert module name from package.json
        // from kebab-case to CamelCase with space
        // e.g. my-contract -> My Contract
        const appName = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf-8'))
            .name.split('-')
            .map((s: string) => s[0].toUpperCase() + s.slice(1))
            .join(' ');
        const envFile = path.join(DAPP_DIR, '.env');
        const env = await fs.readFile(envFile, 'utf-8');
        await fs.writeFile(envFile, env.replace('My Contract', appName));

        ui.clearActionPrompt();
        ui.write('✅ Set title.\n');
    }
    ui.setActionPrompt('📝 Updating dapp configs...');
    const wrappersFiles = await parseWrappersToJSON(ui, WRAPPERS_JSON, CONFIG_JSON);
    ui.clearActionPrompt();
    ui.write('✅ Updated dapp configs.\n');

    ui.setActionPrompt('📁 Copying wrappers into dapp...');
    await fs.mkdir(path.join(DAPP_DIR, 'src', 'wrappers'), { recursive: true });

    const filesToCopy = await findImportsOfList(wrappersFiles, process.cwd());
    for (const filePath of filesToCopy) {
        const relativePath = path.relative(process.cwd(), filePath);
        await fs.cp(filePath, path.join(DAPP_DIR, 'src', relativePath), {
            force: true,
        });
    }

    ui.clearActionPrompt();
    ui.write('✅ Copied wrappers into dapp.\n');

    ui.setActionPrompt('🧹 Running prettier...');
    // prettier is not essential for running the dapp
    // therefore, ignore warnings/errors when running prettier
    const isWindows = platform() === 'win32';
    const suppressWarningsCmd = isWindows ? '2> NUL' : '2> /dev/null';
    execSync(`npx prettier --write . ${suppressWarningsCmd}`, { cwd: DAPP_DIR });
    ui.clearActionPrompt();
    ui.write('✅ Ran prettier.\n');

    ui.write('✅ Scaffold complete!\n');

    ui.write('\nTo start the dapp, run (will take a few minutes):\n');
    ui.write('cd dapp && npm install && npm run start\n\n');

    ui.write('To build for production, run (will take some more minutes):\n');
    ui.write('cd dapp && npm install && npm run build && serve -s build\n\n');
};
