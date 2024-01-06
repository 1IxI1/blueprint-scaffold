import React, { useEffect, useState } from "react";
import { Address } from "@ton/core";
import { FieldProps } from "../ActionCard";
import { BaseField } from "./Field";

export function AddressField(props: FieldProps) {
  function parseInputValue(value: string): { result: any; correct: boolean } {
    try {
      const parsedAddress = Address.parse(value);
      return { result: parsedAddress, correct: true };
    } catch {
      return { result: undefined, correct: false };
    }
  }

  return (
    <BaseField
      {...props}
      types={["Address"]}
      parseInputValue={parseInputValue}
      placeHolder="UQAbc444"
      arrayPlaceHolder={"UQAb1,UQBc2..."}
    />
  );
}
