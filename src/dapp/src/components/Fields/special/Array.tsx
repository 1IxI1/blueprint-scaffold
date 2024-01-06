import { Box, Flex, IconButton, Spacer, Text } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import { Field, FieldProps, ParamValue } from "../../ActionCard";
import { AddIcon } from "@chakra-ui/icons";

export type ArrayFieldProps = FieldProps & { field: Field };

export function ArrayField(props: ArrayFieldProps) {
  const [corrects, setCorrects] = useState<string[]>([]);
  const [entered, setEntered] = useState<Record<string, ParamValue>>({});

  function addField() {
    const next = props.field;
    next.props.paramName = next.props.fieldName = fields.length + 1 + ".";
    next.props.sendParam = enterElement;
    next.props.optional = true;
    next.props.hideOptional = true;
    setFields([...fields, <next.Field key={next.props.paramName} {...next.props} />]);
  }

  useEffect(() => {
    let result: any = [];
    corrects.forEach((correctName) => {
      if (entered[correctName]) result.push(entered[correctName]);
    });
    props.sendParam(props.paramName, result, true);
  }, [corrects]);

  const enterElement = (from: string, value: ParamValue, correct = true) => {
    // every field calls it to enter itself to the result object.
    console.log("enterElement", from, value);
    let newEntered = { ...entered };
    newEntered[from] = value;
    setEntered(newEntered);
    let newCorrects = corrects;
    if (value) {
      if (newCorrects.indexOf(from) === -1) newCorrects.push(from);
    } else newCorrects = corrects.filter((param) => param !== from);
    setCorrects(newCorrects);
  };

  // create the first field
  const _props = props.field.props;
  _props.sendParam = enterElement;
  _props.paramName = _props.fieldName = "1.";
  _props.optional = true;
  _props.hideOptional = true;
  const firstField = <props.field.Field key={"1."} {..._props} />;

  const [fields, setFields] = useState<JSX.Element[]>([firstField]);

  return (
    <>
      {!(props.overridden && props.optional) && (
        <>
          <Box borderWidth="1px" rounded="8" pl="3" my="3" bg="#FFFAFF">
            <Flex alignItems="top" justifyContent={"left"} gap="2">
              <Box display="flex" alignItems="start">
                <Text marginTop="4" size="md" fontWeight="semibold" alignSelf="start">
                  {props.fieldName || props.paramName}
                  {props.hideOptional ? "" : props.optional ? " (optional):" : ":"}
                </Text>
              </Box>
              <Spacer />
              <ul>{fields}</ul>
              <Box width="1px" height="-moz-max-content" bg={"gray.200"} ml="2" rounded="10" />
              <IconButton
                icon={<AddIcon />}
                onClick={addField}
                variant="outlined"
                aria-label={"Add element"}
                alignSelf="center"
              />
            </Flex>
          </Box>
        </>
      )}
    </>
  );
}
