import React from "react";

type Props = ({ children?: React.ReactNode } & Record<string, unknown>) | null;

function element(type: React.ElementType, props: Props, key?: string) {
  const { children, ...rest } = props ?? {};
  if (key !== undefined) (rest as { key?: string }).key = key;
  return React.createElement(type, rest, children);
}

export const jsx = element;
export const jsxs = element;
export function jsxDEV(type: React.ElementType, props: Props, key?: string) {
  return element(type, props, key);
}
export const Fragment = React.Fragment;
