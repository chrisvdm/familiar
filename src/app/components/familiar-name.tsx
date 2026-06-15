import type { ImgHTMLAttributes } from "react";

type FamiliarNameProps = ImgHTMLAttributes<HTMLImageElement>;

export const FamiliarName = ({
  className,
  height,
  width,
  alt = "familiar",
  ...props
}: FamiliarNameProps) => (
  <img
    src="/name-dark.svg"
    alt={alt}
    className={className}
    height={height}
    width={width}
    {...props}
  />
);
