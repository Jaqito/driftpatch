import { Checkbox, Modal } from "@/components";

export default function Page() {
  return (
    <Modal heading="Subscribe to updates" size="base">
      <Checkbox label="Subscribe to newsletter" required />
      <Checkbox label="I agree to terms" />
    </Modal>
  );
}
