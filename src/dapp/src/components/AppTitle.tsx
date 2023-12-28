import { Text } from "@chakra-ui/react";
import React from "react";

export function AppTitle({ title }: { title: string }) {
  return (
    <Text
      fontSize={["24", "24", "32", "32"]}
      fontFamily="Inter Bold"
      ml={["3", "0", "0", "0"]}
    >
      {title}
    </Text>
  );
}
