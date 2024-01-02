import fs from 'fs/promises';
import * as babelParser from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';

import { Node, Identifier, TSInterfaceDeclaration, TSTypeAliasDeclaration, TSTypeAnnotation } from '@babel/types';
import {
    ParamInfo,
    Parameters,
    Functions,
    WrapperInfo,
    ParamInfoNested,
    ParamInfoUnion,
} from '../dapp/src/utils/wrappersConfigTypes';
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

    function parseTypeObject(typeName: string, ast: any): Parameters | string {
        // parse interface/type alias for object by its name.
        // gives a string if type is just an alias to some other type.
        // and gives the fields (properties) to create a type if it's an object.
        let _parsedTypeStr: string = '';
        let _params: Parameters = {};

        // intenal function for 2 cases - alias and interface types
        // (see the main `traverse` below it)
        function _handleObjectType(path: NodePath<TSTypeAliasDeclaration | TSInterfaceDeclaration>) {
            // SAME NAME
            if (path.node.id.name === typeName) {
                // first, check if type is just an alias like
                // type Orders = Array<Address>;
                //
                // so, the type is not `nested`.
                // this check may pass only during the first call of the function,
                // when checking TSTypeAlias.
                if (path.node.type == 'TSTypeAliasDeclaration' && path.node.typeAnnotation.type == 'TSTypeReference') {
                    // 1. if it has type parameters (Type<smth here>) - just leave as is
                    // 2. if type is made up of pieces (like Address | bigint) - leave as is
                    // 3. if we can parse it more deeply - parse it
                    // if not - leave as is
                    if (
                        // 1.
                        !path.node.typeParameters &&
                        // 2.
                        path.node.typeAnnotation.typeName.type == 'Identifier' &&
                        // 3.
                        isTypeDefinedInFile(path.node.typeAnnotation.typeName.name, ast)
                    ) {
                        const parseChildResult = parseTypeObject(path.node.typeAnnotation.typeName.name, ast);
                        if (typeof parseChildResult == 'string') {
                            _parsedTypeStr = parseChildResult;
                        } else {
                            _params = parseChildResult;
                        }
                    } else {
                        // leave as is
                        _parsedTypeStr = generate(path.node.typeAnnotation).code;
                    }
                }
                // otherwise just go and parse the fields of an `object` type
                else
                    path.traverse({
                        // for each field
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

        return _parsedTypeStr || _params;
    }

    function handleType(
        annotation: TSTypeAnnotation,
        ast: Node,
        optional?: boolean,
        defaultValue?: string
    ): ParamInfo | ParamInfoNested | ParamInfoUnion {
        const ta = annotation.typeAnnotation;
        // if its a reference - set nested and continue recursively
        if (ta.type == 'TSTypeReference' && ta.typeName.type == 'Identifier') {
            if (isTypeDefinedInFile(ta.typeName.name, ast)) {
                const parseTypeResult = parseTypeObject(ta.typeName.name, ast);
                // it may be just an alias to another type
                if (typeof parseTypeResult == 'string') {
                    return {
                        type: parseTypeResult,
                        optional,
                        defaultValue,
                    };
                } // or it may be an object
                else
                    return {
                        type: 'nested',
                        isNested: true,
                        fields: parseTypeResult,
                        optional,
                        defaultValue,
                    };
            }
        }
        // if many types (var: TypeA | TypeB) - parse each
        if (ta.type == 'TSUnionType') {
            let types: Array<string | Parameters> = [];
            for (const type of ta.types) {
                // if object and defined in file - handle as nested
                if (
                    type.type == 'TSTypeReference' &&
                    type.typeName.type == 'Identifier' &&
                    isTypeDefinedInFile(type.typeName.name, ast)
                ) {
                    types.push(parseTypeObject(type.typeName.name, ast));
                } else {
                    // if simple - leave as is
                    types.push(generate(type).code);
                }
            }
            // pack as special - union
            return {
                type: 'union',
                isUnion: true,
                types,
            };
        }
        // if simple - set simple
        return {
            type: generate(ta).code,
            optional,
            defaultValue,
        };
    }

    traverse(ast, {
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
                                if (name === 'provider' || (!isGet && name === 'via')) return;

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

    const parseConfigResult = parseTypeObject(className + 'Config', ast);
    // if no config in file - will return class name as string
    if (typeof parseConfigResult !== 'string') {
        configType = parseConfigResult;
    }

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
