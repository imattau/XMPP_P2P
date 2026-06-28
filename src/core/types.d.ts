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

declare module '@xmpp/client' {
  import { Element } from '@xmpp/xml'

  interface Jid {
    local: string
    domain: string
    resource: string
    toString(): string
    bare(): Jid
  }

  interface ClientOptions {
    service?: string
    domain?: string
    resource?: string
    username?: string
    password?: string
    credentials?: { username: string; password: string }
    lang?: string
  }

  interface Client {
    jid: Jid | null
    status: string
    options: ClientOptions
    start(): Promise<Jid>
    stop(): Promise<void>
    send(element: Element): Promise<void>
    on(event: 'online', handler: (jid: Jid) => void): void
    on(event: 'stanza', handler: (stanza: Element) => void): void
    on(event: 'status', handler: (status: string, ...args: any[]) => void): void
    on(event: 'error', handler: (err: Error) => void): void
    on(event: string, handler: (...args: any[]) => void): void
  }

  export function client(options: ClientOptions): Client
  export function xml(name: string, attrs?: Record<string, string> | null, ...children: any[]): Element
  export function jid(jid: string): Jid
  export function jid(local: string, domain: string, resource?: string): Jid
}

declare module '@xmpp/component' {
  import { Element } from '@xmpp/xml'

  interface ComponentOptions {
    service?: string
    domain?: string
    password?: string | ((cb: (creds: any) => void) => void)
    lang?: string
  }

  interface Component {
    status: string
    options: ComponentOptions
    start(): Promise<void>
    stop(): Promise<void>
    send(element: Element): Promise<void>
    on(event: 'online', handler: () => void): void
    on(event: 'stanza', handler: (stanza: Element) => void): void
    on(event: 'status', handler: (status: string, ...args: any[]) => void): void
    on(event: 'error', handler: (err: Error) => void): void
    on(event: string, handler: (...args: any[]) => void): void
  }

  export function component(options: ComponentOptions): Component
  export function xml(name: string, attrs?: Record<string, string> | null, ...children: any[]): Element
}
