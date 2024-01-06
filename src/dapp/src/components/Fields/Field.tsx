import { Box, Button, Flex, Input, InputGroup, InputRightElement, Text } from "@chakra-ui/react";
import React, { ChangeEvent, useEffect, useState } from "react";
import { Address, Cell, Dictionary, beginCell, toNano } from "@ton/core";
import { FieldProps, ParamValue } from "../ActionCard";

export interface BaseFieldProps {
  paramName: string;
  fieldName?: string;
  sendParam: (name: string, value: ParamValue, correct: boolean) => void;
  defaultValue?: string;
  optional?: boolean | null;
  overridden?: boolean;
  hideOptional?: boolean;
  types: string[];
  parseInputValue: (value: string) => { result: any; correct: boolean };
  placeHolder: string;
  arrayPlaceHolder?: string;
  isArray?: boolean;
}

export function BaseField(props: BaseFieldProps) {
  const [value, setValue] = useState<string>("");
  const [touched, setTouched] = useState<boolean>(false);
  const [parseError, setParseError] = useState<boolean>(false);

  let defaultValue: any = null;

  if (props.defaultValue) {
    try {
      const parsedDefault = eval(`(Cell, beginCell, Address, Buffer, toNano) => { return ${props.defaultValue}; }`)(
        Cell,
        beginCell,
        Address,
        Buffer,
        toNano,
        Dictionary
      );

      if (!props.isArray) {
        if (props.types.includes(typeof parsedDefault)) defaultValue = parsedDefault;
        else throw new Error("defaultValue doesnt correspond its type");
      } else {
        // if we should be parsing array
        if (Array.isArray(parsedDefault) && parsedDefault.every((it) => props.types.includes(typeof it)))
          defaultValue = parsedDefault;
        else throw new Error("defaultValue doesnt correspond its type");
      }
    } catch (e) {
      console.warn("Failed to parse defaultValue", e);
    }
  }

  useEffect(() => {
    // on changing value tries to parse it with given specific parser
    if (value) {
      setTouched(true);
      try {
        if (!props.isArray) {
          const parseResult = props.parseInputValue(value);
          setParseError(!parseResult.correct);
          props.sendParam(props.paramName, parseResult.result, parseResult.correct);
        } else {
          const elements = value.split(",");
          let result: any[] = [];
          elements.forEach((element) => {
            const parseResult = props.parseInputValue(element);
            if (!parseResult.correct) throw new Error("some element parsing failed");
            result.push(parseResult.result);
          });
          setParseError(false);
          props.sendParam(props.paramName, result, true);
        }
      } catch {
        setParseError(true);
        props.sendParam(props.paramName, undefined, props.optional || false);
      }
      return;
    }
    if (defaultValue) props.sendParam(props.paramName, defaultValue, true);
    else props.sendParam(props.paramName, undefined, props.optional || false);
  }, [value]);

  const isInvalid = () => {
    // when true - field colored red
    if (!value) {
      if (defaultValue || props.optional) return false;
      else return touched;
    } else return parseError;
  };

  return (
    <>
      {!(props.overridden && (defaultValue || props.optional)) && (
        <Flex alignItems="center" justifyContent={"left"} gap="2">
          <Box display="flex" alignItems="end">
            <Text marginTop="4" size="md" fontWeight="semibold" alignSelf="end">
              {props.fieldName || props.paramName}
              {props.hideOptional ? "" : defaultValue || props.optional ? " (optional):" : ":"}
            </Text>
          </Box>
          <Input
            isInvalid={isInvalid()}
            placeholder={defaultValue ? props.defaultValue : props.isArray ? props.arrayPlaceHolder : props.placeHolder}
            size="md"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onClick={() => setTouched(true)}
          ></Input>
        </Flex>
      )}
    </>
  );
}
