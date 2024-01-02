type ParamInfoBase = {
    type: string;
    defaultValue?: string;
    optional?: boolean | null;
};

export interface ParamInfo extends ParamInfoBase {
    isNested?: false;
    isUnion?: false;
}

export interface ParamInfoUnion extends ParamInfoBase {
    type: 'union';
    isUnion: true;
    isNested?: false;
    types: Array<string | Parameters>;
}

export interface ParamInfoNested extends ParamInfoBase {
    type: 'nested';
    isNested: true;
    isUnion?: false;
    fields: Parameters;
}

// may go recursively for nested/splitted parameters
export type Parameters = Record<string, ParamInfo | ParamInfoNested | ParamInfoUnion>;

// example:
// "params": {
//     "amount": { "type": "bigint", "defaultValue": "toNano('0.1')" },
//     "additionalArgs": {
//         "type": "nested",
//         "optional": true,
//         "fields": {
//             "adminArgs": {
//                 "type": "nested",
//                 "fields": {
//                     "actionCost": { "type": "bigint" },
//                     "actionFee": { "type": "bigint" }
//                 }
//             },
//             "userArgs": {
//                 "type": "nested",
//                 "fields": {
//                     "actionsAmount": { "type": "number" },
//                     "enabled": { "type": "boolean" }
//                 }
//             },
//             "time": { "type": "number" }
//         }
//     }
// }

export type DeployData = {
    canBeCreatedFromConfig: boolean;
    codeHex?: string;
    configType?: Parameters;
};

export type Functions = Record<string, Parameters>;

export type WrapperInfo = {
    sendFunctions: Functions;
    getFunctions: Functions;
    path: string;
    deploy: DeployData;
};

export type WrappersData = Record<string, WrapperInfo>;

export type ParamConfig = {
    fieldTitle: string;
    overrideWithDefault?: boolean;
};

export type ParamsConfig = Record<string, ParamConfig>;

export type MethodConfig = {
    tabName: string;
    params: ParamsConfig;
};

export type GetMethodConfig = MethodConfig & {
    outNames: string[];
};

export type WrapperConfig = {
    defaultAddress: string;
    tabName: string;
    sendFunctions: Record<string, MethodConfig>;
    getFunctions: Record<string, GetMethodConfig>;
};

export type WrappersConfig = Record<string, WrapperConfig>;
