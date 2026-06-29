// @ts-nocheck

export function EventEmitter() {
  this._events = {}
}

EventEmitter.prototype.on = EventEmitter.prototype.addListener = function (type, listener) {
  if (!this._events[type]) this._events[type] = []
  this._events[type].push(listener)
  return this
}

EventEmitter.prototype.emit = function (type) {
  const listeners = this._events[type]
  if (!listeners) return false
  const args = Array.prototype.slice.call(arguments, 1)
  for (let i = 0; i < listeners.length; i++) {
    listeners[i].apply(this, args)
  }
  return true
}

EventEmitter.prototype.once = function (type, listener) {
  const wrapper = (...args) => {
    this.removeListener(type, wrapper)
    listener.apply(this, args)
  }
  wrapper.listener = listener
  this.on(type, wrapper)
  return this
}

EventEmitter.prototype.removeListener = function (type, listener) {
  const listeners = this._events[type]
  if (!listeners) return this
  const idx = listeners.indexOf(listener)
  if (idx >= 0) listeners.splice(idx, 1)
  return this
}

EventEmitter.prototype.removeAllListeners = function (type) {
  if (type) {
    delete this._events[type]
  } else {
    this._events = {}
  }
  return this
}

EventEmitter.prototype.listeners = function (type) {
  return (this._events[type] || []).slice()
}

EventEmitter.prototype.listenerCount = function (type) {
  return (this._events[type] || []).length
}

EventEmitter.prototype.eventNames = function () {
  return Object.keys(this._events)
}
