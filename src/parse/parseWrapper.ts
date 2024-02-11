import fs from "fs/promises";
import path from "path";
import * as babelParser from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import generate from "@babel/generator";

import { TSInterfaceDeclaration, TSTypeAliasDeclaration } from "@babel/types";
import { Parameters, Functions, WrapperInfo, DefinedTypes } from "../dapp/src/utils/wrappersConfigTypes";
import { readCompiled } from "../utils";

export async function parseWrapper(filePath: string, className: string): Promise<WrapperInfo> {
  let content = await fs.readFile(filePath, "utf-8");

  if (content.includes("export * from")) {
    // TODO: fix Object is possibly 'null'
    const relativePath = content.match(/export \* from '(.+)';/)[1];
    const basePath = path.dirname(filePath);
    const importedFilePath = path.resolve(basePath, relativePath);

    content = await fs.readFile(importedFilePath, "utf-8");
  }

  const ast = babelParser.parse(content, {
    sourceType: "module",
    plugins: ["typescript"],
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
  let definedTypes: DefinedTypes = {};

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

  function handleTypeObject(typeName: string, ast: any) {
    // parse interface/type alias by its name.
    // sets a string if type is just an alias to some other type.
    // and sets the fields (properties) to create a type if it's an object.
    let _parsedTypeStr: string = "";
    let _properties: Parameters = {};

    // internal function for 2 tree brances - alias and interface types
    // (see the main `traverse` below it)
    function _handleObjectType(path: NodePath<TSTypeAliasDeclaration | TSInterfaceDeclaration>) {
      // same name
      if (path.node.id.name === typeName) {
        path.traverse({
          // for each property
          TSPropertySignature(propertyPath) {
            const ta = propertyPath.node.typeAnnotation;
            if (propertyPath.node.key.type == "Identifier" && ta?.type == "TSTypeAnnotation") {
              const optional = !!propertyPath.node.optional;

              // no default value in interfaces and aliases

              const field = propertyPath.node.key.name;
              _properties[field] = {
                type: generate(ta).code.slice(2),
                optional,
              };
            }
          },
        });
        // if not found any properties
        // leave the type as is (and if type exists)
        if (Object.keys(_properties).length == 0 && "typeAnnotation" in path.node)
          _parsedTypeStr = generate(path.node.typeAnnotation).code;
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

    definedTypes[typeName] = _parsedTypeStr || _properties;
  }

  traverse(ast, {
    Class(path) {
      // parsing main wrapper class.
      // taking send and get functions +
      // createFromConfig, createFromAddress existences
      const { node } = path;
      if (
        node.type == "ClassDeclaration" &&
        node.id?.name == className &&
        node.implements &&
        node.implements.length === 1 &&
        node.implements.findIndex(
          (i) =>
            i.type == "TSExpressionWithTypeArguments" &&
            i.expression.type == "Identifier" &&
            i.expression.name == "Contract"
        ) !== -1
      ) {
        path.traverse({
          ClassMethod(path) {
            const { node } = path;
            if (
              node.kind === "method" &&
              node.key.type === "Identifier" &&
              node.async === true &&
              (node.key.name.startsWith("send") || node.key.name.startsWith("get"))
            ) {
              const isGet = node.key.name.startsWith("get");
              let methodParams: Parameters = {};

              path.node.params.forEach((param) => {
                let defaultValue: string | undefined;

                // check for defaulValue
                if (param.type === "AssignmentPattern" && param.left.type === "Identifier") {
                  defaultValue = generate(param.right).code;
                  param = param.left;
                }
                if (param.type !== "Identifier" || param.typeAnnotation?.type !== "TSTypeAnnotation")
                  throw new Error("Unexpected param type");

                const name = param.name;

                // remove provider param in all methods, and via in send methods
                if (name === "provider" || (!isGet && name === "via")) return;

                methodParams[name] = {
                  type: generate(param.typeAnnotation).code.slice(2),
                  optional: !!param.optional,
                  defaultValue,
                };
              });
              if (isGet) getFunctions[node.key.name] = methodParams;
              else sendFunctions[node.key.name] = methodParams;
            }
            // checking createFromConfig, createFromAddress existence
            else if (node.kind === "method" && node.key.type === "Identifier" && node.static === true) {
              if (node.key.name === "createFromConfig") {
                canBeCreatedFromConfig = true;
              }
              if (node.key.name === "createFromAddress") {
                canBeCreatedFromAddress = true;
              }
            }
          },
        });
      }
    },
    // searching for every used type reference in the code.
    // if this type was defined in the file - put it into `definedTypes`
    TSTypeReference(path) {
      if (
        path.node.type == "TSTypeReference" &&
        path.node.typeName.type == "Identifier" &&
        isTypeDefinedInFile(path.node.typeName.name, ast) &&
        !definedTypes[path.node.typeName.name]
      )
        // this will process and assign the type
        handleTypeObject(path.node.typeName.name, ast);
    },
  });

  const parseConfigResult = definedTypes[className + "Config"];
  // correct config is not an object. if has no config - will be undefined
  if (typeof parseConfigResult !== "string") {
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
      if ("sendDeploy" in sendFunctions) delete sendFunctions["sendDeploy"];
    }
  }
  const relativePath = filePath.replace(process.cwd(), ".");
  return {
    sendFunctions,
    getFunctions,
    path: relativePath,
    deploy: {
      canBeCreatedFromConfig,
      configType,
      codeHex,
    },
    definedTypes,
  };
}
