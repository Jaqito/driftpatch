import { Card as PolarisCard } from "@shopify/polaris";

export type CardTone = "default" | "subdued";

export const Card = (props: { tone?: CardTone; title: string }) => {
  return (
    <PolarisCard>
      <h2>{props.title}</h2>
    </PolarisCard>
  );
};
