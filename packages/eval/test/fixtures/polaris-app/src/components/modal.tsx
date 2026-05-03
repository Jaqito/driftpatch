import { forwardRef, createElement } from "react";

type SModalProps = JSX.IntrinsicElements["s-modal"];

export interface ModalProps {
  accessibilityLabel?: SModalProps["accessibilityLabel"];
  heading?: SModalProps["heading"];
  padding?: SModalProps["padding"];
  size?: SModalProps["size"];
}

export const Modal = forwardRef<HTMLElement, ModalProps>((props, ref) => {
  return createElement("s-modal", { ref, ...props });
});

Modal.displayName = "Modal";
