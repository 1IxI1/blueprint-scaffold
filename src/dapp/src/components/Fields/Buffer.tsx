import { Box, Flex, Input, Text } from '@chakra-ui/react';
import React, { useEffect, useState } from 'react';
import { FieldProps } from '../ActionCard';
import { BaseField } from './Field';

export function BufferField(props: FieldProps) {
  function parseInputValue(value: string): { result: any; correct: boolean } {
    // first try to parse as hex. if fails, try to parse as base64
    // if both fail, set error
    try {
      const parsed = Buffer.from(value, 'hex');
      return { result: parsed, correct: true };
    } catch {
      try {
        const parsedCell = Buffer.from(value, 'base64');
        return { result: parsedCell, correct: true };
      } catch {
        return { result: undefined, correct: false };
      }
    }
  }

  return (
    <BaseField {...props} types={['Buffer']} parseInputValue={parseInputValue} placeHolder="HEX or base64 bytes" />
  );
}
