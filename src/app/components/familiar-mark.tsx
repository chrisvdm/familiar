import type { ImgHTMLAttributes } from "react";

type FamiliarMarkProps = ImgHTMLAttributes<HTMLImageElement>;

export const FamiliarMark = ({
  className,
  height,
  width,
  alt = "familiar",
  ...props
}: FamiliarMarkProps) => (
  <img
    src="/familiar-mark.svg"
    alt={alt}
    className={className}
    height={height}
    width={width}
    {...props}
  />
);
