import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Center,
  Circle,
  Collapse,
  Divider,
  Flex,
  Heading,
  IconButton,
  Text,
  useToast,
} from "@chakra-ui/react";
import { Search2Icon } from "@chakra-ui/icons";
import React, { useCallback, useEffect, useState } from "react";
import { Address, Builder, Cell, Slice } from "@ton/core";
import {
  Parameters,
  ParamInfo,
  DeployData,
  MethodConfig,
  GetMethodConfig,
  DefinedTypes,
} from "../utils/wrappersConfigTypes";
import {
  AddressField,
  AmountField,
  BoolField,
  BufferField,
  CellField,
  MultiTypeField,
  NullField,
  StringField,
  UnknownField,
} from "./Fields";
import { CHAIN } from "@tonconnect/sdk";
import { useTonWallet } from "@tonconnect/ui-react";
import { NestedField } from "./Fields/special/Nested";
import { ArrayField } from "./Fields/special/Array";

export type ParamValue = any | any[];
export type ParamWithValue = ParamInfo & { value: ParamValue };
export type ParamsWithValue = Record<string, ParamWithValue>;

export interface FieldProps {
  paramName: string;
  fieldName?: string;
  sendParam: (name: string, value: ParamValue, correct: boolean) => void;
  defaultValue?: string;
  optional?: boolean | null;
  overridden?: boolean;
  isArray?: boolean;
  hideOptional?: boolean;
}

export type Field = { Field: (props: any) => JSX.Element; props: any };
export type Fields = Field[];

export const choseField = (type: String) => {
  switch (type) {
    case "Address":
      return AddressField;
    case "boolean":
      return BoolField;
    case "Buffer":
      return BufferField;
    case "bigint":
    case "number":
    case "number | bigint":
    case "bigint | number":
      return AmountField;
    case "string":
      return StringField;
    case "Cell":
    case "Builder":
    case "Slice":
      return CellField;
    case "null":
      return NullField;
    default:
      return UnknownField;
  }
};

export type ActionCardProps = {
  visible: boolean;
  methodName: string;
  methodParams: Parameters;
  isGet: boolean;
  buildAndExecute: (isGet: boolean, methodName: string, params: ParamsWithValue) => Promise<any>;
  deploy?: DeployData;
  methodConfig: MethodConfig | GetMethodConfig;
  definedTypes: DefinedTypes;
};

export const ActionCard: React.FC<ActionCardProps> = ({
  visible,
  methodName,
  methodParams,
  isGet,
  buildAndExecute,
  deploy,
  methodConfig,
  definedTypes,
}) => {
  const [paramFields, setParamFields] = useState<Fields>([]);
  const [configFields, setConfigFields] = useState<Fields>([]);
  const [correctParams, setCorrectParams] = useState<string[]>([]);
  const [getResult, setGetResult] = useState<Object | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDeploy = methodName === "sendDeploy";
  // initializing a map with arguments needed for the method
  // may incude config fields for `createFromConfig` if sendDeploy
  const _defaultParams = isDeploy ? { ...methodParams, ...deploy?.configType } : methodParams;
  const [enteredParams, setEnteredParams] = useState<ParamsWithValue>(_defaultParams as ParamsWithValue);

  const wallet = useTonWallet();
  const toast = useToast();

  const [outNames, setOutNames] = useState<string[]>(
    "outNames" in methodConfig ? (methodConfig.outNames as string[]) : []
  );

  useEffect(() => {
    function _processParams(params: Parameters): Field[] {
      let fields: Field[] = [];
      const url = new URL(window.location.href);
      const searchParams = url.searchParams;

      for (let [paramName, { type, defaultValue, optional }] of Object.entries(params)) {
        const urlValue = searchParams.get(paramName) || undefined;
        let fieldName = paramName;
        let overridden: boolean | undefined = false;

        try {
          fieldName = methodConfig.params[paramName].fieldTitle;
          overridden = methodConfig.params[paramName].overrideWithDefault;
        } catch {}

        let isArray = false;
        if (type.startsWith("Array<")) {
          type = type.substring(6, type.length - 1);
          isArray = true;
        }
        if (type.endsWith("[]")) {
          type = type.substring(0, type.length - 2);
          isArray = true;
        }

        const props: FieldProps = {
          paramName,
          fieldName,
          sendParam: enterParam,
          defaultValue: defaultValue || urlValue,
          optional,
          overridden,
          // isArray,
        };

        let fieldToAdd: Field | undefined = undefined;
        let Field = choseField(type);
        if (Field == UnknownField) {
          const types = type.split("|").map((t) => t.trim());
          if (types.length > 1) {
            fieldToAdd = { Field: MultiTypeField, props: { ...props, types } };
          } else {
            // try to go recursively for definedTypes in config
            const t = definedTypes[type];
            if (t) {
              if (typeof t === "string") {
                const _aliasParams: Parameters = {};
                _aliasParams[paramName] = { type: t };
                fieldToAdd = _processParams(_aliasParams)[0];
              } else {
                fieldToAdd = {
                  Field: NestedField,
                  props: { ...props, fields: _processParams(t), propsType: t },
                };
              }
            }
          }
        }
        if (!fieldToAdd) fieldToAdd = { Field: Field, props };
        if (isArray) fields.push({ Field: ArrayField, props: { ...props, field: fieldToAdd } });
        else fields.push(fieldToAdd);
      }
      return fields;
    }
    setParamFields(_processParams(methodParams));
    if (deploy?.configType) {
      setConfigFields(_processParams(deploy.configType));
    }
  }, []);

  const enterParam = (name: string, value: ParamValue, correct = true) => {
    // a function for Fields to enter parameters for run
    // will be passed to each Field in props
    console.log("enterParam", name, value, correct);
    let newParams = { ...enteredParams };
    newParams[name].value = value;
    setEnteredParams(newParams);
    let newCorrectParams = correctParams;
    if (correct) {
      if (newCorrectParams.indexOf(name) === -1) newCorrectParams.push(name);
    } else newCorrectParams = correctParams.filter((param) => param !== name);
    setCorrectParams(newCorrectParams);
  };

  const isInactive = () => {
    if (correctParams.length !== Object.keys(enteredParams).length) return true;
    if (!isGet && !wallet) return true;
    return false;
  };

  const inactiveButtonText = () => {
    if (correctParams.length !== Object.keys(enteredParams).length) return "Provide arguments";
    if (!isGet && !wallet) return "Connect wallet";
  };

  const handleAction = () => {
    async function run() {
      try {
        const res = await buildAndExecute(isGet, methodName, enteredParams);
        // if deploy, then res is the address of deployed contract, show it
        if (isDeploy) {
          setOutNames(["address"]);
          setGetResult(res);
        }
        if (isGet || isDeploy) setGetResult(res);
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
          throw e;
        } else {
          throw e;
        }
      }
    }
    setGetResult(null);
    setError(null);
    if (!!getResult) {
      // if running not for the first time, then wait for animation to clear
      setTimeout(run, 500);
    } else run();
  };

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      status: "success",
      duration: 3000,
      position: "bottom-right",
    });
  }, []);

  const stringifyResult = (res: any) => {
    const stringifyValue = (value: any): string => {
      if (value instanceof Slice) value = value.asCell();
      if (value instanceof Builder) value = value.asCell();
      if (value instanceof Cell) return value.toBoc().toString("hex");
      if (value instanceof Buffer) return value.toString("hex");
      if (value instanceof BigInt) return value.toString();
      if (value && value.toString) return value.toString();
      else return JSON.stringify(value, (_, value) => (typeof value === "bigint" ? value.toString() : value), 4);
    };
    let outsWithNames: { name: string; strValue: string }[] = [];
    if (typeof res === "object" && res !== null && !Address.isAddress(res) && !(res instanceof Cell)) {
      for (const [key, value] of Object.entries(res)) {
        outsWithNames.push({ name: key, strValue: stringifyValue(value) });
      }
    } else
      outsWithNames.push({
        name: outNames ? outNames[0] : "",
        strValue: stringifyValue(res),
      });
    return outsWithNames;
  };

  const shadow = () => (paramFields.length === 0 ? "xl" : "none");
  const rounding = () => (paramFields.length === 0 ? "18" : "none");
  const width = () => (paramFields.length === 0 ? "0" : "100%");
  const buttonPadding = () => (paramFields.length === 0 ? "-8" : "-3");

  return visible ? (
    <Center>
      <Card
        variant="outline"
        mb="50"
        boxShadow={[shadow(), "xl", "xl", "xl"]}
        p={{ base: "3", sm: "6" }}
        rounded={[rounding(), "18", "18", "18"]}
        minWidth={[width(), "0", "0", "0"]}
        whiteSpace="nowrap"
      >
        <CardHeader marginTop={["0", "-2", "-2", "-2"]}>
          <Center>
            <Heading size="lg">{methodConfig.tabName || methodName}</Heading>
          </Center>
        </CardHeader>
        <CardBody marginTop="-10" marginBottom="-5">
          {isDeploy && !!deploy?.configType && (
            <>
              <ul>
                {configFields.map((configField) => {
                  return <configField.Field key={configField.props.paramName} {...configField.props} />;
                })}
              </ul>{" "}
              <Center>
                <Divider mb="6" width="60%" />
              </Center>
            </>
          )}
          <ul>
            {paramFields.map(({ Field: _Field, props: _props }) => {
              return <_Field key={_props.paramName} {..._props} />;
            })}
          </ul>
        </CardBody>
        <CardFooter>
          <Flex direction="column" flex="1" mb={["0", "-2", "-2", "-2"]}>
            <Button
              height="12"
              mt={buttonPadding()}
              mb="-1"
              rounded="100"
              flex="1"
              py="4"
              isLoading={isInactive()}
              loadingText={inactiveButtonText()}
              spinner={<Circle />}
              onClick={handleAction}
            >
              {isGet ? "Execute" : "Send transaction"}
            </Button>
            <Collapse in={!!getResult} animateOpacity>
              <Flex mt="8" direction="column" maxWidth={["22em", "45px", "58em", "70em"]} whiteSpace="normal">
                <Text fontSize="14" color="gray.500" fontWeight="semibold" align="center">
                  {isDeploy ? "The new contract address:" : "Result:"}
                </Text>
                {stringifyResult(getResult).map(({ name, strValue }) => (
                  <Box key={name} mt="2">
                    <Text
                      key={name + "_txt"}
                      _hover={{ color: "blue.500" }}
                      cursor="pointer"
                      onClick={() => {
                        handleCopy(strValue);
                      }}
                    >
                      {name ? (
                        <>
                          <Badge key={name + "_badge"}>{name}: </Badge> {strValue}
                        </>
                      ) : (
                        <Center>
                          {strValue}
                          {isDeploy && (
                            <a
                              href={`https://${
                                wallet?.account.chain === CHAIN.TESTNET && "testnet."
                              }ton.cx/address/${strValue}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <IconButton size="xs" aria-label="Scanner" variant="link" icon={<Search2Icon />} />
                            </a>
                          )}
                        </Center>
                      )}
                    </Text>
                  </Box>
                ))}
              </Flex>
            </Collapse>

            <Collapse in={!!error} animateOpacity>
              <Flex mt="8" direction="column" maxWidth={["22em", "45px", "58em", "70em"]} whiteSpace="normal">
                <Text fontSize="14" color="gray.500" fontWeight="semibold" align="center">
                  Error:
                </Text>
                {stringifyResult(getResult).map(({ name, strValue }) => (
                  <Box key={name} mt="2">
                    <Text
                      _hover={{ color: "red.300" }}
                      color="red.500"
                      cursor="pointer"
                      key={name}
                      onClick={() => handleCopy(strValue)}
                    >
                      {error}
                    </Text>
                  </Box>
                ))}
              </Flex>
            </Collapse>
          </Flex>
        </CardFooter>
      </Card>
    </Center>
  ) : (
    <></>
  );
};
