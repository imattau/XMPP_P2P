export class StringDecoder {
  private encoding: string
  constructor(encoding?: string) { this.encoding = encoding || 'utf8' }
  write(buffer: Uint8Array): string {
    return new TextDecoder(this.encoding as any).decode(buffer)
  }
  end(): string { return '' }
}
