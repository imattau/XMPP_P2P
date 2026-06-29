export class Readable {
  constructor() {}
  pipe() { return this }
  on() { return this }
  read() {}
}
export class Writable {
  constructor() {}
  write() { return true }
  end() {}
  on() { return this }
}
export class Transform {
  constructor() {}
  write() { return true }
  end() {}
  on() { return this }
}
export class Duplex {
  constructor() {}
  write() { return true }
  end() {}
  on() { return this }
}
export const PassThrough = Duplex
export const pipeline = (...args: any[]) => {}
