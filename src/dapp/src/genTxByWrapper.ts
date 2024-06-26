import { CHAIN, ITonConnect } from "@tonconnect/sdk";
import { TonClient4 } from "@ton/ton";
import { getHttpV4Endpoint } from "@orbs-network/ton-access";
import { Address, beginCell, Cell, Sender, SenderArguments, SendMode, storeStateInit } from "@ton/core";
import { ParamsWithValue } from "./components/ActionCard";
import { Parameters } from "./utils/wrappersConfigTypes";
import { TonConnectUI } from "@tonconnect/ui-react";

class TonConnectSender implements Sender {
  #provider: TonConnectUI;
  readonly address?: Address;

  constructor(provider: TonConnectUI) {
    this.#provider = provider;
    if (provider.wallet) this.address = Address.parse(provider.wallet?.account.address);
    else this.address = undefined;
  }

  async send(args: SenderArguments): Promise<void> {
    if (!(args.sendMode === undefined || args.sendMode == SendMode.PAY_GAS_SEPARATELY)) {
      throw new Error("Deployer sender does not support `sendMode` other than `PAY_GAS_SEPARATELY`");
    }

    await this.#provider.sendTransaction({
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: args.to.toString(),
          amount: args.value.toString(),
          payload: args.body?.toBoc().toString("base64"),
          stateInit: args.init
            ? beginCell().storeWritable(storeStateInit(args.init)).endCell().toBoc().toString("base64")
            : undefined,
        },
      ],
    });
  }
}

export const basicParamTypes = [
  "Address",
  "boolean",
  "Buffer",
  "bigint",
  "number",
  "string",
  "Cell",
  "Builder",
  "Slice",
  "null",
];

function paramsToArgs(params: ParamsWithValue): any[] {
  // there may be nested objects
  // {
  //   "options": {
  //     "type": "HeavySpamOptions",
  //     "optional": false,
  //     "value": {
  //       "msgsLimitPerBlock": {
  //         "type": "number",
  //         "optional": true,
  //         "value": "1"
  //       },
  //       ...
  //     }
  //   },
  //   "value": {
  //     "type": "bigint",
  //     "optional": false,
  //     "value": "0"
  //   }
  // }
  // should return
  // {
  //   "options": {
  //     "msgsLimitPerBlock": 1,
  //     "initialMsgSize": 1,
  //     "msgSizeLimit": 1,
  //     "msgGrowthPerBlock": 1,
  //     "untilUtime": 1
  //     },
  //     "value": 0
  // }
  function checkIsTypeBasic(typestr: string): boolean {
    for (const basicType of basicParamTypes) {
      if (
        basicType === typestr ||
        "Array<".concat(basicType).concat(">") === typestr ||
        basicType.concat("[]") === typestr
      )
        return true;
    }
    return false;
  }
  const args: any[] = [];
  for (const param in params) {
    if (checkIsTypeBasic(params[param].type)) {
      args.push(params[param].value);
    } else {
      // create object and push into args
      const obj: any = {};
      for (const subParam in params[param].value) {
        obj[subParam] = params[param].value[subParam].value;
      }
      args.push(obj);
    }
  }
  return args;
}

export class Executor {
  #client: TonClient4;
  #via?: Sender;

  constructor(client: TonClient4, via?: Sender) {
    this.#client = client;
    this.#via = via;
  }

  static async createFromUI(tcUI: TonConnectUI) {
    let via: TonConnectSender | undefined;
    let network: "mainnet" | "testnet" = "mainnet"; // if no wallet, will be mainnet
    if (tcUI.wallet) {
      via = new TonConnectSender(tcUI);
      network = tcUI.wallet.account.chain === CHAIN.MAINNET ? "mainnet" : "testnet";
    } else console.warn("No wallet connected, only the get methods");

    const tc = new TonClient4({
      endpoint: await getHttpV4Endpoint({ network }),
    });
    return new Executor(tc, via);
  }

  async send(
    contractAddr: Address,
    wrapperPath: string,
    className: string,
    methodName: string,
    params: ParamsWithValue,
  ) {
    if (!this.#via) throw new Error("No sender connected!");
    wrapperPath = wrapperPath.replace(".ts", "");
    const Wrapper = (
      await import(
        /* @vite-ignore */
        `${wrapperPath}.ts`
      )
    )[className];
    const contractProvider = this.#client.open(Wrapper.createFromAddress(contractAddr));
    const args = paramsToArgs(params);
    return await contractProvider[methodName](this.#via, ...args);
  }

  async get(
    contractAddr: Address,
    wrapperPath: string,
    className: string,
    methodName: string,
    params: ParamsWithValue,
  ) {
    wrapperPath = wrapperPath.replace(".ts", "");
    const Wrapper = (
      await import(
        /* @vite-ignore */
        `${wrapperPath}.ts`
      )
    )[className];
    const contractProvider = this.#client.open(Wrapper.createFromAddress(contractAddr));
    const args = paramsToArgs(params);
    return await contractProvider[methodName](...args);
  }

  async deploy(
    wrapperPath: string,
    className: string,
    params: ParamsWithValue,
    configType: Parameters,
    codeHex: string,
  ): Promise<Address> {
    if (!this.#via) throw new Error("No sender connected!");
    wrapperPath = wrapperPath.replace(".ts", "");
    const Wrapper = (
      await import(
        /* @vite-ignore */
        `${wrapperPath}.ts`
      )
    )[className];

    const contractConfig: { [key: string]: any } = {};
    for (const configField in configType) {
      // TODO: here also maybe some nested type. maybe need using paramsToArgs
      contractConfig[configField] = params[configField].value;
      delete params[configField];
    }
    const codeCell = Cell.fromBoc(Buffer.from(codeHex, "hex"))[0];
    const w = Wrapper.createFromConfig(contractConfig, codeCell);
    const contractProvider = this.#client.open(w);
    const args = paramsToArgs(params);
    await contractProvider.sendDeploy(this.#via, ...args);
    return contractProvider.address;
  }
}
