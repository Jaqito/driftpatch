import { forwardRef, createElement } from "react";

type SCheckboxProps = JSX.IntrinsicElements["s-checkbox"];

export interface CheckboxProps {
  accessibilityLabel?: SCheckboxProps["accessibilityLabel"];
  checked?: SCheckboxProps["checked"];
  details?: SCheckboxProps["details"];
  disabled?: SCheckboxProps["disabled"];
  error?: SCheckboxProps["error"];
  id?: SCheckboxProps["id"];
  indeterminate?: SCheckboxProps["indeterminate"];
  label?: SCheckboxProps["label"];
  name?: SCheckboxProps["name"];
  required?: SCheckboxProps["required"];
  value?: SCheckboxProps["value"];
}

export const Checkbox = forwardRef<HTMLElement, CheckboxProps>((props, ref) => {
  return createElement("s-checkbox", { ref, ...props });
});

Checkbox.displayName = "Checkbox";
