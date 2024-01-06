import React, { useEffect, useState } from "react";
import { Cell } from "@ton/core";
import { FieldProps } from "../ActionCard";
import { BaseField } from "./Field";

export function CellField(props: FieldProps) {
  function parseInputValue(value: string): { result: any; correct: boolean } {
    try {
      const parsedCell = Cell.fromBoc(Buffer.from(value, "hex"))[0];
      return { result: parsedCell, correct: true };
    } catch {
      try {
        const parsedCell = Cell.fromBase64(value);
        return { result: parsedCell, correct: true };
      } catch {
        return { result: undefined, correct: false };
      }
    }
  }
  return (
    <BaseField
      {...props}
      types={["Cell"]}
      parseInputValue={parseInputValue}
      placeHolder="HEX or base64 serialized cell"
    />
  );
}
