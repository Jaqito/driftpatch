import { Button as PolarisButton } from "@shopify/polaris";
import type { ReactNode } from "react";

export interface ButtonProps {
  primary?: boolean;
  children: ReactNode;
}

export function Button(props: ButtonProps) {
  return <PolarisButton primary={props.primary}>{props.children}</PolarisButton>;
}
