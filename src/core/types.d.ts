declare module '@xmpp/xml' {
  export class Parser {
    on(event: string, callback: (...args: any[]) => void): this;
    write(data: string): void;
  }
  export class Element {
    name: string;
    attrs: Record<string, string>;
    children: any[];
    text(): string;
    getChild(name: string): Element | undefined;
    toString(): string;
  }
  export function xml(
    name: string,
    attrs?: Record<string, string> | null,
    ...children: any[]
  ): Element;
}
