import fs from 'fs/promises';
import * as babelParser from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';

import { Node, Identifier, TSInterfaceDeclaration, TSTypeAliasDeclaration, TSTypeAnnotation } from '@babel/types';
import { ParamInfo, Parameters, Functions, WrapperInfo, ParamInfoNested } from '../dapp/src/utils/wrappersConfigTypes';
import { readCompiled } from '../utils';

export async function parseWrapper(filePath: string, className: string): Promise<WrapperInfo> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ast = babelParser.parse(content, {
        sourceType: 'module',
        plugins: ['typescript'],
        attachComment: false,
        ranges: false,
        createParenthesizedExpressions: true,
    });
    if (ast.errors.length > 0) throw ast.errors;

    let sendFunctions: Functions = {};
    let getFunctions: Functions = {};
    let canBeCreatedFromConfig = false;
    let canBeCreatedFromAddress = false;
    let configType: Parameters | undefined = undefined;

    function isTypeDefinedInFile(typeName: string, ast: any): boolean {
        let isDefined = false;
        traverse(ast, {
            TSTypeAliasDeclaration(path) {
                if (path.node.id.name === typeName) {
                    isDefined = true;
                }
            },
            TSInterfaceDeclaration(path) {
                if (path.node.id.name === typeName) {
                    isDefined = true;
                }
            },
        });
        return isDefined;
    }

    function parseTypeObject(typeName: string, ast: any): Parameters {
        // parse interface/type alias for object like
        // type MyDeepType = {
        //     c: bigint;
        //     v: Address
        // }
        // by its name.
        let _params: Parameters = {};

        // intenal function for 2 cases - alias and interface types
        function _handleObjectType(path: NodePath<TSTypeAliasDeclaration | TSInterfaceDeclaration>) {
            // SAME NAME
            if (path.node.id.name === typeName) {
                path.traverse({
                    // FOR EACH FIELD
                    TSPropertySignature(propertyPath) {
                        const ta = propertyPath.node.typeAnnotation;
                        if (propertyPath.node.key.type == 'Identifier' && ta?.type == 'TSTypeAnnotation') {
                            const optional = !!propertyPath.node.optional;

                            // no default value in interfaces and aliases

                            const field = propertyPath.node.key.name;
                            _params[field] = handleType(ta, ast, optional);
                        }
                    },
                });
            }
        }
        traverse(ast, {
            TSTypeAliasDeclaration(path) {
                _handleObjectType(path);
            },
            TSInterfaceDeclaration(path) {
                _handleObjectType(path);
            },
        });

        return _params;
    }

    function handleType(
        annotation: TSTypeAnnotation,
        ast: Node,
        optional?: boolean,
        defaultValue?: string
    ): ParamInfo | ParamInfoNested {
        const ta = annotation.typeAnnotation;
        // IF ITS A REFERENCE - SET NESTED AND CONTINUE RECURSIVELY
        if (ta.type == 'TSTypeReference' && ta.typeName.type == 'Identifier') {
            if (isTypeDefinedInFile(ta.typeName.name, ast)) {
                return {
                    type: 'nested',
                    isNested: true,
                    fields: parseTypeObject(ta.typeName.name, ast),
                    optional,
                    defaultValue,
                };
            }
        }
        // IF SIMPLE - SET SIMPLE
        return {
            type: generate(ta).code,
            isNested: false,
            optional,
            defaultValue,
        };
    }

    traverse(ast, {
        ExportNamedDeclaration(path) {
            // parsing config type
            // similar to this (standard blueprint contract wrapper config):
            /*    export type LotteryConfig = {
                    operator: Address;
                    nftItemCode: Cell;
                    content: Cell;
                    ticketPrice: bigint;
                    startOnDeploy: boolean;
                    id?: number;
                };
            */
            const { node } = path;
            if (
                node.exportKind === 'type' &&
                node.declaration?.type === 'TSTypeAliasDeclaration' &&
                node.declaration?.id.type == 'Identifier' &&
                node.declaration?.id.name === className + 'Config' &&
                node.declaration?.typeAnnotation?.type === 'TSTypeLiteral'
            ) {
                configType = {};
                // const { members } = node.declaration.typeAnnotation;
                configType = parseTypeObject(node.declaration?.id.name, ast);
                // for (const member of members) {
                //     if (member.type === 'TSPropertySignature' && member.key.type === 'Identifier') {
                //         const { name } = member.key;
                //         const { typeAnnotation } = member;
                //         if (typeAnnotation?.type === 'TSTypeAnnotation') {
                //             if (typeAnnotation.typeAnnotation.type === 'TSTypeReference') {
                //                 const { typeName } = typeAnnotation.typeAnnotation;
                //                 if (typeName.type === 'Identifier') {
                //                     configType[name] = handleType(typeAnnotation, ast, !!member.optional);
                //                 }
                //             } else {
                //                 configType[name] = {
                //                     isNested: false,
                //                     type: generate(typeAnnotation.typeAnnotation).code,
                //                     optional: member.optional,
                //                 };
                //             }
                //         }
                //     }
                // }
            }
        },
        Class(path) {
            // parsing main wrapper class.
            // taking send and get functions +
            // createFromConfig, createFromAddress existences
            const { node } = path;
            if (
                node.type == 'ClassDeclaration' &&
                node.id?.name == className &&
                node.implements &&
                node.implements.length === 1 &&
                node.implements.findIndex(
                    (i) =>
                        i.type == 'TSExpressionWithTypeArguments' &&
                        i.expression.type == 'Identifier' &&
                        i.expression.name == 'Contract'
                ) !== -1
            ) {
                path.traverse({
                    ClassMethod(path) {
                        const { node } = path;
                        if (
                            node.kind === 'method' &&
                            node.key.type === 'Identifier' &&
                            node.async === true &&
                            (node.key.name.startsWith('send') || node.key.name.startsWith('get'))
                        ) {
                            const isGet = node.key.name.startsWith('get');
                            let methodParams: Parameters = {};

                            path.node.params.forEach((param) => {
                                let defaultValue: string | undefined;

                                // check for defaulValue
                                if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
                                    defaultValue = generate(param.right).code;
                                    param = param.left;
                                }
                                if (param.type !== 'Identifier' || param.typeAnnotation?.type !== 'TSTypeAnnotation')
                                    throw new Error('Unexpected param type');

                                const name = param.name;

                                // remove provider param in all methods, and via in send methods
                                if (name === 'provider' || (isGet && name === 'via')) return;

                                methodParams[name] = handleType(param.typeAnnotation, ast, !!param.optional);
                            });
                            if (isGet) getFunctions[node.key.name] = methodParams;
                            else sendFunctions[node.key.name] = methodParams;
                        }
                        // checking createFromConfig, createFromAddress existence
                        else if (node.kind === 'method' && node.key.type === 'Identifier' && node.static === true) {
                            if (node.key.name === 'createFromConfig') {
                                canBeCreatedFromConfig = true;
                            }
                            if (node.key.name === 'createFromAddress') {
                                canBeCreatedFromAddress = true;
                            }
                        }
                    },
                });
            }
        },
    });

    if (!canBeCreatedFromAddress) {
        throw new Error(`Cannot be created from address (need to create contract instance when sending)`);
    }

    let codeHex: string | undefined = undefined;
    if (canBeCreatedFromConfig) {
        try {
            codeHex = await readCompiled(className);
        } catch (e) {
            canBeCreatedFromConfig = false;
            if ('sendDeploy' in sendFunctions) delete sendFunctions['sendDeploy'];
        }
    }
    const relativePath = filePath.replace(process.cwd(), '.');
    return {
        sendFunctions,
        getFunctions,
        path: relativePath,
        deploy: {
            canBeCreatedFromConfig,
            configType,
            codeHex,
        },
    };
}
