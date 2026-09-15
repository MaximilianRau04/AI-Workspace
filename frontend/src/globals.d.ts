declare const marked: {
  parse(src: string): string;
};
declare const hljs: {
  highlightElement(el: HTMLElement): void;
};

declare module "*.svg?raw" {
  const content: string;
  export default content;
}
