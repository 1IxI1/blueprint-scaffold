import { Box, Flex, Spacer, Text } from '@chakra-ui/react';
import React, { useEffect, useState } from 'react';
import { FieldProps, Fields, ParamsWithValue, ParamValue } from '../../ActionCard';
import { Parameters } from 'src/utils/wrappersConfigTypes';

export type NestedFieldProps = FieldProps & { fields: Fields; propsType: Parameters };

export function NestedField(props: NestedFieldProps) {
  const [correctFields, setCorrectFields] = useState<string[]>([]);
  const [enteredProps, setEnteredProps] = useState<ParamsWithValue>(props.propsType as ParamsWithValue);

  useEffect(() => {
    if (correctFields.length == props.fields.length) {
      props.sendParam(props.paramName, enteredProps, true);
    } else {
      props.sendParam(props.paramName, undefined, props.optional || false);
    }
  }, [correctFields, enteredProps]);

  const enterProperty = (name: string, value: ParamValue, correct = true) => {
    // every field calls it to enter itself to the result object.
    let newEntered = { ...enteredProps };
    newEntered[name].value = value;
    setEnteredProps(newEntered);
    let newCorrectParams = correctFields;
    if (correct) {
      if (newCorrectParams.indexOf(name) === -1) newCorrectParams.push(name);
    } else newCorrectParams = correctFields.filter((param) => param !== name);
    setCorrectFields(newCorrectParams);
  };

  return (
    <>
      {!(props.overridden && props.optional) && (
        <>
          <Box borderWidth="1px" rounded="8" px="3" my="3" py="1" bg="#FCFDFF">
            <Flex alignItems="center" justifyContent={'left'} gap="2">
              <Box display="flex" alignItems="end">
                <Text marginTop="4" size="md" fontWeight="semibold" alignSelf="end">
                  {props.fieldName || props.paramName}
                  {props.hideOptional ? '' : props.optional ? ' (optional):' : ':'}
                </Text>
              </Box>

              <Spacer />
              <ul>
                {props.fields.map(({ Field, props: _props }) => {
                  _props.sendParam = enterProperty;
                  return <Field key={_props.paramName} {..._props} />;
                })}
              </ul>
              {/* <Box */}
              {/*     width="1px" */}
              {/*     height={`${45 * props.fields.length}px`} */}
              {/*     bg={'gray.200'} */}
              {/*     ml="2" */}
              {/*     rounded="10" */}
              {/* /> */}
            </Flex>
          </Box>
        </>
      )}
    </>
  );
}
