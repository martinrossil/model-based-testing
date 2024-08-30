
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var __defProp$8 = Object.defineProperty;
var __defNormalProp$8 = (obj, key, value) => key in obj ? __defProp$8(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$8 = (obj, key, value) => {
  __defNormalProp$8(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class Observable {
  constructor(value) {
    __publicField$8(this, "_value");
    __publicField$8(this, "listeners");
    this._value = value;
    this.listeners = [];
  }
  add(listener) {
    this.listeners.push(listener);
  }
  get value() {
    return this._value;
  }
  set value(value) {
    if (this._value !== value) {
      this._value = value;
      this.listeners.forEach((listener) => {
        listener(value);
      });
    }
  }
}
function observable(value) {
  return new Observable(value);
}

const Context = {
  modal: observable("None")
};

// From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis
function getGlobal() {
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  if (typeof self !== 'undefined') {
    return self;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof global !== 'undefined') {
    return global;
  }
}
function getDevTools() {
  const w = getGlobal();
  if (!!w.__xstate__) {
    return w.__xstate__;
  }
  return undefined;
}
const devToolsAdapter = service => {
  if (typeof window === 'undefined') {
    return;
  }
  const devTools = getDevTools();
  if (devTools) {
    devTools.register(service);
  }
};

const STATE_DELIMITER = '.';
const TARGETLESS_KEY = '';
const NULL_EVENT = '';
const STATE_IDENTIFIER$1 = '#';
const WILDCARD = '*';
const XSTATE_INIT = 'xstate.init';
const XSTATE_STOP = 'xstate.stop';

/**
 * Returns an event that represents an implicit event that
 * is sent after the specified `delay`.
 *
 * @param delayRef The delay in milliseconds
 * @param id The state node ID where this event is handled
 */
function createAfterEvent(delayRef, id) {
  const idSuffix = id ? `#${id}` : '';
  return {
    type: `xstate.after(${delayRef})${idSuffix}`
  };
}

/**
 * Returns an event that represents that a final state node
 * has been reached in the parent state node.
 *
 * @param id The final state node's parent state node `id`
 * @param output The data to pass into the event
 */
function createDoneStateEvent(id, output) {
  return {
    type: `xstate.done.state.${id}`,
    output
  };
}

/**
 * Returns an event that represents that an invoked service has terminated.
 *
 * An invoked service is terminated when it has reached a top-level final state node,
 * but not when it is canceled.
 *
 * @param invokeId The invoked service ID
 * @param output The data to pass into the event
 */
function createDoneActorEvent(invokeId, output) {
  return {
    type: `xstate.done.actor.${invokeId}`,
    output
  };
}
function createErrorActorEvent(id, data) {
  return {
    type: `xstate.error.actor.${id}`,
    data
  };
}
function createInitEvent(input) {
  return {
    type: XSTATE_INIT,
    input
  };
}

class Mailbox {
  constructor(_process) {
    this._process = _process;
    this._active = false;
    this._current = null;
    this._last = null;
  }
  start() {
    this._active = true;
    this.flush();
  }
  clear() {
    // we can't set _current to null because we might be currently processing
    // and enqueue following clear shouldnt start processing the enqueued item immediately
    if (this._current) {
      this._current.next = null;
      this._last = this._current;
    }
  }

  // TODO: rethink this design
  prepend(event) {
    if (!this._current) {
      this.enqueue(event);
      return;
    }

    // we know that something is already queued up
    // so the mailbox is already flushing or it's inactive
    // therefore the only thing that we need to do is to reassign `this._current`
    this._current = {
      value: event,
      next: this._current
    };
  }
  enqueue(event) {
    const enqueued = {
      value: event,
      next: null
    };
    if (this._current) {
      this._last.next = enqueued;
      this._last = enqueued;
      return;
    }
    this._current = enqueued;
    this._last = enqueued;
    if (this._active) {
      this.flush();
    }
  }
  flush() {
    while (this._current) {
      // atm the given _process is responsible for implementing proper try/catch handling
      // we assume here that this won't throw in a way that can affect this mailbox
      const consumed = this._current;
      this._process(consumed.value);
      // something could have been prepended in the meantime
      // so we need to be defensive here to avoid skipping over a prepended item
      if (consumed === this._current) {
        this._current = this._current.next;
      }
    }
    this._last = null;
  }
}

/**
 * This function makes sure that unhandled errors are thrown in a separate macrotask.
 * It allows those errors to be detected by global error handlers and reported to bug tracking services
 * without interrupting our own stack of execution.
 *
 * @param err error to be thrown
 */
function reportUnhandledError(err) {
  setTimeout(() => {
    throw err;
  });
}

const symbolObservable = (() => typeof Symbol === 'function' && Symbol.observable || '@@observable')();

let idCounter = 0;
function createSystem(rootActor) {
  const children = new Map();
  const keyedActors = new Map();
  const reverseKeyedActors = new WeakMap();
  const observers = new Set();
  const system = {
    _bookId: () => `x:${idCounter++}`,
    _register: (sessionId, actorRef) => {
      children.set(sessionId, actorRef);
      return sessionId;
    },
    _unregister: actorRef => {
      children.delete(actorRef.sessionId);
      const systemId = reverseKeyedActors.get(actorRef);
      if (systemId !== undefined) {
        keyedActors.delete(systemId);
        reverseKeyedActors.delete(actorRef);
      }
    },
    get: systemId => {
      return keyedActors.get(systemId);
    },
    _set: (systemId, actorRef) => {
      const existing = keyedActors.get(systemId);
      if (existing && existing !== actorRef) {
        throw new Error(`Actor with system ID '${systemId}' already exists.`);
      }
      keyedActors.set(systemId, actorRef);
      reverseKeyedActors.set(actorRef, systemId);
    },
    inspect: observer => {
      observers.add(observer);
    },
    _sendInspectionEvent: event => {
      const resolvedInspectionEvent = {
        ...event,
        rootId: rootActor.sessionId
      };
      observers.forEach(observer => observer.next?.(resolvedInspectionEvent));
    },
    _relay: (source, target, event) => {
      system._sendInspectionEvent({
        type: '@xstate.event',
        sourceRef: source,
        targetRef: target,
        event
      });
      target._send(event);
    }
  };
  return system;
}

function matchesState(parentStateId, childStateId) {
  const parentStateValue = toStateValue(parentStateId);
  const childStateValue = toStateValue(childStateId);
  if (typeof childStateValue === 'string') {
    if (typeof parentStateValue === 'string') {
      return childStateValue === parentStateValue;
    }

    // Parent more specific than child
    return false;
  }
  if (typeof parentStateValue === 'string') {
    return parentStateValue in childStateValue;
  }
  return Object.keys(parentStateValue).every(key => {
    if (!(key in childStateValue)) {
      return false;
    }
    return matchesState(parentStateValue[key], childStateValue[key]);
  });
}
function toStatePath(stateId) {
  try {
    if (isArray(stateId)) {
      return stateId;
    }
    return stateId.toString().split(STATE_DELIMITER);
  } catch (e) {
    throw new Error(`'${stateId}' is not a valid state path.`);
  }
}
function isStateLike(state) {
  return typeof state === 'object' && 'value' in state && 'context' in state && 'event' in state;
}
function toStateValue(stateValue) {
  if (isStateLike(stateValue)) {
    return stateValue.value;
  }
  if (isArray(stateValue)) {
    return pathToStateValue(stateValue);
  }
  if (typeof stateValue !== 'string') {
    return stateValue;
  }
  const statePath = toStatePath(stateValue);
  return pathToStateValue(statePath);
}
function pathToStateValue(statePath) {
  if (statePath.length === 1) {
    return statePath[0];
  }
  const value = {};
  let marker = value;
  for (let i = 0; i < statePath.length - 1; i++) {
    if (i === statePath.length - 2) {
      marker[statePath[i]] = statePath[i + 1];
    } else {
      const previous = marker;
      marker = {};
      previous[statePath[i]] = marker;
    }
  }
  return value;
}
function mapValues(collection, iteratee) {
  const result = {};
  const collectionKeys = Object.keys(collection);
  for (let i = 0; i < collectionKeys.length; i++) {
    const key = collectionKeys[i];
    result[key] = iteratee(collection[key], key, collection, i);
  }
  return result;
}
function flatten(array) {
  return [].concat(...array);
}
function toArrayStrict(value) {
  if (isArray(value)) {
    return value;
  }
  return [value];
}
function toArray(value) {
  if (value === undefined) {
    return [];
  }
  return toArrayStrict(value);
}
function resolveOutput(mapper, context, event, self) {
  if (typeof mapper === 'function') {
    return mapper({
      context,
      event,
      self
    });
  }
  return mapper;
}
function isArray(value) {
  return Array.isArray(value);
}
function isErrorActorEvent(event) {
  return event.type.startsWith('xstate.error.actor');
}
function toTransitionConfigArray(configLike) {
  return toArrayStrict(configLike).map(transitionLike => {
    if (typeof transitionLike === 'undefined' || typeof transitionLike === 'string') {
      return {
        target: transitionLike
      };
    }
    return transitionLike;
  });
}
function normalizeTarget(target) {
  if (target === undefined || target === TARGETLESS_KEY) {
    return undefined;
  }
  return toArray(target);
}
function toObserver(nextHandler, errorHandler, completionHandler) {
  const isObserver = typeof nextHandler === 'object';
  const self = isObserver ? nextHandler : undefined;
  return {
    next: (isObserver ? nextHandler.next : nextHandler)?.bind(self),
    error: (isObserver ? nextHandler.error : errorHandler)?.bind(self),
    complete: (isObserver ? nextHandler.complete : completionHandler)?.bind(self)
  };
}
function createInvokeId(stateNodeId, index) {
  return `${stateNodeId}:invocation[${index}]`;
}
function resolveReferencedActor(referenced) {
  return referenced ? 'transition' in referenced ? {
    src: referenced,
    input: undefined
  } : referenced : undefined;
}

let ActorStatus = /*#__PURE__*/function (ActorStatus) {
  ActorStatus[ActorStatus["NotStarted"] = 0] = "NotStarted";
  ActorStatus[ActorStatus["Running"] = 1] = "Running";
  ActorStatus[ActorStatus["Stopped"] = 2] = "Stopped";
  return ActorStatus;
}({});
const defaultOptions = {
  clock: {
    setTimeout: (fn, ms) => {
      return setTimeout(fn, ms);
    },
    clearTimeout: id => {
      return clearTimeout(id);
    }
  },
  logger: console.log.bind(console),
  devTools: false
};
class Actor {
  /**
   * The current internal state of the actor.
   */

  /**
   * The clock that is responsible for setting and clearing timeouts, such as delayed events and transitions.
   */

  /**
   * The unique identifier for this actor relative to its parent.
   */

  /**
   * Whether the service is started.
   */

  // Actor Ref

  // TODO: add typings for system

  /**
   * The globally unique process ID for this invocation.
   */

  /**
   * Creates a new actor instance for the given logic with the provided options, if any.
   *
   * @param logic The logic to create an actor from
   * @param options Actor options
   */
  constructor(logic, options) {
    this.logic = logic;
    this._state = void 0;
    this.clock = void 0;
    this.options = void 0;
    this.id = void 0;
    this.mailbox = new Mailbox(this._process.bind(this));
    this.delayedEventsMap = {};
    this.observers = new Set();
    this.logger = void 0;
    this.status = ActorStatus.NotStarted;
    this._parent = void 0;
    this.ref = void 0;
    this._actorContext = void 0;
    this._systemId = void 0;
    this.sessionId = void 0;
    this.system = void 0;
    this._doneEvent = void 0;
    this.src = void 0;
    this._deferred = [];
    const resolvedOptions = {
      ...defaultOptions,
      ...options
    };
    const {
      clock,
      logger,
      parent,
      id,
      systemId,
      inspect
    } = resolvedOptions;
    this.system = parent?.system ?? createSystem(this);
    if (inspect && !parent) {
      // Always inspect at the system-level
      this.system.inspect(toObserver(inspect));
    }
    if (systemId) {
      this._systemId = systemId;
      this.system._set(systemId, this);
    }
    this.sessionId = this.system._bookId();
    this.id = id ?? this.sessionId;
    this.logger = logger;
    this.clock = clock;
    this._parent = parent;
    this.options = resolvedOptions;
    this.src = resolvedOptions.src;
    this.ref = this;
    this._actorContext = {
      self: this,
      id: this.id,
      sessionId: this.sessionId,
      logger: this.logger,
      defer: fn => {
        this._deferred.push(fn);
      },
      system: this.system,
      stopChild: child => {
        if (child._parent !== this) {
          throw new Error(`Cannot stop child actor ${child.id} of ${this.id} because it is not a child`);
        }
        child._stop();
      }
    };

    // Ensure that the send method is bound to this Actor instance
    // if destructured
    this.send = this.send.bind(this);
    this.system._sendInspectionEvent({
      type: '@xstate.actor',
      actorRef: this
    });
    this._initState();
  }
  _initState() {
    this._state = this.options.state ? this.logic.restoreState ? this.logic.restoreState(this.options.state, this._actorContext) : this.options.state : this.logic.getInitialState(this._actorContext, this.options?.input);
  }

  // array of functions to defer

  update(snapshot, event) {
    // Update state
    this._state = snapshot;

    // Execute deferred effects
    let deferredFn;
    while (deferredFn = this._deferred.shift()) {
      deferredFn();
    }
    for (const observer of this.observers) {
      // TODO: should observers be notified in case of the error?
      try {
        observer.next?.(snapshot);
      } catch (err) {
        reportUnhandledError(err);
      }
    }
    switch (this._state.status) {
      case 'done':
        this._stopProcedure();
        this._complete();
        this._doneEvent = createDoneActorEvent(this.id, this._state.output);
        if (this._parent) {
          this.system._relay(this, this._parent, this._doneEvent);
        }
        break;
      case 'error':
        this._stopProcedure();
        this._error(this._state.error);
        if (this._parent) {
          this.system._relay(this, this._parent, createErrorActorEvent(this.id, this._state.error));
        }
        break;
    }
    this.system._sendInspectionEvent({
      type: '@xstate.snapshot',
      actorRef: this,
      event,
      snapshot
    });
  }
  subscribe(nextListenerOrObserver, errorListener, completeListener) {
    const observer = toObserver(nextListenerOrObserver, errorListener, completeListener);
    if (this.status !== ActorStatus.Stopped) {
      this.observers.add(observer);
    } else {
      try {
        observer.complete?.();
      } catch (err) {
        reportUnhandledError(err);
      }
    }
    return {
      unsubscribe: () => {
        this.observers.delete(observer);
      }
    };
  }

  /**
   * Starts the Actor from the initial state
   */
  start() {
    if (this.status === ActorStatus.Running) {
      // Do not restart the service if it is already started
      return this;
    }
    this.system._register(this.sessionId, this);
    if (this._systemId) {
      this.system._set(this._systemId, this);
    }
    this.status = ActorStatus.Running;
    const initEvent = createInitEvent(this.options.input);
    this.system._sendInspectionEvent({
      type: '@xstate.event',
      sourceRef: this._parent,
      targetRef: this,
      event: initEvent
    });
    const status = this._state.status;
    switch (status) {
      case 'done':
        // a state machine can be "done" upon intialization (it could reach a final state using initial microsteps)
        // we still need to complete observers, flush deferreds etc
        this.update(this._state, initEvent);
      // fallthrough
      case 'error':
        // TODO: rethink cleanup of observers, mailbox, etc
        return this;
    }
    if (this.logic.start) {
      try {
        this.logic.start(this._state, this._actorContext);
      } catch (err) {
        this._stopProcedure();
        this._error(err);
        this._parent?.send(createErrorActorEvent(this.id, err));
        return this;
      }
    }

    // TODO: this notifies all subscribers but usually this is redundant
    // there is no real change happening here
    // we need to rethink if this needs to be refactored
    this.update(this._state, initEvent);
    if (this.options.devTools) {
      this.attachDevTools();
    }
    this.mailbox.start();
    return this;
  }
  _process(event) {
    // TODO: reexamine what happens when an action (or a guard or smth) throws
    let nextState;
    let caughtError;
    try {
      nextState = this.logic.transition(this._state, event, this._actorContext);
    } catch (err) {
      // we wrap it in a box so we can rethrow it later even if falsy value gets caught here
      caughtError = {
        err
      };
    }
    if (caughtError) {
      const {
        err
      } = caughtError;
      this._stopProcedure();
      this._error(err);
      this._parent?.send(createErrorActorEvent(this.id, err));
      return;
    }
    this.update(nextState, event);
    if (event.type === XSTATE_STOP) {
      this._stopProcedure();
      this._complete();
    }
  }
  _stop() {
    if (this.status === ActorStatus.Stopped) {
      return this;
    }
    this.mailbox.clear();
    if (this.status === ActorStatus.NotStarted) {
      this.status = ActorStatus.Stopped;
      return this;
    }
    this.mailbox.enqueue({
      type: XSTATE_STOP
    });
    return this;
  }

  /**
   * Stops the Actor and unsubscribe all listeners.
   */
  stop() {
    if (this._parent) {
      throw new Error('A non-root actor cannot be stopped directly.');
    }
    return this._stop();
  }
  _complete() {
    for (const observer of this.observers) {
      try {
        observer.complete?.();
      } catch (err) {
        reportUnhandledError(err);
      }
    }
    this.observers.clear();
  }
  _error(err) {
    if (!this.observers.size) {
      if (!this._parent) {
        reportUnhandledError(err);
      }
      return;
    }
    let reportError = false;
    for (const observer of this.observers) {
      const errorListener = observer.error;
      reportError ||= !errorListener;
      try {
        errorListener?.(err);
      } catch (err2) {
        reportUnhandledError(err2);
      }
    }
    this.observers.clear();
    if (reportError) {
      reportUnhandledError(err);
    }
  }
  _stopProcedure() {
    if (this.status !== ActorStatus.Running) {
      // Actor already stopped; do nothing
      return this;
    }

    // Cancel all delayed events
    for (const key of Object.keys(this.delayedEventsMap)) {
      this.clock.clearTimeout(this.delayedEventsMap[key]);
    }

    // TODO: mailbox.reset
    this.mailbox.clear();
    // TODO: after `stop` we must prepare ourselves for receiving events again
    // events sent *after* stop signal must be queued
    // it seems like this should be the common behavior for all of our consumers
    // so perhaps this should be unified somehow for all of them
    this.mailbox = new Mailbox(this._process.bind(this));
    this.status = ActorStatus.Stopped;
    this.system._unregister(this);
    return this;
  }

  /**
   * @internal
   */
  _send(event) {
    if (this.status === ActorStatus.Stopped) {
      return;
    }
    this.mailbox.enqueue(event);
  }

  /**
   * Sends an event to the running Actor to trigger a transition.
   *
   * @param event The event to send
   */
  send(event) {
    this.system._relay(undefined, this, event);
  }

  // TODO: make private (and figure out a way to do this within the machine)
  delaySend({
    event,
    id,
    delay,
    to
  }) {
    const timerId = this.clock.setTimeout(() => {
      this.system._relay(this, to ?? this, event);
    }, delay);

    // TODO: consider the rehydration story here
    if (id) {
      this.delayedEventsMap[id] = timerId;
    }
  }

  // TODO: make private (and figure out a way to do this within the machine)
  cancel(sendId) {
    this.clock.clearTimeout(this.delayedEventsMap[sendId]);
    delete this.delayedEventsMap[sendId];
  }
  attachDevTools() {
    const {
      devTools
    } = this.options;
    if (devTools) {
      const resolvedDevToolsAdapter = typeof devTools === 'function' ? devTools : devToolsAdapter;
      resolvedDevToolsAdapter(this);
    }
  }
  toJSON() {
    return {
      id: this.id
    };
  }
  getPersistedState() {
    return this.logic.getPersistedState?.(this._state);
  }
  [symbolObservable]() {
    return this;
  }
  getSnapshot() {
    return this._state;
  }
}

/**
 * Creates a new `ActorRef` instance for the given machine with the provided options, if any.
 *
 * @param machine The machine to create an actor from
 * @param options `ActorRef` options
 */

function createActor(logic, options) {
  const interpreter = new Actor(logic, options);
  return interpreter;
}

const cache = new WeakMap();
function memo(object, key, fn) {
  let memoizedData = cache.get(object);
  if (!memoizedData) {
    memoizedData = {
      [key]: fn()
    };
    cache.set(object, memoizedData);
  } else if (!(key in memoizedData)) {
    memoizedData[key] = fn();
  }
  return memoizedData[key];
}

function resolveCancel(_, state, actionArgs, {
  sendId
}) {
  const resolvedSendId = typeof sendId === 'function' ? sendId(actionArgs) : sendId;
  return [state, resolvedSendId];
}
function executeCancel(actorContext, resolvedSendId) {
  actorContext.self.cancel(resolvedSendId);
}
/**
 * Cancels an in-flight `send(...)` action. A canceled sent action will not
 * be executed, nor will its event be sent, unless it has already been sent
 * (e.g., if `cancel(...)` is called after the `send(...)` action's `delay`).
 *
 * @param sendId The `id` of the `send(...)` action to cancel.
 */
function cancel(sendId) {
  function cancel(_) {
  }
  cancel.type = 'xstate.cancel';
  cancel.sendId = sendId;
  cancel.resolve = resolveCancel;
  cancel.execute = executeCancel;
  return cancel;
}

function resolveInvoke(actorContext, state, actionArgs, {
  id,
  systemId,
  src,
  input,
  syncSnapshot
}) {
  const referenced = resolveReferencedActor(state.machine.implementations.actors[src]);
  let actorRef;
  if (referenced) {
    // TODO: inline `input: undefined` should win over the referenced one
    const configuredInput = input || referenced.input;
    actorRef = createActor(referenced.src, {
      id,
      src,
      parent: actorContext?.self,
      systemId,
      input: typeof configuredInput === 'function' ? configuredInput({
        context: state.context,
        event: actionArgs.event,
        self: actorContext?.self
      }) : configuredInput
    });
    if (syncSnapshot) {
      actorRef.subscribe({
        next: snapshot => {
          if (snapshot.status === 'active') {
            actorContext.self.send({
              type: `xstate.snapshot.${id}`,
              snapshot
            });
          }
        },
        error: () => {
          /* TODO */
        }
      });
    }
  }
  return [cloneState(state, {
    children: {
      ...state.children,
      [id]: actorRef
    }
  }), {
    id,
    actorRef
  }];
}
function executeInvoke(actorContext, {
  id,
  actorRef
}) {
  if (!actorRef) {
    return;
  }
  actorContext.defer(() => {
    if (actorRef.status === ActorStatus.Stopped) {
      return;
    }
    try {
      actorRef.start?.();
    } catch (err) {
      actorContext.self.send(createErrorActorEvent(id, err));
      return;
    }
  });
}

// we don't export this since it's an internal action that is not meant to be used in the user's code

function invoke({
  id,
  systemId,
  src,
  input,
  onSnapshot
}) {
  function invoke(_) {
  }
  invoke.type = 'xstate.invoke';
  invoke.id = id;
  invoke.systemId = systemId;
  invoke.src = src;
  invoke.input = input;
  invoke.syncSnapshot = !!onSnapshot;
  invoke.resolve = resolveInvoke;
  invoke.execute = executeInvoke;
  return invoke;
}

function resolveStop(_, state, args, {
  actorRef
}) {
  const actorRefOrString = typeof actorRef === 'function' ? actorRef(args) : actorRef;
  const resolvedActorRef = typeof actorRefOrString === 'string' ? state.children[actorRefOrString] : actorRefOrString;
  let children = state.children;
  if (resolvedActorRef) {
    children = {
      ...children
    };
    delete children[resolvedActorRef.id];
  }
  return [cloneState(state, {
    children
  }), resolvedActorRef];
}
function executeStop(actorContext, actorRef) {
  if (!actorRef) {
    return;
  }
  if (actorRef.status !== ActorStatus.Running) {
    actorContext.stopChild(actorRef);
    return;
  }
  // TODO: recheck why this one has to be deferred
  actorContext.defer(() => {
    actorContext.stopChild(actorRef);
  });
}
/**
 * Stops an actor.
 *
 * @param actorRef The actor to stop.
 */
function stop(actorRef) {
  function stop(_) {
  }
  stop.type = 'xstate.stop';
  stop.actorRef = actorRef;
  stop.resolve = resolveStop;
  stop.execute = executeStop;
  return stop;
}

// TODO: throw on cycles (depth check should be enough)
function evaluateGuard(guard, context, event, state) {
  const {
    machine
  } = state;
  const isInline = typeof guard === 'function';
  const resolved = isInline ? guard : machine.implementations.guards[typeof guard === 'string' ? guard : guard.type];
  if (!isInline && !resolved) {
    throw new Error(`Guard '${typeof guard === 'string' ? guard : guard.type}' is not implemented.'.`);
  }
  if (typeof resolved !== 'function') {
    return evaluateGuard(resolved, context, event, state);
  }
  const guardArgs = {
    context,
    event,
    guard: isInline ? undefined : typeof guard === 'string' ? {
      type: guard
    } : typeof guard.params === 'function' ? {
      type: guard.type,
      params: guard.params({
        context,
        event
      })
    } : guard
  };
  if (!('check' in resolved)) {
    // the existing type of `.guards` assumes non-nullable `TExpressionGuard`
    // inline guards expect `TExpressionGuard` to be set to `undefined`
    // it's fine to cast this here, our logic makes sure that we call those 2 "variants" correctly
    return resolved(guardArgs);
  }
  const builtinGuard = resolved;
  return builtinGuard.check(state, guardArgs, resolved // this holds all params
  );
}

function getOutput(configuration, context, event, self) {
  const {
    machine
  } = configuration[0];
  const {
    root
  } = machine;
  if (!root.output) {
    return undefined;
  }
  const finalChildStateNode = configuration.find(stateNode => stateNode.type === 'final' && stateNode.parent === machine.root);
  const doneStateEvent = createDoneStateEvent(finalChildStateNode.id, finalChildStateNode.output ? resolveOutput(finalChildStateNode.output, context, event, self) : undefined);
  return resolveOutput(root.output, context, doneStateEvent, self);
}
const isAtomicStateNode = stateNode => stateNode.type === 'atomic' || stateNode.type === 'final';
function getChildren(stateNode) {
  return Object.values(stateNode.states).filter(sn => sn.type !== 'history');
}
function getProperAncestors(stateNode, toStateNode) {
  const ancestors = [];

  // add all ancestors
  let m = stateNode.parent;
  while (m && m !== toStateNode) {
    ancestors.push(m);
    m = m.parent;
  }
  return ancestors;
}
function getConfiguration(stateNodes) {
  const configuration = new Set(stateNodes);
  const configurationSet = new Set(stateNodes);
  const adjList = getAdjList(configurationSet);

  // add descendants
  for (const s of configuration) {
    // if previously active, add existing child nodes
    if (s.type === 'compound' && (!adjList.get(s) || !adjList.get(s).length)) {
      getInitialStateNodes(s).forEach(sn => configurationSet.add(sn));
    } else {
      if (s.type === 'parallel') {
        for (const child of getChildren(s)) {
          if (child.type === 'history') {
            continue;
          }
          if (!configurationSet.has(child)) {
            for (const initialStateNode of getInitialStateNodes(child)) {
              configurationSet.add(initialStateNode);
            }
          }
        }
      }
    }
  }

  // add all ancestors
  for (const s of configurationSet) {
    let m = s.parent;
    while (m) {
      configurationSet.add(m);
      m = m.parent;
    }
  }
  return configurationSet;
}
function getValueFromAdj(baseNode, adjList) {
  const childStateNodes = adjList.get(baseNode);
  if (!childStateNodes) {
    return {}; // todo: fix?
  }

  if (baseNode.type === 'compound') {
    const childStateNode = childStateNodes[0];
    if (childStateNode) {
      if (isAtomicStateNode(childStateNode)) {
        return childStateNode.key;
      }
    } else {
      return {};
    }
  }
  const stateValue = {};
  for (const childStateNode of childStateNodes) {
    stateValue[childStateNode.key] = getValueFromAdj(childStateNode, adjList);
  }
  return stateValue;
}
function getAdjList(configuration) {
  const adjList = new Map();
  for (const s of configuration) {
    if (!adjList.has(s)) {
      adjList.set(s, []);
    }
    if (s.parent) {
      if (!adjList.has(s.parent)) {
        adjList.set(s.parent, []);
      }
      adjList.get(s.parent).push(s);
    }
  }
  return adjList;
}
function getStateValue(rootNode, configuration) {
  const config = getConfiguration(configuration);
  return getValueFromAdj(rootNode, getAdjList(config));
}
function isInFinalState(configuration, stateNode = configuration[0].machine.root) {
  if (stateNode.type === 'compound') {
    return getChildren(stateNode).some(s => s.type === 'final' && configuration.includes(s));
  }
  if (stateNode.type === 'parallel') {
    return getChildren(stateNode).every(sn => isInFinalState(configuration, sn));
  }
  return false;
}
const isStateId = str => str[0] === STATE_IDENTIFIER$1;
function getCandidates(stateNode, receivedEventType) {
  const candidates = stateNode.transitions.get(receivedEventType) || [...stateNode.transitions.keys()].filter(descriptor => {
    // check if transition is a wildcard transition,
    // which matches any non-transient events
    if (descriptor === WILDCARD) {
      return true;
    }
    if (!descriptor.endsWith('.*')) {
      return false;
    }
    const partialEventTokens = descriptor.split('.');
    const eventTokens = receivedEventType.split('.');
    for (let tokenIndex = 0; tokenIndex < partialEventTokens.length; tokenIndex++) {
      const partialEventToken = partialEventTokens[tokenIndex];
      const eventToken = eventTokens[tokenIndex];
      if (partialEventToken === '*') {
        const isLastToken = tokenIndex === partialEventTokens.length - 1;
        return isLastToken;
      }
      if (partialEventToken !== eventToken) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => b.length - a.length).flatMap(key => stateNode.transitions.get(key));
  return candidates;
}

/**
 * All delayed transitions from the config.
 */
function getDelayedTransitions(stateNode) {
  const afterConfig = stateNode.config.after;
  if (!afterConfig) {
    return [];
  }
  const mutateEntryExit = (delay, i) => {
    const delayRef = typeof delay === 'function' ? `${stateNode.id}:delay[${i}]` : delay;
    const afterEvent = createAfterEvent(delayRef, stateNode.id);
    const eventType = afterEvent.type;
    stateNode.entry.push(raise(afterEvent, {
      id: eventType,
      delay
    }));
    stateNode.exit.push(cancel(eventType));
    return eventType;
  };
  const delayedTransitions = isArray(afterConfig) ? afterConfig.map((transition, i) => {
    const eventType = mutateEntryExit(transition.delay, i);
    return {
      ...transition,
      event: eventType
    };
  }) : Object.keys(afterConfig).flatMap((delay, i) => {
    const configTransition = afterConfig[delay];
    const resolvedTransition = typeof configTransition === 'string' ? {
      target: configTransition
    } : configTransition;
    const resolvedDelay = !isNaN(+delay) ? +delay : delay;
    const eventType = mutateEntryExit(resolvedDelay, i);
    return toArray(resolvedTransition).map(transition => ({
      ...transition,
      event: eventType,
      delay: resolvedDelay
    }));
  });
  return delayedTransitions.map(delayedTransition => {
    const {
      delay
    } = delayedTransition;
    return {
      ...formatTransition(stateNode, delayedTransition.event, delayedTransition),
      delay
    };
  });
}
function formatTransition(stateNode, descriptor, transitionConfig) {
  const normalizedTarget = normalizeTarget(transitionConfig.target);
  const reenter = transitionConfig.reenter ?? false;
  const target = resolveTarget(stateNode, normalizedTarget);
  const transition = {
    ...transitionConfig,
    actions: toArray(transitionConfig.actions),
    guard: transitionConfig.guard,
    target,
    source: stateNode,
    reenter,
    eventType: descriptor,
    toJSON: () => ({
      ...transition,
      source: `#${stateNode.id}`,
      target: target ? target.map(t => `#${t.id}`) : undefined
    })
  };
  return transition;
}
function formatTransitions(stateNode) {
  const transitions = new Map();
  if (stateNode.config.on) {
    for (const descriptor of Object.keys(stateNode.config.on)) {
      if (descriptor === NULL_EVENT) {
        throw new Error('Null events ("") cannot be specified as a transition key. Use `always: { ... }` instead.');
      }
      const transitionsConfig = stateNode.config.on[descriptor];
      transitions.set(descriptor, toTransitionConfigArray(transitionsConfig).map(t => formatTransition(stateNode, descriptor, t)));
    }
  }
  if (stateNode.config.onDone) {
    const descriptor = `xstate.done.state.${stateNode.id}`;
    transitions.set(descriptor, toTransitionConfigArray(stateNode.config.onDone).map(t => formatTransition(stateNode, descriptor, t)));
  }
  for (const invokeDef of stateNode.invoke) {
    if (invokeDef.onDone) {
      const descriptor = `xstate.done.actor.${invokeDef.id}`;
      transitions.set(descriptor, toTransitionConfigArray(invokeDef.onDone).map(t => formatTransition(stateNode, descriptor, t)));
    }
    if (invokeDef.onError) {
      const descriptor = `xstate.error.actor.${invokeDef.id}`;
      transitions.set(descriptor, toTransitionConfigArray(invokeDef.onError).map(t => formatTransition(stateNode, descriptor, t)));
    }
    if (invokeDef.onSnapshot) {
      const descriptor = `xstate.snapshot.${invokeDef.id}`;
      transitions.set(descriptor, toTransitionConfigArray(invokeDef.onSnapshot).map(t => formatTransition(stateNode, descriptor, t)));
    }
  }
  for (const delayedTransition of stateNode.after) {
    let existing = transitions.get(delayedTransition.eventType);
    if (!existing) {
      existing = [];
      transitions.set(delayedTransition.eventType, existing);
    }
    existing.push(delayedTransition);
  }
  return transitions;
}
function formatInitialTransition(stateNode, _target) {
  if (typeof _target === 'string' || isArray(_target)) {
    const targets = toArray(_target).map(t => {
      // Resolve state string keys (which represent children)
      // to their state node
      const descStateNode = typeof t === 'string' ? isStateId(t) ? stateNode.machine.getStateNodeById(t) : stateNode.states[t] : t;
      if (!descStateNode) {
        throw new Error(`Initial state node "${t}" not found on parent state node #${stateNode.id}`);
      }
      if (!isDescendant(descStateNode, stateNode)) {
        throw new Error(`Invalid initial target: state node #${descStateNode.id} is not a descendant of #${stateNode.id}`);
      }
      return descStateNode;
    });
    const resolvedTarget = resolveTarget(stateNode, targets);
    const transition = {
      source: stateNode,
      actions: [],
      eventType: null,
      reenter: false,
      target: resolvedTarget,
      toJSON: () => ({
        ...transition,
        source: `#${stateNode.id}`,
        target: resolvedTarget ? resolvedTarget.map(t => `#${t.id}`) : undefined
      })
    };
    return transition;
  }
  return formatTransition(stateNode, '__INITIAL__', {
    target: toArray(_target.target).map(t => {
      if (typeof t === 'string') {
        return isStateId(t) ? t : `${STATE_DELIMITER}${t}`;
      }
      return t;
    }),
    actions: _target.actions
  });
}
function resolveTarget(stateNode, targets) {
  if (targets === undefined) {
    // an undefined target signals that the state node should not transition from that state when receiving that event
    return undefined;
  }
  return targets.map(target => {
    if (typeof target !== 'string') {
      return target;
    }
    if (isStateId(target)) {
      return stateNode.machine.getStateNodeById(target);
    }
    const isInternalTarget = target[0] === STATE_DELIMITER;
    // If internal target is defined on machine,
    // do not include machine key on target
    if (isInternalTarget && !stateNode.parent) {
      return getStateNodeByPath(stateNode, target.slice(1));
    }
    const resolvedTarget = isInternalTarget ? stateNode.key + target : target;
    if (stateNode.parent) {
      try {
        const targetStateNode = getStateNodeByPath(stateNode.parent, resolvedTarget);
        return targetStateNode;
      } catch (err) {
        throw new Error(`Invalid transition definition for state node '${stateNode.id}':\n${err.message}`);
      }
    } else {
      throw new Error(`Invalid target: "${target}" is not a valid target from the root node. Did you mean ".${target}"?`);
    }
  });
}
function resolveHistoryTarget(stateNode) {
  const normalizedTarget = normalizeTarget(stateNode.config.target);
  if (!normalizedTarget) {
    return stateNode.parent.initial.target;
  }
  return normalizedTarget.map(t => typeof t === 'string' ? getStateNodeByPath(stateNode.parent, t) : t);
}
function isHistoryNode(stateNode) {
  return stateNode.type === 'history';
}
function getInitialStateNodes(stateNode) {
  const set = new Set();
  function iter(descStateNode) {
    if (set.has(descStateNode)) {
      return;
    }
    set.add(descStateNode);
    if (descStateNode.type === 'compound') {
      for (const targetStateNode of descStateNode.initial.target) {
        for (const a of getProperAncestors(targetStateNode, stateNode)) {
          set.add(a);
        }
        iter(targetStateNode);
      }
    } else if (descStateNode.type === 'parallel') {
      for (const child of getChildren(descStateNode)) {
        iter(child);
      }
    }
  }
  iter(stateNode);
  return [...set];
}
/**
 * Returns the child state node from its relative `stateKey`, or throws.
 */
function getStateNode(stateNode, stateKey) {
  if (isStateId(stateKey)) {
    return stateNode.machine.getStateNodeById(stateKey);
  }
  if (!stateNode.states) {
    throw new Error(`Unable to retrieve child state '${stateKey}' from '${stateNode.id}'; no child states exist.`);
  }
  const result = stateNode.states[stateKey];
  if (!result) {
    throw new Error(`Child state '${stateKey}' does not exist on '${stateNode.id}'`);
  }
  return result;
}

/**
 * Returns the relative state node from the given `statePath`, or throws.
 *
 * @param statePath The string or string array relative path to the state node.
 */
function getStateNodeByPath(stateNode, statePath) {
  if (typeof statePath === 'string' && isStateId(statePath)) {
    try {
      return stateNode.machine.getStateNodeById(statePath);
    } catch (e) {
      // try individual paths
      // throw e;
    }
  }
  const arrayStatePath = toStatePath(statePath).slice();
  let currentStateNode = stateNode;
  while (arrayStatePath.length) {
    const key = arrayStatePath.shift();
    if (!key.length) {
      break;
    }
    currentStateNode = getStateNode(currentStateNode, key);
  }
  return currentStateNode;
}

/**
 * Returns the state nodes represented by the current state value.
 *
 * @param state The state value or State instance
 */
function getStateNodes(stateNode, state) {
  const stateValue = state instanceof State ? state.value : toStateValue(state);
  if (typeof stateValue === 'string') {
    return [stateNode, stateNode.states[stateValue]];
  }
  const childStateKeys = Object.keys(stateValue);
  const childStateNodes = childStateKeys.map(subStateKey => getStateNode(stateNode, subStateKey)).filter(Boolean);
  return [stateNode.machine.root, stateNode].concat(childStateNodes, childStateKeys.reduce((allSubStateNodes, subStateKey) => {
    const subStateNode = getStateNode(stateNode, subStateKey);
    if (!subStateNode) {
      return allSubStateNodes;
    }
    const subStateNodes = getStateNodes(subStateNode, stateValue[subStateKey]);
    return allSubStateNodes.concat(subStateNodes);
  }, []));
}
function transitionAtomicNode(stateNode, stateValue, state, event) {
  const childStateNode = getStateNode(stateNode, stateValue);
  const next = childStateNode.next(state, event);
  if (!next || !next.length) {
    return stateNode.next(state, event);
  }
  return next;
}
function transitionCompoundNode(stateNode, stateValue, state, event) {
  const subStateKeys = Object.keys(stateValue);
  const childStateNode = getStateNode(stateNode, subStateKeys[0]);
  const next = transitionNode(childStateNode, stateValue[subStateKeys[0]], state, event);
  if (!next || !next.length) {
    return stateNode.next(state, event);
  }
  return next;
}
function transitionParallelNode(stateNode, stateValue, state, event) {
  const allInnerTransitions = [];
  for (const subStateKey of Object.keys(stateValue)) {
    const subStateValue = stateValue[subStateKey];
    if (!subStateValue) {
      continue;
    }
    const subStateNode = getStateNode(stateNode, subStateKey);
    const innerTransitions = transitionNode(subStateNode, subStateValue, state, event);
    if (innerTransitions) {
      allInnerTransitions.push(...innerTransitions);
    }
  }
  if (!allInnerTransitions.length) {
    return stateNode.next(state, event);
  }
  return allInnerTransitions;
}
function transitionNode(stateNode, stateValue, state, event) {
  // leaf node
  if (typeof stateValue === 'string') {
    return transitionAtomicNode(stateNode, stateValue, state, event);
  }

  // compound node
  if (Object.keys(stateValue).length === 1) {
    return transitionCompoundNode(stateNode, stateValue, state, event);
  }

  // parallel node
  return transitionParallelNode(stateNode, stateValue, state, event);
}
function getHistoryNodes(stateNode) {
  return Object.keys(stateNode.states).map(key => stateNode.states[key]).filter(sn => sn.type === 'history');
}
function isDescendant(childStateNode, parentStateNode) {
  let marker = childStateNode;
  while (marker.parent && marker.parent !== parentStateNode) {
    marker = marker.parent;
  }
  return marker.parent === parentStateNode;
}
function getPathFromRootToNode(stateNode) {
  const path = [];
  let marker = stateNode.parent;
  while (marker) {
    path.unshift(marker);
    marker = marker.parent;
  }
  return path;
}
function hasIntersection(s1, s2) {
  const set1 = new Set(s1);
  const set2 = new Set(s2);
  for (const item of set1) {
    if (set2.has(item)) {
      return true;
    }
  }
  for (const item of set2) {
    if (set1.has(item)) {
      return true;
    }
  }
  return false;
}
function removeConflictingTransitions(enabledTransitions, configuration, historyValue) {
  const filteredTransitions = new Set();
  for (const t1 of enabledTransitions) {
    let t1Preempted = false;
    const transitionsToRemove = new Set();
    for (const t2 of filteredTransitions) {
      if (hasIntersection(computeExitSet([t1], configuration, historyValue), computeExitSet([t2], configuration, historyValue))) {
        if (isDescendant(t1.source, t2.source)) {
          transitionsToRemove.add(t2);
        } else {
          t1Preempted = true;
          break;
        }
      }
    }
    if (!t1Preempted) {
      for (const t3 of transitionsToRemove) {
        filteredTransitions.delete(t3);
      }
      filteredTransitions.add(t1);
    }
  }
  return Array.from(filteredTransitions);
}
function findLCCA(stateNodes) {
  const [head] = stateNodes;
  let current = getPathFromRootToNode(head);
  let candidates = [];
  for (const stateNode of stateNodes) {
    const path = getPathFromRootToNode(stateNode);
    candidates = current.filter(sn => path.includes(sn));
    current = candidates;
    candidates = [];
  }
  return current[current.length - 1];
}
function getEffectiveTargetStates(transition, historyValue) {
  if (!transition.target) {
    return [];
  }
  const targets = new Set();
  for (const targetNode of transition.target) {
    if (isHistoryNode(targetNode)) {
      if (historyValue[targetNode.id]) {
        for (const node of historyValue[targetNode.id]) {
          targets.add(node);
        }
      } else {
        for (const node of getEffectiveTargetStates({
          target: resolveHistoryTarget(targetNode)
        }, historyValue)) {
          targets.add(node);
        }
      }
    } else {
      targets.add(targetNode);
    }
  }
  return [...targets];
}
function getTransitionDomain(transition, historyValue) {
  const targetStates = getEffectiveTargetStates(transition, historyValue);
  if (!targetStates) {
    return null;
  }
  if (!transition.reenter && transition.source.type !== 'parallel' && targetStates.every(targetStateNode => isDescendant(targetStateNode, transition.source))) {
    return transition.source;
  }
  const lcca = findLCCA(targetStates.concat(transition.source));
  return lcca;
}
function computeExitSet(transitions, configuration, historyValue) {
  const statesToExit = new Set();
  for (const t of transitions) {
    if (t.target?.length) {
      const domain = getTransitionDomain(t, historyValue);
      for (const stateNode of configuration) {
        if (isDescendant(stateNode, domain)) {
          statesToExit.add(stateNode);
        }
      }
    }
  }
  return [...statesToExit];
}

/**
 * https://www.w3.org/TR/scxml/#microstepProcedure
 *
 * @private
 * @param transitions
 * @param currentState
 * @param mutConfiguration
 */

function microstep(transitions, currentState, actorCtx, event, isInitial) {
  const mutConfiguration = new Set(currentState.configuration);
  if (!transitions.length) {
    return currentState;
  }
  const microstate = microstepProcedure(transitions, currentState, mutConfiguration, event, actorCtx, isInitial);
  return cloneState(microstate, {
    value: {} // TODO: make optional
  });
}

function microstepProcedure(transitions, currentState, mutConfiguration, event, actorCtx, isInitial) {
  const actions = [];
  const historyValue = {
    ...currentState.historyValue
  };
  const filteredTransitions = removeConflictingTransitions(transitions, mutConfiguration, historyValue);
  const internalQueue = [...currentState._internalQueue];

  // Exit states
  if (!isInitial) {
    exitStates(filteredTransitions, mutConfiguration, historyValue, actions);
  }

  // Execute transition content
  actions.push(...filteredTransitions.flatMap(t => t.actions));

  // Enter states
  enterStates(event, filteredTransitions, mutConfiguration, actions, internalQueue, currentState, historyValue, isInitial, actorCtx);
  const nextConfiguration = [...mutConfiguration];
  const done = isInFinalState(nextConfiguration);
  if (done) {
    const finalActions = nextConfiguration.sort((a, b) => b.order - a.order).flatMap(state => state.exit);
    actions.push(...finalActions);
  }
  try {
    const nextState = resolveActionsAndContext(actions, event, currentState, actorCtx);
    const output = done ? getOutput(nextConfiguration, nextState.context, event, actorCtx.self) : undefined;
    internalQueue.push(...nextState._internalQueue);
    return cloneState(currentState, {
      configuration: nextConfiguration,
      historyValue,
      _internalQueue: internalQueue,
      context: nextState.context,
      status: done ? 'done' : currentState.status,
      output,
      children: nextState.children
    });
  } catch (e) {
    // TODO: Refactor this once proper error handling is implemented.
    // See https://github.com/statelyai/rfcs/pull/4
    throw e;
  }
}
function enterStates(event, filteredTransitions, mutConfiguration, actions, internalQueue, currentState, historyValue, isInitial, actorContext) {
  const statesToEnter = new Set();
  const statesForDefaultEntry = new Set();
  computeEntrySet(filteredTransitions, historyValue, statesForDefaultEntry, statesToEnter);

  // In the initial state, the root state node is "entered".
  if (isInitial) {
    statesForDefaultEntry.add(currentState.machine.root);
  }
  for (const stateNodeToEnter of [...statesToEnter].sort((a, b) => a.order - b.order)) {
    mutConfiguration.add(stateNodeToEnter);
    for (const invokeDef of stateNodeToEnter.invoke) {
      actions.push(invoke(invokeDef));
    }

    // Add entry actions
    actions.push(...stateNodeToEnter.entry);
    if (statesForDefaultEntry.has(stateNodeToEnter)) {
      for (const stateNode of statesForDefaultEntry) {
        const initialActions = stateNode.initial.actions;
        actions.push(...initialActions);
      }
    }
    if (stateNodeToEnter.type === 'final') {
      const parent = stateNodeToEnter.parent;
      if (!parent.parent) {
        continue;
      }
      internalQueue.push(createDoneStateEvent(parent.id, stateNodeToEnter.output ? resolveOutput(stateNodeToEnter.output, currentState.context, event, actorContext.self) : undefined));
      if (parent.parent) {
        const grandparent = parent.parent;
        if (grandparent.type === 'parallel') {
          if (getChildren(grandparent).every(parentNode => isInFinalState([...mutConfiguration], parentNode))) {
            internalQueue.push(createDoneStateEvent(grandparent.id));
          }
        }
      }
    }
  }
}
function computeEntrySet(transitions, historyValue, statesForDefaultEntry, statesToEnter) {
  for (const t of transitions) {
    for (const s of t.target || []) {
      addDescendantStatesToEnter(s, historyValue, statesForDefaultEntry, statesToEnter);
    }
    const ancestor = getTransitionDomain(t, historyValue);
    const targetStates = getEffectiveTargetStates(t, historyValue);
    for (const s of targetStates) {
      addAncestorStatesToEnter(s, ancestor, statesToEnter, historyValue, statesForDefaultEntry);
    }
  }
}
function addDescendantStatesToEnter(stateNode, historyValue, statesForDefaultEntry, statesToEnter) {
  if (isHistoryNode(stateNode)) {
    if (historyValue[stateNode.id]) {
      const historyStateNodes = historyValue[stateNode.id];
      for (const s of historyStateNodes) {
        addDescendantStatesToEnter(s, historyValue, statesForDefaultEntry, statesToEnter);
      }
      for (const s of historyStateNodes) {
        addAncestorStatesToEnter(s, stateNode.parent, statesToEnter, historyValue, statesForDefaultEntry);
        for (const stateForDefaultEntry of statesForDefaultEntry) {
          statesForDefaultEntry.add(stateForDefaultEntry);
        }
      }
    } else {
      const targets = resolveHistoryTarget(stateNode);
      for (const s of targets) {
        addDescendantStatesToEnter(s, historyValue, statesForDefaultEntry, statesToEnter);
      }
      for (const s of targets) {
        addAncestorStatesToEnter(s, stateNode, statesToEnter, historyValue, statesForDefaultEntry);
        for (const stateForDefaultEntry of statesForDefaultEntry) {
          statesForDefaultEntry.add(stateForDefaultEntry);
        }
      }
    }
  } else {
    statesToEnter.add(stateNode);
    if (stateNode.type === 'compound') {
      statesForDefaultEntry.add(stateNode);
      const initialStates = stateNode.initial.target;
      for (const initialState of initialStates) {
        addDescendantStatesToEnter(initialState, historyValue, statesForDefaultEntry, statesToEnter);
      }
      for (const initialState of initialStates) {
        addAncestorStatesToEnter(initialState, stateNode, statesToEnter, historyValue, statesForDefaultEntry);
      }
    } else {
      if (stateNode.type === 'parallel') {
        for (const child of getChildren(stateNode).filter(sn => !isHistoryNode(sn))) {
          if (![...statesToEnter].some(s => isDescendant(s, child))) {
            addDescendantStatesToEnter(child, historyValue, statesForDefaultEntry, statesToEnter);
          }
        }
      }
    }
  }
}
function addAncestorStatesToEnter(stateNode, toStateNode, statesToEnter, historyValue, statesForDefaultEntry) {
  const properAncestors = getProperAncestors(stateNode, toStateNode);
  for (const anc of properAncestors) {
    statesToEnter.add(anc);
    if (anc.type === 'parallel') {
      for (const child of getChildren(anc).filter(sn => !isHistoryNode(sn))) {
        if (![...statesToEnter].some(s => isDescendant(s, child))) {
          addDescendantStatesToEnter(child, historyValue, statesForDefaultEntry, statesToEnter);
        }
      }
    }
  }
}
function exitStates(transitions, mutConfiguration, historyValue, actions) {
  const statesToExit = computeExitSet(transitions, mutConfiguration, historyValue);
  statesToExit.sort((a, b) => b.order - a.order);

  // From SCXML algorithm: https://www.w3.org/TR/scxml/#exitStates
  for (const exitStateNode of statesToExit) {
    for (const historyNode of getHistoryNodes(exitStateNode)) {
      let predicate;
      if (historyNode.history === 'deep') {
        predicate = sn => isAtomicStateNode(sn) && isDescendant(sn, exitStateNode);
      } else {
        predicate = sn => {
          return sn.parent === exitStateNode;
        };
      }
      historyValue[historyNode.id] = Array.from(mutConfiguration).filter(predicate);
    }
  }
  for (const s of statesToExit) {
    actions.push(...s.exit, ...s.invoke.map(def => stop(def.id)));
    mutConfiguration.delete(s);
  }
}
function resolveActionsAndContext(actions, event, currentState, actorCtx) {
  const {
    machine
  } = currentState;
  // TODO: this `cloneState` is really just a hack to prevent infinite loops
  // we need to take another look at how internal queue is managed
  let intermediateState = cloneState(currentState, {
    _internalQueue: []
  });
  for (const action of actions) {
    const isInline = typeof action === 'function';
    const resolvedAction = isInline ? action :
    // the existing type of `.actions` assumes non-nullable `TExpressionAction`
    // it's fine to cast this here to get a common type and lack of errors in the rest of the code
    // our logic below makes sure that we call those 2 "variants" correctly
    machine.implementations.actions[typeof action === 'string' ? action : action.type];
    if (!resolvedAction) {
      continue;
    }
    const actionArgs = {
      context: intermediateState.context,
      event,
      self: actorCtx?.self,
      system: actorCtx?.system,
      action: isInline ? undefined : typeof action === 'string' ? {
        type: action
      } : typeof action.params === 'function' ? {
        type: action.type,
        params: action.params({
          context: intermediateState.context,
          event
        })
      } :
      // TS isn't able to narrow it down here
      action
    };
    if (!('resolve' in resolvedAction)) {
      if (actorCtx?.self.status === ActorStatus.Running) {
        resolvedAction(actionArgs);
      } else {
        actorCtx?.defer(() => {
          resolvedAction(actionArgs);
        });
      }
      continue;
    }
    const builtinAction = resolvedAction;
    const [nextState, params, actions] = builtinAction.resolve(actorCtx, intermediateState, actionArgs, resolvedAction // this holds all params
    );

    intermediateState = nextState;
    if ('execute' in resolvedAction) {
      if (actorCtx?.self.status === ActorStatus.Running) {
        builtinAction.execute(actorCtx, params);
      } else {
        actorCtx?.defer(builtinAction.execute.bind(null, actorCtx, params));
      }
    }
    if (actions) {
      intermediateState = resolveActionsAndContext(actions, event, intermediateState, actorCtx);
    }
  }
  return intermediateState;
}
function macrostep(state, event, actorCtx) {
  let nextState = state;
  const states = [];

  // Handle stop event
  if (event.type === XSTATE_STOP) {
    nextState = stopStep(event, nextState, actorCtx);
    states.push(nextState);
    return {
      state: nextState,
      microstates: states
    };
  }
  let nextEvent = event;

  // Assume the state is at rest (no raised events)
  // Determine the next state based on the next microstep
  if (nextEvent.type !== XSTATE_INIT) {
    const transitions = selectTransitions(nextEvent, nextState);
    nextState = microstep(transitions, state, actorCtx, nextEvent, false);
    states.push(nextState);
  }
  while (nextState.status === 'active') {
    let enabledTransitions = selectEventlessTransitions(nextState, nextEvent);
    if (!enabledTransitions.length) {
      if (!nextState._internalQueue.length) {
        break;
      } else {
        nextEvent = nextState._internalQueue[0];
        const transitions = selectTransitions(nextEvent, nextState);
        nextState = microstep(transitions, nextState, actorCtx, nextEvent, false);
        nextState._internalQueue.shift();
        states.push(nextState);
      }
    } else {
      nextState = microstep(enabledTransitions, nextState, actorCtx, nextEvent, false);
      states.push(nextState);
    }
  }
  if (nextState.status !== 'active') {
    // Perform the stop step to ensure that child actors are stopped
    stopStep(nextEvent, nextState, actorCtx);
  }
  return {
    state: nextState,
    microstates: states
  };
}
function stopStep(event, nextState, actorCtx) {
  const actions = [];
  for (const stateNode of nextState.configuration.sort((a, b) => b.order - a.order)) {
    actions.push(...stateNode.exit);
  }
  for (const child of Object.values(nextState.children)) {
    actions.push(stop(child));
  }
  return resolveActionsAndContext(actions, event, nextState, actorCtx);
}
function selectTransitions(event, nextState) {
  return nextState.machine.getTransitionData(nextState, event);
}
function selectEventlessTransitions(nextState, event) {
  const enabledTransitionSet = new Set();
  const atomicStates = nextState.configuration.filter(isAtomicStateNode);
  for (const stateNode of atomicStates) {
    loop: for (const s of [stateNode].concat(getProperAncestors(stateNode, null))) {
      if (!s.always) {
        continue;
      }
      for (const transition of s.always) {
        if (transition.guard === undefined || evaluateGuard(transition.guard, nextState.context, event, nextState)) {
          enabledTransitionSet.add(transition);
          break loop;
        }
      }
    }
  }
  return removeConflictingTransitions(Array.from(enabledTransitionSet), new Set(nextState.configuration), nextState.historyValue);
}

/**
 * Resolves a partial state value with its full representation in the state node's machine.
 *
 * @param stateValue The partial state value to resolve.
 */
function resolveStateValue(rootNode, stateValue) {
  const configuration = getConfiguration(getStateNodes(rootNode, stateValue));
  return getStateValue(rootNode, [...configuration]);
}
function getInitialConfiguration(rootNode) {
  const configuration = [];
  const initialTransition = rootNode.initial;
  const statesToEnter = new Set();
  const statesForDefaultEntry = new Set([rootNode]);
  computeEntrySet([initialTransition], {}, statesForDefaultEntry, statesToEnter);
  for (const stateNodeToEnter of [...statesToEnter].sort((a, b) => a.order - b.order)) {
    configuration.push(stateNodeToEnter);
  }
  return configuration;
}

class State {
  /**
   * Indicates whether the state is a final state.
   */

  /**
   * The output data of the top-level finite state.
   */

  /**
   * The enabled state nodes representative of the state value.
   */

  /**
   * An object mapping actor names to spawned/invoked actors.
   */

  /**
   * Creates a new State instance for the given `stateValue` and `context`.
   * @param stateValue
   * @param context
   */
  static from(stateValue, context = {}, machine) {
    if (stateValue instanceof State) {
      if (stateValue.context !== context) {
        return new State({
          value: stateValue.value,
          context,
          meta: {},
          configuration: [],
          // TODO: fix,
          children: {},
          status: 'active'
        }, machine);
      }
      return stateValue;
    }
    const configuration = getConfiguration(getStateNodes(machine.root, stateValue));
    return new State({
      value: stateValue,
      context,
      meta: undefined,
      configuration: Array.from(configuration),
      children: {},
      status: 'active'
    }, machine);
  }

  /**
   * Creates a new `State` instance that represents the current state of a running machine.
   *
   * @param config
   */
  constructor(config, machine) {
    this.machine = machine;
    this.tags = void 0;
    this.value = void 0;
    this.status = void 0;
    this.error = void 0;
    this.context = void 0;
    this.historyValue = {};
    this._internalQueue = void 0;
    this.configuration = void 0;
    this.children = void 0;
    this.context = config.context;
    this._internalQueue = config._internalQueue ?? [];
    this.historyValue = config.historyValue || {};
    this.matches = this.matches.bind(this);
    this.toStrings = this.toStrings.bind(this);
    this.configuration = config.configuration ?? Array.from(getConfiguration(getStateNodes(machine.root, config.value)));
    this.children = config.children;
    this.value = getStateValue(machine.root, this.configuration);
    this.tags = new Set(flatten(this.configuration.map(sn => sn.tags)));
    this.status = config.status;
    this.output = config.output;
    this.error = config.error;
  }

  /**
   * Returns an array of all the string leaf state node paths.
   * @param stateValue
   * @param delimiter The character(s) that separate each subpath in the string state node path.
   */
  toStrings(stateValue = this.value) {
    if (typeof stateValue === 'string') {
      return [stateValue];
    }
    const valueKeys = Object.keys(stateValue);
    return valueKeys.concat(...valueKeys.map(key => this.toStrings(stateValue[key]).map(s => key + STATE_DELIMITER + s)));
  }
  toJSON() {
    const {
      configuration,
      tags,
      machine,
      ...jsonValues
    } = this;
    return {
      ...jsonValues,
      tags: Array.from(tags),
      meta: this.meta
    };
  }

  /**
   * Whether the current state value is a subset of the given parent state value.
   * @param parentStateValue
   */
  matches(parentStateValue) {
    return matchesState(parentStateValue, this.value);
  }

  /**
   * Whether the current state configuration has a state node with the specified `tag`.
   * @param tag
   */
  hasTag(tag) {
    return this.tags.has(tag);
  }

  /**
   * Determines whether sending the `event` will cause a non-forbidden transition
   * to be selected, even if the transitions have no actions nor
   * change the state value.
   *
   * @param event The event to test
   * @returns Whether the event will cause a transition
   */
  can(event) {
    const transitionData = this.machine.getTransitionData(this, event);
    return !!transitionData?.length &&
    // Check that at least one transition is not forbidden
    transitionData.some(t => t.target !== undefined || t.actions.length);
  }

  /**
   * The next events that will cause a transition from the current state.
   */
  get nextEvents() {
    return memo(this, 'nextEvents', () => {
      return [...new Set(flatten([...this.configuration.map(sn => sn.ownEvents)]))];
    });
  }
  get meta() {
    return this.configuration.reduce((acc, stateNode) => {
      if (stateNode.meta !== undefined) {
        acc[stateNode.id] = stateNode.meta;
      }
      return acc;
    }, {});
  }
}
function cloneState(state, config = {}) {
  return new State({
    ...state,
    ...config
  }, state.machine);
}
function getPersistedState(state) {
  const {
    configuration,
    tags,
    machine,
    children,
    ...jsonValues
  } = state;
  const childrenJson = {};
  for (const id in children) {
    const child = children[id];
    childrenJson[id] = {
      state: child.getPersistedState?.(),
      src: child.src
    };
  }
  return {
    ...jsonValues,
    children: childrenJson
  };
}

function resolveRaise(_, state, args, {
  event: eventOrExpr,
  id,
  delay
}) {
  const delaysMap = state.machine.implementations.delays;
  if (typeof eventOrExpr === 'string') {
    throw new Error(`Only event objects may be used with raise; use raise({ type: "${eventOrExpr}" }) instead`);
  }
  const resolvedEvent = typeof eventOrExpr === 'function' ? eventOrExpr(args) : eventOrExpr;
  let resolvedDelay;
  if (typeof delay === 'string') {
    const configDelay = delaysMap && delaysMap[delay];
    resolvedDelay = typeof configDelay === 'function' ? configDelay(args) : configDelay;
  } else {
    resolvedDelay = typeof delay === 'function' ? delay(args) : delay;
  }
  return [typeof resolvedDelay !== 'number' ? cloneState(state, {
    _internalQueue: state._internalQueue.concat(resolvedEvent)
  }) : state, {
    event: resolvedEvent,
    id,
    delay: resolvedDelay
  }];
}
function executeRaise(actorContext, params) {
  if (typeof params.delay === 'number') {
    actorContext.self.delaySend(params);
    return;
  }
}
/**
 * Raises an event. This places the event in the internal event queue, so that
 * the event is immediately consumed by the machine in the current step.
 *
 * @param eventType The event to raise.
 */
function raise(eventOrExpr, options) {
  function raise(_) {
  }
  raise.type = 'xstate.raise';
  raise.event = eventOrExpr;
  raise.id = options?.id;
  raise.delay = options?.delay;
  raise.resolve = resolveRaise;
  raise.execute = executeRaise;
  return raise;
}

function createSpawner(actorContext, {
  machine,
  context
}, event, spawnedChildren) {
  const spawn = (src, options = {}) => {
    const {
      systemId
    } = options;
    if (typeof src === 'string') {
      const referenced = resolveReferencedActor(machine.implementations.actors[src]);
      if (!referenced) {
        throw new Error(`Actor logic '${src}' not implemented in machine '${machine.id}'`);
      }
      const input = 'input' in options ? options.input : referenced.input;

      // TODO: this should also receive `src`
      const actorRef = createActor(referenced.src, {
        id: options.id,
        parent: actorContext.self,
        input: typeof input === 'function' ? input({
          context,
          event,
          self: actorContext.self
        }) : input,
        systemId
      });
      spawnedChildren[actorRef.id] = actorRef;
      if (options.syncSnapshot) {
        actorRef.subscribe({
          next: snapshot => {
            if (snapshot.status === 'active') {
              actorContext.self.send({
                type: `xstate.snapshot.${actorRef.id}`,
                snapshot
              });
            }
          },
          error: () => {
            /* TODO */
          }
        });
      }
      return actorRef;
    } else {
      // TODO: this should also receive `src`
      const actorRef = createActor(src, {
        id: options.id,
        parent: actorContext.self,
        input: options.input,
        systemId
      });
      if (options.syncSnapshot) {
        actorRef.subscribe({
          next: snapshot => {
            if (snapshot.status === 'active') {
              actorContext.self.send({
                type: `xstate.snapshot.${actorRef.id}`,
                snapshot,
                id: actorRef.id
              });
            }
          },
          error: () => {
            /* TODO */
          }
        });
      }
      return actorRef;
    }
  };
  return (src, options) => {
    const actorRef = spawn(src, options); // TODO: fix types
    spawnedChildren[actorRef.id] = actorRef;
    actorContext.defer(() => {
      if (actorRef.status === ActorStatus.Stopped) {
        return;
      }
      try {
        actorRef.start?.();
      } catch (err) {
        actorContext.self.send(createErrorActorEvent(actorRef.id, err));
        return;
      }
    });
    return actorRef;
  };
}

function resolveAssign(actorContext, state, actionArgs, {
  assignment
}) {
  if (!state.context) {
    throw new Error('Cannot assign to undefined `context`. Ensure that `context` is defined in the machine config.');
  }
  const spawnedChildren = {};
  const assignArgs = {
    context: state.context,
    event: actionArgs.event,
    action: actionArgs.action,
    spawn: createSpawner(actorContext, state, actionArgs.event, spawnedChildren),
    self: actorContext?.self,
    system: actorContext?.system
  };
  let partialUpdate = {};
  if (typeof assignment === 'function') {
    partialUpdate = assignment(assignArgs);
  } else {
    for (const key of Object.keys(assignment)) {
      const propAssignment = assignment[key];
      partialUpdate[key] = typeof propAssignment === 'function' ? propAssignment(assignArgs) : propAssignment;
    }
  }
  const updatedContext = Object.assign({}, state.context, partialUpdate);
  return [cloneState(state, {
    context: updatedContext,
    children: Object.keys(spawnedChildren).length ? {
      ...state.children,
      ...spawnedChildren
    } : state.children
  })];
}
/**
 * Updates the current context of the machine.
 *
 * @param assignment An object that represents the partial context to update.
 */
function assign(assignment) {
  function assign(_) {
  }
  assign.type = 'xstate.assign';
  assign.assignment = assignment;
  assign.resolve = resolveAssign;
  return assign;
}

const EMPTY_OBJECT = {};
const toSerializableAction = action => {
  if (typeof action === 'string') {
    return {
      type: action
    };
  }
  if (typeof action === 'function') {
    if ('resolve' in action) {
      return {
        type: action.type
      };
    }
    return {
      type: action.name
    };
  }
  return action;
};
class StateNode {
  /**
   * The relative key of the state node, which represents its location in the overall state value.
   */

  /**
   * The unique ID of the state node.
   */

  /**
   * The type of this state node:
   *
   *  - `'atomic'` - no child state nodes
   *  - `'compound'` - nested child state nodes (XOR)
   *  - `'parallel'` - orthogonal nested child state nodes (AND)
   *  - `'history'` - history state node
   *  - `'final'` - final state node
   */

  /**
   * The string path from the root machine node to this node.
   */

  /**
   * The child state nodes.
   */

  /**
   * The type of history on this state node. Can be:
   *
   *  - `'shallow'` - recalls only top-level historical state value
   *  - `'deep'` - recalls historical state value at all levels
   */

  /**
   * The action(s) to be executed upon entering the state node.
   */

  /**
   * The action(s) to be executed upon exiting the state node.
   */

  /**
   * The parent state node.
   */

  /**
   * The root machine node.
   */

  /**
   * The meta data associated with this state node, which will be returned in State instances.
   */

  /**
   * The output data sent with the "xstate.done.state._id_" event if this is a final state node.
   */

  /**
   * The order this state node appears. Corresponds to the implicit document order.
   */

  constructor(
  /**
   * The raw config used to create the machine.
   */
  config, options) {
    this.config = config;
    this.key = void 0;
    this.id = void 0;
    this.type = void 0;
    this.path = void 0;
    this.states = void 0;
    this.history = void 0;
    this.entry = void 0;
    this.exit = void 0;
    this.parent = void 0;
    this.machine = void 0;
    this.meta = void 0;
    this.output = void 0;
    this.order = -1;
    this.description = void 0;
    this.tags = [];
    this.transitions = void 0;
    this.always = void 0;
    this.parent = options._parent;
    this.key = options._key;
    this.machine = options._machine;
    this.path = this.parent ? this.parent.path.concat(this.key) : [];
    this.id = this.config.id || [this.machine.id, ...this.path].join(STATE_DELIMITER);
    this.type = this.config.type || (this.config.states && Object.keys(this.config.states).length ? 'compound' : this.config.history ? 'history' : 'atomic');
    this.description = this.config.description;
    this.order = this.machine.idMap.size;
    this.machine.idMap.set(this.id, this);
    this.states = this.config.states ? mapValues(this.config.states, (stateConfig, key) => {
      const stateNode = new StateNode(stateConfig, {
        _parent: this,
        _key: key,
        _machine: this.machine
      });
      return stateNode;
    }) : EMPTY_OBJECT;
    if (this.type === 'compound' && !this.config.initial) {
      throw new Error(`No initial state specified for compound state node "#${this.id}". Try adding { initial: "${Object.keys(this.states)[0]}" } to the state config.`);
    }

    // History config
    this.history = this.config.history === true ? 'shallow' : this.config.history || false;
    this.entry = toArray(this.config.entry).slice();
    this.exit = toArray(this.config.exit).slice();
    this.meta = this.config.meta;
    this.output = this.type === 'final' || !this.parent ? this.config.output : undefined;
    this.tags = toArray(config.tags).slice();
  }
  _initialize() {
    this.transitions = formatTransitions(this);
    if (this.config.always) {
      this.always = toTransitionConfigArray(this.config.always).map(t => formatTransition(this, NULL_EVENT, t));
    }
    Object.keys(this.states).forEach(key => {
      this.states[key]._initialize();
    });
  }

  /**
   * The well-structured state node definition.
   */
  get definition() {
    return {
      id: this.id,
      key: this.key,
      version: this.machine.version,
      type: this.type,
      initial: this.initial ? {
        target: this.initial.target,
        source: this,
        actions: this.initial.actions.map(toSerializableAction),
        eventType: null,
        reenter: false,
        toJSON: () => ({
          target: this.initial.target.map(t => `#${t.id}`),
          source: `#${this.id}`,
          actions: this.initial.actions.map(toSerializableAction),
          eventType: null
        })
      } : undefined,
      history: this.history,
      states: mapValues(this.states, state => {
        return state.definition;
      }),
      on: this.on,
      transitions: [...this.transitions.values()].flat().map(t => ({
        ...t,
        actions: t.actions.map(toSerializableAction)
      })),
      entry: this.entry.map(toSerializableAction),
      exit: this.exit.map(toSerializableAction),
      meta: this.meta,
      order: this.order || -1,
      output: this.output,
      invoke: this.invoke,
      description: this.description,
      tags: this.tags
    };
  }
  toJSON() {
    return this.definition;
  }

  /**
   * The logic invoked as actors by this state node.
   */
  get invoke() {
    return memo(this, 'invoke', () => toArray(this.config.invoke).map((invokeConfig, i) => {
      const {
        src,
        systemId
      } = invokeConfig;
      const resolvedId = invokeConfig.id || createInvokeId(this.id, i);
      // TODO: resolving should not happen here
      const resolvedSrc = typeof src === 'string' ? src : !('type' in src) ? resolvedId : src;
      if (!this.machine.implementations.actors[resolvedId] && typeof src !== 'string' && !('type' in src)) {
        this.machine.implementations.actors = {
          ...this.machine.implementations.actors,
          // TODO: this should accept `src` as-is
          [resolvedId]: src
        };
      }
      return {
        ...invokeConfig,
        src: resolvedSrc,
        id: resolvedId,
        systemId: systemId,
        toJSON() {
          const {
            onDone,
            onError,
            ...invokeDefValues
          } = invokeConfig;
          return {
            ...invokeDefValues,
            type: 'xstate.invoke',
            src: resolvedSrc,
            id: resolvedId
          };
        }
      };
    }));
  }

  /**
   * The mapping of events to transitions.
   */
  get on() {
    return memo(this, 'on', () => {
      const transitions = this.transitions;
      return [...transitions].flatMap(([descriptor, t]) => t.map(t => [descriptor, t])).reduce((map, [descriptor, transition]) => {
        map[descriptor] = map[descriptor] || [];
        map[descriptor].push(transition);
        return map;
      }, {});
    });
  }
  get after() {
    return memo(this, 'delayedTransitions', () => getDelayedTransitions(this));
  }
  get initial() {
    return memo(this, 'initial', () => formatInitialTransition(this, this.config.initial || []));
  }
  next(state, event) {
    const eventType = event.type;
    const actions = [];
    let selectedTransition;
    const candidates = memo(this, `candidates-${eventType}`, () => getCandidates(this, eventType));
    for (const candidate of candidates) {
      const {
        guard
      } = candidate;
      const resolvedContext = state.context;
      let guardPassed = false;
      try {
        guardPassed = !guard || evaluateGuard(guard, resolvedContext, event, state);
      } catch (err) {
        const guardType = typeof guard === 'string' ? guard : typeof guard === 'object' ? guard.type : undefined;
        throw new Error(`Unable to evaluate guard ${guardType ? `'${guardType}' ` : ''}in transition for event '${eventType}' in state node '${this.id}':\n${err.message}`);
      }
      if (guardPassed) {
        actions.push(...candidate.actions);
        selectedTransition = candidate;
        break;
      }
    }
    return selectedTransition ? [selectedTransition] : undefined;
  }

  /**
   * All the event types accepted by this state node and its descendants.
   */
  get events() {
    return memo(this, 'events', () => {
      const {
        states
      } = this;
      const events = new Set(this.ownEvents);
      if (states) {
        for (const stateId of Object.keys(states)) {
          const state = states[stateId];
          if (state.states) {
            for (const event of state.events) {
              events.add(`${event}`);
            }
          }
        }
      }
      return Array.from(events);
    });
  }

  /**
   * All the events that have transitions directly from this state node.
   *
   * Excludes any inert events.
   */
  get ownEvents() {
    const events = new Set([...this.transitions.keys()].filter(descriptor => {
      return this.transitions.get(descriptor).some(transition => !(!transition.target && !transition.actions.length && !transition.reenter));
    }));
    return Array.from(events);
  }
}

const STATE_IDENTIFIER = '#';
class StateMachine {
  /**
   * The machine's own version.
   */

  constructor(
  /**
   * The raw config used to create the machine.
   */
  config, implementations) {
    this.config = config;
    this.version = void 0;
    this.implementations = void 0;
    this.types = void 0;
    this.__xstatenode = true;
    this.idMap = new Map();
    this.root = void 0;
    this.id = void 0;
    this.states = void 0;
    this.events = void 0;
    this.__TContext = void 0;
    this.__TEvent = void 0;
    this.__TActor = void 0;
    this.__TAction = void 0;
    this.__TGuard = void 0;
    this.__TDelay = void 0;
    this.__TTag = void 0;
    this.__TInput = void 0;
    this.__TOutput = void 0;
    this.__TResolvedTypesMeta = void 0;
    this.id = config.id || '(machine)';
    this.implementations = {
      actors: implementations?.actors ?? {},
      actions: implementations?.actions ?? {},
      delays: implementations?.delays ?? {},
      guards: implementations?.guards ?? {}
    };
    this.version = this.config.version;
    this.types = this.config.types ?? {};
    this.transition = this.transition.bind(this);
    this.getInitialState = this.getInitialState.bind(this);
    this.restoreState = this.restoreState.bind(this);
    this.start = this.start.bind(this);
    this.getPersistedState = this.getPersistedState.bind(this);
    this.root = new StateNode(config, {
      _key: this.id,
      _machine: this
    });
    this.root._initialize();
    this.states = this.root.states; // TODO: remove!
    this.events = this.root.events;
  }

  /**
   * Clones this state machine with the provided implementations
   * and merges the `context` (if provided).
   *
   * @param implementations Options (`actions`, `guards`, `actors`, `delays`, `context`)
   *  to recursively merge with the existing options.
   *
   * @returns A new `StateMachine` instance with the provided implementations.
   */
  provide(implementations) {
    const {
      actions,
      guards,
      actors,
      delays
    } = this.implementations;
    return new StateMachine(this.config, {
      actions: {
        ...actions,
        ...implementations.actions
      },
      guards: {
        ...guards,
        ...implementations.guards
      },
      actors: {
        ...actors,
        ...implementations.actors
      },
      delays: {
        ...delays,
        ...implementations.delays
      }
    });
  }

  /**
   * Resolves the given `state` to a new `State` instance relative to this machine.
   *
   * This ensures that `.nextEvents` represent the correct values.
   *
   * @param state The state to resolve
   */
  resolveState(state) {
    const configurationSet = getConfiguration(getStateNodes(this.root, state.value));
    const configuration = Array.from(configurationSet);
    return this.createState({
      ...state,
      value: resolveStateValue(this.root, state.value),
      configuration,
      status: isInFinalState(configuration) ? 'done' : state.status
    });
  }
  resolveStateValue(stateValue, ...[context]) {
    const resolvedStateValue = resolveStateValue(this.root, stateValue);
    return this.resolveState(State.from(resolvedStateValue, context, this));
  }

  /**
   * Determines the next state given the current `state` and received `event`.
   * Calculates a full macrostep from all microsteps.
   *
   * @param state The current State instance or state value
   * @param event The received event
   */
  transition(state, event, actorCtx) {
    // TODO: handle error events in a better way
    if (isErrorActorEvent(event) && !state.nextEvents.some(nextEvent => nextEvent === event.type)) {
      return cloneState(state, {
        status: 'error',
        error: event.data
      });
    }
    const {
      state: nextState
    } = macrostep(state, event, actorCtx);
    return nextState;
  }

  /**
   * Determines the next state given the current `state` and `event`.
   * Calculates a microstep.
   *
   * @param state The current state
   * @param event The received event
   */
  microstep(state, event, actorCtx) {
    return macrostep(state, event, actorCtx).microstates;
  }
  getTransitionData(state, event) {
    return transitionNode(this.root, state.value, state, event) || [];
  }

  /**
   * The initial state _before_ evaluating any microsteps.
   * This "pre-initial" state is provided to initial actions executed in the initial state.
   */
  getPreInitialState(actorCtx, initEvent) {
    const {
      context
    } = this.config;
    const preInitial = this.resolveState(this.createState({
      value: {},
      // TODO: this is computed in state constructor
      context: typeof context !== 'function' && context ? context : {},
      meta: undefined,
      configuration: getInitialConfiguration(this.root),
      children: {},
      status: 'active'
    }));
    if (typeof context === 'function') {
      const assignment = ({
        spawn,
        event
      }) => context({
        spawn,
        input: event.input
      });
      return resolveActionsAndContext([assign(assignment)], initEvent, preInitial, actorCtx);
    }
    return preInitial;
  }

  /**
   * Returns the initial `State` instance, with reference to `self` as an `ActorRef`.
   */
  getInitialState(actorCtx, input) {
    const initEvent = createInitEvent(input); // TODO: fix;

    const preInitialState = this.getPreInitialState(actorCtx, initEvent);
    const nextState = microstep([{
      target: [...preInitialState.configuration].filter(isAtomicStateNode),
      source: this.root,
      reenter: true,
      actions: [],
      eventType: null,
      toJSON: null // TODO: fix
    }], preInitialState, actorCtx, initEvent, true);
    const {
      state: macroState
    } = macrostep(nextState, initEvent, actorCtx);
    return macroState;
  }
  start(state) {
    Object.values(state.children).forEach(child => {
      if (child.status === 0) {
        child.start?.();
      }
    });
  }
  getStateNodeById(stateId) {
    const fullPath = stateId.split(STATE_DELIMITER);
    const relativePath = fullPath.slice(1);
    const resolvedStateId = isStateId(fullPath[0]) ? fullPath[0].slice(STATE_IDENTIFIER.length) : fullPath[0];
    const stateNode = this.idMap.get(resolvedStateId);
    if (!stateNode) {
      throw new Error(`Child state node '#${resolvedStateId}' does not exist on machine '${this.id}'`);
    }
    return getStateNodeByPath(stateNode, relativePath);
  }
  get definition() {
    return this.root.definition;
  }
  toJSON() {
    return this.definition;
  }
  getPersistedState(state) {
    return getPersistedState(state);
  }
  createState(stateConfig) {
    return stateConfig instanceof State ? stateConfig : new State(stateConfig, this);
  }
  restoreState(snapshot, _actorCtx) {
    const children = {};
    Object.keys(snapshot.children).forEach(actorId => {
      const actorData = snapshot.children[actorId];
      const childState = actorData.state;
      const src = actorData.src;
      const logic = src ? resolveReferencedActor(this.implementations.actors[src])?.src : undefined;
      if (!logic) {
        return;
      }
      const actorState = logic.restoreState?.(childState, _actorCtx);
      const actorRef = createActor(logic, {
        id: actorId,
        parent: _actorCtx?.self,
        state: actorState
      });
      children[actorId] = actorRef;
    });
    return this.createState(new State({
      ...snapshot,
      children
    }, this));
  }

  /**@deprecated an internal property acting as a "phantom" type, not meant to be used at runtime */
}

function createMachine(config, implementations) {
  return new StateMachine(config, implementations);
}

const feedbackMachine = createMachine({
  id: "FeedbackMachine",
  types: {},
  context: Context,
  initial: "Satisfied",
  states: {
    Satisfied: {
      entry: "setModalToSatisfied",
      on: {
        SATISFIED_YES: "Thanx",
        SATISFIED_NO: "Feedback"
      }
    },
    Feedback: {
      entry: "setModalToFeedback"
    },
    Thanx: {
      entry: "setModalToThanx"
    },
    Closed: {}
  }
}, {
  actions: {
    setModalToSatisfied: ({ context }) => {
      context.modal.value = "Satisfied";
    },
    setModalToFeedback: ({ context }) => {
      context.modal.value = "Feedback";
    },
    setModalToThanx: ({ context }) => {
      context.modal.value = "Thanx";
    }
  }
});

const feedbackActor = createActor(feedbackMachine);

class FeedbackLogic {
  constructor() {
    window.addEventListener("SATISFIED_YES", feedbackActor.send);
    window.addEventListener("SATISFIED_NO", feedbackActor.send);
    feedbackActor.subscribe((snapshot) => {
      console.log(snapshot.value);
    });
    feedbackActor.start();
  }
}

var __defProp$7 = Object.defineProperty;
var __defNormalProp$7 = (obj, key, value) => key in obj ? __defProp$7(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$7 = (obj, key, value) => {
  __defNormalProp$7(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class Base extends HTMLElement {
  constructor() {
    super();
    __publicField$7(this, "_width", "HUG");
    __publicField$7(this, "_widthChanged", true);
    __publicField$7(this, "_height", "HUG");
    __publicField$7(this, "_heightChanged", true);
    __publicField$7(this, "_position", "SCROLL_WITH_PARENT");
    __publicField$7(this, "_positionChanged", false);
    __publicField$7(this, "_left", NaN);
    __publicField$7(this, "_leftChanged", false);
    __publicField$7(this, "_top", NaN);
    __publicField$7(this, "_topChanged", false);
    __publicField$7(this, "_right", NaN);
    __publicField$7(this, "_rightChanged", false);
    __publicField$7(this, "_bottom", NaN);
    __publicField$7(this, "_bottomChanged", false);
    __publicField$7(this, "connected", false);
  }
  commitProperties() {
    if (this._widthChanged || this._heightChanged) {
      this.sizeChanged();
    }
    if (this._positionChanged) {
      this.positionChanged();
    }
    if (this._leftChanged || this._topChanged || this._rightChanged || this._bottomChanged) {
      this.contraintsChanged();
    }
  }
  sizeChanged() {
    this._widthChanged = false;
    this._heightChanged = false;
  }
  positionChanged() {
    this._positionChanged = false;
  }
  contraintsChanged() {
    this._leftChanged = false;
    this._topChanged = false;
    this._rightChanged = false;
    this._bottomChanged = false;
  }
  get width() {
    return this._width;
  }
  set width(value) {
    if (this._width === value) {
      return;
    }
    if (value === "FILL" || value === "HUG") {
      this._width = value;
      this._widthChanged = true;
      this.invalidateProperties();
      return;
    }
    if (isNaN(value) || value < 0) {
      if (this._width !== 0) {
        this._width = 0;
        this._widthChanged = true;
        this.invalidateProperties();
      }
      return;
    }
    this._width = value;
    this._widthChanged = true;
    this.invalidateProperties();
  }
  get height() {
    return this._height;
  }
  set height(value) {
    if (this._height === value) {
      return;
    }
    if (value === "FILL" || value === "HUG") {
      this._height = value;
      this._heightChanged = true;
      this.invalidateProperties();
      return;
    }
    if (isNaN(value) || value < 0) {
      if (this._height !== 0) {
        this._height = 0;
        this._heightChanged = true;
        this.invalidateProperties();
      }
      return;
    }
    this._height = value;
    this._heightChanged = true;
    this.invalidateProperties();
  }
  get position() {
    return this._position;
  }
  set position(value) {
    if (this._position === value) {
      return;
    }
    this._position = value;
    this._positionChanged = true;
    this.invalidateProperties();
  }
  get left() {
    return this._left;
  }
  set left(value) {
    if (this._left === value) {
      return;
    }
    if (Number.isNaN(this._left) && Number.isNaN(value)) {
      return;
    }
    this._left = value;
    this._leftChanged = true;
    this.invalidateProperties();
  }
  get top() {
    return this._top;
  }
  set top(value) {
    if (this._top === value) {
      return;
    }
    if (Number.isNaN(this._top) && Number.isNaN(value)) {
      return;
    }
    this._top = value;
    this._topChanged = true;
    this.invalidateProperties();
  }
  get right() {
    return this._right;
  }
  set right(value) {
    if (this._right === value) {
      return;
    }
    if (Number.isNaN(this._right) && Number.isNaN(value)) {
      return;
    }
    this._right = value;
    this._rightChanged = true;
    this.invalidateProperties();
  }
  get bottom() {
    return this._bottom;
  }
  set bottom(value) {
    if (this._bottom === value) {
      return;
    }
    if (Number.isNaN(this._bottom) && Number.isNaN(value)) {
      return;
    }
    this._bottom = value;
    this._bottomChanged = true;
    this.invalidateProperties();
  }
  get parent() {
    if (this.parentNode instanceof HTMLAnchorElement) {
      return this.parentNode.parentNode;
    }
    return this.parentNode;
  }
  invalidateProperties() {
    if (this.connected) {
      this.commitProperties();
    }
  }
  connectedCallback() {
    this.connected = true;
    this.commitProperties();
  }
  disconnectedCallback() {
    this.connected = false;
  }
}

function resetPadding(target) {
  target.style.padding = "";
}
function applyPadding(container, target) {
  target.style.paddingLeft = container.paddingLeft + "px";
  target.style.paddingTop = container.paddingTop + "px";
  target.style.paddingRight = container.paddingRight + "px";
  target.style.paddingBottom = container.paddingBottom + "px";
}
function setDisplayAutolayoutHorizontalOrVertical(target, parent) {
  const parentElement = parent;
  if (parentElement === document.body) {
    target.style.display = "flex";
  } else {
    target.style.display = "inline-flex";
  }
}
function setDisplayAutoLayoutGrid(target, parent) {
  const parentElement = parent;
  if (parentElement === document.body) {
    target.style.display = "grid";
  } else {
    target.style.display = "inline-grid";
  }
}
function setDisplayAutolayoutNone(target, parent) {
  const parentElement = parent;
  if (parentElement === document.body) {
    target.style.display = "block";
  } else {
    target.style.display = "inline-block";
  }
}
function setSizeWithParentAutoLayoutHorizontal(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    setSizeWithParentAutoLayoutHorizontalScrollWithParent(component, target);
  } else if (component.position === "STICKY") {
    setSizeWithParentAutoLayoutHorizontalSticky(component, target);
  } else {
    setSizeWithParentAutoLayoutHorizontalFixed(component, target);
  }
}
function setSizeWithParentAutoLayoutGrid(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    setSizeWithParentAutoLayoutGridScrollWithParent(target);
  }
}
function setSizeWithParentAutoLayoutGridScrollWithParent(target) {
  target.style.width = "";
  target.style.flexGrow = "1";
  target.style.flexBasis = "0%";
  target.style.height = "";
  target.style.alignSelf = "";
}
function setSizeWithParentAutoLayoutHorizontalScrollWithParent(component, target) {
  if (component.width === "FILL") {
    target.style.width = "";
    target.style.flexGrow = "1";
    target.style.flexBasis = "0%";
  } else if (component.width === "HUG") {
    target.style.width = "";
    target.style.flexGrow = "0";
  } else {
    target.style.width = component.width + "px";
    target.style.flexGrow = "0";
  }
  if (component.height === "FILL") {
    target.style.height = "";
    target.style.alignSelf = "stretch";
  } else if (component.height === "HUG") {
    target.style.height = "";
    target.style.alignSelf = "";
  } else {
    target.style.height = component.height + "px";
    target.style.alignSelf = "";
  }
}
function setSizeWithParentAutoLayoutHorizontalSticky(component, target) {
  if (component.width === "FILL") {
    target.style.width = "";
    target.style.flexGrow = "1";
    target.style.flexBasis = "0%";
  } else if (component.width === "HUG") {
    target.style.width = "";
    target.style.flexGrow = "0";
  } else {
    target.style.width = component.width + "px";
    target.style.flexGrow = "0";
  }
  if (component.height === "FILL") {
    target.style.height = "";
    target.style.alignSelf = "stretch";
  } else if (component.height === "HUG") {
    target.style.height = "";
    target.style.alignSelf = "";
  } else {
    target.style.height = component.height + "px";
    target.style.alignSelf = "";
  }
}
function setSizeWithParentAutoLayoutHorizontalFixed(component, target) {
  if (component.width !== "FILL" && component.width !== "HUG" && !isNaN(component.width)) {
    target.style.width = component.width + "px";
  } else {
    target.style.width = "";
  }
  if (component.height !== "FILL" && component.height !== "HUG" && !isNaN(component.height)) {
    target.style.height = component.height + "px";
  } else {
    target.style.height = "";
  }
}
function setSizeWithParentAutoLayoutVertical(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    setSizeWithParentAutoLayoutVerticalScrollWithParent(component, target);
  } else if (component.position === "STICKY") {
    setSizeWithParentAutoLayoutVerticalSticky(component, target);
  } else {
    setSizeWithParentAutoLayoutVerticalFixed(component, target);
  }
}
function setSizeWithParentAutoLayoutVerticalScrollWithParent(component, target) {
  if (component.width === "FILL") {
    target.style.width = "";
    target.style.alignSelf = "stretch";
  } else if (component.width === "HUG") {
    target.style.width = "";
    target.style.alignSelf = "";
  } else {
    target.style.width = component.width + "px";
    target.style.alignSelf = "";
  }
  if (component.height === "FILL") {
    target.style.height = "";
    target.style.flexGrow = "1";
  } else if (component.height === "HUG") {
    target.style.height = "";
    target.style.flexGrow = "0";
  } else {
    target.style.height = component.height + "px";
    target.style.flexGrow = "0";
  }
}
function setSizeWithParentAutoLayoutVerticalSticky(component, target) {
  if (component.width === "FILL") {
    target.style.width = "";
    target.style.alignSelf = "stretch";
  } else if (component.width === "HUG") {
    target.style.width = "";
    target.style.alignSelf = "";
  } else {
    target.style.width = component.width + "px";
    target.style.alignSelf = "";
  }
  if (component.height === "FILL") {
    target.style.height = "";
    target.style.flexGrow = "1";
  } else if (component.height === "HUG") {
    target.style.height = "";
    target.style.flexGrow = "0";
  } else {
    target.style.height = component.height + "px";
    target.style.flexGrow = "0";
  }
}
function setSizeWithParentAutoLayoutVerticalFixed(component, target) {
  if (component.width !== "FILL" && component.width !== "HUG" && !isNaN(component.width)) {
    target.style.width = component.width + "px";
  } else {
    target.style.width = "";
  }
  if (component.height !== "FILL" && component.height !== "HUG" && !isNaN(component.height)) {
    target.style.height = component.height + "px";
  } else {
    target.style.height = "";
  }
}
function setSizeWithParentAutoLayoutNone(component, target) {
  if (component.width !== "FILL" && component.width !== "HUG") {
    if (!isNaN(component.left) && !isNaN(component.right)) {
      target.style.width = "";
    } else {
      target.style.width = component.width + "px";
    }
  } else {
    target.style.width = "";
  }
  if (component.height !== "FILL" && component.height !== "HUG") {
    if (!isNaN(component.top) && !isNaN(component.bottom)) {
      target.style.height = "";
    } else {
      target.style.height = component.height + "px";
    }
  } else {
    target.style.height = "";
  }
}
function setContraintsWithParentAutoLayoutHorizontal(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    resetContraints(target);
  } else {
    applyContraints(component, target);
  }
}
function setContraintsWithParentAutoLayoutVertical(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    resetContraints(target);
  } else {
    applyContraints(component, target);
  }
}
function setContraintsWithParentAutoLayoutGrid(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    resetContraints(target);
  } else {
    applyContraints(component, target);
  }
}
function setPositionWithParentAutoLayoutHorizontal(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    target.style.position = "relative";
  } else if (component.position === "STICKY") {
    target.style.position = "sticky";
  } else {
    target.style.position = "fixed";
  }
}
function setPositionWithParentAutoLayoutVertical(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    target.style.position = "relative";
  } else if (component.position === "STICKY") {
    target.style.position = "sticky";
  } else {
    target.style.position = "fixed";
  }
}
function setPositionWithParentAutoLayoutGrid(component, target) {
  if (component.position === "SCROLL_WITH_PARENT") {
    target.style.position = "relative";
  } else if (component.position === "STICKY") {
    target.style.position = "sticky";
  } else {
    target.style.position = "fixed";
  }
}
function resetContraints(target) {
  target.style.left = "";
  target.style.top = "";
  target.style.right = "";
  target.style.bottom = "";
}
function applyContraints(component, target) {
  if (isNaN(component.left)) {
    target.style.left = "";
  } else {
    target.style.left = component.left + "px";
  }
  if (isNaN(component.top)) {
    target.style.top = "";
  } else {
    target.style.top = component.top + "px";
  }
  if (isNaN(component.right)) {
    target.style.right = "";
  } else {
    target.style.right = component.right + "px";
  }
  if (isNaN(component.bottom)) {
    target.style.bottom = "";
  } else {
    target.style.bottom = component.bottom + "px";
  }
}
function alignChildrenHorizontalPacked(container, target) {
  if (container.align === "TOP_LEFT") {
    target.style.alignItems = "flex-start";
    target.style.justifyContent = "";
  } else if (container.align === "TOP_CENTER") {
    target.style.alignItems = "flex-start";
    target.style.justifyContent = "center";
  } else if (container.align === "TOP_RIGHT") {
    target.style.alignItems = "flex-start";
    target.style.justifyContent = "flex-end";
  } else if (container.align === "LEFT") {
    target.style.alignItems = "center";
    target.style.justifyContent = "";
  } else if (container.align === "CENTER") {
    target.style.alignItems = "center";
    target.style.justifyContent = "center";
  } else if (container.align === "RIGHT") {
    target.style.alignItems = "center";
    target.style.justifyContent = "flex-end";
  } else if (container.align === "BOTTOM_LEFT") {
    target.style.alignItems = "flex-end";
    target.style.justifyContent = "";
  } else if (container.align === "BOTTOM_CENTER") {
    target.style.alignItems = "flex-end";
    target.style.justifyContent = "center";
  } else {
    target.style.alignItems = "flex-end";
    target.style.justifyContent = "flex-end";
  }
}
function alignChildrenVerticalPacked(container, target) {
  if (container.align === "TOP_LEFT") {
    target.style.alignItems = "flex-start";
    target.style.justifyContent = "";
  } else if (container.align === "TOP_CENTER") {
    target.style.alignItems = "center";
    target.style.justifyContent = "";
  } else if (container.align === "TOP_RIGHT") {
    target.style.alignItems = "flex-end";
    target.style.justifyContent = "";
  } else if (container.align === "LEFT") {
    target.style.alignItems = "flex-start";
    target.style.justifyContent = "center";
  } else if (container.align === "CENTER") {
    target.style.alignItems = "center";
    target.style.justifyContent = "center";
  } else if (container.align === "RIGHT") {
    target.style.alignItems = "flex-end";
    target.style.justifyContent = "center";
  } else if (container.align === "BOTTOM_LEFT") {
    target.style.alignItems = "flex-start";
    target.style.justifyContent = "flex-end";
  } else if (container.align === "BOTTOM_CENTER") {
    target.style.alignItems = "center";
    target.style.justifyContent = "flex-end";
  } else {
    target.style.alignItems = "flex-end";
    target.style.justifyContent = "flex-end";
  }
}
function alignChildrenHorizontalSpaceBetween(container, target) {
  if (container.align === "TOP_LEFT" || container.align === "TOP_CENTER" || container.align === "TOP_RIGHT") {
    target.style.alignItems = "flex-start";
  } else if (container.align === "LEFT" || container.align === "CENTER" || container.align === "RIGHT") {
    target.style.alignItems = "center";
  } else {
    target.style.alignItems = "flex-end";
  }
  target.style.justifyContent = "space-between";
}
function alignChildrenVerticalSpaceBetween(container, target) {
  if (container.align === "TOP_LEFT" || container.align === "LEFT" || container.align === "BOTTOM_LEFT") {
    target.style.alignItems = "flex-start";
  } else if (container.align === "TOP_CENTER" || container.align === "CENTER" || container.align === "BOTTOM_CENTER") {
    target.style.alignItems = "center";
  } else {
    target.style.alignItems = "flex-end";
  }
  target.style.justifyContent = "space-between";
}

var __defProp$6 = Object.defineProperty;
var __defNormalProp$6 = (obj, key, value) => key in obj ? __defProp$6(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$6 = (obj, key, value) => {
  __defNormalProp$6(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class Component extends Base {
  constructor() {
    super();
    __publicField$6(this, "_cursor", "default");
    __publicField$6(this, "_opacity", 1);
    __publicField$6(this, "_cornerRadius", 0);
    __publicField$6(this, "_fill", "");
    __publicField$6(this, "_clipContent", false);
    this.style.boxSizing = "border-box";
    this.style.position = "relative";
    this.style.display = "inline-block";
    this.style.flex = "none";
    this.style.flexGrow = "0";
    this.style.border = "none";
    this.style.outline = "none";
    this.style.minWidth = "0";
    this.style.minHeight = "0";
  }
  sizeChanged() {
    super.sizeChanged();
    if (this.parent.autoLayout === "HORIZONTAL") {
      setSizeWithParentAutoLayoutHorizontal(this, this);
    } else if (this.parent.autoLayout === "VERTICAL") {
      setSizeWithParentAutoLayoutVertical(this, this);
    } else {
      setSizeWithParentAutoLayoutNone(this, this);
    }
  }
  positionChanged() {
    super.positionChanged();
    if (this.position === "SCROLL_WITH_PARENT") {
      if (this.parent.autoLayout === "NONE") {
        this.style.position = "absolute";
      } else {
        this.style.position = "relative";
      }
    } else if (this.position === "FIXED") {
      this.style.position = "fixed";
    } else {
      this.style.position = "sticky";
    }
  }
  contraintsChanged() {
    super.contraintsChanged();
    if (this.parent.autoLayout === "NONE" || this.position === "FIXED" || this.position === "STICKY") {
      applyContraints(this, this);
    } else {
      resetContraints(this);
    }
  }
  get cursor() {
    return this._cursor;
  }
  set cursor(value) {
    this._cursor = value;
    this.style.cursor = value;
  }
  get opacity() {
    return this._opacity;
  }
  set opacity(value) {
    if (Number.isNaN(value)) {
      this._opacity = 1;
      this.style.opacity = "";
      return;
    }
    if (value < 0) {
      this._opacity = 0;
      this.style.opacity = "0";
      return;
    }
    if (value > 1) {
      this._opacity = 1;
      this.style.opacity = "";
      return;
    }
    this._opacity = value;
    this.style.opacity = value.toString();
  }
  get cornerRadius() {
    return this._cornerRadius;
  }
  set cornerRadius(value) {
    if (Number.isNaN(value) || value < 0) {
      this._cornerRadius = 0;
      this.style.borderRadius = "";
      return;
    }
    this._cornerRadius = value;
    this.style.borderRadius = value + "px";
  }
  get fill() {
    return this._fill;
  }
  set fill(value) {
    this._fill = value;
    this.style.background = value;
  }
  get clipContent() {
    return this._clipContent;
  }
  set clipContent(value) {
    this._clipContent = value;
    if (value) {
      this.style.overflow = "auto";
    } else {
      this.style.overflow = "";
    }
  }
}

var __defProp$5 = Object.defineProperty;
var __defNormalProp$5 = (obj, key, value) => key in obj ? __defProp$5(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$5 = (obj, key, value) => {
  __defNormalProp$5(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class Link extends Base {
  constructor() {
    super();
    __publicField$5(this, "_anchor");
    __publicField$5(this, "_target", "_self");
    __publicField$5(this, "_autoLayout", "HORIZONTAL");
    __publicField$5(this, "_autoLayoutChanged", true);
    __publicField$5(this, "_visible", true);
    __publicField$5(this, "_visibleChanged", false);
    __publicField$5(this, "_cursor", "default");
    __publicField$5(this, "_opacity", 1);
    __publicField$5(this, "_cornerRadius", 0);
    __publicField$5(this, "_fill", "");
    __publicField$5(this, "_clipContent", false);
    __publicField$5(this, "_minGridColumnWidth", NaN);
    __publicField$5(this, "_padding", 0);
    __publicField$5(this, "_paddingLeft", 0);
    __publicField$5(this, "_paddingTop", 0);
    __publicField$5(this, "_paddingRight", 0);
    __publicField$5(this, "_paddingBottom", 0);
    __publicField$5(this, "_itemSpacing", 0);
    __publicField$5(this, "_spacingMode", "PACKED");
    __publicField$5(this, "_spacingModeChanged", true);
    __publicField$5(this, "_align", "TOP_LEFT");
    __publicField$5(this, "_alignChanged", true);
    this.style.display = "contents";
    this.appendChild(this.anchor);
  }
  addComponent(component) {
    this.anchor.appendChild(component);
  }
  addComponents(components) {
    const frag = document.createDocumentFragment();
    components.forEach((component) => frag.appendChild(component));
    this.anchor.appendChild(frag);
  }
  removeComponent(component) {
    if (this.containsComponent(component)) {
      this.anchor.removeChild(component);
    }
  }
  containsComponent(component) {
    return this.anchor.contains(component);
  }
  removeAllComponents() {
    while (this.anchor.firstChild) {
      this.removeChild(this.anchor.firstChild);
    }
  }
  commitProperties() {
    super.commitProperties();
    if (this._autoLayoutChanged || this._visibleChanged) {
      this.autoLayoutChanged();
    }
    if (this._alignChanged || this._spacingModeChanged) {
      this.alignOrSpacingModeChanged();
    }
  }
  autoLayoutChanged() {
    this._autoLayoutChanged = false;
    this._visibleChanged = false;
    if (this.visible) {
      this.applyAutoLayout();
    } else {
      this.applyVisibleFalse();
    }
  }
  alignOrSpacingModeChanged() {
    this._alignChanged = false;
    this._spacingModeChanged = false;
    if (this.autoLayout === "HORIZONTAL") {
      this.alignHorizontal();
    } else if (this.autoLayout === "VERTICAL") {
      this.alignVertical();
    } else {
      this.alignNone();
    }
  }
  applyAutoLayout() {
    if (this.autoLayout === "HORIZONTAL") {
      this.updateAutoLayoutHorizontal();
    } else if (this.autoLayout === "VERTICAL") {
      this.updateAutoLayoutVertical();
    } else if (this.autoLayout === "GRID") {
      this.updateAutoLayoutGrid();
    } else {
      this.updateAutoLayoutNone();
    }
  }
  updateAutoLayoutHorizontal() {
    setDisplayAutolayoutHorizontalOrVertical(this.anchor, this.parent);
    applyPadding(this, this.anchor);
    this.anchor.style.flexDirection = "row";
    this.updateChildrenHorizontal();
    this.alignHorizontal();
  }
  updateAutoLayoutVertical() {
    setDisplayAutolayoutHorizontalOrVertical(this.anchor, this.parent);
    applyPadding(this, this.anchor);
    this.anchor.style.flexDirection = "column";
    this.updateChildrenVertical();
    this.alignVertical();
  }
  updateAutoLayoutGrid() {
    setDisplayAutoLayoutGrid(this.anchor, this.parent);
    applyPadding(this, this.anchor);
    this.anchor.style.flexDirection = "";
    this.updateChildrenGrid();
    this.alignGrid();
  }
  updateAutoLayoutNone() {
    setDisplayAutolayoutNone(this.anchor, this.parent);
    resetPadding(this.anchor);
    this.updateChildrenNone();
    this.alignNone();
  }
  alignHorizontal() {
    if (this.spacingMode === "PACKED") {
      alignChildrenHorizontalPacked(this, this.anchor);
    } else {
      alignChildrenHorizontalSpaceBetween(this, this.anchor);
    }
  }
  alignVertical() {
    if (this.spacingMode === "PACKED") {
      alignChildrenVerticalPacked(this, this.anchor);
    } else {
      alignChildrenVerticalSpaceBetween(this, this.anchor);
    }
  }
  alignGrid() {
    this.anchor.style.alignItems = "start";
    this.anchor.style.alignContent = "start";
  }
  alignNone() {
    this.anchor.style.alignItems = "";
    this.anchor.style.justifyContent = "";
  }
  updateChildrenHorizontal() {
    let child;
    this.anchor.childNodes.forEach((node) => {
      child = node;
      if (child instanceof Link) {
        setSizeWithParentAutoLayoutHorizontal(child, child.anchor);
        setContraintsWithParentAutoLayoutHorizontal(child, child.anchor);
        setPositionWithParentAutoLayoutHorizontal(child, child.anchor);
      } else {
        setSizeWithParentAutoLayoutHorizontal(child, child);
        setContraintsWithParentAutoLayoutHorizontal(child, child);
        setPositionWithParentAutoLayoutHorizontal(child, child);
      }
    });
  }
  updateChildrenVertical() {
    let child;
    this.anchor.childNodes.forEach((node) => {
      child = node;
      if (child instanceof Link) {
        setSizeWithParentAutoLayoutVertical(child, child.anchor);
        setContraintsWithParentAutoLayoutVertical(child, child.anchor);
        setPositionWithParentAutoLayoutVertical(child, child.anchor);
      } else {
        setSizeWithParentAutoLayoutVertical(child, child);
        setContraintsWithParentAutoLayoutVertical(child, child);
        setPositionWithParentAutoLayoutVertical(child, child);
      }
    });
  }
  updateChildrenGrid() {
    let child;
    this.anchor.childNodes.forEach((node) => {
      child = node;
      if (child instanceof Link) {
        setSizeWithParentAutoLayoutGrid(child, child.anchor);
        setContraintsWithParentAutoLayoutGrid(child, child.anchor);
        setPositionWithParentAutoLayoutGrid(child, child.anchor);
      } else {
        setSizeWithParentAutoLayoutGrid(child, child);
        setContraintsWithParentAutoLayoutGrid(child, child);
        setPositionWithParentAutoLayoutGrid(child, child);
      }
    });
  }
  updateChildrenNone() {
    let child;
    this.anchor.childNodes.forEach((node) => {
      child = node;
      if (child instanceof Link) {
        if (child.position === "SCROLL_WITH_PARENT") {
          child.anchor.style.position = "absolute";
        }
        setSizeWithParentAutoLayoutNone(child, child.anchor);
        applyContraints(child, child.anchor);
      } else {
        if (child.position === "SCROLL_WITH_PARENT") {
          child.style.position = "absolute";
        }
        setSizeWithParentAutoLayoutNone(child, child);
        applyContraints(child, child);
      }
    });
  }
  applyVisibleFalse() {
    this.anchor.style.display = "none";
  }
  sizeChanged() {
    super.sizeChanged();
    if (this.parent.autoLayout === "HORIZONTAL") {
      setSizeWithParentAutoLayoutHorizontal(this, this.anchor);
    } else if (this.parent.autoLayout === "VERTICAL") {
      setSizeWithParentAutoLayoutVertical(this, this.anchor);
    } else {
      setSizeWithParentAutoLayoutNone(this, this.anchor);
    }
  }
  positionChanged() {
    super.positionChanged();
    if (this.position === "SCROLL_WITH_PARENT") {
      if (this.parent.autoLayout === "NONE") {
        this.anchor.style.position = "absolute";
      } else {
        this.anchor.style.position = "relative";
      }
    } else if (this.position === "FIXED") {
      this.anchor.style.position = "fixed";
    } else {
      this.anchor.style.position = "sticky";
    }
  }
  contraintsChanged() {
    super.contraintsChanged();
    if (this.parent.autoLayout === "NONE" || this.position === "FIXED" || this.position === "STICKY") {
      applyContraints(this, this.anchor);
    } else {
      resetContraints(this.anchor);
    }
  }
  get anchor() {
    if (!this._anchor) {
      this._anchor = document.createElement("a");
      this._anchor.style.display = "inline-block";
      this._anchor.style.boxSizing = "border-box";
      this._anchor.style.position = "relative";
      this._anchor.style.display = "inline-block";
      this._anchor.style.flex = "none";
      this._anchor.style.flexGrow = "0";
      this._anchor.style.border = "none";
      this._anchor.style.outline = "none";
      this._anchor.style.minWidth = "0px";
      this._anchor.style.minHeight = "0px";
      this._anchor.style.textDecoration = "none";
    }
    return this._anchor;
  }
  get href() {
    return this.anchor.href;
  }
  set href(value) {
    this.anchor.href = value;
  }
  get target() {
    return this._target;
  }
  set target(value) {
    this._target = value;
    this.anchor.target = value;
  }
  get autoLayout() {
    return this._autoLayout;
  }
  set autoLayout(value) {
    if (this._autoLayout === value) {
      return;
    }
    this._autoLayout = value;
    this._autoLayoutChanged = true;
    this.invalidateProperties();
  }
  get visible() {
    return this._visible;
  }
  set visible(value) {
    if (this._visible === value) {
      return;
    }
    this._visible = value;
    this._visibleChanged = true;
    this.invalidateProperties();
  }
  get cursor() {
    return this._cursor;
  }
  set cursor(value) {
    this._cursor = value;
    this.anchor.style.cursor = value;
  }
  get opacity() {
    return this._opacity;
  }
  set opacity(value) {
    if (Number.isNaN(value)) {
      this._opacity = 1;
      this.anchor.style.opacity = "";
      return;
    }
    if (value < 0) {
      this._opacity = 0;
      this.anchor.style.opacity = "0";
      return;
    }
    if (value > 1) {
      this._opacity = 1;
      this.anchor.style.opacity = "";
      return;
    }
    this._opacity = value;
    this.anchor.style.opacity = value.toString();
  }
  get cornerRadius() {
    return this._cornerRadius;
  }
  set cornerRadius(value) {
    if (Number.isNaN(value) || value < 0) {
      this._cornerRadius = 0;
      this.anchor.style.borderRadius = "";
      return;
    }
    this._cornerRadius = value;
    this.anchor.style.borderRadius = value + "px";
  }
  get parent() {
    if (this.parentNode instanceof HTMLAnchorElement) {
      return this.parentNode.parentNode;
    }
    return this.parentNode;
  }
  get fill() {
    return this._fill;
  }
  set fill(value) {
    this._fill = value;
    this.anchor.style.background = value;
  }
  get clipContent() {
    return this._clipContent;
  }
  set clipContent(value) {
    this._clipContent = value;
    if (value) {
      this.anchor.style.overflow = "auto";
    } else {
      this.anchor.style.overflow = "";
    }
  }
  get minGridColumnWidth() {
    return this._minGridColumnWidth;
  }
  set minGridColumnWidth(value) {
    if (this._minGridColumnWidth === value) {
      return;
    }
    if (Number.isNaN(this._minGridColumnWidth) && Number.isNaN(value)) {
      return;
    }
    if (isNaN(value) || value < 0) {
      this._minGridColumnWidth = NaN;
      this.anchor.style["gridTemplateColumns"] = "";
      return;
    }
    this._minGridColumnWidth = value;
    this.anchor.style["gridTemplateColumns"] = "repeat(auto-fill, minmax(" + value + "px, 1fr))";
  }
  get padding() {
    return this._padding;
  }
  set padding(value) {
    if (isNaN(value) || value < 0) {
      this._padding = 0;
      this.paddingLeft = 0;
      this.paddingTop = 0;
      this.paddingRight = 0;
      this.paddingBottom = 0;
      return;
    }
    this._padding = value;
    this.paddingLeft = value;
    this.paddingTop = value;
    this.paddingRight = value;
    this.paddingBottom = value;
  }
  get paddingLeft() {
    return this._paddingLeft;
  }
  set paddingLeft(value) {
    if (this._paddingLeft === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      this._paddingLeft = 0;
      this.anchor.style.paddingLeft = "";
      return;
    }
    this._paddingLeft = value;
    this.anchor.style.paddingLeft = value + "px";
  }
  get paddingTop() {
    return this._paddingTop;
  }
  set paddingTop(value) {
    if (this._paddingTop === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      this._paddingTop = 0;
      this.anchor.style.paddingTop = "";
      return;
    }
    this._paddingTop = value;
    this.anchor.style.paddingTop = value + "px";
  }
  get paddingRight() {
    return this._paddingRight;
  }
  set paddingRight(value) {
    if (this._paddingRight === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      this._paddingRight = 0;
      this.anchor.style.paddingRight = "";
      return;
    }
    this._paddingRight = value;
    this.anchor.style.paddingRight = value + "px";
  }
  get paddingBottom() {
    return this._paddingBottom;
  }
  set paddingBottom(value) {
    if (this._paddingBottom === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      this._paddingBottom = 0;
      this.anchor.style.paddingBottom = "";
      return;
    }
    this._paddingBottom = value;
    this.anchor.style.paddingBottom = value + "px";
  }
  get itemSpacing() {
    return this._itemSpacing;
  }
  set itemSpacing(value) {
    if (this._itemSpacing === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      if (this._itemSpacing !== 0) {
        this._itemSpacing = 0;
        this.anchor.style["gap"] = "";
      }
      return;
    }
    this._itemSpacing = value;
    this.anchor.style["gap"] = value + "px";
  }
  get spacingMode() {
    return this._spacingMode;
  }
  set spacingMode(value) {
    if (this._spacingMode === value) {
      return;
    }
    this._spacingMode = value;
    this._spacingModeChanged = true;
    this.invalidateProperties();
  }
  get align() {
    return this._align;
  }
  set align(value) {
    if (this._align === value) {
      return;
    }
    this._align = value;
    this._alignChanged = true;
    this.invalidateProperties();
  }
}

var __defProp$4 = Object.defineProperty;
var __defNormalProp$4 = (obj, key, value) => key in obj ? __defProp$4(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$4 = (obj, key, value) => {
  __defNormalProp$4(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class Container extends Component {
  constructor() {
    super();
    __publicField$4(this, "_spacingMode", "PACKED");
    __publicField$4(this, "_spacingModeChanged", true);
    __publicField$4(this, "_align", "TOP_LEFT");
    __publicField$4(this, "_alignChanged", true);
    __publicField$4(this, "_itemSpacing", 0);
    __publicField$4(this, "_autoLayout", "HORIZONTAL");
    __publicField$4(this, "_autoLayoutChanged", true);
    __publicField$4(this, "_padding", 0);
    __publicField$4(this, "_paddingLeft", 0);
    __publicField$4(this, "_paddingTop", 0);
    __publicField$4(this, "_paddingRight", 0);
    __publicField$4(this, "_paddingBottom", 0);
    __publicField$4(this, "_minGridColumnWidth", NaN);
    __publicField$4(this, "_visible", true);
    __publicField$4(this, "_visibleChanged", false);
  }
  commitProperties() {
    super.commitProperties();
    if (this._autoLayoutChanged || this._visibleChanged) {
      this.autoLayoutChanged();
    }
    if (this._alignChanged || this._spacingModeChanged) {
      this.alignOrSpacingModeChanged();
    }
  }
  alignOrSpacingModeChanged() {
    this._alignChanged = false;
    this._spacingModeChanged = false;
    if (this.autoLayout === "HORIZONTAL") {
      this.alignHorizontal();
    } else if (this.autoLayout === "VERTICAL") {
      this.alignVertical();
    } else {
      this.alignNone();
    }
  }
  autoLayoutChanged() {
    this._autoLayoutChanged = false;
    this._visibleChanged = false;
    if (this.visible) {
      this.applyAutoLayout();
    } else {
      this.applyVisibleFalse();
    }
  }
  applyAutoLayout() {
    if (this.autoLayout === "HORIZONTAL") {
      this.updateAutoLayoutHorizontal();
    } else if (this.autoLayout === "VERTICAL") {
      this.updateAutoLayoutVertical();
    } else if (this.autoLayout === "GRID") {
      this.updateAutoLayoutGrid();
    } else {
      this.updateAutoLayoutNone();
    }
  }
  applyVisibleFalse() {
    this.style.display = "none";
  }
  updateAutoLayoutHorizontal() {
    setDisplayAutolayoutHorizontalOrVertical(this, this.parent);
    applyPadding(this, this);
    this.style.flexDirection = "row";
    this.updateChildrenHorizontal();
    this.alignHorizontal();
  }
  updateAutoLayoutVertical() {
    setDisplayAutolayoutHorizontalOrVertical(this, this.parent);
    applyPadding(this, this);
    this.style.flexDirection = "column";
    this.updateChildrenVertical();
    this.alignVertical();
  }
  updateAutoLayoutGrid() {
    setDisplayAutoLayoutGrid(this, this.parent);
    applyPadding(this, this);
    this.style.flexDirection = "";
    this.updateChildrenGrid();
    this.alignGrid();
  }
  updateAutoLayoutNone() {
    setDisplayAutolayoutNone(this, this.parent);
    resetPadding(this);
    this.updateChildrenNone();
    this.alignNone();
  }
  updateChildrenHorizontal() {
    let child;
    this.childNodes.forEach((node) => {
      child = node;
      if (child instanceof Link) {
        setSizeWithParentAutoLayoutHorizontal(child, child.anchor);
        setContraintsWithParentAutoLayoutHorizontal(child, child.anchor);
        setPositionWithParentAutoLayoutHorizontal(child, child.anchor);
      } else {
        setSizeWithParentAutoLayoutHorizontal(child, child);
        setContraintsWithParentAutoLayoutHorizontal(child, child);
        setPositionWithParentAutoLayoutHorizontal(child, child);
      }
    });
  }
  updateChildrenVertical() {
    let child;
    this.childNodes.forEach((node) => {
      child = node;
      if (child instanceof Link) {
        setSizeWithParentAutoLayoutVertical(child, child.anchor);
        setContraintsWithParentAutoLayoutVertical(child, child.anchor);
        setPositionWithParentAutoLayoutVertical(child, child.anchor);
      } else {
        setSizeWithParentAutoLayoutVertical(child, child);
        setContraintsWithParentAutoLayoutVertical(child, child);
        setPositionWithParentAutoLayoutVertical(child, child);
      }
    });
  }
  updateChildrenGrid() {
    let child;
    this.childNodes.forEach((node) => {
      child = node;
      if (child instanceof Link) {
        setSizeWithParentAutoLayoutGrid(child, child.anchor);
        setContraintsWithParentAutoLayoutGrid(child, child.anchor);
        setPositionWithParentAutoLayoutGrid(child, child.anchor);
      } else {
        setSizeWithParentAutoLayoutGrid(child, child);
        setContraintsWithParentAutoLayoutGrid(child, child);
        setPositionWithParentAutoLayoutGrid(child, child);
      }
    });
  }
  updateChildrenNone() {
    let child;
    this.childNodes.forEach((node) => {
      child = node;
      if (child instanceof Link) {
        if (child.position === "SCROLL_WITH_PARENT") {
          child.anchor.style.position = "absolute";
        }
        setSizeWithParentAutoLayoutNone(child, child.anchor);
        applyContraints(child, child.anchor);
      } else {
        if (child.position === "SCROLL_WITH_PARENT") {
          child.style.position = "absolute";
        }
        setSizeWithParentAutoLayoutNone(child, child);
        applyContraints(child, child);
      }
    });
  }
  alignHorizontal() {
    if (this.spacingMode === "PACKED") {
      alignChildrenHorizontalPacked(this, this);
    } else {
      alignChildrenHorizontalSpaceBetween(this, this);
    }
  }
  alignVertical() {
    if (this.spacingMode === "PACKED") {
      alignChildrenVerticalPacked(this, this);
    } else {
      alignChildrenVerticalSpaceBetween(this, this);
    }
  }
  alignGrid() {
    this.style.alignItems = "start";
    this.style.alignContent = "start";
  }
  alignNone() {
    this.style.alignItems = "";
    this.style.justifyContent = "";
  }
  addComponent(component) {
    this.appendChild(component);
  }
  addComponents(components) {
    const frag = document.createDocumentFragment();
    components.forEach((component) => frag.appendChild(component));
    this.appendChild(frag);
  }
  removeComponent(component) {
    if (this.containsComponent(component)) {
      this.removeChild(component);
    }
  }
  containsComponent(component) {
    return this.contains(component);
  }
  removeAllComponents() {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  }
  get spacingMode() {
    return this._spacingMode;
  }
  set spacingMode(value) {
    if (this._spacingMode === value) {
      return;
    }
    this._spacingMode = value;
    this._spacingModeChanged = true;
    this.invalidateProperties();
  }
  get align() {
    return this._align;
  }
  set align(value) {
    if (this._align === value) {
      return;
    }
    this._align = value;
    this._alignChanged = true;
    this.invalidateProperties();
  }
  get itemSpacing() {
    return this._itemSpacing;
  }
  set itemSpacing(value) {
    if (this._itemSpacing === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      if (this._itemSpacing !== 0) {
        this._itemSpacing = 0;
        this.style["gap"] = "";
      }
      return;
    }
    this._itemSpacing = value;
    this.style["gap"] = value + "px";
  }
  get autoLayout() {
    return this._autoLayout;
  }
  set autoLayout(value) {
    if (this._autoLayout === value) {
      return;
    }
    this._autoLayout = value;
    this._autoLayoutChanged = true;
    this.invalidateProperties();
  }
  get padding() {
    return this._padding;
  }
  set padding(value) {
    if (isNaN(value) || value < 0) {
      this._padding = 0;
      this.paddingLeft = 0;
      this.paddingTop = 0;
      this.paddingRight = 0;
      this.paddingBottom = 0;
      return;
    }
    this._padding = value;
    this.paddingLeft = value;
    this.paddingTop = value;
    this.paddingRight = value;
    this.paddingBottom = value;
  }
  get paddingLeft() {
    return this._paddingLeft;
  }
  set paddingLeft(value) {
    if (this._paddingLeft === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      this._paddingLeft = 0;
      this.style.paddingLeft = "";
      return;
    }
    this._paddingLeft = value;
    this.style.paddingLeft = value + "px";
  }
  get paddingTop() {
    return this._paddingTop;
  }
  set paddingTop(value) {
    if (this._paddingTop === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      this._paddingTop = 0;
      this.style.paddingTop = "";
      return;
    }
    this._paddingTop = value;
    this.style.paddingTop = value + "px";
  }
  get paddingRight() {
    return this._paddingRight;
  }
  set paddingRight(value) {
    if (this._paddingRight === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      this._paddingRight = 0;
      this.style.paddingRight = "";
      return;
    }
    this._paddingRight = value;
    this.style.paddingRight = value + "px";
  }
  get paddingBottom() {
    return this._paddingBottom;
  }
  set paddingBottom(value) {
    if (this._paddingBottom === value) {
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      this._paddingBottom = 0;
      this.style.paddingBottom = "";
      return;
    }
    this._paddingBottom = value;
    this.style.paddingBottom = value + "px";
  }
  get minGridColumnWidth() {
    return this._minGridColumnWidth;
  }
  set minGridColumnWidth(value) {
    if (this._minGridColumnWidth === value) {
      return;
    }
    if (Number.isNaN(this._minGridColumnWidth) && Number.isNaN(value)) {
      return;
    }
    if (isNaN(value) || value < 0) {
      this._minGridColumnWidth = NaN;
      this.style.gridTemplateColumns = "";
      return;
    }
    this._minGridColumnWidth = value;
    this.style["gridTemplateColumns"] = "repeat(auto-fill, minmax(" + value + "px, 1fr))";
  }
  get visible() {
    return this._visible;
  }
  set visible(value) {
    if (this._visible === value) {
      return;
    }
    this._visible = value;
    this._visibleChanged = true;
    this.invalidateProperties();
  }
}
customElements.define("container-element", Container);

class Application extends Container {
  constructor() {
    super();
    this.style.display = "block";
    this.style.minHeight = "100%";
  }
  get fill() {
    return this._fill;
  }
  set fill(value) {
    this._fill = value;
    document.body.style.background = value;
  }
}

var __defProp$3 = Object.defineProperty;
var __defNormalProp$3 = (obj, key, value) => key in obj ? __defProp$3(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$3 = (obj, key, value) => {
  __defNormalProp$3(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class Label extends Component {
  constructor() {
    super();
    __publicField$3(this, "_truncate", false);
    __publicField$3(this, "_content", "");
    __publicField$3(this, "_color", "");
    __publicField$3(this, "_lineHeight", 20);
    __publicField$3(this, "_fontSize", 16);
    __publicField$3(this, "_fontWeight", 400);
    __publicField$3(this, "_letterSpacing", 0);
    this.style.userSelect = "none";
    this.style.pointerEvents = "none";
    this.style.lineHeight = "20px";
    this.style.fontSize = "16px";
    this.style.fontWeight = "400";
    this.style.letterSpacing = "";
  }
  get truncate() {
    return this._truncate;
  }
  set truncate(value) {
    if (this._truncate === value) {
      return;
    }
    this._truncate = value;
    if (value) {
      this.style.overflow = "hidden";
      this.style.textOverflow = "ellipsis";
      this.style.whiteSpace = "nowrap";
    } else {
      if (this.clipContent) {
        this.style.overflow = "auto";
      } else {
        this.style.overflow = "";
      }
      this.style.textOverflow = "";
      this.style.whiteSpace = "";
    }
  }
  get content() {
    return this._content;
  }
  set content(value) {
    this._content = value;
    this.innerText = this.content;
  }
  get fontFamily() {
    return this.style.fontFamily;
  }
  set fontFamily(value) {
    this.style.fontFamily = value;
  }
  get color() {
    return this._color;
  }
  set color(value) {
    if (this._color === value) {
      return;
    }
    this._color = value;
    this.style.color = value;
  }
  get lineHeight() {
    return this._lineHeight;
  }
  set lineHeight(value) {
    if (Number.isNaN(value) || value < 0) {
      this._lineHeight = 20;
      this.style.lineHeight = "20px";
      return;
    }
    this._lineHeight = value;
    this.style.lineHeight = value + "px";
  }
  get fontSize() {
    return this._fontSize;
  }
  set fontSize(value) {
    if (Number.isNaN(value) || value < 0) {
      this._fontSize = 16;
      this.style.fontSize = "16px";
      return;
    }
    this._fontSize = value;
    this.style.fontSize = value + "px";
  }
  get fontWeight() {
    return this._fontWeight;
  }
  set fontWeight(value) {
    this._fontWeight = value;
    this.style.fontWeight = value.toString();
  }
  get letterSpacing() {
    return this._letterSpacing;
  }
  set letterSpacing(value) {
    if (Number.isNaN(value)) {
      this._letterSpacing = 0;
      this.style.letterSpacing = "";
      return;
    }
    this._letterSpacing = value;
    this.style.letterSpacing = value + "px";
  }
  get textAlign() {
    return this.style.textAlign;
  }
  set textAlign(value) {
    this.style.textAlign = value;
  }
}
customElements.define("label-element", Label);

var __defProp$2 = Object.defineProperty;
var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$2 = (obj, key, value) => {
  __defNormalProp$2(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class BaseButton extends Container {
  constructor(label, fill, clickType) {
    super();
    __publicField$2(this, "clickType");
    __publicField$2(this, "_label");
    this.label.content = label;
    this.fill = fill;
    this.clickType = clickType;
    this.cursor = "pointer";
    this.cornerRadius = 4;
    this.paddingLeft = 12;
    this.paddingRight = 12;
    this.paddingTop = 8;
    this.paddingBottom = 8;
    this.addComponent(this.label);
    this.addEventListener("click", this.clicked);
  }
  clicked() {
    this.dispatchEvent(new CustomEvent(this.clickType, { bubbles: true }));
  }
  get label() {
    if (!this._label) {
      this._label = new Label();
      this._label.fontWeight = 600;
    }
    return this._label;
  }
}
customElements.define("base-button", BaseButton);

const LARGE = "0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08)";

class BaseModal extends Container {
  constructor() {
    super();
    this.fill = "white";
    this.cornerRadius = 8;
    this.style.boxShadow = LARGE;
  }
}
customElements.define("base-modal", BaseModal);

const GREEN_700 = "#087443";
const ERROR_700 = "#B42318";
const GRAY_100 = "#F2F4F7";

var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => {
  __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class SatisfiedModal extends BaseModal {
  constructor() {
    super();
    __publicField$1(this, "_titleLabel");
    __publicField$1(this, "_actions");
    this.autoLayout = "VERTICAL";
    this.padding = 32;
    this.itemSpacing = 32;
    this.addComponents([
      this.titleLabel,
      this.actions
    ]);
  }
  get titleLabel() {
    if (!this._titleLabel) {
      this._titleLabel = new Label();
      this._titleLabel.fontSize = 32;
      this._titleLabel.lineHeight = 26;
      this._titleLabel.content = "Satisfied Modal";
    }
    return this._titleLabel;
  }
  get actions() {
    if (!this._actions) {
      this._actions = new Container();
      this._actions.width = "FILL";
      this._actions.autoLayout = "HORIZONTAL";
      this._actions.itemSpacing = 16;
      this.actions.align = "RIGHT";
      this._actions.addComponents([
        new BaseButton("Yes", GREEN_700, "SATISFIED_YES"),
        new BaseButton("No", ERROR_700, "SATISFIED_NO")
      ]);
    }
    return this._actions;
  }
}
customElements.define("satisfied-modal", SatisfiedModal);

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
class ModelBasedTesting extends Application {
  constructor() {
    super();
    __publicField(this, "satisfiedModal", new SatisfiedModal());
    this.fill = GRAY_100;
    this.align = "CENTER";
    Context.modal.add(this.modalChanged.bind(this));
    new FeedbackLogic();
  }
  modalChanged(value) {
    console.log("modalChanged", value);
    this.removeAllComponents();
    if (value === "Satisfied") {
      this.addComponent(this.satisfiedModal);
    }
  }
}
customElements.define("model-based-testing", ModelBasedTesting);

export { ModelBasedTesting as default };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2LmpzIiwic291cmNlcyI6WyIuLi9zcmMvb2JzZXJ2YWJsZXMvT2JzZXJ2YWJsZS50cyIsIi4uL3NyYy9Db250ZXh0LnRzIiwiLi4vbm9kZV9tb2R1bGVzL3hzdGF0ZS9kZXYvZGlzdC94c3RhdGUtZGV2LmVzbS5qcyIsIi4uL25vZGVfbW9kdWxlcy94c3RhdGUvZGlzdC9pbnRlcnByZXRlci0wMzczNzgxMC5lc20uanMiLCIuLi9ub2RlX21vZHVsZXMveHN0YXRlL2Rpc3QvcmFpc2UtMmQ5MmVhZTguZXNtLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3hzdGF0ZS9kaXN0L3NlbmQtMGVkZWUyYjQuZXNtLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3hzdGF0ZS9kaXN0L3hzdGF0ZS5lc20uanMiLCIuLi9zcmMvZnNtL0ZlZWRiYWNrTWFjaGluZS50cyIsIi4uL3NyYy9mc20vRmVlZGJhY2tBY3Rvci50cyIsIi4uL3NyYy9GZWVkYmFja0xvZ2ljLnRzIiwiLi4vc3JjL2NvbXBvbmVudHMvQmFzZS50cyIsIi4uL3NyYy9jb21wb25lbnRzL2hlbHBlcnMudHMiLCIuLi9zcmMvY29tcG9uZW50cy9Db21wb25lbnQudHMiLCIuLi9zcmMvY29tcG9uZW50cy9MaW5rLnRzIiwiLi4vc3JjL2NvbXBvbmVudHMvQ29udGFpbmVyLnRzIiwiLi4vc3JjL2NvbXBvbmVudHMvQXBwbGljYXRpb24udHMiLCIuLi9zcmMvY29tcG9uZW50cy9MYWJlbC50cyIsIi4uL3NyYy91aS9CYXNlQnV0dG9uLnRzIiwiLi4vc3JjL3VpL3RoZW1lL1NoYWRvd3MudHMiLCIuLi9zcmMvdWkvQmFzZU1vZGFsLnRzIiwiLi4vc3JjL3VpL3RoZW1lL0NvbG9ycy50cyIsIi4uL3NyYy91aS9TYXRpc2ZpZWRNb2RhbC50cyIsIi4uL3NyYy9Nb2RlbEJhc2VkVGVzdGluZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJ0eXBlIExpc3RlbmVyPFQ+ID0gKHZhbHVlOiBUKSA9PiB2b2lkO1xyXG5cclxuZXhwb3J0IGNsYXNzIE9ic2VydmFibGU8VD4ge1xyXG5cdHByaXZhdGUgX3ZhbHVlOiBUO1xyXG5cclxuXHRwcml2YXRlIHJlYWRvbmx5IGxpc3RlbmVyczogQXJyYXk8KHZhbHVlOiBUKSA9PiB2b2lkPjtcclxuXHJcblx0cHVibGljIGNvbnN0cnVjdG9yKHZhbHVlOiBUKSB7XHJcblx0XHR0aGlzLl92YWx1ZSA9IHZhbHVlO1xyXG5cdFx0dGhpcy5saXN0ZW5lcnMgPSBbXTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBhZGQobGlzdGVuZXI6IExpc3RlbmVyPFQ+KSB7XHJcblx0XHR0aGlzLmxpc3RlbmVycy5wdXNoKGxpc3RlbmVyKTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBnZXQgdmFsdWUoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWU7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IHZhbHVlKHZhbHVlOiBUKSB7XHJcblx0XHRpZiAodGhpcy5fdmFsdWUgIT09IHZhbHVlKSB7XHJcblx0XHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XHJcblx0XHRcdHRoaXMubGlzdGVuZXJzLmZvckVhY2gobGlzdGVuZXIgPT4ge1xyXG5cdFx0XHRcdGxpc3RlbmVyKHZhbHVlKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gb2JzZXJ2YWJsZTxUPih2YWx1ZTogVCkge1xyXG5cdHJldHVybiBuZXcgT2JzZXJ2YWJsZTxUPih2YWx1ZSk7XHJcbn1cclxuIiwiaW1wb3J0IHsgSUNvbnRleHQsIE1vZGFscyB9IGZyb20gJy4vdHlwZXMnO1xyXG5pbXBvcnQgeyBvYnNlcnZhYmxlIH0gZnJvbSAnLi9vYnNlcnZhYmxlcy9PYnNlcnZhYmxlJztcclxuXHJcbmV4cG9ydCBjb25zdCBDb250ZXh0OiBJQ29udGV4dCA9IHtcclxuXHRtb2RhbDogb2JzZXJ2YWJsZTxNb2RhbHM+KCdOb25lJyksXHJcbn07XHJcbiIsIi8vIEZyb20gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvZ2xvYmFsVGhpc1xuZnVuY3Rpb24gZ2V0R2xvYmFsKCkge1xuICBpZiAodHlwZW9mIGdsb2JhbFRoaXMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGdsb2JhbFRoaXM7XG4gIH1cbiAgaWYgKHR5cGVvZiBzZWxmICE9PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBzZWxmO1xuICB9XG4gIGlmICh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiB3aW5kb3c7XG4gIH1cbiAgaWYgKHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuIGdsb2JhbDtcbiAgfVxufVxuZnVuY3Rpb24gZ2V0RGV2VG9vbHMoKSB7XG4gIGNvbnN0IHcgPSBnZXRHbG9iYWwoKTtcbiAgaWYgKCEhdy5fX3hzdGF0ZV9fKSB7XG4gICAgcmV0dXJuIHcuX194c3RhdGVfXztcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuZnVuY3Rpb24gcmVnaXN0ZXJTZXJ2aWNlKHNlcnZpY2UpIHtcbiAgaWYgKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IGRldlRvb2xzID0gZ2V0RGV2VG9vbHMoKTtcbiAgaWYgKGRldlRvb2xzKSB7XG4gICAgZGV2VG9vbHMucmVnaXN0ZXIoc2VydmljZSk7XG4gIH1cbn1cbmNvbnN0IGRldlRvb2xzQWRhcHRlciA9IHNlcnZpY2UgPT4ge1xuICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgZGV2VG9vbHMgPSBnZXREZXZUb29scygpO1xuICBpZiAoZGV2VG9vbHMpIHtcbiAgICBkZXZUb29scy5yZWdpc3RlcihzZXJ2aWNlKTtcbiAgfVxufTtcblxuZXhwb3J0IHsgZGV2VG9vbHNBZGFwdGVyLCBnZXRHbG9iYWwsIHJlZ2lzdGVyU2VydmljZSB9O1xuIiwiaW1wb3J0IHsgZGV2VG9vbHNBZGFwdGVyIH0gZnJvbSAnLi4vZGV2L2Rpc3QveHN0YXRlLWRldi5lc20uanMnO1xuXG5jb25zdCBTVEFURV9ERUxJTUlURVIgPSAnLic7XG5jb25zdCBUQVJHRVRMRVNTX0tFWSA9ICcnO1xuY29uc3QgTlVMTF9FVkVOVCA9ICcnO1xuY29uc3QgU1RBVEVfSURFTlRJRklFUiA9ICcjJztcbmNvbnN0IFdJTERDQVJEID0gJyonO1xuY29uc3QgWFNUQVRFX0lOSVQgPSAneHN0YXRlLmluaXQnO1xuY29uc3QgWFNUQVRFX0VSUk9SID0gJ3hzdGF0ZS5lcnJvcic7XG5jb25zdCBYU1RBVEVfU1RPUCA9ICd4c3RhdGUuc3RvcCc7XG5cbi8qKlxuICogUmV0dXJucyBhbiBldmVudCB0aGF0IHJlcHJlc2VudHMgYW4gaW1wbGljaXQgZXZlbnQgdGhhdFxuICogaXMgc2VudCBhZnRlciB0aGUgc3BlY2lmaWVkIGBkZWxheWAuXG4gKlxuICogQHBhcmFtIGRlbGF5UmVmIFRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHNcbiAqIEBwYXJhbSBpZCBUaGUgc3RhdGUgbm9kZSBJRCB3aGVyZSB0aGlzIGV2ZW50IGlzIGhhbmRsZWRcbiAqL1xuZnVuY3Rpb24gY3JlYXRlQWZ0ZXJFdmVudChkZWxheVJlZiwgaWQpIHtcbiAgY29uc3QgaWRTdWZmaXggPSBpZCA/IGAjJHtpZH1gIDogJyc7XG4gIHJldHVybiB7XG4gICAgdHlwZTogYHhzdGF0ZS5hZnRlcigke2RlbGF5UmVmfSkke2lkU3VmZml4fWBcbiAgfTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGFuIGV2ZW50IHRoYXQgcmVwcmVzZW50cyB0aGF0IGEgZmluYWwgc3RhdGUgbm9kZVxuICogaGFzIGJlZW4gcmVhY2hlZCBpbiB0aGUgcGFyZW50IHN0YXRlIG5vZGUuXG4gKlxuICogQHBhcmFtIGlkIFRoZSBmaW5hbCBzdGF0ZSBub2RlJ3MgcGFyZW50IHN0YXRlIG5vZGUgYGlkYFxuICogQHBhcmFtIG91dHB1dCBUaGUgZGF0YSB0byBwYXNzIGludG8gdGhlIGV2ZW50XG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZURvbmVTdGF0ZUV2ZW50KGlkLCBvdXRwdXQpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiBgeHN0YXRlLmRvbmUuc3RhdGUuJHtpZH1gLFxuICAgIG91dHB1dFxuICB9O1xufVxuXG4vKipcbiAqIFJldHVybnMgYW4gZXZlbnQgdGhhdCByZXByZXNlbnRzIHRoYXQgYW4gaW52b2tlZCBzZXJ2aWNlIGhhcyB0ZXJtaW5hdGVkLlxuICpcbiAqIEFuIGludm9rZWQgc2VydmljZSBpcyB0ZXJtaW5hdGVkIHdoZW4gaXQgaGFzIHJlYWNoZWQgYSB0b3AtbGV2ZWwgZmluYWwgc3RhdGUgbm9kZSxcbiAqIGJ1dCBub3Qgd2hlbiBpdCBpcyBjYW5jZWxlZC5cbiAqXG4gKiBAcGFyYW0gaW52b2tlSWQgVGhlIGludm9rZWQgc2VydmljZSBJRFxuICogQHBhcmFtIG91dHB1dCBUaGUgZGF0YSB0byBwYXNzIGludG8gdGhlIGV2ZW50XG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZURvbmVBY3RvckV2ZW50KGludm9rZUlkLCBvdXRwdXQpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiBgeHN0YXRlLmRvbmUuYWN0b3IuJHtpbnZva2VJZH1gLFxuICAgIG91dHB1dFxuICB9O1xufVxuZnVuY3Rpb24gY3JlYXRlRXJyb3JBY3RvckV2ZW50KGlkLCBkYXRhKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogYHhzdGF0ZS5lcnJvci5hY3Rvci4ke2lkfWAsXG4gICAgZGF0YVxuICB9O1xufVxuZnVuY3Rpb24gY3JlYXRlSW5pdEV2ZW50KGlucHV0KSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogWFNUQVRFX0lOSVQsXG4gICAgaW5wdXRcbiAgfTtcbn1cblxuY2xhc3MgTWFpbGJveCB7XG4gIGNvbnN0cnVjdG9yKF9wcm9jZXNzKSB7XG4gICAgdGhpcy5fcHJvY2VzcyA9IF9wcm9jZXNzO1xuICAgIHRoaXMuX2FjdGl2ZSA9IGZhbHNlO1xuICAgIHRoaXMuX2N1cnJlbnQgPSBudWxsO1xuICAgIHRoaXMuX2xhc3QgPSBudWxsO1xuICB9XG4gIHN0YXJ0KCkge1xuICAgIHRoaXMuX2FjdGl2ZSA9IHRydWU7XG4gICAgdGhpcy5mbHVzaCgpO1xuICB9XG4gIGNsZWFyKCkge1xuICAgIC8vIHdlIGNhbid0IHNldCBfY3VycmVudCB0byBudWxsIGJlY2F1c2Ugd2UgbWlnaHQgYmUgY3VycmVudGx5IHByb2Nlc3NpbmdcbiAgICAvLyBhbmQgZW5xdWV1ZSBmb2xsb3dpbmcgY2xlYXIgc2hvdWxkbnQgc3RhcnQgcHJvY2Vzc2luZyB0aGUgZW5xdWV1ZWQgaXRlbSBpbW1lZGlhdGVseVxuICAgIGlmICh0aGlzLl9jdXJyZW50KSB7XG4gICAgICB0aGlzLl9jdXJyZW50Lm5leHQgPSBudWxsO1xuICAgICAgdGhpcy5fbGFzdCA9IHRoaXMuX2N1cnJlbnQ7XG4gICAgfVxuICB9XG5cbiAgLy8gVE9ETzogcmV0aGluayB0aGlzIGRlc2lnblxuICBwcmVwZW5kKGV2ZW50KSB7XG4gICAgaWYgKCF0aGlzLl9jdXJyZW50KSB7XG4gICAgICB0aGlzLmVucXVldWUoZXZlbnQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIHdlIGtub3cgdGhhdCBzb21ldGhpbmcgaXMgYWxyZWFkeSBxdWV1ZWQgdXBcbiAgICAvLyBzbyB0aGUgbWFpbGJveCBpcyBhbHJlYWR5IGZsdXNoaW5nIG9yIGl0J3MgaW5hY3RpdmVcbiAgICAvLyB0aGVyZWZvcmUgdGhlIG9ubHkgdGhpbmcgdGhhdCB3ZSBuZWVkIHRvIGRvIGlzIHRvIHJlYXNzaWduIGB0aGlzLl9jdXJyZW50YFxuICAgIHRoaXMuX2N1cnJlbnQgPSB7XG4gICAgICB2YWx1ZTogZXZlbnQsXG4gICAgICBuZXh0OiB0aGlzLl9jdXJyZW50XG4gICAgfTtcbiAgfVxuICBlbnF1ZXVlKGV2ZW50KSB7XG4gICAgY29uc3QgZW5xdWV1ZWQgPSB7XG4gICAgICB2YWx1ZTogZXZlbnQsXG4gICAgICBuZXh0OiBudWxsXG4gICAgfTtcbiAgICBpZiAodGhpcy5fY3VycmVudCkge1xuICAgICAgdGhpcy5fbGFzdC5uZXh0ID0gZW5xdWV1ZWQ7XG4gICAgICB0aGlzLl9sYXN0ID0gZW5xdWV1ZWQ7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuX2N1cnJlbnQgPSBlbnF1ZXVlZDtcbiAgICB0aGlzLl9sYXN0ID0gZW5xdWV1ZWQ7XG4gICAgaWYgKHRoaXMuX2FjdGl2ZSkge1xuICAgICAgdGhpcy5mbHVzaCgpO1xuICAgIH1cbiAgfVxuICBmbHVzaCgpIHtcbiAgICB3aGlsZSAodGhpcy5fY3VycmVudCkge1xuICAgICAgLy8gYXRtIHRoZSBnaXZlbiBfcHJvY2VzcyBpcyByZXNwb25zaWJsZSBmb3IgaW1wbGVtZW50aW5nIHByb3BlciB0cnkvY2F0Y2ggaGFuZGxpbmdcbiAgICAgIC8vIHdlIGFzc3VtZSBoZXJlIHRoYXQgdGhpcyB3b24ndCB0aHJvdyBpbiBhIHdheSB0aGF0IGNhbiBhZmZlY3QgdGhpcyBtYWlsYm94XG4gICAgICBjb25zdCBjb25zdW1lZCA9IHRoaXMuX2N1cnJlbnQ7XG4gICAgICB0aGlzLl9wcm9jZXNzKGNvbnN1bWVkLnZhbHVlKTtcbiAgICAgIC8vIHNvbWV0aGluZyBjb3VsZCBoYXZlIGJlZW4gcHJlcGVuZGVkIGluIHRoZSBtZWFudGltZVxuICAgICAgLy8gc28gd2UgbmVlZCB0byBiZSBkZWZlbnNpdmUgaGVyZSB0byBhdm9pZCBza2lwcGluZyBvdmVyIGEgcHJlcGVuZGVkIGl0ZW1cbiAgICAgIGlmIChjb25zdW1lZCA9PT0gdGhpcy5fY3VycmVudCkge1xuICAgICAgICB0aGlzLl9jdXJyZW50ID0gdGhpcy5fY3VycmVudC5uZXh0O1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLl9sYXN0ID0gbnVsbDtcbiAgfVxufVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gbWFrZXMgc3VyZSB0aGF0IHVuaGFuZGxlZCBlcnJvcnMgYXJlIHRocm93biBpbiBhIHNlcGFyYXRlIG1hY3JvdGFzay5cbiAqIEl0IGFsbG93cyB0aG9zZSBlcnJvcnMgdG8gYmUgZGV0ZWN0ZWQgYnkgZ2xvYmFsIGVycm9yIGhhbmRsZXJzIGFuZCByZXBvcnRlZCB0byBidWcgdHJhY2tpbmcgc2VydmljZXNcbiAqIHdpdGhvdXQgaW50ZXJydXB0aW5nIG91ciBvd24gc3RhY2sgb2YgZXhlY3V0aW9uLlxuICpcbiAqIEBwYXJhbSBlcnIgZXJyb3IgdG8gYmUgdGhyb3duXG4gKi9cbmZ1bmN0aW9uIHJlcG9ydFVuaGFuZGxlZEVycm9yKGVycikge1xuICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICB0aHJvdyBlcnI7XG4gIH0pO1xufVxuXG5jb25zdCBzeW1ib2xPYnNlcnZhYmxlID0gKCgpID0+IHR5cGVvZiBTeW1ib2wgPT09ICdmdW5jdGlvbicgJiYgU3ltYm9sLm9ic2VydmFibGUgfHwgJ0BAb2JzZXJ2YWJsZScpKCk7XG5cbmxldCBpZENvdW50ZXIgPSAwO1xuZnVuY3Rpb24gY3JlYXRlU3lzdGVtKHJvb3RBY3Rvcikge1xuICBjb25zdCBjaGlsZHJlbiA9IG5ldyBNYXAoKTtcbiAgY29uc3Qga2V5ZWRBY3RvcnMgPSBuZXcgTWFwKCk7XG4gIGNvbnN0IHJldmVyc2VLZXllZEFjdG9ycyA9IG5ldyBXZWFrTWFwKCk7XG4gIGNvbnN0IG9ic2VydmVycyA9IG5ldyBTZXQoKTtcbiAgY29uc3Qgc3lzdGVtID0ge1xuICAgIF9ib29rSWQ6ICgpID0+IGB4OiR7aWRDb3VudGVyKyt9YCxcbiAgICBfcmVnaXN0ZXI6IChzZXNzaW9uSWQsIGFjdG9yUmVmKSA9PiB7XG4gICAgICBjaGlsZHJlbi5zZXQoc2Vzc2lvbklkLCBhY3RvclJlZik7XG4gICAgICByZXR1cm4gc2Vzc2lvbklkO1xuICAgIH0sXG4gICAgX3VucmVnaXN0ZXI6IGFjdG9yUmVmID0+IHtcbiAgICAgIGNoaWxkcmVuLmRlbGV0ZShhY3RvclJlZi5zZXNzaW9uSWQpO1xuICAgICAgY29uc3Qgc3lzdGVtSWQgPSByZXZlcnNlS2V5ZWRBY3RvcnMuZ2V0KGFjdG9yUmVmKTtcbiAgICAgIGlmIChzeXN0ZW1JZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGtleWVkQWN0b3JzLmRlbGV0ZShzeXN0ZW1JZCk7XG4gICAgICAgIHJldmVyc2VLZXllZEFjdG9ycy5kZWxldGUoYWN0b3JSZWYpO1xuICAgICAgfVxuICAgIH0sXG4gICAgZ2V0OiBzeXN0ZW1JZCA9PiB7XG4gICAgICByZXR1cm4ga2V5ZWRBY3RvcnMuZ2V0KHN5c3RlbUlkKTtcbiAgICB9LFxuICAgIF9zZXQ6IChzeXN0ZW1JZCwgYWN0b3JSZWYpID0+IHtcbiAgICAgIGNvbnN0IGV4aXN0aW5nID0ga2V5ZWRBY3RvcnMuZ2V0KHN5c3RlbUlkKTtcbiAgICAgIGlmIChleGlzdGluZyAmJiBleGlzdGluZyAhPT0gYWN0b3JSZWYpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBY3RvciB3aXRoIHN5c3RlbSBJRCAnJHtzeXN0ZW1JZH0nIGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgfVxuICAgICAga2V5ZWRBY3RvcnMuc2V0KHN5c3RlbUlkLCBhY3RvclJlZik7XG4gICAgICByZXZlcnNlS2V5ZWRBY3RvcnMuc2V0KGFjdG9yUmVmLCBzeXN0ZW1JZCk7XG4gICAgfSxcbiAgICBpbnNwZWN0OiBvYnNlcnZlciA9PiB7XG4gICAgICBvYnNlcnZlcnMuYWRkKG9ic2VydmVyKTtcbiAgICB9LFxuICAgIF9zZW5kSW5zcGVjdGlvbkV2ZW50OiBldmVudCA9PiB7XG4gICAgICBjb25zdCByZXNvbHZlZEluc3BlY3Rpb25FdmVudCA9IHtcbiAgICAgICAgLi4uZXZlbnQsXG4gICAgICAgIHJvb3RJZDogcm9vdEFjdG9yLnNlc3Npb25JZFxuICAgICAgfTtcbiAgICAgIG9ic2VydmVycy5mb3JFYWNoKG9ic2VydmVyID0+IG9ic2VydmVyLm5leHQ/LihyZXNvbHZlZEluc3BlY3Rpb25FdmVudCkpO1xuICAgIH0sXG4gICAgX3JlbGF5OiAoc291cmNlLCB0YXJnZXQsIGV2ZW50KSA9PiB7XG4gICAgICBzeXN0ZW0uX3NlbmRJbnNwZWN0aW9uRXZlbnQoe1xuICAgICAgICB0eXBlOiAnQHhzdGF0ZS5ldmVudCcsXG4gICAgICAgIHNvdXJjZVJlZjogc291cmNlLFxuICAgICAgICB0YXJnZXRSZWY6IHRhcmdldCxcbiAgICAgICAgZXZlbnRcbiAgICAgIH0pO1xuICAgICAgdGFyZ2V0Ll9zZW5kKGV2ZW50KTtcbiAgICB9XG4gIH07XG4gIHJldHVybiBzeXN0ZW07XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXNTdGF0ZShwYXJlbnRTdGF0ZUlkLCBjaGlsZFN0YXRlSWQpIHtcbiAgY29uc3QgcGFyZW50U3RhdGVWYWx1ZSA9IHRvU3RhdGVWYWx1ZShwYXJlbnRTdGF0ZUlkKTtcbiAgY29uc3QgY2hpbGRTdGF0ZVZhbHVlID0gdG9TdGF0ZVZhbHVlKGNoaWxkU3RhdGVJZCk7XG4gIGlmICh0eXBlb2YgY2hpbGRTdGF0ZVZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGlmICh0eXBlb2YgcGFyZW50U3RhdGVWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBjaGlsZFN0YXRlVmFsdWUgPT09IHBhcmVudFN0YXRlVmFsdWU7XG4gICAgfVxuXG4gICAgLy8gUGFyZW50IG1vcmUgc3BlY2lmaWMgdGhhbiBjaGlsZFxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAodHlwZW9mIHBhcmVudFN0YXRlVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHBhcmVudFN0YXRlVmFsdWUgaW4gY2hpbGRTdGF0ZVZhbHVlO1xuICB9XG4gIHJldHVybiBPYmplY3Qua2V5cyhwYXJlbnRTdGF0ZVZhbHVlKS5ldmVyeShrZXkgPT4ge1xuICAgIGlmICghKGtleSBpbiBjaGlsZFN0YXRlVmFsdWUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBtYXRjaGVzU3RhdGUocGFyZW50U3RhdGVWYWx1ZVtrZXldLCBjaGlsZFN0YXRlVmFsdWVba2V5XSk7XG4gIH0pO1xufVxuZnVuY3Rpb24gdG9TdGF0ZVBhdGgoc3RhdGVJZCkge1xuICB0cnkge1xuICAgIGlmIChpc0FycmF5KHN0YXRlSWQpKSB7XG4gICAgICByZXR1cm4gc3RhdGVJZDtcbiAgICB9XG4gICAgcmV0dXJuIHN0YXRlSWQudG9TdHJpbmcoKS5zcGxpdChTVEFURV9ERUxJTUlURVIpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGAnJHtzdGF0ZUlkfScgaXMgbm90IGEgdmFsaWQgc3RhdGUgcGF0aC5gKTtcbiAgfVxufVxuZnVuY3Rpb24gaXNTdGF0ZUxpa2Uoc3RhdGUpIHtcbiAgcmV0dXJuIHR5cGVvZiBzdGF0ZSA9PT0gJ29iamVjdCcgJiYgJ3ZhbHVlJyBpbiBzdGF0ZSAmJiAnY29udGV4dCcgaW4gc3RhdGUgJiYgJ2V2ZW50JyBpbiBzdGF0ZTtcbn1cbmZ1bmN0aW9uIHRvU3RhdGVWYWx1ZShzdGF0ZVZhbHVlKSB7XG4gIGlmIChpc1N0YXRlTGlrZShzdGF0ZVZhbHVlKSkge1xuICAgIHJldHVybiBzdGF0ZVZhbHVlLnZhbHVlO1xuICB9XG4gIGlmIChpc0FycmF5KHN0YXRlVmFsdWUpKSB7XG4gICAgcmV0dXJuIHBhdGhUb1N0YXRlVmFsdWUoc3RhdGVWYWx1ZSk7XG4gIH1cbiAgaWYgKHR5cGVvZiBzdGF0ZVZhbHVlICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBzdGF0ZVZhbHVlO1xuICB9XG4gIGNvbnN0IHN0YXRlUGF0aCA9IHRvU3RhdGVQYXRoKHN0YXRlVmFsdWUpO1xuICByZXR1cm4gcGF0aFRvU3RhdGVWYWx1ZShzdGF0ZVBhdGgpO1xufVxuZnVuY3Rpb24gcGF0aFRvU3RhdGVWYWx1ZShzdGF0ZVBhdGgpIHtcbiAgaWYgKHN0YXRlUGF0aC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gc3RhdGVQYXRoWzBdO1xuICB9XG4gIGNvbnN0IHZhbHVlID0ge307XG4gIGxldCBtYXJrZXIgPSB2YWx1ZTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0ZVBhdGgubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgaWYgKGkgPT09IHN0YXRlUGF0aC5sZW5ndGggLSAyKSB7XG4gICAgICBtYXJrZXJbc3RhdGVQYXRoW2ldXSA9IHN0YXRlUGF0aFtpICsgMV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHByZXZpb3VzID0gbWFya2VyO1xuICAgICAgbWFya2VyID0ge307XG4gICAgICBwcmV2aW91c1tzdGF0ZVBhdGhbaV1dID0gbWFya2VyO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5mdW5jdGlvbiBtYXBWYWx1ZXMoY29sbGVjdGlvbiwgaXRlcmF0ZWUpIHtcbiAgY29uc3QgcmVzdWx0ID0ge307XG4gIGNvbnN0IGNvbGxlY3Rpb25LZXlzID0gT2JqZWN0LmtleXMoY29sbGVjdGlvbik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29sbGVjdGlvbktleXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBrZXkgPSBjb2xsZWN0aW9uS2V5c1tpXTtcbiAgICByZXN1bHRba2V5XSA9IGl0ZXJhdGVlKGNvbGxlY3Rpb25ba2V5XSwga2V5LCBjb2xsZWN0aW9uLCBpKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuZnVuY3Rpb24gZmxhdHRlbihhcnJheSkge1xuICByZXR1cm4gW10uY29uY2F0KC4uLmFycmF5KTtcbn1cbmZ1bmN0aW9uIHRvQXJyYXlTdHJpY3QodmFsdWUpIHtcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIHJldHVybiBbdmFsdWVdO1xufVxuZnVuY3Rpb24gdG9BcnJheSh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICByZXR1cm4gdG9BcnJheVN0cmljdCh2YWx1ZSk7XG59XG5mdW5jdGlvbiByZXNvbHZlT3V0cHV0KG1hcHBlciwgY29udGV4dCwgZXZlbnQsIHNlbGYpIHtcbiAgaWYgKHR5cGVvZiBtYXBwZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gbWFwcGVyKHtcbiAgICAgIGNvbnRleHQsXG4gICAgICBldmVudCxcbiAgICAgIHNlbGZcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gbWFwcGVyO1xufVxuZnVuY3Rpb24gaXNBcnJheSh2YWx1ZSkge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG59XG5mdW5jdGlvbiBpc0Vycm9yQWN0b3JFdmVudChldmVudCkge1xuICByZXR1cm4gZXZlbnQudHlwZS5zdGFydHNXaXRoKCd4c3RhdGUuZXJyb3IuYWN0b3InKTtcbn1cbmZ1bmN0aW9uIHRvVHJhbnNpdGlvbkNvbmZpZ0FycmF5KGNvbmZpZ0xpa2UpIHtcbiAgcmV0dXJuIHRvQXJyYXlTdHJpY3QoY29uZmlnTGlrZSkubWFwKHRyYW5zaXRpb25MaWtlID0+IHtcbiAgICBpZiAodHlwZW9mIHRyYW5zaXRpb25MaWtlID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgdHJhbnNpdGlvbkxpa2UgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB0YXJnZXQ6IHRyYW5zaXRpb25MaWtlXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdHJhbnNpdGlvbkxpa2U7XG4gIH0pO1xufVxuZnVuY3Rpb24gbm9ybWFsaXplVGFyZ2V0KHRhcmdldCkge1xuICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgdGFyZ2V0ID09PSBUQVJHRVRMRVNTX0tFWSkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbiAgcmV0dXJuIHRvQXJyYXkodGFyZ2V0KTtcbn1cbmZ1bmN0aW9uIHRvT2JzZXJ2ZXIobmV4dEhhbmRsZXIsIGVycm9ySGFuZGxlciwgY29tcGxldGlvbkhhbmRsZXIpIHtcbiAgY29uc3QgaXNPYnNlcnZlciA9IHR5cGVvZiBuZXh0SGFuZGxlciA9PT0gJ29iamVjdCc7XG4gIGNvbnN0IHNlbGYgPSBpc09ic2VydmVyID8gbmV4dEhhbmRsZXIgOiB1bmRlZmluZWQ7XG4gIHJldHVybiB7XG4gICAgbmV4dDogKGlzT2JzZXJ2ZXIgPyBuZXh0SGFuZGxlci5uZXh0IDogbmV4dEhhbmRsZXIpPy5iaW5kKHNlbGYpLFxuICAgIGVycm9yOiAoaXNPYnNlcnZlciA/IG5leHRIYW5kbGVyLmVycm9yIDogZXJyb3JIYW5kbGVyKT8uYmluZChzZWxmKSxcbiAgICBjb21wbGV0ZTogKGlzT2JzZXJ2ZXIgPyBuZXh0SGFuZGxlci5jb21wbGV0ZSA6IGNvbXBsZXRpb25IYW5kbGVyKT8uYmluZChzZWxmKVxuICB9O1xufVxuZnVuY3Rpb24gY3JlYXRlSW52b2tlSWQoc3RhdGVOb2RlSWQsIGluZGV4KSB7XG4gIHJldHVybiBgJHtzdGF0ZU5vZGVJZH06aW52b2NhdGlvblske2luZGV4fV1gO1xufVxuZnVuY3Rpb24gcmVzb2x2ZVJlZmVyZW5jZWRBY3RvcihyZWZlcmVuY2VkKSB7XG4gIHJldHVybiByZWZlcmVuY2VkID8gJ3RyYW5zaXRpb24nIGluIHJlZmVyZW5jZWQgPyB7XG4gICAgc3JjOiByZWZlcmVuY2VkLFxuICAgIGlucHV0OiB1bmRlZmluZWRcbiAgfSA6IHJlZmVyZW5jZWQgOiB1bmRlZmluZWQ7XG59XG5cbmxldCBBY3RvclN0YXR1cyA9IC8qI19fUFVSRV9fKi9mdW5jdGlvbiAoQWN0b3JTdGF0dXMpIHtcbiAgQWN0b3JTdGF0dXNbQWN0b3JTdGF0dXNbXCJOb3RTdGFydGVkXCJdID0gMF0gPSBcIk5vdFN0YXJ0ZWRcIjtcbiAgQWN0b3JTdGF0dXNbQWN0b3JTdGF0dXNbXCJSdW5uaW5nXCJdID0gMV0gPSBcIlJ1bm5pbmdcIjtcbiAgQWN0b3JTdGF0dXNbQWN0b3JTdGF0dXNbXCJTdG9wcGVkXCJdID0gMl0gPSBcIlN0b3BwZWRcIjtcbiAgcmV0dXJuIEFjdG9yU3RhdHVzO1xufSh7fSk7XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgVXNlIGBBY3RvclN0YXR1c2AgaW5zdGVhZC5cbiAqL1xuY29uc3QgSW50ZXJwcmV0ZXJTdGF0dXMgPSBBY3RvclN0YXR1cztcbmNvbnN0IGRlZmF1bHRPcHRpb25zID0ge1xuICBjbG9jazoge1xuICAgIHNldFRpbWVvdXQ6IChmbiwgbXMpID0+IHtcbiAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZuLCBtcyk7XG4gICAgfSxcbiAgICBjbGVhclRpbWVvdXQ6IGlkID0+IHtcbiAgICAgIHJldHVybiBjbGVhclRpbWVvdXQoaWQpO1xuICAgIH1cbiAgfSxcbiAgbG9nZ2VyOiBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpLFxuICBkZXZUb29sczogZmFsc2Vcbn07XG5jbGFzcyBBY3RvciB7XG4gIC8qKlxuICAgKiBUaGUgY3VycmVudCBpbnRlcm5hbCBzdGF0ZSBvZiB0aGUgYWN0b3IuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBUaGUgY2xvY2sgdGhhdCBpcyByZXNwb25zaWJsZSBmb3Igc2V0dGluZyBhbmQgY2xlYXJpbmcgdGltZW91dHMsIHN1Y2ggYXMgZGVsYXllZCBldmVudHMgYW5kIHRyYW5zaXRpb25zLlxuICAgKi9cblxuICAvKipcbiAgICogVGhlIHVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGlzIGFjdG9yIHJlbGF0aXZlIHRvIGl0cyBwYXJlbnQuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRoZSBzZXJ2aWNlIGlzIHN0YXJ0ZWQuXG4gICAqL1xuXG4gIC8vIEFjdG9yIFJlZlxuXG4gIC8vIFRPRE86IGFkZCB0eXBpbmdzIGZvciBzeXN0ZW1cblxuICAvKipcbiAgICogVGhlIGdsb2JhbGx5IHVuaXF1ZSBwcm9jZXNzIElEIGZvciB0aGlzIGludm9jYXRpb24uXG4gICAqL1xuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IGFjdG9yIGluc3RhbmNlIGZvciB0aGUgZ2l2ZW4gbG9naWMgd2l0aCB0aGUgcHJvdmlkZWQgb3B0aW9ucywgaWYgYW55LlxuICAgKlxuICAgKiBAcGFyYW0gbG9naWMgVGhlIGxvZ2ljIHRvIGNyZWF0ZSBhbiBhY3RvciBmcm9tXG4gICAqIEBwYXJhbSBvcHRpb25zIEFjdG9yIG9wdGlvbnNcbiAgICovXG4gIGNvbnN0cnVjdG9yKGxvZ2ljLCBvcHRpb25zKSB7XG4gICAgdGhpcy5sb2dpYyA9IGxvZ2ljO1xuICAgIHRoaXMuX3N0YXRlID0gdm9pZCAwO1xuICAgIHRoaXMuY2xvY2sgPSB2b2lkIDA7XG4gICAgdGhpcy5vcHRpb25zID0gdm9pZCAwO1xuICAgIHRoaXMuaWQgPSB2b2lkIDA7XG4gICAgdGhpcy5tYWlsYm94ID0gbmV3IE1haWxib3godGhpcy5fcHJvY2Vzcy5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmRlbGF5ZWRFdmVudHNNYXAgPSB7fTtcbiAgICB0aGlzLm9ic2VydmVycyA9IG5ldyBTZXQoKTtcbiAgICB0aGlzLmxvZ2dlciA9IHZvaWQgMDtcbiAgICB0aGlzLnN0YXR1cyA9IEFjdG9yU3RhdHVzLk5vdFN0YXJ0ZWQ7XG4gICAgdGhpcy5fcGFyZW50ID0gdm9pZCAwO1xuICAgIHRoaXMucmVmID0gdm9pZCAwO1xuICAgIHRoaXMuX2FjdG9yQ29udGV4dCA9IHZvaWQgMDtcbiAgICB0aGlzLl9zeXN0ZW1JZCA9IHZvaWQgMDtcbiAgICB0aGlzLnNlc3Npb25JZCA9IHZvaWQgMDtcbiAgICB0aGlzLnN5c3RlbSA9IHZvaWQgMDtcbiAgICB0aGlzLl9kb25lRXZlbnQgPSB2b2lkIDA7XG4gICAgdGhpcy5zcmMgPSB2b2lkIDA7XG4gICAgdGhpcy5fZGVmZXJyZWQgPSBbXTtcbiAgICBjb25zdCByZXNvbHZlZE9wdGlvbnMgPSB7XG4gICAgICAuLi5kZWZhdWx0T3B0aW9ucyxcbiAgICAgIC4uLm9wdGlvbnNcbiAgICB9O1xuICAgIGNvbnN0IHtcbiAgICAgIGNsb2NrLFxuICAgICAgbG9nZ2VyLFxuICAgICAgcGFyZW50LFxuICAgICAgaWQsXG4gICAgICBzeXN0ZW1JZCxcbiAgICAgIGluc3BlY3RcbiAgICB9ID0gcmVzb2x2ZWRPcHRpb25zO1xuICAgIHRoaXMuc3lzdGVtID0gcGFyZW50Py5zeXN0ZW0gPz8gY3JlYXRlU3lzdGVtKHRoaXMpO1xuICAgIGlmIChpbnNwZWN0ICYmICFwYXJlbnQpIHtcbiAgICAgIC8vIEFsd2F5cyBpbnNwZWN0IGF0IHRoZSBzeXN0ZW0tbGV2ZWxcbiAgICAgIHRoaXMuc3lzdGVtLmluc3BlY3QodG9PYnNlcnZlcihpbnNwZWN0KSk7XG4gICAgfVxuICAgIGlmIChzeXN0ZW1JZCkge1xuICAgICAgdGhpcy5fc3lzdGVtSWQgPSBzeXN0ZW1JZDtcbiAgICAgIHRoaXMuc3lzdGVtLl9zZXQoc3lzdGVtSWQsIHRoaXMpO1xuICAgIH1cbiAgICB0aGlzLnNlc3Npb25JZCA9IHRoaXMuc3lzdGVtLl9ib29rSWQoKTtcbiAgICB0aGlzLmlkID0gaWQgPz8gdGhpcy5zZXNzaW9uSWQ7XG4gICAgdGhpcy5sb2dnZXIgPSBsb2dnZXI7XG4gICAgdGhpcy5jbG9jayA9IGNsb2NrO1xuICAgIHRoaXMuX3BhcmVudCA9IHBhcmVudDtcbiAgICB0aGlzLm9wdGlvbnMgPSByZXNvbHZlZE9wdGlvbnM7XG4gICAgdGhpcy5zcmMgPSByZXNvbHZlZE9wdGlvbnMuc3JjO1xuICAgIHRoaXMucmVmID0gdGhpcztcbiAgICB0aGlzLl9hY3RvckNvbnRleHQgPSB7XG4gICAgICBzZWxmOiB0aGlzLFxuICAgICAgaWQ6IHRoaXMuaWQsXG4gICAgICBzZXNzaW9uSWQ6IHRoaXMuc2Vzc2lvbklkLFxuICAgICAgbG9nZ2VyOiB0aGlzLmxvZ2dlcixcbiAgICAgIGRlZmVyOiBmbiA9PiB7XG4gICAgICAgIHRoaXMuX2RlZmVycmVkLnB1c2goZm4pO1xuICAgICAgfSxcbiAgICAgIHN5c3RlbTogdGhpcy5zeXN0ZW0sXG4gICAgICBzdG9wQ2hpbGQ6IGNoaWxkID0+IHtcbiAgICAgICAgaWYgKGNoaWxkLl9wYXJlbnQgIT09IHRoaXMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBzdG9wIGNoaWxkIGFjdG9yICR7Y2hpbGQuaWR9IG9mICR7dGhpcy5pZH0gYmVjYXVzZSBpdCBpcyBub3QgYSBjaGlsZGApO1xuICAgICAgICB9XG4gICAgICAgIGNoaWxkLl9zdG9wKCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBzZW5kIG1ldGhvZCBpcyBib3VuZCB0byB0aGlzIEFjdG9yIGluc3RhbmNlXG4gICAgLy8gaWYgZGVzdHJ1Y3R1cmVkXG4gICAgdGhpcy5zZW5kID0gdGhpcy5zZW5kLmJpbmQodGhpcyk7XG4gICAgdGhpcy5zeXN0ZW0uX3NlbmRJbnNwZWN0aW9uRXZlbnQoe1xuICAgICAgdHlwZTogJ0B4c3RhdGUuYWN0b3InLFxuICAgICAgYWN0b3JSZWY6IHRoaXNcbiAgICB9KTtcbiAgICB0aGlzLl9pbml0U3RhdGUoKTtcbiAgfVxuICBfaW5pdFN0YXRlKCkge1xuICAgIHRoaXMuX3N0YXRlID0gdGhpcy5vcHRpb25zLnN0YXRlID8gdGhpcy5sb2dpYy5yZXN0b3JlU3RhdGUgPyB0aGlzLmxvZ2ljLnJlc3RvcmVTdGF0ZSh0aGlzLm9wdGlvbnMuc3RhdGUsIHRoaXMuX2FjdG9yQ29udGV4dCkgOiB0aGlzLm9wdGlvbnMuc3RhdGUgOiB0aGlzLmxvZ2ljLmdldEluaXRpYWxTdGF0ZSh0aGlzLl9hY3RvckNvbnRleHQsIHRoaXMub3B0aW9ucz8uaW5wdXQpO1xuICB9XG5cbiAgLy8gYXJyYXkgb2YgZnVuY3Rpb25zIHRvIGRlZmVyXG5cbiAgdXBkYXRlKHNuYXBzaG90LCBldmVudCkge1xuICAgIC8vIFVwZGF0ZSBzdGF0ZVxuICAgIHRoaXMuX3N0YXRlID0gc25hcHNob3Q7XG5cbiAgICAvLyBFeGVjdXRlIGRlZmVycmVkIGVmZmVjdHNcbiAgICBsZXQgZGVmZXJyZWRGbjtcbiAgICB3aGlsZSAoZGVmZXJyZWRGbiA9IHRoaXMuX2RlZmVycmVkLnNoaWZ0KCkpIHtcbiAgICAgIGRlZmVycmVkRm4oKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBvYnNlcnZlciBvZiB0aGlzLm9ic2VydmVycykge1xuICAgICAgLy8gVE9ETzogc2hvdWxkIG9ic2VydmVycyBiZSBub3RpZmllZCBpbiBjYXNlIG9mIHRoZSBlcnJvcj9cbiAgICAgIHRyeSB7XG4gICAgICAgIG9ic2VydmVyLm5leHQ/LihzbmFwc2hvdCk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgcmVwb3J0VW5oYW5kbGVkRXJyb3IoZXJyKTtcbiAgICAgIH1cbiAgICB9XG4gICAgc3dpdGNoICh0aGlzLl9zdGF0ZS5zdGF0dXMpIHtcbiAgICAgIGNhc2UgJ2RvbmUnOlxuICAgICAgICB0aGlzLl9zdG9wUHJvY2VkdXJlKCk7XG4gICAgICAgIHRoaXMuX2NvbXBsZXRlKCk7XG4gICAgICAgIHRoaXMuX2RvbmVFdmVudCA9IGNyZWF0ZURvbmVBY3RvckV2ZW50KHRoaXMuaWQsIHRoaXMuX3N0YXRlLm91dHB1dCk7XG4gICAgICAgIGlmICh0aGlzLl9wYXJlbnQpIHtcbiAgICAgICAgICB0aGlzLnN5c3RlbS5fcmVsYXkodGhpcywgdGhpcy5fcGFyZW50LCB0aGlzLl9kb25lRXZlbnQpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZXJyb3InOlxuICAgICAgICB0aGlzLl9zdG9wUHJvY2VkdXJlKCk7XG4gICAgICAgIHRoaXMuX2Vycm9yKHRoaXMuX3N0YXRlLmVycm9yKTtcbiAgICAgICAgaWYgKHRoaXMuX3BhcmVudCkge1xuICAgICAgICAgIHRoaXMuc3lzdGVtLl9yZWxheSh0aGlzLCB0aGlzLl9wYXJlbnQsIGNyZWF0ZUVycm9yQWN0b3JFdmVudCh0aGlzLmlkLCB0aGlzLl9zdGF0ZS5lcnJvcikpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB0aGlzLnN5c3RlbS5fc2VuZEluc3BlY3Rpb25FdmVudCh7XG4gICAgICB0eXBlOiAnQHhzdGF0ZS5zbmFwc2hvdCcsXG4gICAgICBhY3RvclJlZjogdGhpcyxcbiAgICAgIGV2ZW50LFxuICAgICAgc25hcHNob3RcbiAgICB9KTtcbiAgfVxuICBzdWJzY3JpYmUobmV4dExpc3RlbmVyT3JPYnNlcnZlciwgZXJyb3JMaXN0ZW5lciwgY29tcGxldGVMaXN0ZW5lcikge1xuICAgIGNvbnN0IG9ic2VydmVyID0gdG9PYnNlcnZlcihuZXh0TGlzdGVuZXJPck9ic2VydmVyLCBlcnJvckxpc3RlbmVyLCBjb21wbGV0ZUxpc3RlbmVyKTtcbiAgICBpZiAodGhpcy5zdGF0dXMgIT09IEFjdG9yU3RhdHVzLlN0b3BwZWQpIHtcbiAgICAgIHRoaXMub2JzZXJ2ZXJzLmFkZChvYnNlcnZlcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIG9ic2VydmVyLmNvbXBsZXRlPy4oKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICByZXBvcnRVbmhhbmRsZWRFcnJvcihlcnIpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgdW5zdWJzY3JpYmU6ICgpID0+IHtcbiAgICAgICAgdGhpcy5vYnNlcnZlcnMuZGVsZXRlKG9ic2VydmVyKTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0cyB0aGUgQWN0b3IgZnJvbSB0aGUgaW5pdGlhbCBzdGF0ZVxuICAgKi9cbiAgc3RhcnQoKSB7XG4gICAgaWYgKHRoaXMuc3RhdHVzID09PSBBY3RvclN0YXR1cy5SdW5uaW5nKSB7XG4gICAgICAvLyBEbyBub3QgcmVzdGFydCB0aGUgc2VydmljZSBpZiBpdCBpcyBhbHJlYWR5IHN0YXJ0ZWRcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICB0aGlzLnN5c3RlbS5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uSWQsIHRoaXMpO1xuICAgIGlmICh0aGlzLl9zeXN0ZW1JZCkge1xuICAgICAgdGhpcy5zeXN0ZW0uX3NldCh0aGlzLl9zeXN0ZW1JZCwgdGhpcyk7XG4gICAgfVxuICAgIHRoaXMuc3RhdHVzID0gQWN0b3JTdGF0dXMuUnVubmluZztcbiAgICBjb25zdCBpbml0RXZlbnQgPSBjcmVhdGVJbml0RXZlbnQodGhpcy5vcHRpb25zLmlucHV0KTtcbiAgICB0aGlzLnN5c3RlbS5fc2VuZEluc3BlY3Rpb25FdmVudCh7XG4gICAgICB0eXBlOiAnQHhzdGF0ZS5ldmVudCcsXG4gICAgICBzb3VyY2VSZWY6IHRoaXMuX3BhcmVudCxcbiAgICAgIHRhcmdldFJlZjogdGhpcyxcbiAgICAgIGV2ZW50OiBpbml0RXZlbnRcbiAgICB9KTtcbiAgICBjb25zdCBzdGF0dXMgPSB0aGlzLl9zdGF0ZS5zdGF0dXM7XG4gICAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICAgIGNhc2UgJ2RvbmUnOlxuICAgICAgICAvLyBhIHN0YXRlIG1hY2hpbmUgY2FuIGJlIFwiZG9uZVwiIHVwb24gaW50aWFsaXphdGlvbiAoaXQgY291bGQgcmVhY2ggYSBmaW5hbCBzdGF0ZSB1c2luZyBpbml0aWFsIG1pY3Jvc3RlcHMpXG4gICAgICAgIC8vIHdlIHN0aWxsIG5lZWQgdG8gY29tcGxldGUgb2JzZXJ2ZXJzLCBmbHVzaCBkZWZlcnJlZHMgZXRjXG4gICAgICAgIHRoaXMudXBkYXRlKHRoaXMuX3N0YXRlLCBpbml0RXZlbnQpO1xuICAgICAgLy8gZmFsbHRocm91Z2hcbiAgICAgIGNhc2UgJ2Vycm9yJzpcbiAgICAgICAgLy8gVE9ETzogcmV0aGluayBjbGVhbnVwIG9mIG9ic2VydmVycywgbWFpbGJveCwgZXRjXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBpZiAodGhpcy5sb2dpYy5zdGFydCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy5sb2dpYy5zdGFydCh0aGlzLl9zdGF0ZSwgdGhpcy5fYWN0b3JDb250ZXh0KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICB0aGlzLl9zdG9wUHJvY2VkdXJlKCk7XG4gICAgICAgIHRoaXMuX2Vycm9yKGVycik7XG4gICAgICAgIHRoaXMuX3BhcmVudD8uc2VuZChjcmVhdGVFcnJvckFjdG9yRXZlbnQodGhpcy5pZCwgZXJyKSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRPRE86IHRoaXMgbm90aWZpZXMgYWxsIHN1YnNjcmliZXJzIGJ1dCB1c3VhbGx5IHRoaXMgaXMgcmVkdW5kYW50XG4gICAgLy8gdGhlcmUgaXMgbm8gcmVhbCBjaGFuZ2UgaGFwcGVuaW5nIGhlcmVcbiAgICAvLyB3ZSBuZWVkIHRvIHJldGhpbmsgaWYgdGhpcyBuZWVkcyB0byBiZSByZWZhY3RvcmVkXG4gICAgdGhpcy51cGRhdGUodGhpcy5fc3RhdGUsIGluaXRFdmVudCk7XG4gICAgaWYgKHRoaXMub3B0aW9ucy5kZXZUb29scykge1xuICAgICAgdGhpcy5hdHRhY2hEZXZUb29scygpO1xuICAgIH1cbiAgICB0aGlzLm1haWxib3guc3RhcnQoKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICBfcHJvY2VzcyhldmVudCkge1xuICAgIC8vIFRPRE86IHJlZXhhbWluZSB3aGF0IGhhcHBlbnMgd2hlbiBhbiBhY3Rpb24gKG9yIGEgZ3VhcmQgb3Igc210aCkgdGhyb3dzXG4gICAgbGV0IG5leHRTdGF0ZTtcbiAgICBsZXQgY2F1Z2h0RXJyb3I7XG4gICAgdHJ5IHtcbiAgICAgIG5leHRTdGF0ZSA9IHRoaXMubG9naWMudHJhbnNpdGlvbih0aGlzLl9zdGF0ZSwgZXZlbnQsIHRoaXMuX2FjdG9yQ29udGV4dCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAvLyB3ZSB3cmFwIGl0IGluIGEgYm94IHNvIHdlIGNhbiByZXRocm93IGl0IGxhdGVyIGV2ZW4gaWYgZmFsc3kgdmFsdWUgZ2V0cyBjYXVnaHQgaGVyZVxuICAgICAgY2F1Z2h0RXJyb3IgPSB7XG4gICAgICAgIGVyclxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKGNhdWdodEVycm9yKSB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGVyclxuICAgICAgfSA9IGNhdWdodEVycm9yO1xuICAgICAgdGhpcy5fc3RvcFByb2NlZHVyZSgpO1xuICAgICAgdGhpcy5fZXJyb3IoZXJyKTtcbiAgICAgIHRoaXMuX3BhcmVudD8uc2VuZChjcmVhdGVFcnJvckFjdG9yRXZlbnQodGhpcy5pZCwgZXJyKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMudXBkYXRlKG5leHRTdGF0ZSwgZXZlbnQpO1xuICAgIGlmIChldmVudC50eXBlID09PSBYU1RBVEVfU1RPUCkge1xuICAgICAgdGhpcy5fc3RvcFByb2NlZHVyZSgpO1xuICAgICAgdGhpcy5fY29tcGxldGUoKTtcbiAgICB9XG4gIH1cbiAgX3N0b3AoKSB7XG4gICAgaWYgKHRoaXMuc3RhdHVzID09PSBBY3RvclN0YXR1cy5TdG9wcGVkKSB7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgdGhpcy5tYWlsYm94LmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuc3RhdHVzID09PSBBY3RvclN0YXR1cy5Ob3RTdGFydGVkKSB7XG4gICAgICB0aGlzLnN0YXR1cyA9IEFjdG9yU3RhdHVzLlN0b3BwZWQ7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgdGhpcy5tYWlsYm94LmVucXVldWUoe1xuICAgICAgdHlwZTogWFNUQVRFX1NUT1BcbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wcyB0aGUgQWN0b3IgYW5kIHVuc3Vic2NyaWJlIGFsbCBsaXN0ZW5lcnMuXG4gICAqL1xuICBzdG9wKCkge1xuICAgIGlmICh0aGlzLl9wYXJlbnQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQSBub24tcm9vdCBhY3RvciBjYW5ub3QgYmUgc3RvcHBlZCBkaXJlY3RseS4nKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX3N0b3AoKTtcbiAgfVxuICBfY29tcGxldGUoKSB7XG4gICAgZm9yIChjb25zdCBvYnNlcnZlciBvZiB0aGlzLm9ic2VydmVycykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgb2JzZXJ2ZXIuY29tcGxldGU/LigpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHJlcG9ydFVuaGFuZGxlZEVycm9yKGVycik7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMub2JzZXJ2ZXJzLmNsZWFyKCk7XG4gIH1cbiAgX2Vycm9yKGVycikge1xuICAgIGlmICghdGhpcy5vYnNlcnZlcnMuc2l6ZSkge1xuICAgICAgaWYgKCF0aGlzLl9wYXJlbnQpIHtcbiAgICAgICAgcmVwb3J0VW5oYW5kbGVkRXJyb3IoZXJyKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlcG9ydEVycm9yID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBvYnNlcnZlciBvZiB0aGlzLm9ic2VydmVycykge1xuICAgICAgY29uc3QgZXJyb3JMaXN0ZW5lciA9IG9ic2VydmVyLmVycm9yO1xuICAgICAgcmVwb3J0RXJyb3IgfHw9ICFlcnJvckxpc3RlbmVyO1xuICAgICAgdHJ5IHtcbiAgICAgICAgZXJyb3JMaXN0ZW5lcj8uKGVycik7XG4gICAgICB9IGNhdGNoIChlcnIyKSB7XG4gICAgICAgIHJlcG9ydFVuaGFuZGxlZEVycm9yKGVycjIpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLm9ic2VydmVycy5jbGVhcigpO1xuICAgIGlmIChyZXBvcnRFcnJvcikge1xuICAgICAgcmVwb3J0VW5oYW5kbGVkRXJyb3IoZXJyKTtcbiAgICB9XG4gIH1cbiAgX3N0b3BQcm9jZWR1cmUoKSB7XG4gICAgaWYgKHRoaXMuc3RhdHVzICE9PSBBY3RvclN0YXR1cy5SdW5uaW5nKSB7XG4gICAgICAvLyBBY3RvciBhbHJlYWR5IHN0b3BwZWQ7IGRvIG5vdGhpbmdcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8vIENhbmNlbCBhbGwgZGVsYXllZCBldmVudHNcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyh0aGlzLmRlbGF5ZWRFdmVudHNNYXApKSB7XG4gICAgICB0aGlzLmNsb2NrLmNsZWFyVGltZW91dCh0aGlzLmRlbGF5ZWRFdmVudHNNYXBba2V5XSk7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogbWFpbGJveC5yZXNldFxuICAgIHRoaXMubWFpbGJveC5jbGVhcigpO1xuICAgIC8vIFRPRE86IGFmdGVyIGBzdG9wYCB3ZSBtdXN0IHByZXBhcmUgb3Vyc2VsdmVzIGZvciByZWNlaXZpbmcgZXZlbnRzIGFnYWluXG4gICAgLy8gZXZlbnRzIHNlbnQgKmFmdGVyKiBzdG9wIHNpZ25hbCBtdXN0IGJlIHF1ZXVlZFxuICAgIC8vIGl0IHNlZW1zIGxpa2UgdGhpcyBzaG91bGQgYmUgdGhlIGNvbW1vbiBiZWhhdmlvciBmb3IgYWxsIG9mIG91ciBjb25zdW1lcnNcbiAgICAvLyBzbyBwZXJoYXBzIHRoaXMgc2hvdWxkIGJlIHVuaWZpZWQgc29tZWhvdyBmb3IgYWxsIG9mIHRoZW1cbiAgICB0aGlzLm1haWxib3ggPSBuZXcgTWFpbGJveCh0aGlzLl9wcm9jZXNzLmJpbmQodGhpcykpO1xuICAgIHRoaXMuc3RhdHVzID0gQWN0b3JTdGF0dXMuU3RvcHBlZDtcbiAgICB0aGlzLnN5c3RlbS5fdW5yZWdpc3Rlcih0aGlzKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBAaW50ZXJuYWxcbiAgICovXG4gIF9zZW5kKGV2ZW50KSB7XG4gICAgaWYgKHRoaXMuc3RhdHVzID09PSBBY3RvclN0YXR1cy5TdG9wcGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMubWFpbGJveC5lbnF1ZXVlKGV2ZW50KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kcyBhbiBldmVudCB0byB0aGUgcnVubmluZyBBY3RvciB0byB0cmlnZ2VyIGEgdHJhbnNpdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCB0byBzZW5kXG4gICAqL1xuICBzZW5kKGV2ZW50KSB7XG4gICAgdGhpcy5zeXN0ZW0uX3JlbGF5KHVuZGVmaW5lZCwgdGhpcywgZXZlbnQpO1xuICB9XG5cbiAgLy8gVE9ETzogbWFrZSBwcml2YXRlIChhbmQgZmlndXJlIG91dCBhIHdheSB0byBkbyB0aGlzIHdpdGhpbiB0aGUgbWFjaGluZSlcbiAgZGVsYXlTZW5kKHtcbiAgICBldmVudCxcbiAgICBpZCxcbiAgICBkZWxheSxcbiAgICB0b1xuICB9KSB7XG4gICAgY29uc3QgdGltZXJJZCA9IHRoaXMuY2xvY2suc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnN5c3RlbS5fcmVsYXkodGhpcywgdG8gPz8gdGhpcywgZXZlbnQpO1xuICAgIH0sIGRlbGF5KTtcblxuICAgIC8vIFRPRE86IGNvbnNpZGVyIHRoZSByZWh5ZHJhdGlvbiBzdG9yeSBoZXJlXG4gICAgaWYgKGlkKSB7XG4gICAgICB0aGlzLmRlbGF5ZWRFdmVudHNNYXBbaWRdID0gdGltZXJJZDtcbiAgICB9XG4gIH1cblxuICAvLyBUT0RPOiBtYWtlIHByaXZhdGUgKGFuZCBmaWd1cmUgb3V0IGEgd2F5IHRvIGRvIHRoaXMgd2l0aGluIHRoZSBtYWNoaW5lKVxuICBjYW5jZWwoc2VuZElkKSB7XG4gICAgdGhpcy5jbG9jay5jbGVhclRpbWVvdXQodGhpcy5kZWxheWVkRXZlbnRzTWFwW3NlbmRJZF0pO1xuICAgIGRlbGV0ZSB0aGlzLmRlbGF5ZWRFdmVudHNNYXBbc2VuZElkXTtcbiAgfVxuICBhdHRhY2hEZXZUb29scygpIHtcbiAgICBjb25zdCB7XG4gICAgICBkZXZUb29sc1xuICAgIH0gPSB0aGlzLm9wdGlvbnM7XG4gICAgaWYgKGRldlRvb2xzKSB7XG4gICAgICBjb25zdCByZXNvbHZlZERldlRvb2xzQWRhcHRlciA9IHR5cGVvZiBkZXZUb29scyA9PT0gJ2Z1bmN0aW9uJyA/IGRldlRvb2xzIDogZGV2VG9vbHNBZGFwdGVyO1xuICAgICAgcmVzb2x2ZWREZXZUb29sc0FkYXB0ZXIodGhpcyk7XG4gICAgfVxuICB9XG4gIHRvSlNPTigpIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHRoaXMuaWRcbiAgICB9O1xuICB9XG4gIGdldFBlcnNpc3RlZFN0YXRlKCkge1xuICAgIHJldHVybiB0aGlzLmxvZ2ljLmdldFBlcnNpc3RlZFN0YXRlPy4odGhpcy5fc3RhdGUpO1xuICB9XG4gIFtzeW1ib2xPYnNlcnZhYmxlXSgpIHtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuICBnZXRTbmFwc2hvdCgpIHtcbiAgICByZXR1cm4gdGhpcy5fc3RhdGU7XG4gIH1cbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBY3RvclJlZmAgaW5zdGFuY2UgZm9yIHRoZSBnaXZlbiBtYWNoaW5lIHdpdGggdGhlIHByb3ZpZGVkIG9wdGlvbnMsIGlmIGFueS5cbiAqXG4gKiBAcGFyYW0gbWFjaGluZSBUaGUgbWFjaGluZSB0byBjcmVhdGUgYW4gYWN0b3IgZnJvbVxuICogQHBhcmFtIG9wdGlvbnMgYEFjdG9yUmVmYCBvcHRpb25zXG4gKi9cblxuZnVuY3Rpb24gY3JlYXRlQWN0b3IobG9naWMsIG9wdGlvbnMpIHtcbiAgY29uc3QgaW50ZXJwcmV0ZXIgPSBuZXcgQWN0b3IobG9naWMsIG9wdGlvbnMpO1xuICByZXR1cm4gaW50ZXJwcmV0ZXI7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBJbnRlcnByZXRlciBpbnN0YW5jZSBmb3IgdGhlIGdpdmVuIG1hY2hpbmUgd2l0aCB0aGUgcHJvdmlkZWQgb3B0aW9ucywgaWYgYW55LlxuICpcbiAqIEBkZXByZWNhdGVkIFVzZSBgY3JlYXRlQWN0b3JgIGluc3RlYWRcbiAqL1xuY29uc3QgaW50ZXJwcmV0ID0gY3JlYXRlQWN0b3I7XG5cbi8qKlxuICogQGRlcHJlY2F0ZWQgVXNlIGBBY3RvcmAgaW5zdGVhZC5cbiAqL1xuXG5leHBvcnQgeyBBY3RvciBhcyBBLCBJbnRlcnByZXRlclN0YXR1cyBhcyBJLCBOVUxMX0VWRU5UIGFzIE4sIFNUQVRFX0RFTElNSVRFUiBhcyBTLCBXSUxEQ0FSRCBhcyBXLCBYU1RBVEVfSU5JVCBhcyBYLCB0b1RyYW5zaXRpb25Db25maWdBcnJheSBhcyBhLCBjcmVhdGVJbml0RXZlbnQgYXMgYiwgY3JlYXRlSW52b2tlSWQgYXMgYywgY3JlYXRlQWN0b3IgYXMgZCwgbWF0Y2hlc1N0YXRlIGFzIGUsIEFjdG9yU3RhdHVzIGFzIGYsIGludGVycHJldCBhcyBnLCB0b09ic2VydmVyIGFzIGgsIGlzRXJyb3JBY3RvckV2ZW50IGFzIGksIFhTVEFURV9TVE9QIGFzIGosIGNyZWF0ZUVycm9yQWN0b3JFdmVudCBhcyBrLCB0b1N0YXRlVmFsdWUgYXMgbCwgbWFwVmFsdWVzIGFzIG0sIFNUQVRFX0lERU5USUZJRVIgYXMgbiwgbm9ybWFsaXplVGFyZ2V0IGFzIG8sIHBhdGhUb1N0YXRlVmFsdWUgYXMgcCwgdG9TdGF0ZVBhdGggYXMgcSwgcmVzb2x2ZVJlZmVyZW5jZWRBY3RvciBhcyByLCBjcmVhdGVEb25lU3RhdGVFdmVudCBhcyBzLCB0b0FycmF5IGFzIHQsIHJlc29sdmVPdXRwdXQgYXMgdSwgaXNBcnJheSBhcyB2LCBjcmVhdGVBZnRlckV2ZW50IGFzIHcsIGZsYXR0ZW4gYXMgeCwgWFNUQVRFX0VSUk9SIGFzIHkgfTtcbiIsImltcG9ydCB7IHIgYXMgcmVzb2x2ZVJlZmVyZW5jZWRBY3RvciwgZCBhcyBjcmVhdGVBY3RvciwgZiBhcyBBY3RvclN0YXR1cywgayBhcyBjcmVhdGVFcnJvckFjdG9yRXZlbnQsIGwgYXMgdG9TdGF0ZVZhbHVlLCBuIGFzIFNUQVRFX0lERU5USUZJRVIsIG8gYXMgbm9ybWFsaXplVGFyZ2V0LCB0IGFzIHRvQXJyYXksIE4gYXMgTlVMTF9FVkVOVCwgYSBhcyB0b1RyYW5zaXRpb25Db25maWdBcnJheSwgUyBhcyBTVEFURV9ERUxJTUlURVIsIHEgYXMgdG9TdGF0ZVBhdGgsIHMgYXMgY3JlYXRlRG9uZVN0YXRlRXZlbnQsIHUgYXMgcmVzb2x2ZU91dHB1dCwgaiBhcyBYU1RBVEVfU1RPUCwgWCBhcyBYU1RBVEVfSU5JVCwgVyBhcyBXSUxEQ0FSRCwgdiBhcyBpc0FycmF5LCB3IGFzIGNyZWF0ZUFmdGVyRXZlbnQsIHggYXMgZmxhdHRlbiwgZSBhcyBtYXRjaGVzU3RhdGUgfSBmcm9tICcuL2ludGVycHJldGVyLTAzNzM3ODEwLmVzbS5qcyc7XG5cbmNvbnN0IGNhY2hlID0gbmV3IFdlYWtNYXAoKTtcbmZ1bmN0aW9uIG1lbW8ob2JqZWN0LCBrZXksIGZuKSB7XG4gIGxldCBtZW1vaXplZERhdGEgPSBjYWNoZS5nZXQob2JqZWN0KTtcbiAgaWYgKCFtZW1vaXplZERhdGEpIHtcbiAgICBtZW1vaXplZERhdGEgPSB7XG4gICAgICBba2V5XTogZm4oKVxuICAgIH07XG4gICAgY2FjaGUuc2V0KG9iamVjdCwgbWVtb2l6ZWREYXRhKTtcbiAgfSBlbHNlIGlmICghKGtleSBpbiBtZW1vaXplZERhdGEpKSB7XG4gICAgbWVtb2l6ZWREYXRhW2tleV0gPSBmbigpO1xuICB9XG4gIHJldHVybiBtZW1vaXplZERhdGFba2V5XTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUNhbmNlbChfLCBzdGF0ZSwgYWN0aW9uQXJncywge1xuICBzZW5kSWRcbn0pIHtcbiAgY29uc3QgcmVzb2x2ZWRTZW5kSWQgPSB0eXBlb2Ygc2VuZElkID09PSAnZnVuY3Rpb24nID8gc2VuZElkKGFjdGlvbkFyZ3MpIDogc2VuZElkO1xuICByZXR1cm4gW3N0YXRlLCByZXNvbHZlZFNlbmRJZF07XG59XG5mdW5jdGlvbiBleGVjdXRlQ2FuY2VsKGFjdG9yQ29udGV4dCwgcmVzb2x2ZWRTZW5kSWQpIHtcbiAgYWN0b3JDb250ZXh0LnNlbGYuY2FuY2VsKHJlc29sdmVkU2VuZElkKTtcbn1cbi8qKlxuICogQ2FuY2VscyBhbiBpbi1mbGlnaHQgYHNlbmQoLi4uKWAgYWN0aW9uLiBBIGNhbmNlbGVkIHNlbnQgYWN0aW9uIHdpbGwgbm90XG4gKiBiZSBleGVjdXRlZCwgbm9yIHdpbGwgaXRzIGV2ZW50IGJlIHNlbnQsIHVubGVzcyBpdCBoYXMgYWxyZWFkeSBiZWVuIHNlbnRcbiAqIChlLmcuLCBpZiBgY2FuY2VsKC4uLilgIGlzIGNhbGxlZCBhZnRlciB0aGUgYHNlbmQoLi4uKWAgYWN0aW9uJ3MgYGRlbGF5YCkuXG4gKlxuICogQHBhcmFtIHNlbmRJZCBUaGUgYGlkYCBvZiB0aGUgYHNlbmQoLi4uKWAgYWN0aW9uIHRvIGNhbmNlbC5cbiAqL1xuZnVuY3Rpb24gY2FuY2VsKHNlbmRJZCkge1xuICBmdW5jdGlvbiBjYW5jZWwoXykge1xuICB9XG4gIGNhbmNlbC50eXBlID0gJ3hzdGF0ZS5jYW5jZWwnO1xuICBjYW5jZWwuc2VuZElkID0gc2VuZElkO1xuICBjYW5jZWwucmVzb2x2ZSA9IHJlc29sdmVDYW5jZWw7XG4gIGNhbmNlbC5leGVjdXRlID0gZXhlY3V0ZUNhbmNlbDtcbiAgcmV0dXJuIGNhbmNlbDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUludm9rZShhY3RvckNvbnRleHQsIHN0YXRlLCBhY3Rpb25BcmdzLCB7XG4gIGlkLFxuICBzeXN0ZW1JZCxcbiAgc3JjLFxuICBpbnB1dCxcbiAgc3luY1NuYXBzaG90XG59KSB7XG4gIGNvbnN0IHJlZmVyZW5jZWQgPSByZXNvbHZlUmVmZXJlbmNlZEFjdG9yKHN0YXRlLm1hY2hpbmUuaW1wbGVtZW50YXRpb25zLmFjdG9yc1tzcmNdKTtcbiAgbGV0IGFjdG9yUmVmO1xuICBpZiAocmVmZXJlbmNlZCkge1xuICAgIC8vIFRPRE86IGlubGluZSBgaW5wdXQ6IHVuZGVmaW5lZGAgc2hvdWxkIHdpbiBvdmVyIHRoZSByZWZlcmVuY2VkIG9uZVxuICAgIGNvbnN0IGNvbmZpZ3VyZWRJbnB1dCA9IGlucHV0IHx8IHJlZmVyZW5jZWQuaW5wdXQ7XG4gICAgYWN0b3JSZWYgPSBjcmVhdGVBY3RvcihyZWZlcmVuY2VkLnNyYywge1xuICAgICAgaWQsXG4gICAgICBzcmMsXG4gICAgICBwYXJlbnQ6IGFjdG9yQ29udGV4dD8uc2VsZixcbiAgICAgIHN5c3RlbUlkLFxuICAgICAgaW5wdXQ6IHR5cGVvZiBjb25maWd1cmVkSW5wdXQgPT09ICdmdW5jdGlvbicgPyBjb25maWd1cmVkSW5wdXQoe1xuICAgICAgICBjb250ZXh0OiBzdGF0ZS5jb250ZXh0LFxuICAgICAgICBldmVudDogYWN0aW9uQXJncy5ldmVudCxcbiAgICAgICAgc2VsZjogYWN0b3JDb250ZXh0Py5zZWxmXG4gICAgICB9KSA6IGNvbmZpZ3VyZWRJbnB1dFxuICAgIH0pO1xuICAgIGlmIChzeW5jU25hcHNob3QpIHtcbiAgICAgIGFjdG9yUmVmLnN1YnNjcmliZSh7XG4gICAgICAgIG5leHQ6IHNuYXBzaG90ID0+IHtcbiAgICAgICAgICBpZiAoc25hcHNob3Quc3RhdHVzID09PSAnYWN0aXZlJykge1xuICAgICAgICAgICAgYWN0b3JDb250ZXh0LnNlbGYuc2VuZCh7XG4gICAgICAgICAgICAgIHR5cGU6IGB4c3RhdGUuc25hcHNob3QuJHtpZH1gLFxuICAgICAgICAgICAgICBzbmFwc2hvdFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBlcnJvcjogKCkgPT4ge1xuICAgICAgICAgIC8qIFRPRE8gKi9cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBbY2xvbmVTdGF0ZShzdGF0ZSwge1xuICAgIGNoaWxkcmVuOiB7XG4gICAgICAuLi5zdGF0ZS5jaGlsZHJlbixcbiAgICAgIFtpZF06IGFjdG9yUmVmXG4gICAgfVxuICB9KSwge1xuICAgIGlkLFxuICAgIGFjdG9yUmVmXG4gIH1dO1xufVxuZnVuY3Rpb24gZXhlY3V0ZUludm9rZShhY3RvckNvbnRleHQsIHtcbiAgaWQsXG4gIGFjdG9yUmVmXG59KSB7XG4gIGlmICghYWN0b3JSZWYpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgYWN0b3JDb250ZXh0LmRlZmVyKCgpID0+IHtcbiAgICBpZiAoYWN0b3JSZWYuc3RhdHVzID09PSBBY3RvclN0YXR1cy5TdG9wcGVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhY3RvclJlZi5zdGFydD8uKCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBhY3RvckNvbnRleHQuc2VsZi5zZW5kKGNyZWF0ZUVycm9yQWN0b3JFdmVudChpZCwgZXJyKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9KTtcbn1cblxuLy8gd2UgZG9uJ3QgZXhwb3J0IHRoaXMgc2luY2UgaXQncyBhbiBpbnRlcm5hbCBhY3Rpb24gdGhhdCBpcyBub3QgbWVhbnQgdG8gYmUgdXNlZCBpbiB0aGUgdXNlcidzIGNvZGVcblxuZnVuY3Rpb24gaW52b2tlKHtcbiAgaWQsXG4gIHN5c3RlbUlkLFxuICBzcmMsXG4gIGlucHV0LFxuICBvblNuYXBzaG90XG59KSB7XG4gIGZ1bmN0aW9uIGludm9rZShfKSB7XG4gIH1cbiAgaW52b2tlLnR5cGUgPSAneHN0YXRlLmludm9rZSc7XG4gIGludm9rZS5pZCA9IGlkO1xuICBpbnZva2Uuc3lzdGVtSWQgPSBzeXN0ZW1JZDtcbiAgaW52b2tlLnNyYyA9IHNyYztcbiAgaW52b2tlLmlucHV0ID0gaW5wdXQ7XG4gIGludm9rZS5zeW5jU25hcHNob3QgPSAhIW9uU25hcHNob3Q7XG4gIGludm9rZS5yZXNvbHZlID0gcmVzb2x2ZUludm9rZTtcbiAgaW52b2tlLmV4ZWN1dGUgPSBleGVjdXRlSW52b2tlO1xuICByZXR1cm4gaW52b2tlO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlU3RvcChfLCBzdGF0ZSwgYXJncywge1xuICBhY3RvclJlZlxufSkge1xuICBjb25zdCBhY3RvclJlZk9yU3RyaW5nID0gdHlwZW9mIGFjdG9yUmVmID09PSAnZnVuY3Rpb24nID8gYWN0b3JSZWYoYXJncykgOiBhY3RvclJlZjtcbiAgY29uc3QgcmVzb2x2ZWRBY3RvclJlZiA9IHR5cGVvZiBhY3RvclJlZk9yU3RyaW5nID09PSAnc3RyaW5nJyA/IHN0YXRlLmNoaWxkcmVuW2FjdG9yUmVmT3JTdHJpbmddIDogYWN0b3JSZWZPclN0cmluZztcbiAgbGV0IGNoaWxkcmVuID0gc3RhdGUuY2hpbGRyZW47XG4gIGlmIChyZXNvbHZlZEFjdG9yUmVmKSB7XG4gICAgY2hpbGRyZW4gPSB7XG4gICAgICAuLi5jaGlsZHJlblxuICAgIH07XG4gICAgZGVsZXRlIGNoaWxkcmVuW3Jlc29sdmVkQWN0b3JSZWYuaWRdO1xuICB9XG4gIHJldHVybiBbY2xvbmVTdGF0ZShzdGF0ZSwge1xuICAgIGNoaWxkcmVuXG4gIH0pLCByZXNvbHZlZEFjdG9yUmVmXTtcbn1cbmZ1bmN0aW9uIGV4ZWN1dGVTdG9wKGFjdG9yQ29udGV4dCwgYWN0b3JSZWYpIHtcbiAgaWYgKCFhY3RvclJlZikge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoYWN0b3JSZWYuc3RhdHVzICE9PSBBY3RvclN0YXR1cy5SdW5uaW5nKSB7XG4gICAgYWN0b3JDb250ZXh0LnN0b3BDaGlsZChhY3RvclJlZik7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIFRPRE86IHJlY2hlY2sgd2h5IHRoaXMgb25lIGhhcyB0byBiZSBkZWZlcnJlZFxuICBhY3RvckNvbnRleHQuZGVmZXIoKCkgPT4ge1xuICAgIGFjdG9yQ29udGV4dC5zdG9wQ2hpbGQoYWN0b3JSZWYpO1xuICB9KTtcbn1cbi8qKlxuICogU3RvcHMgYW4gYWN0b3IuXG4gKlxuICogQHBhcmFtIGFjdG9yUmVmIFRoZSBhY3RvciB0byBzdG9wLlxuICovXG5mdW5jdGlvbiBzdG9wKGFjdG9yUmVmKSB7XG4gIGZ1bmN0aW9uIHN0b3AoXykge1xuICB9XG4gIHN0b3AudHlwZSA9ICd4c3RhdGUuc3RvcCc7XG4gIHN0b3AuYWN0b3JSZWYgPSBhY3RvclJlZjtcbiAgc3RvcC5yZXNvbHZlID0gcmVzb2x2ZVN0b3A7XG4gIHN0b3AuZXhlY3V0ZSA9IGV4ZWN1dGVTdG9wO1xuICByZXR1cm4gc3RvcDtcbn1cblxuZnVuY3Rpb24gY2hlY2tTdGF0ZUluKHN0YXRlLCBfLCB7XG4gIHN0YXRlVmFsdWVcbn0pIHtcbiAgaWYgKHR5cGVvZiBzdGF0ZVZhbHVlID09PSAnc3RyaW5nJyAmJiBpc1N0YXRlSWQoc3RhdGVWYWx1ZSkpIHtcbiAgICByZXR1cm4gc3RhdGUuY29uZmlndXJhdGlvbi5zb21lKHNuID0+IHNuLmlkID09PSBzdGF0ZVZhbHVlLnNsaWNlKDEpKTtcbiAgfVxuICByZXR1cm4gc3RhdGUubWF0Y2hlcyhzdGF0ZVZhbHVlKTtcbn1cbmZ1bmN0aW9uIHN0YXRlSW4oc3RhdGVWYWx1ZSkge1xuICBmdW5jdGlvbiBzdGF0ZUluKF8pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgc3RhdGVJbi5jaGVjayA9IGNoZWNrU3RhdGVJbjtcbiAgc3RhdGVJbi5zdGF0ZVZhbHVlID0gc3RhdGVWYWx1ZTtcbiAgcmV0dXJuIHN0YXRlSW47XG59XG5mdW5jdGlvbiBjaGVja05vdChzdGF0ZSwge1xuICBjb250ZXh0LFxuICBldmVudFxufSwge1xuICBndWFyZHNcbn0pIHtcbiAgcmV0dXJuICFldmFsdWF0ZUd1YXJkKGd1YXJkc1swXSwgY29udGV4dCwgZXZlbnQsIHN0YXRlKTtcbn1cbmZ1bmN0aW9uIG5vdChndWFyZCkge1xuICBmdW5jdGlvbiBub3QoXykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBub3QuY2hlY2sgPSBjaGVja05vdDtcbiAgbm90Lmd1YXJkcyA9IFtndWFyZF07XG4gIHJldHVybiBub3Q7XG59XG5mdW5jdGlvbiBjaGVja0FuZChzdGF0ZSwge1xuICBjb250ZXh0LFxuICBldmVudFxufSwge1xuICBndWFyZHNcbn0pIHtcbiAgcmV0dXJuIGd1YXJkcy5ldmVyeShndWFyZCA9PiBldmFsdWF0ZUd1YXJkKGd1YXJkLCBjb250ZXh0LCBldmVudCwgc3RhdGUpKTtcbn1cbmZ1bmN0aW9uIGFuZChndWFyZHMpIHtcbiAgZnVuY3Rpb24gYW5kKF8pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgYW5kLmNoZWNrID0gY2hlY2tBbmQ7XG4gIGFuZC5ndWFyZHMgPSBndWFyZHM7XG4gIHJldHVybiBhbmQ7XG59XG5mdW5jdGlvbiBjaGVja09yKHN0YXRlLCB7XG4gIGNvbnRleHQsXG4gIGV2ZW50XG59LCB7XG4gIGd1YXJkc1xufSkge1xuICByZXR1cm4gZ3VhcmRzLnNvbWUoZ3VhcmQgPT4gZXZhbHVhdGVHdWFyZChndWFyZCwgY29udGV4dCwgZXZlbnQsIHN0YXRlKSk7XG59XG5mdW5jdGlvbiBvcihndWFyZHMpIHtcbiAgZnVuY3Rpb24gb3IoXykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBvci5jaGVjayA9IGNoZWNrT3I7XG4gIG9yLmd1YXJkcyA9IGd1YXJkcztcbiAgcmV0dXJuIG9yO1xufVxuXG4vLyBUT0RPOiB0aHJvdyBvbiBjeWNsZXMgKGRlcHRoIGNoZWNrIHNob3VsZCBiZSBlbm91Z2gpXG5mdW5jdGlvbiBldmFsdWF0ZUd1YXJkKGd1YXJkLCBjb250ZXh0LCBldmVudCwgc3RhdGUpIHtcbiAgY29uc3Qge1xuICAgIG1hY2hpbmVcbiAgfSA9IHN0YXRlO1xuICBjb25zdCBpc0lubGluZSA9IHR5cGVvZiBndWFyZCA9PT0gJ2Z1bmN0aW9uJztcbiAgY29uc3QgcmVzb2x2ZWQgPSBpc0lubGluZSA/IGd1YXJkIDogbWFjaGluZS5pbXBsZW1lbnRhdGlvbnMuZ3VhcmRzW3R5cGVvZiBndWFyZCA9PT0gJ3N0cmluZycgPyBndWFyZCA6IGd1YXJkLnR5cGVdO1xuICBpZiAoIWlzSW5saW5lICYmICFyZXNvbHZlZCkge1xuICAgIHRocm93IG5ldyBFcnJvcihgR3VhcmQgJyR7dHlwZW9mIGd1YXJkID09PSAnc3RyaW5nJyA/IGd1YXJkIDogZ3VhcmQudHlwZX0nIGlzIG5vdCBpbXBsZW1lbnRlZC4nLmApO1xuICB9XG4gIGlmICh0eXBlb2YgcmVzb2x2ZWQgIT09ICdmdW5jdGlvbicpIHtcbiAgICByZXR1cm4gZXZhbHVhdGVHdWFyZChyZXNvbHZlZCwgY29udGV4dCwgZXZlbnQsIHN0YXRlKTtcbiAgfVxuICBjb25zdCBndWFyZEFyZ3MgPSB7XG4gICAgY29udGV4dCxcbiAgICBldmVudCxcbiAgICBndWFyZDogaXNJbmxpbmUgPyB1bmRlZmluZWQgOiB0eXBlb2YgZ3VhcmQgPT09ICdzdHJpbmcnID8ge1xuICAgICAgdHlwZTogZ3VhcmRcbiAgICB9IDogdHlwZW9mIGd1YXJkLnBhcmFtcyA9PT0gJ2Z1bmN0aW9uJyA/IHtcbiAgICAgIHR5cGU6IGd1YXJkLnR5cGUsXG4gICAgICBwYXJhbXM6IGd1YXJkLnBhcmFtcyh7XG4gICAgICAgIGNvbnRleHQsXG4gICAgICAgIGV2ZW50XG4gICAgICB9KVxuICAgIH0gOiBndWFyZFxuICB9O1xuICBpZiAoISgnY2hlY2snIGluIHJlc29sdmVkKSkge1xuICAgIC8vIHRoZSBleGlzdGluZyB0eXBlIG9mIGAuZ3VhcmRzYCBhc3N1bWVzIG5vbi1udWxsYWJsZSBgVEV4cHJlc3Npb25HdWFyZGBcbiAgICAvLyBpbmxpbmUgZ3VhcmRzIGV4cGVjdCBgVEV4cHJlc3Npb25HdWFyZGAgdG8gYmUgc2V0IHRvIGB1bmRlZmluZWRgXG4gICAgLy8gaXQncyBmaW5lIHRvIGNhc3QgdGhpcyBoZXJlLCBvdXIgbG9naWMgbWFrZXMgc3VyZSB0aGF0IHdlIGNhbGwgdGhvc2UgMiBcInZhcmlhbnRzXCIgY29ycmVjdGx5XG4gICAgcmV0dXJuIHJlc29sdmVkKGd1YXJkQXJncyk7XG4gIH1cbiAgY29uc3QgYnVpbHRpbkd1YXJkID0gcmVzb2x2ZWQ7XG4gIHJldHVybiBidWlsdGluR3VhcmQuY2hlY2soc3RhdGUsIGd1YXJkQXJncywgcmVzb2x2ZWQgLy8gdGhpcyBob2xkcyBhbGwgcGFyYW1zXG4gICk7XG59XG5cbmZ1bmN0aW9uIGdldE91dHB1dChjb25maWd1cmF0aW9uLCBjb250ZXh0LCBldmVudCwgc2VsZikge1xuICBjb25zdCB7XG4gICAgbWFjaGluZVxuICB9ID0gY29uZmlndXJhdGlvblswXTtcbiAgY29uc3Qge1xuICAgIHJvb3RcbiAgfSA9IG1hY2hpbmU7XG4gIGlmICghcm9vdC5vdXRwdXQpIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG4gIGNvbnN0IGZpbmFsQ2hpbGRTdGF0ZU5vZGUgPSBjb25maWd1cmF0aW9uLmZpbmQoc3RhdGVOb2RlID0+IHN0YXRlTm9kZS50eXBlID09PSAnZmluYWwnICYmIHN0YXRlTm9kZS5wYXJlbnQgPT09IG1hY2hpbmUucm9vdCk7XG4gIGNvbnN0IGRvbmVTdGF0ZUV2ZW50ID0gY3JlYXRlRG9uZVN0YXRlRXZlbnQoZmluYWxDaGlsZFN0YXRlTm9kZS5pZCwgZmluYWxDaGlsZFN0YXRlTm9kZS5vdXRwdXQgPyByZXNvbHZlT3V0cHV0KGZpbmFsQ2hpbGRTdGF0ZU5vZGUub3V0cHV0LCBjb250ZXh0LCBldmVudCwgc2VsZikgOiB1bmRlZmluZWQpO1xuICByZXR1cm4gcmVzb2x2ZU91dHB1dChyb290Lm91dHB1dCwgY29udGV4dCwgZG9uZVN0YXRlRXZlbnQsIHNlbGYpO1xufVxuY29uc3QgaXNBdG9taWNTdGF0ZU5vZGUgPSBzdGF0ZU5vZGUgPT4gc3RhdGVOb2RlLnR5cGUgPT09ICdhdG9taWMnIHx8IHN0YXRlTm9kZS50eXBlID09PSAnZmluYWwnO1xuZnVuY3Rpb24gZ2V0Q2hpbGRyZW4oc3RhdGVOb2RlKSB7XG4gIHJldHVybiBPYmplY3QudmFsdWVzKHN0YXRlTm9kZS5zdGF0ZXMpLmZpbHRlcihzbiA9PiBzbi50eXBlICE9PSAnaGlzdG9yeScpO1xufVxuZnVuY3Rpb24gZ2V0UHJvcGVyQW5jZXN0b3JzKHN0YXRlTm9kZSwgdG9TdGF0ZU5vZGUpIHtcbiAgY29uc3QgYW5jZXN0b3JzID0gW107XG5cbiAgLy8gYWRkIGFsbCBhbmNlc3RvcnNcbiAgbGV0IG0gPSBzdGF0ZU5vZGUucGFyZW50O1xuICB3aGlsZSAobSAmJiBtICE9PSB0b1N0YXRlTm9kZSkge1xuICAgIGFuY2VzdG9ycy5wdXNoKG0pO1xuICAgIG0gPSBtLnBhcmVudDtcbiAgfVxuICByZXR1cm4gYW5jZXN0b3JzO1xufVxuZnVuY3Rpb24gZ2V0Q29uZmlndXJhdGlvbihzdGF0ZU5vZGVzKSB7XG4gIGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBuZXcgU2V0KHN0YXRlTm9kZXMpO1xuICBjb25zdCBjb25maWd1cmF0aW9uU2V0ID0gbmV3IFNldChzdGF0ZU5vZGVzKTtcbiAgY29uc3QgYWRqTGlzdCA9IGdldEFkakxpc3QoY29uZmlndXJhdGlvblNldCk7XG5cbiAgLy8gYWRkIGRlc2NlbmRhbnRzXG4gIGZvciAoY29uc3QgcyBvZiBjb25maWd1cmF0aW9uKSB7XG4gICAgLy8gaWYgcHJldmlvdXNseSBhY3RpdmUsIGFkZCBleGlzdGluZyBjaGlsZCBub2Rlc1xuICAgIGlmIChzLnR5cGUgPT09ICdjb21wb3VuZCcgJiYgKCFhZGpMaXN0LmdldChzKSB8fCAhYWRqTGlzdC5nZXQocykubGVuZ3RoKSkge1xuICAgICAgZ2V0SW5pdGlhbFN0YXRlTm9kZXMocykuZm9yRWFjaChzbiA9PiBjb25maWd1cmF0aW9uU2V0LmFkZChzbikpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAocy50eXBlID09PSAncGFyYWxsZWwnKSB7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgZ2V0Q2hpbGRyZW4ocykpIHtcbiAgICAgICAgICBpZiAoY2hpbGQudHlwZSA9PT0gJ2hpc3RvcnknKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFjb25maWd1cmF0aW9uU2V0LmhhcyhjaGlsZCkpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgaW5pdGlhbFN0YXRlTm9kZSBvZiBnZXRJbml0aWFsU3RhdGVOb2RlcyhjaGlsZCkpIHtcbiAgICAgICAgICAgICAgY29uZmlndXJhdGlvblNldC5hZGQoaW5pdGlhbFN0YXRlTm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gYWRkIGFsbCBhbmNlc3RvcnNcbiAgZm9yIChjb25zdCBzIG9mIGNvbmZpZ3VyYXRpb25TZXQpIHtcbiAgICBsZXQgbSA9IHMucGFyZW50O1xuICAgIHdoaWxlIChtKSB7XG4gICAgICBjb25maWd1cmF0aW9uU2V0LmFkZChtKTtcbiAgICAgIG0gPSBtLnBhcmVudDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbmZpZ3VyYXRpb25TZXQ7XG59XG5mdW5jdGlvbiBnZXRWYWx1ZUZyb21BZGooYmFzZU5vZGUsIGFkakxpc3QpIHtcbiAgY29uc3QgY2hpbGRTdGF0ZU5vZGVzID0gYWRqTGlzdC5nZXQoYmFzZU5vZGUpO1xuICBpZiAoIWNoaWxkU3RhdGVOb2Rlcykge1xuICAgIHJldHVybiB7fTsgLy8gdG9kbzogZml4P1xuICB9XG5cbiAgaWYgKGJhc2VOb2RlLnR5cGUgPT09ICdjb21wb3VuZCcpIHtcbiAgICBjb25zdCBjaGlsZFN0YXRlTm9kZSA9IGNoaWxkU3RhdGVOb2Rlc1swXTtcbiAgICBpZiAoY2hpbGRTdGF0ZU5vZGUpIHtcbiAgICAgIGlmIChpc0F0b21pY1N0YXRlTm9kZShjaGlsZFN0YXRlTm9kZSkpIHtcbiAgICAgICAgcmV0dXJuIGNoaWxkU3RhdGVOb2RlLmtleTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHt9O1xuICAgIH1cbiAgfVxuICBjb25zdCBzdGF0ZVZhbHVlID0ge307XG4gIGZvciAoY29uc3QgY2hpbGRTdGF0ZU5vZGUgb2YgY2hpbGRTdGF0ZU5vZGVzKSB7XG4gICAgc3RhdGVWYWx1ZVtjaGlsZFN0YXRlTm9kZS5rZXldID0gZ2V0VmFsdWVGcm9tQWRqKGNoaWxkU3RhdGVOb2RlLCBhZGpMaXN0KTtcbiAgfVxuICByZXR1cm4gc3RhdGVWYWx1ZTtcbn1cbmZ1bmN0aW9uIGdldEFkakxpc3QoY29uZmlndXJhdGlvbikge1xuICBjb25zdCBhZGpMaXN0ID0gbmV3IE1hcCgpO1xuICBmb3IgKGNvbnN0IHMgb2YgY29uZmlndXJhdGlvbikge1xuICAgIGlmICghYWRqTGlzdC5oYXMocykpIHtcbiAgICAgIGFkakxpc3Quc2V0KHMsIFtdKTtcbiAgICB9XG4gICAgaWYgKHMucGFyZW50KSB7XG4gICAgICBpZiAoIWFkakxpc3QuaGFzKHMucGFyZW50KSkge1xuICAgICAgICBhZGpMaXN0LnNldChzLnBhcmVudCwgW10pO1xuICAgICAgfVxuICAgICAgYWRqTGlzdC5nZXQocy5wYXJlbnQpLnB1c2gocyk7XG4gICAgfVxuICB9XG4gIHJldHVybiBhZGpMaXN0O1xufVxuZnVuY3Rpb24gZ2V0U3RhdGVWYWx1ZShyb290Tm9kZSwgY29uZmlndXJhdGlvbikge1xuICBjb25zdCBjb25maWcgPSBnZXRDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb24pO1xuICByZXR1cm4gZ2V0VmFsdWVGcm9tQWRqKHJvb3ROb2RlLCBnZXRBZGpMaXN0KGNvbmZpZykpO1xufVxuZnVuY3Rpb24gaXNJbkZpbmFsU3RhdGUoY29uZmlndXJhdGlvbiwgc3RhdGVOb2RlID0gY29uZmlndXJhdGlvblswXS5tYWNoaW5lLnJvb3QpIHtcbiAgaWYgKHN0YXRlTm9kZS50eXBlID09PSAnY29tcG91bmQnKSB7XG4gICAgcmV0dXJuIGdldENoaWxkcmVuKHN0YXRlTm9kZSkuc29tZShzID0+IHMudHlwZSA9PT0gJ2ZpbmFsJyAmJiBjb25maWd1cmF0aW9uLmluY2x1ZGVzKHMpKTtcbiAgfVxuICBpZiAoc3RhdGVOb2RlLnR5cGUgPT09ICdwYXJhbGxlbCcpIHtcbiAgICByZXR1cm4gZ2V0Q2hpbGRyZW4oc3RhdGVOb2RlKS5ldmVyeShzbiA9PiBpc0luRmluYWxTdGF0ZShjb25maWd1cmF0aW9uLCBzbikpO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cbmNvbnN0IGlzU3RhdGVJZCA9IHN0ciA9PiBzdHJbMF0gPT09IFNUQVRFX0lERU5USUZJRVI7XG5mdW5jdGlvbiBnZXRDYW5kaWRhdGVzKHN0YXRlTm9kZSwgcmVjZWl2ZWRFdmVudFR5cGUpIHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IHN0YXRlTm9kZS50cmFuc2l0aW9ucy5nZXQocmVjZWl2ZWRFdmVudFR5cGUpIHx8IFsuLi5zdGF0ZU5vZGUudHJhbnNpdGlvbnMua2V5cygpXS5maWx0ZXIoZGVzY3JpcHRvciA9PiB7XG4gICAgLy8gY2hlY2sgaWYgdHJhbnNpdGlvbiBpcyBhIHdpbGRjYXJkIHRyYW5zaXRpb24sXG4gICAgLy8gd2hpY2ggbWF0Y2hlcyBhbnkgbm9uLXRyYW5zaWVudCBldmVudHNcbiAgICBpZiAoZGVzY3JpcHRvciA9PT0gV0lMRENBUkQpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoIWRlc2NyaXB0b3IuZW5kc1dpdGgoJy4qJykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgcGFydGlhbEV2ZW50VG9rZW5zID0gZGVzY3JpcHRvci5zcGxpdCgnLicpO1xuICAgIGNvbnN0IGV2ZW50VG9rZW5zID0gcmVjZWl2ZWRFdmVudFR5cGUuc3BsaXQoJy4nKTtcbiAgICBmb3IgKGxldCB0b2tlbkluZGV4ID0gMDsgdG9rZW5JbmRleCA8IHBhcnRpYWxFdmVudFRva2Vucy5sZW5ndGg7IHRva2VuSW5kZXgrKykge1xuICAgICAgY29uc3QgcGFydGlhbEV2ZW50VG9rZW4gPSBwYXJ0aWFsRXZlbnRUb2tlbnNbdG9rZW5JbmRleF07XG4gICAgICBjb25zdCBldmVudFRva2VuID0gZXZlbnRUb2tlbnNbdG9rZW5JbmRleF07XG4gICAgICBpZiAocGFydGlhbEV2ZW50VG9rZW4gPT09ICcqJykge1xuICAgICAgICBjb25zdCBpc0xhc3RUb2tlbiA9IHRva2VuSW5kZXggPT09IHBhcnRpYWxFdmVudFRva2Vucy5sZW5ndGggLSAxO1xuICAgICAgICByZXR1cm4gaXNMYXN0VG9rZW47XG4gICAgICB9XG4gICAgICBpZiAocGFydGlhbEV2ZW50VG9rZW4gIT09IGV2ZW50VG9rZW4pIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSkuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCkuZmxhdE1hcChrZXkgPT4gc3RhdGVOb2RlLnRyYW5zaXRpb25zLmdldChrZXkpKTtcbiAgcmV0dXJuIGNhbmRpZGF0ZXM7XG59XG5cbi8qKlxuICogQWxsIGRlbGF5ZWQgdHJhbnNpdGlvbnMgZnJvbSB0aGUgY29uZmlnLlxuICovXG5mdW5jdGlvbiBnZXREZWxheWVkVHJhbnNpdGlvbnMoc3RhdGVOb2RlKSB7XG4gIGNvbnN0IGFmdGVyQ29uZmlnID0gc3RhdGVOb2RlLmNvbmZpZy5hZnRlcjtcbiAgaWYgKCFhZnRlckNvbmZpZykge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBjb25zdCBtdXRhdGVFbnRyeUV4aXQgPSAoZGVsYXksIGkpID0+IHtcbiAgICBjb25zdCBkZWxheVJlZiA9IHR5cGVvZiBkZWxheSA9PT0gJ2Z1bmN0aW9uJyA/IGAke3N0YXRlTm9kZS5pZH06ZGVsYXlbJHtpfV1gIDogZGVsYXk7XG4gICAgY29uc3QgYWZ0ZXJFdmVudCA9IGNyZWF0ZUFmdGVyRXZlbnQoZGVsYXlSZWYsIHN0YXRlTm9kZS5pZCk7XG4gICAgY29uc3QgZXZlbnRUeXBlID0gYWZ0ZXJFdmVudC50eXBlO1xuICAgIHN0YXRlTm9kZS5lbnRyeS5wdXNoKHJhaXNlKGFmdGVyRXZlbnQsIHtcbiAgICAgIGlkOiBldmVudFR5cGUsXG4gICAgICBkZWxheVxuICAgIH0pKTtcbiAgICBzdGF0ZU5vZGUuZXhpdC5wdXNoKGNhbmNlbChldmVudFR5cGUpKTtcbiAgICByZXR1cm4gZXZlbnRUeXBlO1xuICB9O1xuICBjb25zdCBkZWxheWVkVHJhbnNpdGlvbnMgPSBpc0FycmF5KGFmdGVyQ29uZmlnKSA/IGFmdGVyQ29uZmlnLm1hcCgodHJhbnNpdGlvbiwgaSkgPT4ge1xuICAgIGNvbnN0IGV2ZW50VHlwZSA9IG11dGF0ZUVudHJ5RXhpdCh0cmFuc2l0aW9uLmRlbGF5LCBpKTtcbiAgICByZXR1cm4ge1xuICAgICAgLi4udHJhbnNpdGlvbixcbiAgICAgIGV2ZW50OiBldmVudFR5cGVcbiAgICB9O1xuICB9KSA6IE9iamVjdC5rZXlzKGFmdGVyQ29uZmlnKS5mbGF0TWFwKChkZWxheSwgaSkgPT4ge1xuICAgIGNvbnN0IGNvbmZpZ1RyYW5zaXRpb24gPSBhZnRlckNvbmZpZ1tkZWxheV07XG4gICAgY29uc3QgcmVzb2x2ZWRUcmFuc2l0aW9uID0gdHlwZW9mIGNvbmZpZ1RyYW5zaXRpb24gPT09ICdzdHJpbmcnID8ge1xuICAgICAgdGFyZ2V0OiBjb25maWdUcmFuc2l0aW9uXG4gICAgfSA6IGNvbmZpZ1RyYW5zaXRpb247XG4gICAgY29uc3QgcmVzb2x2ZWREZWxheSA9ICFpc05hTigrZGVsYXkpID8gK2RlbGF5IDogZGVsYXk7XG4gICAgY29uc3QgZXZlbnRUeXBlID0gbXV0YXRlRW50cnlFeGl0KHJlc29sdmVkRGVsYXksIGkpO1xuICAgIHJldHVybiB0b0FycmF5KHJlc29sdmVkVHJhbnNpdGlvbikubWFwKHRyYW5zaXRpb24gPT4gKHtcbiAgICAgIC4uLnRyYW5zaXRpb24sXG4gICAgICBldmVudDogZXZlbnRUeXBlLFxuICAgICAgZGVsYXk6IHJlc29sdmVkRGVsYXlcbiAgICB9KSk7XG4gIH0pO1xuICByZXR1cm4gZGVsYXllZFRyYW5zaXRpb25zLm1hcChkZWxheWVkVHJhbnNpdGlvbiA9PiB7XG4gICAgY29uc3Qge1xuICAgICAgZGVsYXlcbiAgICB9ID0gZGVsYXllZFRyYW5zaXRpb247XG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLmZvcm1hdFRyYW5zaXRpb24oc3RhdGVOb2RlLCBkZWxheWVkVHJhbnNpdGlvbi5ldmVudCwgZGVsYXllZFRyYW5zaXRpb24pLFxuICAgICAgZGVsYXlcbiAgICB9O1xuICB9KTtcbn1cbmZ1bmN0aW9uIGZvcm1hdFRyYW5zaXRpb24oc3RhdGVOb2RlLCBkZXNjcmlwdG9yLCB0cmFuc2l0aW9uQ29uZmlnKSB7XG4gIGNvbnN0IG5vcm1hbGl6ZWRUYXJnZXQgPSBub3JtYWxpemVUYXJnZXQodHJhbnNpdGlvbkNvbmZpZy50YXJnZXQpO1xuICBjb25zdCByZWVudGVyID0gdHJhbnNpdGlvbkNvbmZpZy5yZWVudGVyID8/IGZhbHNlO1xuICBjb25zdCB0YXJnZXQgPSByZXNvbHZlVGFyZ2V0KHN0YXRlTm9kZSwgbm9ybWFsaXplZFRhcmdldCk7XG4gIGNvbnN0IHRyYW5zaXRpb24gPSB7XG4gICAgLi4udHJhbnNpdGlvbkNvbmZpZyxcbiAgICBhY3Rpb25zOiB0b0FycmF5KHRyYW5zaXRpb25Db25maWcuYWN0aW9ucyksXG4gICAgZ3VhcmQ6IHRyYW5zaXRpb25Db25maWcuZ3VhcmQsXG4gICAgdGFyZ2V0LFxuICAgIHNvdXJjZTogc3RhdGVOb2RlLFxuICAgIHJlZW50ZXIsXG4gICAgZXZlbnRUeXBlOiBkZXNjcmlwdG9yLFxuICAgIHRvSlNPTjogKCkgPT4gKHtcbiAgICAgIC4uLnRyYW5zaXRpb24sXG4gICAgICBzb3VyY2U6IGAjJHtzdGF0ZU5vZGUuaWR9YCxcbiAgICAgIHRhcmdldDogdGFyZ2V0ID8gdGFyZ2V0Lm1hcCh0ID0+IGAjJHt0LmlkfWApIDogdW5kZWZpbmVkXG4gICAgfSlcbiAgfTtcbiAgcmV0dXJuIHRyYW5zaXRpb247XG59XG5mdW5jdGlvbiBmb3JtYXRUcmFuc2l0aW9ucyhzdGF0ZU5vZGUpIHtcbiAgY29uc3QgdHJhbnNpdGlvbnMgPSBuZXcgTWFwKCk7XG4gIGlmIChzdGF0ZU5vZGUuY29uZmlnLm9uKSB7XG4gICAgZm9yIChjb25zdCBkZXNjcmlwdG9yIG9mIE9iamVjdC5rZXlzKHN0YXRlTm9kZS5jb25maWcub24pKSB7XG4gICAgICBpZiAoZGVzY3JpcHRvciA9PT0gTlVMTF9FVkVOVCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ051bGwgZXZlbnRzIChcIlwiKSBjYW5ub3QgYmUgc3BlY2lmaWVkIGFzIGEgdHJhbnNpdGlvbiBrZXkuIFVzZSBgYWx3YXlzOiB7IC4uLiB9YCBpbnN0ZWFkLicpO1xuICAgICAgfVxuICAgICAgY29uc3QgdHJhbnNpdGlvbnNDb25maWcgPSBzdGF0ZU5vZGUuY29uZmlnLm9uW2Rlc2NyaXB0b3JdO1xuICAgICAgdHJhbnNpdGlvbnMuc2V0KGRlc2NyaXB0b3IsIHRvVHJhbnNpdGlvbkNvbmZpZ0FycmF5KHRyYW5zaXRpb25zQ29uZmlnKS5tYXAodCA9PiBmb3JtYXRUcmFuc2l0aW9uKHN0YXRlTm9kZSwgZGVzY3JpcHRvciwgdCkpKTtcbiAgICB9XG4gIH1cbiAgaWYgKHN0YXRlTm9kZS5jb25maWcub25Eb25lKSB7XG4gICAgY29uc3QgZGVzY3JpcHRvciA9IGB4c3RhdGUuZG9uZS5zdGF0ZS4ke3N0YXRlTm9kZS5pZH1gO1xuICAgIHRyYW5zaXRpb25zLnNldChkZXNjcmlwdG9yLCB0b1RyYW5zaXRpb25Db25maWdBcnJheShzdGF0ZU5vZGUuY29uZmlnLm9uRG9uZSkubWFwKHQgPT4gZm9ybWF0VHJhbnNpdGlvbihzdGF0ZU5vZGUsIGRlc2NyaXB0b3IsIHQpKSk7XG4gIH1cbiAgZm9yIChjb25zdCBpbnZva2VEZWYgb2Ygc3RhdGVOb2RlLmludm9rZSkge1xuICAgIGlmIChpbnZva2VEZWYub25Eb25lKSB7XG4gICAgICBjb25zdCBkZXNjcmlwdG9yID0gYHhzdGF0ZS5kb25lLmFjdG9yLiR7aW52b2tlRGVmLmlkfWA7XG4gICAgICB0cmFuc2l0aW9ucy5zZXQoZGVzY3JpcHRvciwgdG9UcmFuc2l0aW9uQ29uZmlnQXJyYXkoaW52b2tlRGVmLm9uRG9uZSkubWFwKHQgPT4gZm9ybWF0VHJhbnNpdGlvbihzdGF0ZU5vZGUsIGRlc2NyaXB0b3IsIHQpKSk7XG4gICAgfVxuICAgIGlmIChpbnZva2VEZWYub25FcnJvcikge1xuICAgICAgY29uc3QgZGVzY3JpcHRvciA9IGB4c3RhdGUuZXJyb3IuYWN0b3IuJHtpbnZva2VEZWYuaWR9YDtcbiAgICAgIHRyYW5zaXRpb25zLnNldChkZXNjcmlwdG9yLCB0b1RyYW5zaXRpb25Db25maWdBcnJheShpbnZva2VEZWYub25FcnJvcikubWFwKHQgPT4gZm9ybWF0VHJhbnNpdGlvbihzdGF0ZU5vZGUsIGRlc2NyaXB0b3IsIHQpKSk7XG4gICAgfVxuICAgIGlmIChpbnZva2VEZWYub25TbmFwc2hvdCkge1xuICAgICAgY29uc3QgZGVzY3JpcHRvciA9IGB4c3RhdGUuc25hcHNob3QuJHtpbnZva2VEZWYuaWR9YDtcbiAgICAgIHRyYW5zaXRpb25zLnNldChkZXNjcmlwdG9yLCB0b1RyYW5zaXRpb25Db25maWdBcnJheShpbnZva2VEZWYub25TbmFwc2hvdCkubWFwKHQgPT4gZm9ybWF0VHJhbnNpdGlvbihzdGF0ZU5vZGUsIGRlc2NyaXB0b3IsIHQpKSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgZGVsYXllZFRyYW5zaXRpb24gb2Ygc3RhdGVOb2RlLmFmdGVyKSB7XG4gICAgbGV0IGV4aXN0aW5nID0gdHJhbnNpdGlvbnMuZ2V0KGRlbGF5ZWRUcmFuc2l0aW9uLmV2ZW50VHlwZSk7XG4gICAgaWYgKCFleGlzdGluZykge1xuICAgICAgZXhpc3RpbmcgPSBbXTtcbiAgICAgIHRyYW5zaXRpb25zLnNldChkZWxheWVkVHJhbnNpdGlvbi5ldmVudFR5cGUsIGV4aXN0aW5nKTtcbiAgICB9XG4gICAgZXhpc3RpbmcucHVzaChkZWxheWVkVHJhbnNpdGlvbik7XG4gIH1cbiAgcmV0dXJuIHRyYW5zaXRpb25zO1xufVxuZnVuY3Rpb24gZm9ybWF0SW5pdGlhbFRyYW5zaXRpb24oc3RhdGVOb2RlLCBfdGFyZ2V0KSB7XG4gIGlmICh0eXBlb2YgX3RhcmdldCA9PT0gJ3N0cmluZycgfHwgaXNBcnJheShfdGFyZ2V0KSkge1xuICAgIGNvbnN0IHRhcmdldHMgPSB0b0FycmF5KF90YXJnZXQpLm1hcCh0ID0+IHtcbiAgICAgIC8vIFJlc29sdmUgc3RhdGUgc3RyaW5nIGtleXMgKHdoaWNoIHJlcHJlc2VudCBjaGlsZHJlbilcbiAgICAgIC8vIHRvIHRoZWlyIHN0YXRlIG5vZGVcbiAgICAgIGNvbnN0IGRlc2NTdGF0ZU5vZGUgPSB0eXBlb2YgdCA9PT0gJ3N0cmluZycgPyBpc1N0YXRlSWQodCkgPyBzdGF0ZU5vZGUubWFjaGluZS5nZXRTdGF0ZU5vZGVCeUlkKHQpIDogc3RhdGVOb2RlLnN0YXRlc1t0XSA6IHQ7XG4gICAgICBpZiAoIWRlc2NTdGF0ZU5vZGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbml0aWFsIHN0YXRlIG5vZGUgXCIke3R9XCIgbm90IGZvdW5kIG9uIHBhcmVudCBzdGF0ZSBub2RlICMke3N0YXRlTm9kZS5pZH1gKTtcbiAgICAgIH1cbiAgICAgIGlmICghaXNEZXNjZW5kYW50KGRlc2NTdGF0ZU5vZGUsIHN0YXRlTm9kZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGluaXRpYWwgdGFyZ2V0OiBzdGF0ZSBub2RlICMke2Rlc2NTdGF0ZU5vZGUuaWR9IGlzIG5vdCBhIGRlc2NlbmRhbnQgb2YgIyR7c3RhdGVOb2RlLmlkfWApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGRlc2NTdGF0ZU5vZGU7XG4gICAgfSk7XG4gICAgY29uc3QgcmVzb2x2ZWRUYXJnZXQgPSByZXNvbHZlVGFyZ2V0KHN0YXRlTm9kZSwgdGFyZ2V0cyk7XG4gICAgY29uc3QgdHJhbnNpdGlvbiA9IHtcbiAgICAgIHNvdXJjZTogc3RhdGVOb2RlLFxuICAgICAgYWN0aW9uczogW10sXG4gICAgICBldmVudFR5cGU6IG51bGwsXG4gICAgICByZWVudGVyOiBmYWxzZSxcbiAgICAgIHRhcmdldDogcmVzb2x2ZWRUYXJnZXQsXG4gICAgICB0b0pTT046ICgpID0+ICh7XG4gICAgICAgIC4uLnRyYW5zaXRpb24sXG4gICAgICAgIHNvdXJjZTogYCMke3N0YXRlTm9kZS5pZH1gLFxuICAgICAgICB0YXJnZXQ6IHJlc29sdmVkVGFyZ2V0ID8gcmVzb2x2ZWRUYXJnZXQubWFwKHQgPT4gYCMke3QuaWR9YCkgOiB1bmRlZmluZWRcbiAgICAgIH0pXG4gICAgfTtcbiAgICByZXR1cm4gdHJhbnNpdGlvbjtcbiAgfVxuICByZXR1cm4gZm9ybWF0VHJhbnNpdGlvbihzdGF0ZU5vZGUsICdfX0lOSVRJQUxfXycsIHtcbiAgICB0YXJnZXQ6IHRvQXJyYXkoX3RhcmdldC50YXJnZXQpLm1hcCh0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIGlzU3RhdGVJZCh0KSA/IHQgOiBgJHtTVEFURV9ERUxJTUlURVJ9JHt0fWA7XG4gICAgICB9XG4gICAgICByZXR1cm4gdDtcbiAgICB9KSxcbiAgICBhY3Rpb25zOiBfdGFyZ2V0LmFjdGlvbnNcbiAgfSk7XG59XG5mdW5jdGlvbiByZXNvbHZlVGFyZ2V0KHN0YXRlTm9kZSwgdGFyZ2V0cykge1xuICBpZiAodGFyZ2V0cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgLy8gYW4gdW5kZWZpbmVkIHRhcmdldCBzaWduYWxzIHRoYXQgdGhlIHN0YXRlIG5vZGUgc2hvdWxkIG5vdCB0cmFuc2l0aW9uIGZyb20gdGhhdCBzdGF0ZSB3aGVuIHJlY2VpdmluZyB0aGF0IGV2ZW50XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuICByZXR1cm4gdGFyZ2V0cy5tYXAodGFyZ2V0ID0+IHtcbiAgICBpZiAodHlwZW9mIHRhcmdldCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB0YXJnZXQ7XG4gICAgfVxuICAgIGlmIChpc1N0YXRlSWQodGFyZ2V0KSkge1xuICAgICAgcmV0dXJuIHN0YXRlTm9kZS5tYWNoaW5lLmdldFN0YXRlTm9kZUJ5SWQodGFyZ2V0KTtcbiAgICB9XG4gICAgY29uc3QgaXNJbnRlcm5hbFRhcmdldCA9IHRhcmdldFswXSA9PT0gU1RBVEVfREVMSU1JVEVSO1xuICAgIC8vIElmIGludGVybmFsIHRhcmdldCBpcyBkZWZpbmVkIG9uIG1hY2hpbmUsXG4gICAgLy8gZG8gbm90IGluY2x1ZGUgbWFjaGluZSBrZXkgb24gdGFyZ2V0XG4gICAgaWYgKGlzSW50ZXJuYWxUYXJnZXQgJiYgIXN0YXRlTm9kZS5wYXJlbnQpIHtcbiAgICAgIHJldHVybiBnZXRTdGF0ZU5vZGVCeVBhdGgoc3RhdGVOb2RlLCB0YXJnZXQuc2xpY2UoMSkpO1xuICAgIH1cbiAgICBjb25zdCByZXNvbHZlZFRhcmdldCA9IGlzSW50ZXJuYWxUYXJnZXQgPyBzdGF0ZU5vZGUua2V5ICsgdGFyZ2V0IDogdGFyZ2V0O1xuICAgIGlmIChzdGF0ZU5vZGUucGFyZW50KSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB0YXJnZXRTdGF0ZU5vZGUgPSBnZXRTdGF0ZU5vZGVCeVBhdGgoc3RhdGVOb2RlLnBhcmVudCwgcmVzb2x2ZWRUYXJnZXQpO1xuICAgICAgICByZXR1cm4gdGFyZ2V0U3RhdGVOb2RlO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB0cmFuc2l0aW9uIGRlZmluaXRpb24gZm9yIHN0YXRlIG5vZGUgJyR7c3RhdGVOb2RlLmlkfSc6XFxuJHtlcnIubWVzc2FnZX1gKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHRhcmdldDogXCIke3RhcmdldH1cIiBpcyBub3QgYSB2YWxpZCB0YXJnZXQgZnJvbSB0aGUgcm9vdCBub2RlLiBEaWQgeW91IG1lYW4gXCIuJHt0YXJnZXR9XCI/YCk7XG4gICAgfVxuICB9KTtcbn1cbmZ1bmN0aW9uIHJlc29sdmVIaXN0b3J5VGFyZ2V0KHN0YXRlTm9kZSkge1xuICBjb25zdCBub3JtYWxpemVkVGFyZ2V0ID0gbm9ybWFsaXplVGFyZ2V0KHN0YXRlTm9kZS5jb25maWcudGFyZ2V0KTtcbiAgaWYgKCFub3JtYWxpemVkVGFyZ2V0KSB7XG4gICAgcmV0dXJuIHN0YXRlTm9kZS5wYXJlbnQuaW5pdGlhbC50YXJnZXQ7XG4gIH1cbiAgcmV0dXJuIG5vcm1hbGl6ZWRUYXJnZXQubWFwKHQgPT4gdHlwZW9mIHQgPT09ICdzdHJpbmcnID8gZ2V0U3RhdGVOb2RlQnlQYXRoKHN0YXRlTm9kZS5wYXJlbnQsIHQpIDogdCk7XG59XG5mdW5jdGlvbiBpc0hpc3RvcnlOb2RlKHN0YXRlTm9kZSkge1xuICByZXR1cm4gc3RhdGVOb2RlLnR5cGUgPT09ICdoaXN0b3J5Jztcbn1cbmZ1bmN0aW9uIGdldEluaXRpYWxTdGF0ZU5vZGVzKHN0YXRlTm9kZSkge1xuICBjb25zdCBzZXQgPSBuZXcgU2V0KCk7XG4gIGZ1bmN0aW9uIGl0ZXIoZGVzY1N0YXRlTm9kZSkge1xuICAgIGlmIChzZXQuaGFzKGRlc2NTdGF0ZU5vZGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHNldC5hZGQoZGVzY1N0YXRlTm9kZSk7XG4gICAgaWYgKGRlc2NTdGF0ZU5vZGUudHlwZSA9PT0gJ2NvbXBvdW5kJykge1xuICAgICAgZm9yIChjb25zdCB0YXJnZXRTdGF0ZU5vZGUgb2YgZGVzY1N0YXRlTm9kZS5pbml0aWFsLnRhcmdldCkge1xuICAgICAgICBmb3IgKGNvbnN0IGEgb2YgZ2V0UHJvcGVyQW5jZXN0b3JzKHRhcmdldFN0YXRlTm9kZSwgc3RhdGVOb2RlKSkge1xuICAgICAgICAgIHNldC5hZGQoYSk7XG4gICAgICAgIH1cbiAgICAgICAgaXRlcih0YXJnZXRTdGF0ZU5vZGUpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZGVzY1N0YXRlTm9kZS50eXBlID09PSAncGFyYWxsZWwnKSB7XG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGdldENoaWxkcmVuKGRlc2NTdGF0ZU5vZGUpKSB7XG4gICAgICAgIGl0ZXIoY2hpbGQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBpdGVyKHN0YXRlTm9kZSk7XG4gIHJldHVybiBbLi4uc2V0XTtcbn1cbi8qKlxuICogUmV0dXJucyB0aGUgY2hpbGQgc3RhdGUgbm9kZSBmcm9tIGl0cyByZWxhdGl2ZSBgc3RhdGVLZXlgLCBvciB0aHJvd3MuXG4gKi9cbmZ1bmN0aW9uIGdldFN0YXRlTm9kZShzdGF0ZU5vZGUsIHN0YXRlS2V5KSB7XG4gIGlmIChpc1N0YXRlSWQoc3RhdGVLZXkpKSB7XG4gICAgcmV0dXJuIHN0YXRlTm9kZS5tYWNoaW5lLmdldFN0YXRlTm9kZUJ5SWQoc3RhdGVLZXkpO1xuICB9XG4gIGlmICghc3RhdGVOb2RlLnN0YXRlcykge1xuICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHJldHJpZXZlIGNoaWxkIHN0YXRlICcke3N0YXRlS2V5fScgZnJvbSAnJHtzdGF0ZU5vZGUuaWR9Jzsgbm8gY2hpbGQgc3RhdGVzIGV4aXN0LmApO1xuICB9XG4gIGNvbnN0IHJlc3VsdCA9IHN0YXRlTm9kZS5zdGF0ZXNbc3RhdGVLZXldO1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHRocm93IG5ldyBFcnJvcihgQ2hpbGQgc3RhdGUgJyR7c3RhdGVLZXl9JyBkb2VzIG5vdCBleGlzdCBvbiAnJHtzdGF0ZU5vZGUuaWR9J2ApO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcmVsYXRpdmUgc3RhdGUgbm9kZSBmcm9tIHRoZSBnaXZlbiBgc3RhdGVQYXRoYCwgb3IgdGhyb3dzLlxuICpcbiAqIEBwYXJhbSBzdGF0ZVBhdGggVGhlIHN0cmluZyBvciBzdHJpbmcgYXJyYXkgcmVsYXRpdmUgcGF0aCB0byB0aGUgc3RhdGUgbm9kZS5cbiAqL1xuZnVuY3Rpb24gZ2V0U3RhdGVOb2RlQnlQYXRoKHN0YXRlTm9kZSwgc3RhdGVQYXRoKSB7XG4gIGlmICh0eXBlb2Ygc3RhdGVQYXRoID09PSAnc3RyaW5nJyAmJiBpc1N0YXRlSWQoc3RhdGVQYXRoKSkge1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gc3RhdGVOb2RlLm1hY2hpbmUuZ2V0U3RhdGVOb2RlQnlJZChzdGF0ZVBhdGgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIC8vIHRyeSBpbmRpdmlkdWFsIHBhdGhzXG4gICAgICAvLyB0aHJvdyBlO1xuICAgIH1cbiAgfVxuICBjb25zdCBhcnJheVN0YXRlUGF0aCA9IHRvU3RhdGVQYXRoKHN0YXRlUGF0aCkuc2xpY2UoKTtcbiAgbGV0IGN1cnJlbnRTdGF0ZU5vZGUgPSBzdGF0ZU5vZGU7XG4gIHdoaWxlIChhcnJheVN0YXRlUGF0aC5sZW5ndGgpIHtcbiAgICBjb25zdCBrZXkgPSBhcnJheVN0YXRlUGF0aC5zaGlmdCgpO1xuICAgIGlmICgha2V5Lmxlbmd0aCkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGN1cnJlbnRTdGF0ZU5vZGUgPSBnZXRTdGF0ZU5vZGUoY3VycmVudFN0YXRlTm9kZSwga2V5KTtcbiAgfVxuICByZXR1cm4gY3VycmVudFN0YXRlTm9kZTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBzdGF0ZSBub2RlcyByZXByZXNlbnRlZCBieSB0aGUgY3VycmVudCBzdGF0ZSB2YWx1ZS5cbiAqXG4gKiBAcGFyYW0gc3RhdGUgVGhlIHN0YXRlIHZhbHVlIG9yIFN0YXRlIGluc3RhbmNlXG4gKi9cbmZ1bmN0aW9uIGdldFN0YXRlTm9kZXMoc3RhdGVOb2RlLCBzdGF0ZSkge1xuICBjb25zdCBzdGF0ZVZhbHVlID0gc3RhdGUgaW5zdGFuY2VvZiBTdGF0ZSA/IHN0YXRlLnZhbHVlIDogdG9TdGF0ZVZhbHVlKHN0YXRlKTtcbiAgaWYgKHR5cGVvZiBzdGF0ZVZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBbc3RhdGVOb2RlLCBzdGF0ZU5vZGUuc3RhdGVzW3N0YXRlVmFsdWVdXTtcbiAgfVxuICBjb25zdCBjaGlsZFN0YXRlS2V5cyA9IE9iamVjdC5rZXlzKHN0YXRlVmFsdWUpO1xuICBjb25zdCBjaGlsZFN0YXRlTm9kZXMgPSBjaGlsZFN0YXRlS2V5cy5tYXAoc3ViU3RhdGVLZXkgPT4gZ2V0U3RhdGVOb2RlKHN0YXRlTm9kZSwgc3ViU3RhdGVLZXkpKS5maWx0ZXIoQm9vbGVhbik7XG4gIHJldHVybiBbc3RhdGVOb2RlLm1hY2hpbmUucm9vdCwgc3RhdGVOb2RlXS5jb25jYXQoY2hpbGRTdGF0ZU5vZGVzLCBjaGlsZFN0YXRlS2V5cy5yZWR1Y2UoKGFsbFN1YlN0YXRlTm9kZXMsIHN1YlN0YXRlS2V5KSA9PiB7XG4gICAgY29uc3Qgc3ViU3RhdGVOb2RlID0gZ2V0U3RhdGVOb2RlKHN0YXRlTm9kZSwgc3ViU3RhdGVLZXkpO1xuICAgIGlmICghc3ViU3RhdGVOb2RlKSB7XG4gICAgICByZXR1cm4gYWxsU3ViU3RhdGVOb2RlcztcbiAgICB9XG4gICAgY29uc3Qgc3ViU3RhdGVOb2RlcyA9IGdldFN0YXRlTm9kZXMoc3ViU3RhdGVOb2RlLCBzdGF0ZVZhbHVlW3N1YlN0YXRlS2V5XSk7XG4gICAgcmV0dXJuIGFsbFN1YlN0YXRlTm9kZXMuY29uY2F0KHN1YlN0YXRlTm9kZXMpO1xuICB9LCBbXSkpO1xufVxuZnVuY3Rpb24gdHJhbnNpdGlvbkF0b21pY05vZGUoc3RhdGVOb2RlLCBzdGF0ZVZhbHVlLCBzdGF0ZSwgZXZlbnQpIHtcbiAgY29uc3QgY2hpbGRTdGF0ZU5vZGUgPSBnZXRTdGF0ZU5vZGUoc3RhdGVOb2RlLCBzdGF0ZVZhbHVlKTtcbiAgY29uc3QgbmV4dCA9IGNoaWxkU3RhdGVOb2RlLm5leHQoc3RhdGUsIGV2ZW50KTtcbiAgaWYgKCFuZXh0IHx8ICFuZXh0Lmxlbmd0aCkge1xuICAgIHJldHVybiBzdGF0ZU5vZGUubmV4dChzdGF0ZSwgZXZlbnQpO1xuICB9XG4gIHJldHVybiBuZXh0O1xufVxuZnVuY3Rpb24gdHJhbnNpdGlvbkNvbXBvdW5kTm9kZShzdGF0ZU5vZGUsIHN0YXRlVmFsdWUsIHN0YXRlLCBldmVudCkge1xuICBjb25zdCBzdWJTdGF0ZUtleXMgPSBPYmplY3Qua2V5cyhzdGF0ZVZhbHVlKTtcbiAgY29uc3QgY2hpbGRTdGF0ZU5vZGUgPSBnZXRTdGF0ZU5vZGUoc3RhdGVOb2RlLCBzdWJTdGF0ZUtleXNbMF0pO1xuICBjb25zdCBuZXh0ID0gdHJhbnNpdGlvbk5vZGUoY2hpbGRTdGF0ZU5vZGUsIHN0YXRlVmFsdWVbc3ViU3RhdGVLZXlzWzBdXSwgc3RhdGUsIGV2ZW50KTtcbiAgaWYgKCFuZXh0IHx8ICFuZXh0Lmxlbmd0aCkge1xuICAgIHJldHVybiBzdGF0ZU5vZGUubmV4dChzdGF0ZSwgZXZlbnQpO1xuICB9XG4gIHJldHVybiBuZXh0O1xufVxuZnVuY3Rpb24gdHJhbnNpdGlvblBhcmFsbGVsTm9kZShzdGF0ZU5vZGUsIHN0YXRlVmFsdWUsIHN0YXRlLCBldmVudCkge1xuICBjb25zdCBhbGxJbm5lclRyYW5zaXRpb25zID0gW107XG4gIGZvciAoY29uc3Qgc3ViU3RhdGVLZXkgb2YgT2JqZWN0LmtleXMoc3RhdGVWYWx1ZSkpIHtcbiAgICBjb25zdCBzdWJTdGF0ZVZhbHVlID0gc3RhdGVWYWx1ZVtzdWJTdGF0ZUtleV07XG4gICAgaWYgKCFzdWJTdGF0ZVZhbHVlKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3Qgc3ViU3RhdGVOb2RlID0gZ2V0U3RhdGVOb2RlKHN0YXRlTm9kZSwgc3ViU3RhdGVLZXkpO1xuICAgIGNvbnN0IGlubmVyVHJhbnNpdGlvbnMgPSB0cmFuc2l0aW9uTm9kZShzdWJTdGF0ZU5vZGUsIHN1YlN0YXRlVmFsdWUsIHN0YXRlLCBldmVudCk7XG4gICAgaWYgKGlubmVyVHJhbnNpdGlvbnMpIHtcbiAgICAgIGFsbElubmVyVHJhbnNpdGlvbnMucHVzaCguLi5pbm5lclRyYW5zaXRpb25zKTtcbiAgICB9XG4gIH1cbiAgaWYgKCFhbGxJbm5lclRyYW5zaXRpb25zLmxlbmd0aCkge1xuICAgIHJldHVybiBzdGF0ZU5vZGUubmV4dChzdGF0ZSwgZXZlbnQpO1xuICB9XG4gIHJldHVybiBhbGxJbm5lclRyYW5zaXRpb25zO1xufVxuZnVuY3Rpb24gdHJhbnNpdGlvbk5vZGUoc3RhdGVOb2RlLCBzdGF0ZVZhbHVlLCBzdGF0ZSwgZXZlbnQpIHtcbiAgLy8gbGVhZiBub2RlXG4gIGlmICh0eXBlb2Ygc3RhdGVWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdHJhbnNpdGlvbkF0b21pY05vZGUoc3RhdGVOb2RlLCBzdGF0ZVZhbHVlLCBzdGF0ZSwgZXZlbnQpO1xuICB9XG5cbiAgLy8gY29tcG91bmQgbm9kZVxuICBpZiAoT2JqZWN0LmtleXMoc3RhdGVWYWx1ZSkubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIHRyYW5zaXRpb25Db21wb3VuZE5vZGUoc3RhdGVOb2RlLCBzdGF0ZVZhbHVlLCBzdGF0ZSwgZXZlbnQpO1xuICB9XG5cbiAgLy8gcGFyYWxsZWwgbm9kZVxuICByZXR1cm4gdHJhbnNpdGlvblBhcmFsbGVsTm9kZShzdGF0ZU5vZGUsIHN0YXRlVmFsdWUsIHN0YXRlLCBldmVudCk7XG59XG5mdW5jdGlvbiBnZXRIaXN0b3J5Tm9kZXMoc3RhdGVOb2RlKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhzdGF0ZU5vZGUuc3RhdGVzKS5tYXAoa2V5ID0+IHN0YXRlTm9kZS5zdGF0ZXNba2V5XSkuZmlsdGVyKHNuID0+IHNuLnR5cGUgPT09ICdoaXN0b3J5Jyk7XG59XG5mdW5jdGlvbiBpc0Rlc2NlbmRhbnQoY2hpbGRTdGF0ZU5vZGUsIHBhcmVudFN0YXRlTm9kZSkge1xuICBsZXQgbWFya2VyID0gY2hpbGRTdGF0ZU5vZGU7XG4gIHdoaWxlIChtYXJrZXIucGFyZW50ICYmIG1hcmtlci5wYXJlbnQgIT09IHBhcmVudFN0YXRlTm9kZSkge1xuICAgIG1hcmtlciA9IG1hcmtlci5wYXJlbnQ7XG4gIH1cbiAgcmV0dXJuIG1hcmtlci5wYXJlbnQgPT09IHBhcmVudFN0YXRlTm9kZTtcbn1cbmZ1bmN0aW9uIGdldFBhdGhGcm9tUm9vdFRvTm9kZShzdGF0ZU5vZGUpIHtcbiAgY29uc3QgcGF0aCA9IFtdO1xuICBsZXQgbWFya2VyID0gc3RhdGVOb2RlLnBhcmVudDtcbiAgd2hpbGUgKG1hcmtlcikge1xuICAgIHBhdGgudW5zaGlmdChtYXJrZXIpO1xuICAgIG1hcmtlciA9IG1hcmtlci5wYXJlbnQ7XG4gIH1cbiAgcmV0dXJuIHBhdGg7XG59XG5mdW5jdGlvbiBoYXNJbnRlcnNlY3Rpb24oczEsIHMyKSB7XG4gIGNvbnN0IHNldDEgPSBuZXcgU2V0KHMxKTtcbiAgY29uc3Qgc2V0MiA9IG5ldyBTZXQoczIpO1xuICBmb3IgKGNvbnN0IGl0ZW0gb2Ygc2V0MSkge1xuICAgIGlmIChzZXQyLmhhcyhpdGVtKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgaXRlbSBvZiBzZXQyKSB7XG4gICAgaWYgKHNldDEuaGFzKGl0ZW0pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuZnVuY3Rpb24gcmVtb3ZlQ29uZmxpY3RpbmdUcmFuc2l0aW9ucyhlbmFibGVkVHJhbnNpdGlvbnMsIGNvbmZpZ3VyYXRpb24sIGhpc3RvcnlWYWx1ZSkge1xuICBjb25zdCBmaWx0ZXJlZFRyYW5zaXRpb25zID0gbmV3IFNldCgpO1xuICBmb3IgKGNvbnN0IHQxIG9mIGVuYWJsZWRUcmFuc2l0aW9ucykge1xuICAgIGxldCB0MVByZWVtcHRlZCA9IGZhbHNlO1xuICAgIGNvbnN0IHRyYW5zaXRpb25zVG9SZW1vdmUgPSBuZXcgU2V0KCk7XG4gICAgZm9yIChjb25zdCB0MiBvZiBmaWx0ZXJlZFRyYW5zaXRpb25zKSB7XG4gICAgICBpZiAoaGFzSW50ZXJzZWN0aW9uKGNvbXB1dGVFeGl0U2V0KFt0MV0sIGNvbmZpZ3VyYXRpb24sIGhpc3RvcnlWYWx1ZSksIGNvbXB1dGVFeGl0U2V0KFt0Ml0sIGNvbmZpZ3VyYXRpb24sIGhpc3RvcnlWYWx1ZSkpKSB7XG4gICAgICAgIGlmIChpc0Rlc2NlbmRhbnQodDEuc291cmNlLCB0Mi5zb3VyY2UpKSB7XG4gICAgICAgICAgdHJhbnNpdGlvbnNUb1JlbW92ZS5hZGQodDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHQxUHJlZW1wdGVkID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXQxUHJlZW1wdGVkKSB7XG4gICAgICBmb3IgKGNvbnN0IHQzIG9mIHRyYW5zaXRpb25zVG9SZW1vdmUpIHtcbiAgICAgICAgZmlsdGVyZWRUcmFuc2l0aW9ucy5kZWxldGUodDMpO1xuICAgICAgfVxuICAgICAgZmlsdGVyZWRUcmFuc2l0aW9ucy5hZGQodDEpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gQXJyYXkuZnJvbShmaWx0ZXJlZFRyYW5zaXRpb25zKTtcbn1cbmZ1bmN0aW9uIGZpbmRMQ0NBKHN0YXRlTm9kZXMpIHtcbiAgY29uc3QgW2hlYWRdID0gc3RhdGVOb2RlcztcbiAgbGV0IGN1cnJlbnQgPSBnZXRQYXRoRnJvbVJvb3RUb05vZGUoaGVhZCk7XG4gIGxldCBjYW5kaWRhdGVzID0gW107XG4gIGZvciAoY29uc3Qgc3RhdGVOb2RlIG9mIHN0YXRlTm9kZXMpIHtcbiAgICBjb25zdCBwYXRoID0gZ2V0UGF0aEZyb21Sb290VG9Ob2RlKHN0YXRlTm9kZSk7XG4gICAgY2FuZGlkYXRlcyA9IGN1cnJlbnQuZmlsdGVyKHNuID0+IHBhdGguaW5jbHVkZXMoc24pKTtcbiAgICBjdXJyZW50ID0gY2FuZGlkYXRlcztcbiAgICBjYW5kaWRhdGVzID0gW107XG4gIH1cbiAgcmV0dXJuIGN1cnJlbnRbY3VycmVudC5sZW5ndGggLSAxXTtcbn1cbmZ1bmN0aW9uIGdldEVmZmVjdGl2ZVRhcmdldFN0YXRlcyh0cmFuc2l0aW9uLCBoaXN0b3J5VmFsdWUpIHtcbiAgaWYgKCF0cmFuc2l0aW9uLnRhcmdldCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBjb25zdCB0YXJnZXRzID0gbmV3IFNldCgpO1xuICBmb3IgKGNvbnN0IHRhcmdldE5vZGUgb2YgdHJhbnNpdGlvbi50YXJnZXQpIHtcbiAgICBpZiAoaXNIaXN0b3J5Tm9kZSh0YXJnZXROb2RlKSkge1xuICAgICAgaWYgKGhpc3RvcnlWYWx1ZVt0YXJnZXROb2RlLmlkXSkge1xuICAgICAgICBmb3IgKGNvbnN0IG5vZGUgb2YgaGlzdG9yeVZhbHVlW3RhcmdldE5vZGUuaWRdKSB7XG4gICAgICAgICAgdGFyZ2V0cy5hZGQobm9kZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBnZXRFZmZlY3RpdmVUYXJnZXRTdGF0ZXMoe1xuICAgICAgICAgIHRhcmdldDogcmVzb2x2ZUhpc3RvcnlUYXJnZXQodGFyZ2V0Tm9kZSlcbiAgICAgICAgfSwgaGlzdG9yeVZhbHVlKSkge1xuICAgICAgICAgIHRhcmdldHMuYWRkKG5vZGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRhcmdldHMuYWRkKHRhcmdldE5vZGUpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gWy4uLnRhcmdldHNdO1xufVxuZnVuY3Rpb24gZ2V0VHJhbnNpdGlvbkRvbWFpbih0cmFuc2l0aW9uLCBoaXN0b3J5VmFsdWUpIHtcbiAgY29uc3QgdGFyZ2V0U3RhdGVzID0gZ2V0RWZmZWN0aXZlVGFyZ2V0U3RhdGVzKHRyYW5zaXRpb24sIGhpc3RvcnlWYWx1ZSk7XG4gIGlmICghdGFyZ2V0U3RhdGVzKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgaWYgKCF0cmFuc2l0aW9uLnJlZW50ZXIgJiYgdHJhbnNpdGlvbi5zb3VyY2UudHlwZSAhPT0gJ3BhcmFsbGVsJyAmJiB0YXJnZXRTdGF0ZXMuZXZlcnkodGFyZ2V0U3RhdGVOb2RlID0+IGlzRGVzY2VuZGFudCh0YXJnZXRTdGF0ZU5vZGUsIHRyYW5zaXRpb24uc291cmNlKSkpIHtcbiAgICByZXR1cm4gdHJhbnNpdGlvbi5zb3VyY2U7XG4gIH1cbiAgY29uc3QgbGNjYSA9IGZpbmRMQ0NBKHRhcmdldFN0YXRlcy5jb25jYXQodHJhbnNpdGlvbi5zb3VyY2UpKTtcbiAgcmV0dXJuIGxjY2E7XG59XG5mdW5jdGlvbiBjb21wdXRlRXhpdFNldCh0cmFuc2l0aW9ucywgY29uZmlndXJhdGlvbiwgaGlzdG9yeVZhbHVlKSB7XG4gIGNvbnN0IHN0YXRlc1RvRXhpdCA9IG5ldyBTZXQoKTtcbiAgZm9yIChjb25zdCB0IG9mIHRyYW5zaXRpb25zKSB7XG4gICAgaWYgKHQudGFyZ2V0Py5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IGRvbWFpbiA9IGdldFRyYW5zaXRpb25Eb21haW4odCwgaGlzdG9yeVZhbHVlKTtcbiAgICAgIGZvciAoY29uc3Qgc3RhdGVOb2RlIG9mIGNvbmZpZ3VyYXRpb24pIHtcbiAgICAgICAgaWYgKGlzRGVzY2VuZGFudChzdGF0ZU5vZGUsIGRvbWFpbikpIHtcbiAgICAgICAgICBzdGF0ZXNUb0V4aXQuYWRkKHN0YXRlTm9kZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIFsuLi5zdGF0ZXNUb0V4aXRdO1xufVxuXG4vKipcbiAqIGh0dHBzOi8vd3d3LnczLm9yZy9UUi9zY3htbC8jbWljcm9zdGVwUHJvY2VkdXJlXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB0cmFuc2l0aW9uc1xuICogQHBhcmFtIGN1cnJlbnRTdGF0ZVxuICogQHBhcmFtIG11dENvbmZpZ3VyYXRpb25cbiAqL1xuXG5mdW5jdGlvbiBtaWNyb3N0ZXAodHJhbnNpdGlvbnMsIGN1cnJlbnRTdGF0ZSwgYWN0b3JDdHgsIGV2ZW50LCBpc0luaXRpYWwpIHtcbiAgY29uc3QgbXV0Q29uZmlndXJhdGlvbiA9IG5ldyBTZXQoY3VycmVudFN0YXRlLmNvbmZpZ3VyYXRpb24pO1xuICBpZiAoIXRyYW5zaXRpb25zLmxlbmd0aCkge1xuICAgIHJldHVybiBjdXJyZW50U3RhdGU7XG4gIH1cbiAgY29uc3QgbWljcm9zdGF0ZSA9IG1pY3Jvc3RlcFByb2NlZHVyZSh0cmFuc2l0aW9ucywgY3VycmVudFN0YXRlLCBtdXRDb25maWd1cmF0aW9uLCBldmVudCwgYWN0b3JDdHgsIGlzSW5pdGlhbCk7XG4gIHJldHVybiBjbG9uZVN0YXRlKG1pY3Jvc3RhdGUsIHtcbiAgICB2YWx1ZToge30gLy8gVE9ETzogbWFrZSBvcHRpb25hbFxuICB9KTtcbn1cblxuZnVuY3Rpb24gbWljcm9zdGVwUHJvY2VkdXJlKHRyYW5zaXRpb25zLCBjdXJyZW50U3RhdGUsIG11dENvbmZpZ3VyYXRpb24sIGV2ZW50LCBhY3RvckN0eCwgaXNJbml0aWFsKSB7XG4gIGNvbnN0IGFjdGlvbnMgPSBbXTtcbiAgY29uc3QgaGlzdG9yeVZhbHVlID0ge1xuICAgIC4uLmN1cnJlbnRTdGF0ZS5oaXN0b3J5VmFsdWVcbiAgfTtcbiAgY29uc3QgZmlsdGVyZWRUcmFuc2l0aW9ucyA9IHJlbW92ZUNvbmZsaWN0aW5nVHJhbnNpdGlvbnModHJhbnNpdGlvbnMsIG11dENvbmZpZ3VyYXRpb24sIGhpc3RvcnlWYWx1ZSk7XG4gIGNvbnN0IGludGVybmFsUXVldWUgPSBbLi4uY3VycmVudFN0YXRlLl9pbnRlcm5hbFF1ZXVlXTtcblxuICAvLyBFeGl0IHN0YXRlc1xuICBpZiAoIWlzSW5pdGlhbCkge1xuICAgIGV4aXRTdGF0ZXMoZmlsdGVyZWRUcmFuc2l0aW9ucywgbXV0Q29uZmlndXJhdGlvbiwgaGlzdG9yeVZhbHVlLCBhY3Rpb25zKTtcbiAgfVxuXG4gIC8vIEV4ZWN1dGUgdHJhbnNpdGlvbiBjb250ZW50XG4gIGFjdGlvbnMucHVzaCguLi5maWx0ZXJlZFRyYW5zaXRpb25zLmZsYXRNYXAodCA9PiB0LmFjdGlvbnMpKTtcblxuICAvLyBFbnRlciBzdGF0ZXNcbiAgZW50ZXJTdGF0ZXMoZXZlbnQsIGZpbHRlcmVkVHJhbnNpdGlvbnMsIG11dENvbmZpZ3VyYXRpb24sIGFjdGlvbnMsIGludGVybmFsUXVldWUsIGN1cnJlbnRTdGF0ZSwgaGlzdG9yeVZhbHVlLCBpc0luaXRpYWwsIGFjdG9yQ3R4KTtcbiAgY29uc3QgbmV4dENvbmZpZ3VyYXRpb24gPSBbLi4ubXV0Q29uZmlndXJhdGlvbl07XG4gIGNvbnN0IGRvbmUgPSBpc0luRmluYWxTdGF0ZShuZXh0Q29uZmlndXJhdGlvbik7XG4gIGlmIChkb25lKSB7XG4gICAgY29uc3QgZmluYWxBY3Rpb25zID0gbmV4dENvbmZpZ3VyYXRpb24uc29ydCgoYSwgYikgPT4gYi5vcmRlciAtIGEub3JkZXIpLmZsYXRNYXAoc3RhdGUgPT4gc3RhdGUuZXhpdCk7XG4gICAgYWN0aW9ucy5wdXNoKC4uLmZpbmFsQWN0aW9ucyk7XG4gIH1cbiAgdHJ5IHtcbiAgICBjb25zdCBuZXh0U3RhdGUgPSByZXNvbHZlQWN0aW9uc0FuZENvbnRleHQoYWN0aW9ucywgZXZlbnQsIGN1cnJlbnRTdGF0ZSwgYWN0b3JDdHgpO1xuICAgIGNvbnN0IG91dHB1dCA9IGRvbmUgPyBnZXRPdXRwdXQobmV4dENvbmZpZ3VyYXRpb24sIG5leHRTdGF0ZS5jb250ZXh0LCBldmVudCwgYWN0b3JDdHguc2VsZikgOiB1bmRlZmluZWQ7XG4gICAgaW50ZXJuYWxRdWV1ZS5wdXNoKC4uLm5leHRTdGF0ZS5faW50ZXJuYWxRdWV1ZSk7XG4gICAgcmV0dXJuIGNsb25lU3RhdGUoY3VycmVudFN0YXRlLCB7XG4gICAgICBjb25maWd1cmF0aW9uOiBuZXh0Q29uZmlndXJhdGlvbixcbiAgICAgIGhpc3RvcnlWYWx1ZSxcbiAgICAgIF9pbnRlcm5hbFF1ZXVlOiBpbnRlcm5hbFF1ZXVlLFxuICAgICAgY29udGV4dDogbmV4dFN0YXRlLmNvbnRleHQsXG4gICAgICBzdGF0dXM6IGRvbmUgPyAnZG9uZScgOiBjdXJyZW50U3RhdGUuc3RhdHVzLFxuICAgICAgb3V0cHV0LFxuICAgICAgY2hpbGRyZW46IG5leHRTdGF0ZS5jaGlsZHJlblxuICAgIH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgLy8gVE9ETzogUmVmYWN0b3IgdGhpcyBvbmNlIHByb3BlciBlcnJvciBoYW5kbGluZyBpcyBpbXBsZW1lbnRlZC5cbiAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL3N0YXRlbHlhaS9yZmNzL3B1bGwvNFxuICAgIHRocm93IGU7XG4gIH1cbn1cbmZ1bmN0aW9uIGVudGVyU3RhdGVzKGV2ZW50LCBmaWx0ZXJlZFRyYW5zaXRpb25zLCBtdXRDb25maWd1cmF0aW9uLCBhY3Rpb25zLCBpbnRlcm5hbFF1ZXVlLCBjdXJyZW50U3RhdGUsIGhpc3RvcnlWYWx1ZSwgaXNJbml0aWFsLCBhY3RvckNvbnRleHQpIHtcbiAgY29uc3Qgc3RhdGVzVG9FbnRlciA9IG5ldyBTZXQoKTtcbiAgY29uc3Qgc3RhdGVzRm9yRGVmYXVsdEVudHJ5ID0gbmV3IFNldCgpO1xuICBjb21wdXRlRW50cnlTZXQoZmlsdGVyZWRUcmFuc2l0aW9ucywgaGlzdG9yeVZhbHVlLCBzdGF0ZXNGb3JEZWZhdWx0RW50cnksIHN0YXRlc1RvRW50ZXIpO1xuXG4gIC8vIEluIHRoZSBpbml0aWFsIHN0YXRlLCB0aGUgcm9vdCBzdGF0ZSBub2RlIGlzIFwiZW50ZXJlZFwiLlxuICBpZiAoaXNJbml0aWFsKSB7XG4gICAgc3RhdGVzRm9yRGVmYXVsdEVudHJ5LmFkZChjdXJyZW50U3RhdGUubWFjaGluZS5yb290KTtcbiAgfVxuICBmb3IgKGNvbnN0IHN0YXRlTm9kZVRvRW50ZXIgb2YgWy4uLnN0YXRlc1RvRW50ZXJdLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKSkge1xuICAgIG11dENvbmZpZ3VyYXRpb24uYWRkKHN0YXRlTm9kZVRvRW50ZXIpO1xuICAgIGZvciAoY29uc3QgaW52b2tlRGVmIG9mIHN0YXRlTm9kZVRvRW50ZXIuaW52b2tlKSB7XG4gICAgICBhY3Rpb25zLnB1c2goaW52b2tlKGludm9rZURlZikpO1xuICAgIH1cblxuICAgIC8vIEFkZCBlbnRyeSBhY3Rpb25zXG4gICAgYWN0aW9ucy5wdXNoKC4uLnN0YXRlTm9kZVRvRW50ZXIuZW50cnkpO1xuICAgIGlmIChzdGF0ZXNGb3JEZWZhdWx0RW50cnkuaGFzKHN0YXRlTm9kZVRvRW50ZXIpKSB7XG4gICAgICBmb3IgKGNvbnN0IHN0YXRlTm9kZSBvZiBzdGF0ZXNGb3JEZWZhdWx0RW50cnkpIHtcbiAgICAgICAgY29uc3QgaW5pdGlhbEFjdGlvbnMgPSBzdGF0ZU5vZGUuaW5pdGlhbC5hY3Rpb25zO1xuICAgICAgICBhY3Rpb25zLnB1c2goLi4uaW5pdGlhbEFjdGlvbnMpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoc3RhdGVOb2RlVG9FbnRlci50eXBlID09PSAnZmluYWwnKSB7XG4gICAgICBjb25zdCBwYXJlbnQgPSBzdGF0ZU5vZGVUb0VudGVyLnBhcmVudDtcbiAgICAgIGlmICghcGFyZW50LnBhcmVudCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGludGVybmFsUXVldWUucHVzaChjcmVhdGVEb25lU3RhdGVFdmVudChwYXJlbnQuaWQsIHN0YXRlTm9kZVRvRW50ZXIub3V0cHV0ID8gcmVzb2x2ZU91dHB1dChzdGF0ZU5vZGVUb0VudGVyLm91dHB1dCwgY3VycmVudFN0YXRlLmNvbnRleHQsIGV2ZW50LCBhY3RvckNvbnRleHQuc2VsZikgOiB1bmRlZmluZWQpKTtcbiAgICAgIGlmIChwYXJlbnQucGFyZW50KSB7XG4gICAgICAgIGNvbnN0IGdyYW5kcGFyZW50ID0gcGFyZW50LnBhcmVudDtcbiAgICAgICAgaWYgKGdyYW5kcGFyZW50LnR5cGUgPT09ICdwYXJhbGxlbCcpIHtcbiAgICAgICAgICBpZiAoZ2V0Q2hpbGRyZW4oZ3JhbmRwYXJlbnQpLmV2ZXJ5KHBhcmVudE5vZGUgPT4gaXNJbkZpbmFsU3RhdGUoWy4uLm11dENvbmZpZ3VyYXRpb25dLCBwYXJlbnROb2RlKSkpIHtcbiAgICAgICAgICAgIGludGVybmFsUXVldWUucHVzaChjcmVhdGVEb25lU3RhdGVFdmVudChncmFuZHBhcmVudC5pZCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuZnVuY3Rpb24gY29tcHV0ZUVudHJ5U2V0KHRyYW5zaXRpb25zLCBoaXN0b3J5VmFsdWUsIHN0YXRlc0ZvckRlZmF1bHRFbnRyeSwgc3RhdGVzVG9FbnRlcikge1xuICBmb3IgKGNvbnN0IHQgb2YgdHJhbnNpdGlvbnMpIHtcbiAgICBmb3IgKGNvbnN0IHMgb2YgdC50YXJnZXQgfHwgW10pIHtcbiAgICAgIGFkZERlc2NlbmRhbnRTdGF0ZXNUb0VudGVyKHMsIGhpc3RvcnlWYWx1ZSwgc3RhdGVzRm9yRGVmYXVsdEVudHJ5LCBzdGF0ZXNUb0VudGVyKTtcbiAgICB9XG4gICAgY29uc3QgYW5jZXN0b3IgPSBnZXRUcmFuc2l0aW9uRG9tYWluKHQsIGhpc3RvcnlWYWx1ZSk7XG4gICAgY29uc3QgdGFyZ2V0U3RhdGVzID0gZ2V0RWZmZWN0aXZlVGFyZ2V0U3RhdGVzKHQsIGhpc3RvcnlWYWx1ZSk7XG4gICAgZm9yIChjb25zdCBzIG9mIHRhcmdldFN0YXRlcykge1xuICAgICAgYWRkQW5jZXN0b3JTdGF0ZXNUb0VudGVyKHMsIGFuY2VzdG9yLCBzdGF0ZXNUb0VudGVyLCBoaXN0b3J5VmFsdWUsIHN0YXRlc0ZvckRlZmF1bHRFbnRyeSk7XG4gICAgfVxuICB9XG59XG5mdW5jdGlvbiBhZGREZXNjZW5kYW50U3RhdGVzVG9FbnRlcihzdGF0ZU5vZGUsIGhpc3RvcnlWYWx1ZSwgc3RhdGVzRm9yRGVmYXVsdEVudHJ5LCBzdGF0ZXNUb0VudGVyKSB7XG4gIGlmIChpc0hpc3RvcnlOb2RlKHN0YXRlTm9kZSkpIHtcbiAgICBpZiAoaGlzdG9yeVZhbHVlW3N0YXRlTm9kZS5pZF0pIHtcbiAgICAgIGNvbnN0IGhpc3RvcnlTdGF0ZU5vZGVzID0gaGlzdG9yeVZhbHVlW3N0YXRlTm9kZS5pZF07XG4gICAgICBmb3IgKGNvbnN0IHMgb2YgaGlzdG9yeVN0YXRlTm9kZXMpIHtcbiAgICAgICAgYWRkRGVzY2VuZGFudFN0YXRlc1RvRW50ZXIocywgaGlzdG9yeVZhbHVlLCBzdGF0ZXNGb3JEZWZhdWx0RW50cnksIHN0YXRlc1RvRW50ZXIpO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBzIG9mIGhpc3RvcnlTdGF0ZU5vZGVzKSB7XG4gICAgICAgIGFkZEFuY2VzdG9yU3RhdGVzVG9FbnRlcihzLCBzdGF0ZU5vZGUucGFyZW50LCBzdGF0ZXNUb0VudGVyLCBoaXN0b3J5VmFsdWUsIHN0YXRlc0ZvckRlZmF1bHRFbnRyeSk7XG4gICAgICAgIGZvciAoY29uc3Qgc3RhdGVGb3JEZWZhdWx0RW50cnkgb2Ygc3RhdGVzRm9yRGVmYXVsdEVudHJ5KSB7XG4gICAgICAgICAgc3RhdGVzRm9yRGVmYXVsdEVudHJ5LmFkZChzdGF0ZUZvckRlZmF1bHRFbnRyeSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgdGFyZ2V0cyA9IHJlc29sdmVIaXN0b3J5VGFyZ2V0KHN0YXRlTm9kZSk7XG4gICAgICBmb3IgKGNvbnN0IHMgb2YgdGFyZ2V0cykge1xuICAgICAgICBhZGREZXNjZW5kYW50U3RhdGVzVG9FbnRlcihzLCBoaXN0b3J5VmFsdWUsIHN0YXRlc0ZvckRlZmF1bHRFbnRyeSwgc3RhdGVzVG9FbnRlcik7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHMgb2YgdGFyZ2V0cykge1xuICAgICAgICBhZGRBbmNlc3RvclN0YXRlc1RvRW50ZXIocywgc3RhdGVOb2RlLCBzdGF0ZXNUb0VudGVyLCBoaXN0b3J5VmFsdWUsIHN0YXRlc0ZvckRlZmF1bHRFbnRyeSk7XG4gICAgICAgIGZvciAoY29uc3Qgc3RhdGVGb3JEZWZhdWx0RW50cnkgb2Ygc3RhdGVzRm9yRGVmYXVsdEVudHJ5KSB7XG4gICAgICAgICAgc3RhdGVzRm9yRGVmYXVsdEVudHJ5LmFkZChzdGF0ZUZvckRlZmF1bHRFbnRyeSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc3RhdGVzVG9FbnRlci5hZGQoc3RhdGVOb2RlKTtcbiAgICBpZiAoc3RhdGVOb2RlLnR5cGUgPT09ICdjb21wb3VuZCcpIHtcbiAgICAgIHN0YXRlc0ZvckRlZmF1bHRFbnRyeS5hZGQoc3RhdGVOb2RlKTtcbiAgICAgIGNvbnN0IGluaXRpYWxTdGF0ZXMgPSBzdGF0ZU5vZGUuaW5pdGlhbC50YXJnZXQ7XG4gICAgICBmb3IgKGNvbnN0IGluaXRpYWxTdGF0ZSBvZiBpbml0aWFsU3RhdGVzKSB7XG4gICAgICAgIGFkZERlc2NlbmRhbnRTdGF0ZXNUb0VudGVyKGluaXRpYWxTdGF0ZSwgaGlzdG9yeVZhbHVlLCBzdGF0ZXNGb3JEZWZhdWx0RW50cnksIHN0YXRlc1RvRW50ZXIpO1xuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBpbml0aWFsU3RhdGUgb2YgaW5pdGlhbFN0YXRlcykge1xuICAgICAgICBhZGRBbmNlc3RvclN0YXRlc1RvRW50ZXIoaW5pdGlhbFN0YXRlLCBzdGF0ZU5vZGUsIHN0YXRlc1RvRW50ZXIsIGhpc3RvcnlWYWx1ZSwgc3RhdGVzRm9yRGVmYXVsdEVudHJ5KTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHN0YXRlTm9kZS50eXBlID09PSAncGFyYWxsZWwnKSB7XG4gICAgICAgIGZvciAoY29uc3QgY2hpbGQgb2YgZ2V0Q2hpbGRyZW4oc3RhdGVOb2RlKS5maWx0ZXIoc24gPT4gIWlzSGlzdG9yeU5vZGUoc24pKSkge1xuICAgICAgICAgIGlmICghWy4uLnN0YXRlc1RvRW50ZXJdLnNvbWUocyA9PiBpc0Rlc2NlbmRhbnQocywgY2hpbGQpKSkge1xuICAgICAgICAgICAgYWRkRGVzY2VuZGFudFN0YXRlc1RvRW50ZXIoY2hpbGQsIGhpc3RvcnlWYWx1ZSwgc3RhdGVzRm9yRGVmYXVsdEVudHJ5LCBzdGF0ZXNUb0VudGVyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbmZ1bmN0aW9uIGFkZEFuY2VzdG9yU3RhdGVzVG9FbnRlcihzdGF0ZU5vZGUsIHRvU3RhdGVOb2RlLCBzdGF0ZXNUb0VudGVyLCBoaXN0b3J5VmFsdWUsIHN0YXRlc0ZvckRlZmF1bHRFbnRyeSkge1xuICBjb25zdCBwcm9wZXJBbmNlc3RvcnMgPSBnZXRQcm9wZXJBbmNlc3RvcnMoc3RhdGVOb2RlLCB0b1N0YXRlTm9kZSk7XG4gIGZvciAoY29uc3QgYW5jIG9mIHByb3BlckFuY2VzdG9ycykge1xuICAgIHN0YXRlc1RvRW50ZXIuYWRkKGFuYyk7XG4gICAgaWYgKGFuYy50eXBlID09PSAncGFyYWxsZWwnKSB7XG4gICAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIGdldENoaWxkcmVuKGFuYykuZmlsdGVyKHNuID0+ICFpc0hpc3RvcnlOb2RlKHNuKSkpIHtcbiAgICAgICAgaWYgKCFbLi4uc3RhdGVzVG9FbnRlcl0uc29tZShzID0+IGlzRGVzY2VuZGFudChzLCBjaGlsZCkpKSB7XG4gICAgICAgICAgYWRkRGVzY2VuZGFudFN0YXRlc1RvRW50ZXIoY2hpbGQsIGhpc3RvcnlWYWx1ZSwgc3RhdGVzRm9yRGVmYXVsdEVudHJ5LCBzdGF0ZXNUb0VudGVyKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuZnVuY3Rpb24gZXhpdFN0YXRlcyh0cmFuc2l0aW9ucywgbXV0Q29uZmlndXJhdGlvbiwgaGlzdG9yeVZhbHVlLCBhY3Rpb25zKSB7XG4gIGNvbnN0IHN0YXRlc1RvRXhpdCA9IGNvbXB1dGVFeGl0U2V0KHRyYW5zaXRpb25zLCBtdXRDb25maWd1cmF0aW9uLCBoaXN0b3J5VmFsdWUpO1xuICBzdGF0ZXNUb0V4aXQuc29ydCgoYSwgYikgPT4gYi5vcmRlciAtIGEub3JkZXIpO1xuXG4gIC8vIEZyb20gU0NYTUwgYWxnb3JpdGhtOiBodHRwczovL3d3dy53My5vcmcvVFIvc2N4bWwvI2V4aXRTdGF0ZXNcbiAgZm9yIChjb25zdCBleGl0U3RhdGVOb2RlIG9mIHN0YXRlc1RvRXhpdCkge1xuICAgIGZvciAoY29uc3QgaGlzdG9yeU5vZGUgb2YgZ2V0SGlzdG9yeU5vZGVzKGV4aXRTdGF0ZU5vZGUpKSB7XG4gICAgICBsZXQgcHJlZGljYXRlO1xuICAgICAgaWYgKGhpc3RvcnlOb2RlLmhpc3RvcnkgPT09ICdkZWVwJykge1xuICAgICAgICBwcmVkaWNhdGUgPSBzbiA9PiBpc0F0b21pY1N0YXRlTm9kZShzbikgJiYgaXNEZXNjZW5kYW50KHNuLCBleGl0U3RhdGVOb2RlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHByZWRpY2F0ZSA9IHNuID0+IHtcbiAgICAgICAgICByZXR1cm4gc24ucGFyZW50ID09PSBleGl0U3RhdGVOb2RlO1xuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaGlzdG9yeVZhbHVlW2hpc3RvcnlOb2RlLmlkXSA9IEFycmF5LmZyb20obXV0Q29uZmlndXJhdGlvbikuZmlsdGVyKHByZWRpY2F0ZSk7XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgcyBvZiBzdGF0ZXNUb0V4aXQpIHtcbiAgICBhY3Rpb25zLnB1c2goLi4ucy5leGl0LCAuLi5zLmludm9rZS5tYXAoZGVmID0+IHN0b3AoZGVmLmlkKSkpO1xuICAgIG11dENvbmZpZ3VyYXRpb24uZGVsZXRlKHMpO1xuICB9XG59XG5mdW5jdGlvbiByZXNvbHZlQWN0aW9uc0FuZENvbnRleHQoYWN0aW9ucywgZXZlbnQsIGN1cnJlbnRTdGF0ZSwgYWN0b3JDdHgpIHtcbiAgY29uc3Qge1xuICAgIG1hY2hpbmVcbiAgfSA9IGN1cnJlbnRTdGF0ZTtcbiAgLy8gVE9ETzogdGhpcyBgY2xvbmVTdGF0ZWAgaXMgcmVhbGx5IGp1c3QgYSBoYWNrIHRvIHByZXZlbnQgaW5maW5pdGUgbG9vcHNcbiAgLy8gd2UgbmVlZCB0byB0YWtlIGFub3RoZXIgbG9vayBhdCBob3cgaW50ZXJuYWwgcXVldWUgaXMgbWFuYWdlZFxuICBsZXQgaW50ZXJtZWRpYXRlU3RhdGUgPSBjbG9uZVN0YXRlKGN1cnJlbnRTdGF0ZSwge1xuICAgIF9pbnRlcm5hbFF1ZXVlOiBbXVxuICB9KTtcbiAgZm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuICAgIGNvbnN0IGlzSW5saW5lID0gdHlwZW9mIGFjdGlvbiA9PT0gJ2Z1bmN0aW9uJztcbiAgICBjb25zdCByZXNvbHZlZEFjdGlvbiA9IGlzSW5saW5lID8gYWN0aW9uIDpcbiAgICAvLyB0aGUgZXhpc3RpbmcgdHlwZSBvZiBgLmFjdGlvbnNgIGFzc3VtZXMgbm9uLW51bGxhYmxlIGBURXhwcmVzc2lvbkFjdGlvbmBcbiAgICAvLyBpdCdzIGZpbmUgdG8gY2FzdCB0aGlzIGhlcmUgdG8gZ2V0IGEgY29tbW9uIHR5cGUgYW5kIGxhY2sgb2YgZXJyb3JzIGluIHRoZSByZXN0IG9mIHRoZSBjb2RlXG4gICAgLy8gb3VyIGxvZ2ljIGJlbG93IG1ha2VzIHN1cmUgdGhhdCB3ZSBjYWxsIHRob3NlIDIgXCJ2YXJpYW50c1wiIGNvcnJlY3RseVxuICAgIG1hY2hpbmUuaW1wbGVtZW50YXRpb25zLmFjdGlvbnNbdHlwZW9mIGFjdGlvbiA9PT0gJ3N0cmluZycgPyBhY3Rpb24gOiBhY3Rpb24udHlwZV07XG4gICAgaWYgKCFyZXNvbHZlZEFjdGlvbikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGFjdGlvbkFyZ3MgPSB7XG4gICAgICBjb250ZXh0OiBpbnRlcm1lZGlhdGVTdGF0ZS5jb250ZXh0LFxuICAgICAgZXZlbnQsXG4gICAgICBzZWxmOiBhY3RvckN0eD8uc2VsZixcbiAgICAgIHN5c3RlbTogYWN0b3JDdHg/LnN5c3RlbSxcbiAgICAgIGFjdGlvbjogaXNJbmxpbmUgPyB1bmRlZmluZWQgOiB0eXBlb2YgYWN0aW9uID09PSAnc3RyaW5nJyA/IHtcbiAgICAgICAgdHlwZTogYWN0aW9uXG4gICAgICB9IDogdHlwZW9mIGFjdGlvbi5wYXJhbXMgPT09ICdmdW5jdGlvbicgPyB7XG4gICAgICAgIHR5cGU6IGFjdGlvbi50eXBlLFxuICAgICAgICBwYXJhbXM6IGFjdGlvbi5wYXJhbXMoe1xuICAgICAgICAgIGNvbnRleHQ6IGludGVybWVkaWF0ZVN0YXRlLmNvbnRleHQsXG4gICAgICAgICAgZXZlbnRcbiAgICAgICAgfSlcbiAgICAgIH0gOlxuICAgICAgLy8gVFMgaXNuJ3QgYWJsZSB0byBuYXJyb3cgaXQgZG93biBoZXJlXG4gICAgICBhY3Rpb25cbiAgICB9O1xuICAgIGlmICghKCdyZXNvbHZlJyBpbiByZXNvbHZlZEFjdGlvbikpIHtcbiAgICAgIGlmIChhY3RvckN0eD8uc2VsZi5zdGF0dXMgPT09IEFjdG9yU3RhdHVzLlJ1bm5pbmcpIHtcbiAgICAgICAgcmVzb2x2ZWRBY3Rpb24oYWN0aW9uQXJncyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhY3RvckN0eD8uZGVmZXIoKCkgPT4ge1xuICAgICAgICAgIHJlc29sdmVkQWN0aW9uKGFjdGlvbkFyZ3MpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBidWlsdGluQWN0aW9uID0gcmVzb2x2ZWRBY3Rpb247XG4gICAgY29uc3QgW25leHRTdGF0ZSwgcGFyYW1zLCBhY3Rpb25zXSA9IGJ1aWx0aW5BY3Rpb24ucmVzb2x2ZShhY3RvckN0eCwgaW50ZXJtZWRpYXRlU3RhdGUsIGFjdGlvbkFyZ3MsIHJlc29sdmVkQWN0aW9uIC8vIHRoaXMgaG9sZHMgYWxsIHBhcmFtc1xuICAgICk7XG5cbiAgICBpbnRlcm1lZGlhdGVTdGF0ZSA9IG5leHRTdGF0ZTtcbiAgICBpZiAoJ2V4ZWN1dGUnIGluIHJlc29sdmVkQWN0aW9uKSB7XG4gICAgICBpZiAoYWN0b3JDdHg/LnNlbGYuc3RhdHVzID09PSBBY3RvclN0YXR1cy5SdW5uaW5nKSB7XG4gICAgICAgIGJ1aWx0aW5BY3Rpb24uZXhlY3V0ZShhY3RvckN0eCwgcGFyYW1zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGFjdG9yQ3R4Py5kZWZlcihidWlsdGluQWN0aW9uLmV4ZWN1dGUuYmluZChudWxsLCBhY3RvckN0eCwgcGFyYW1zKSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChhY3Rpb25zKSB7XG4gICAgICBpbnRlcm1lZGlhdGVTdGF0ZSA9IHJlc29sdmVBY3Rpb25zQW5kQ29udGV4dChhY3Rpb25zLCBldmVudCwgaW50ZXJtZWRpYXRlU3RhdGUsIGFjdG9yQ3R4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGludGVybWVkaWF0ZVN0YXRlO1xufVxuZnVuY3Rpb24gbWFjcm9zdGVwKHN0YXRlLCBldmVudCwgYWN0b3JDdHgpIHtcbiAgbGV0IG5leHRTdGF0ZSA9IHN0YXRlO1xuICBjb25zdCBzdGF0ZXMgPSBbXTtcblxuICAvLyBIYW5kbGUgc3RvcCBldmVudFxuICBpZiAoZXZlbnQudHlwZSA9PT0gWFNUQVRFX1NUT1ApIHtcbiAgICBuZXh0U3RhdGUgPSBzdG9wU3RlcChldmVudCwgbmV4dFN0YXRlLCBhY3RvckN0eCk7XG4gICAgc3RhdGVzLnB1c2gobmV4dFN0YXRlKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdGU6IG5leHRTdGF0ZSxcbiAgICAgIG1pY3Jvc3RhdGVzOiBzdGF0ZXNcbiAgICB9O1xuICB9XG4gIGxldCBuZXh0RXZlbnQgPSBldmVudDtcblxuICAvLyBBc3N1bWUgdGhlIHN0YXRlIGlzIGF0IHJlc3QgKG5vIHJhaXNlZCBldmVudHMpXG4gIC8vIERldGVybWluZSB0aGUgbmV4dCBzdGF0ZSBiYXNlZCBvbiB0aGUgbmV4dCBtaWNyb3N0ZXBcbiAgaWYgKG5leHRFdmVudC50eXBlICE9PSBYU1RBVEVfSU5JVCkge1xuICAgIGNvbnN0IHRyYW5zaXRpb25zID0gc2VsZWN0VHJhbnNpdGlvbnMobmV4dEV2ZW50LCBuZXh0U3RhdGUpO1xuICAgIG5leHRTdGF0ZSA9IG1pY3Jvc3RlcCh0cmFuc2l0aW9ucywgc3RhdGUsIGFjdG9yQ3R4LCBuZXh0RXZlbnQsIGZhbHNlKTtcbiAgICBzdGF0ZXMucHVzaChuZXh0U3RhdGUpO1xuICB9XG4gIHdoaWxlIChuZXh0U3RhdGUuc3RhdHVzID09PSAnYWN0aXZlJykge1xuICAgIGxldCBlbmFibGVkVHJhbnNpdGlvbnMgPSBzZWxlY3RFdmVudGxlc3NUcmFuc2l0aW9ucyhuZXh0U3RhdGUsIG5leHRFdmVudCk7XG4gICAgaWYgKCFlbmFibGVkVHJhbnNpdGlvbnMubGVuZ3RoKSB7XG4gICAgICBpZiAoIW5leHRTdGF0ZS5faW50ZXJuYWxRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuZXh0RXZlbnQgPSBuZXh0U3RhdGUuX2ludGVybmFsUXVldWVbMF07XG4gICAgICAgIGNvbnN0IHRyYW5zaXRpb25zID0gc2VsZWN0VHJhbnNpdGlvbnMobmV4dEV2ZW50LCBuZXh0U3RhdGUpO1xuICAgICAgICBuZXh0U3RhdGUgPSBtaWNyb3N0ZXAodHJhbnNpdGlvbnMsIG5leHRTdGF0ZSwgYWN0b3JDdHgsIG5leHRFdmVudCwgZmFsc2UpO1xuICAgICAgICBuZXh0U3RhdGUuX2ludGVybmFsUXVldWUuc2hpZnQoKTtcbiAgICAgICAgc3RhdGVzLnB1c2gobmV4dFN0YXRlKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dFN0YXRlID0gbWljcm9zdGVwKGVuYWJsZWRUcmFuc2l0aW9ucywgbmV4dFN0YXRlLCBhY3RvckN0eCwgbmV4dEV2ZW50LCBmYWxzZSk7XG4gICAgICBzdGF0ZXMucHVzaChuZXh0U3RhdGUpO1xuICAgIH1cbiAgfVxuICBpZiAobmV4dFN0YXRlLnN0YXR1cyAhPT0gJ2FjdGl2ZScpIHtcbiAgICAvLyBQZXJmb3JtIHRoZSBzdG9wIHN0ZXAgdG8gZW5zdXJlIHRoYXQgY2hpbGQgYWN0b3JzIGFyZSBzdG9wcGVkXG4gICAgc3RvcFN0ZXAobmV4dEV2ZW50LCBuZXh0U3RhdGUsIGFjdG9yQ3R4KTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHN0YXRlOiBuZXh0U3RhdGUsXG4gICAgbWljcm9zdGF0ZXM6IHN0YXRlc1xuICB9O1xufVxuZnVuY3Rpb24gc3RvcFN0ZXAoZXZlbnQsIG5leHRTdGF0ZSwgYWN0b3JDdHgpIHtcbiAgY29uc3QgYWN0aW9ucyA9IFtdO1xuICBmb3IgKGNvbnN0IHN0YXRlTm9kZSBvZiBuZXh0U3RhdGUuY29uZmlndXJhdGlvbi5zb3J0KChhLCBiKSA9PiBiLm9yZGVyIC0gYS5vcmRlcikpIHtcbiAgICBhY3Rpb25zLnB1c2goLi4uc3RhdGVOb2RlLmV4aXQpO1xuICB9XG4gIGZvciAoY29uc3QgY2hpbGQgb2YgT2JqZWN0LnZhbHVlcyhuZXh0U3RhdGUuY2hpbGRyZW4pKSB7XG4gICAgYWN0aW9ucy5wdXNoKHN0b3AoY2hpbGQpKTtcbiAgfVxuICByZXR1cm4gcmVzb2x2ZUFjdGlvbnNBbmRDb250ZXh0KGFjdGlvbnMsIGV2ZW50LCBuZXh0U3RhdGUsIGFjdG9yQ3R4KTtcbn1cbmZ1bmN0aW9uIHNlbGVjdFRyYW5zaXRpb25zKGV2ZW50LCBuZXh0U3RhdGUpIHtcbiAgcmV0dXJuIG5leHRTdGF0ZS5tYWNoaW5lLmdldFRyYW5zaXRpb25EYXRhKG5leHRTdGF0ZSwgZXZlbnQpO1xufVxuZnVuY3Rpb24gc2VsZWN0RXZlbnRsZXNzVHJhbnNpdGlvbnMobmV4dFN0YXRlLCBldmVudCkge1xuICBjb25zdCBlbmFibGVkVHJhbnNpdGlvblNldCA9IG5ldyBTZXQoKTtcbiAgY29uc3QgYXRvbWljU3RhdGVzID0gbmV4dFN0YXRlLmNvbmZpZ3VyYXRpb24uZmlsdGVyKGlzQXRvbWljU3RhdGVOb2RlKTtcbiAgZm9yIChjb25zdCBzdGF0ZU5vZGUgb2YgYXRvbWljU3RhdGVzKSB7XG4gICAgbG9vcDogZm9yIChjb25zdCBzIG9mIFtzdGF0ZU5vZGVdLmNvbmNhdChnZXRQcm9wZXJBbmNlc3RvcnMoc3RhdGVOb2RlLCBudWxsKSkpIHtcbiAgICAgIGlmICghcy5hbHdheXMpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHRyYW5zaXRpb24gb2Ygcy5hbHdheXMpIHtcbiAgICAgICAgaWYgKHRyYW5zaXRpb24uZ3VhcmQgPT09IHVuZGVmaW5lZCB8fCBldmFsdWF0ZUd1YXJkKHRyYW5zaXRpb24uZ3VhcmQsIG5leHRTdGF0ZS5jb250ZXh0LCBldmVudCwgbmV4dFN0YXRlKSkge1xuICAgICAgICAgIGVuYWJsZWRUcmFuc2l0aW9uU2V0LmFkZCh0cmFuc2l0aW9uKTtcbiAgICAgICAgICBicmVhayBsb29wO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZW1vdmVDb25mbGljdGluZ1RyYW5zaXRpb25zKEFycmF5LmZyb20oZW5hYmxlZFRyYW5zaXRpb25TZXQpLCBuZXcgU2V0KG5leHRTdGF0ZS5jb25maWd1cmF0aW9uKSwgbmV4dFN0YXRlLmhpc3RvcnlWYWx1ZSk7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgYSBwYXJ0aWFsIHN0YXRlIHZhbHVlIHdpdGggaXRzIGZ1bGwgcmVwcmVzZW50YXRpb24gaW4gdGhlIHN0YXRlIG5vZGUncyBtYWNoaW5lLlxuICpcbiAqIEBwYXJhbSBzdGF0ZVZhbHVlIFRoZSBwYXJ0aWFsIHN0YXRlIHZhbHVlIHRvIHJlc29sdmUuXG4gKi9cbmZ1bmN0aW9uIHJlc29sdmVTdGF0ZVZhbHVlKHJvb3ROb2RlLCBzdGF0ZVZhbHVlKSB7XG4gIGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBnZXRDb25maWd1cmF0aW9uKGdldFN0YXRlTm9kZXMocm9vdE5vZGUsIHN0YXRlVmFsdWUpKTtcbiAgcmV0dXJuIGdldFN0YXRlVmFsdWUocm9vdE5vZGUsIFsuLi5jb25maWd1cmF0aW9uXSk7XG59XG5mdW5jdGlvbiBnZXRJbml0aWFsQ29uZmlndXJhdGlvbihyb290Tm9kZSkge1xuICBjb25zdCBjb25maWd1cmF0aW9uID0gW107XG4gIGNvbnN0IGluaXRpYWxUcmFuc2l0aW9uID0gcm9vdE5vZGUuaW5pdGlhbDtcbiAgY29uc3Qgc3RhdGVzVG9FbnRlciA9IG5ldyBTZXQoKTtcbiAgY29uc3Qgc3RhdGVzRm9yRGVmYXVsdEVudHJ5ID0gbmV3IFNldChbcm9vdE5vZGVdKTtcbiAgY29tcHV0ZUVudHJ5U2V0KFtpbml0aWFsVHJhbnNpdGlvbl0sIHt9LCBzdGF0ZXNGb3JEZWZhdWx0RW50cnksIHN0YXRlc1RvRW50ZXIpO1xuICBmb3IgKGNvbnN0IHN0YXRlTm9kZVRvRW50ZXIgb2YgWy4uLnN0YXRlc1RvRW50ZXJdLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKSkge1xuICAgIGNvbmZpZ3VyYXRpb24ucHVzaChzdGF0ZU5vZGVUb0VudGVyKTtcbiAgfVxuICByZXR1cm4gY29uZmlndXJhdGlvbjtcbn1cblxuY2xhc3MgU3RhdGUge1xuICAvKipcbiAgICogSW5kaWNhdGVzIHdoZXRoZXIgdGhlIHN0YXRlIGlzIGEgZmluYWwgc3RhdGUuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBUaGUgb3V0cHV0IGRhdGEgb2YgdGhlIHRvcC1sZXZlbCBmaW5pdGUgc3RhdGUuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBUaGUgZW5hYmxlZCBzdGF0ZSBub2RlcyByZXByZXNlbnRhdGl2ZSBvZiB0aGUgc3RhdGUgdmFsdWUuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBBbiBvYmplY3QgbWFwcGluZyBhY3RvciBuYW1lcyB0byBzcGF3bmVkL2ludm9rZWQgYWN0b3JzLlxuICAgKi9cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBTdGF0ZSBpbnN0YW5jZSBmb3IgdGhlIGdpdmVuIGBzdGF0ZVZhbHVlYCBhbmQgYGNvbnRleHRgLlxuICAgKiBAcGFyYW0gc3RhdGVWYWx1ZVxuICAgKiBAcGFyYW0gY29udGV4dFxuICAgKi9cbiAgc3RhdGljIGZyb20oc3RhdGVWYWx1ZSwgY29udGV4dCA9IHt9LCBtYWNoaW5lKSB7XG4gICAgaWYgKHN0YXRlVmFsdWUgaW5zdGFuY2VvZiBTdGF0ZSkge1xuICAgICAgaWYgKHN0YXRlVmFsdWUuY29udGV4dCAhPT0gY29udGV4dCkge1xuICAgICAgICByZXR1cm4gbmV3IFN0YXRlKHtcbiAgICAgICAgICB2YWx1ZTogc3RhdGVWYWx1ZS52YWx1ZSxcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIG1ldGE6IHt9LFxuICAgICAgICAgIGNvbmZpZ3VyYXRpb246IFtdLFxuICAgICAgICAgIC8vIFRPRE86IGZpeCxcbiAgICAgICAgICBjaGlsZHJlbjoge30sXG4gICAgICAgICAgc3RhdHVzOiAnYWN0aXZlJ1xuICAgICAgICB9LCBtYWNoaW5lKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGF0ZVZhbHVlO1xuICAgIH1cbiAgICBjb25zdCBjb25maWd1cmF0aW9uID0gZ2V0Q29uZmlndXJhdGlvbihnZXRTdGF0ZU5vZGVzKG1hY2hpbmUucm9vdCwgc3RhdGVWYWx1ZSkpO1xuICAgIHJldHVybiBuZXcgU3RhdGUoe1xuICAgICAgdmFsdWU6IHN0YXRlVmFsdWUsXG4gICAgICBjb250ZXh0LFxuICAgICAgbWV0YTogdW5kZWZpbmVkLFxuICAgICAgY29uZmlndXJhdGlvbjogQXJyYXkuZnJvbShjb25maWd1cmF0aW9uKSxcbiAgICAgIGNoaWxkcmVuOiB7fSxcbiAgICAgIHN0YXR1czogJ2FjdGl2ZSdcbiAgICB9LCBtYWNoaW5lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IGBTdGF0ZWAgaW5zdGFuY2UgdGhhdCByZXByZXNlbnRzIHRoZSBjdXJyZW50IHN0YXRlIG9mIGEgcnVubmluZyBtYWNoaW5lLlxuICAgKlxuICAgKiBAcGFyYW0gY29uZmlnXG4gICAqL1xuICBjb25zdHJ1Y3Rvcihjb25maWcsIG1hY2hpbmUpIHtcbiAgICB0aGlzLm1hY2hpbmUgPSBtYWNoaW5lO1xuICAgIHRoaXMudGFncyA9IHZvaWQgMDtcbiAgICB0aGlzLnZhbHVlID0gdm9pZCAwO1xuICAgIHRoaXMuc3RhdHVzID0gdm9pZCAwO1xuICAgIHRoaXMuZXJyb3IgPSB2b2lkIDA7XG4gICAgdGhpcy5jb250ZXh0ID0gdm9pZCAwO1xuICAgIHRoaXMuaGlzdG9yeVZhbHVlID0ge307XG4gICAgdGhpcy5faW50ZXJuYWxRdWV1ZSA9IHZvaWQgMDtcbiAgICB0aGlzLmNvbmZpZ3VyYXRpb24gPSB2b2lkIDA7XG4gICAgdGhpcy5jaGlsZHJlbiA9IHZvaWQgMDtcbiAgICB0aGlzLmNvbnRleHQgPSBjb25maWcuY29udGV4dDtcbiAgICB0aGlzLl9pbnRlcm5hbFF1ZXVlID0gY29uZmlnLl9pbnRlcm5hbFF1ZXVlID8/IFtdO1xuICAgIHRoaXMuaGlzdG9yeVZhbHVlID0gY29uZmlnLmhpc3RvcnlWYWx1ZSB8fCB7fTtcbiAgICB0aGlzLm1hdGNoZXMgPSB0aGlzLm1hdGNoZXMuYmluZCh0aGlzKTtcbiAgICB0aGlzLnRvU3RyaW5ncyA9IHRoaXMudG9TdHJpbmdzLmJpbmQodGhpcyk7XG4gICAgdGhpcy5jb25maWd1cmF0aW9uID0gY29uZmlnLmNvbmZpZ3VyYXRpb24gPz8gQXJyYXkuZnJvbShnZXRDb25maWd1cmF0aW9uKGdldFN0YXRlTm9kZXMobWFjaGluZS5yb290LCBjb25maWcudmFsdWUpKSk7XG4gICAgdGhpcy5jaGlsZHJlbiA9IGNvbmZpZy5jaGlsZHJlbjtcbiAgICB0aGlzLnZhbHVlID0gZ2V0U3RhdGVWYWx1ZShtYWNoaW5lLnJvb3QsIHRoaXMuY29uZmlndXJhdGlvbik7XG4gICAgdGhpcy50YWdzID0gbmV3IFNldChmbGF0dGVuKHRoaXMuY29uZmlndXJhdGlvbi5tYXAoc24gPT4gc24udGFncykpKTtcbiAgICB0aGlzLnN0YXR1cyA9IGNvbmZpZy5zdGF0dXM7XG4gICAgdGhpcy5vdXRwdXQgPSBjb25maWcub3V0cHV0O1xuICAgIHRoaXMuZXJyb3IgPSBjb25maWcuZXJyb3I7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhbiBhcnJheSBvZiBhbGwgdGhlIHN0cmluZyBsZWFmIHN0YXRlIG5vZGUgcGF0aHMuXG4gICAqIEBwYXJhbSBzdGF0ZVZhbHVlXG4gICAqIEBwYXJhbSBkZWxpbWl0ZXIgVGhlIGNoYXJhY3RlcihzKSB0aGF0IHNlcGFyYXRlIGVhY2ggc3VicGF0aCBpbiB0aGUgc3RyaW5nIHN0YXRlIG5vZGUgcGF0aC5cbiAgICovXG4gIHRvU3RyaW5ncyhzdGF0ZVZhbHVlID0gdGhpcy52YWx1ZSkge1xuICAgIGlmICh0eXBlb2Ygc3RhdGVWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBbc3RhdGVWYWx1ZV07XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlS2V5cyA9IE9iamVjdC5rZXlzKHN0YXRlVmFsdWUpO1xuICAgIHJldHVybiB2YWx1ZUtleXMuY29uY2F0KC4uLnZhbHVlS2V5cy5tYXAoa2V5ID0+IHRoaXMudG9TdHJpbmdzKHN0YXRlVmFsdWVba2V5XSkubWFwKHMgPT4ga2V5ICsgU1RBVEVfREVMSU1JVEVSICsgcykpKTtcbiAgfVxuICB0b0pTT04oKSB7XG4gICAgY29uc3Qge1xuICAgICAgY29uZmlndXJhdGlvbixcbiAgICAgIHRhZ3MsXG4gICAgICBtYWNoaW5lLFxuICAgICAgLi4uanNvblZhbHVlc1xuICAgIH0gPSB0aGlzO1xuICAgIHJldHVybiB7XG4gICAgICAuLi5qc29uVmFsdWVzLFxuICAgICAgdGFnczogQXJyYXkuZnJvbSh0YWdzKSxcbiAgICAgIG1ldGE6IHRoaXMubWV0YVxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogV2hldGhlciB0aGUgY3VycmVudCBzdGF0ZSB2YWx1ZSBpcyBhIHN1YnNldCBvZiB0aGUgZ2l2ZW4gcGFyZW50IHN0YXRlIHZhbHVlLlxuICAgKiBAcGFyYW0gcGFyZW50U3RhdGVWYWx1ZVxuICAgKi9cbiAgbWF0Y2hlcyhwYXJlbnRTdGF0ZVZhbHVlKSB7XG4gICAgcmV0dXJuIG1hdGNoZXNTdGF0ZShwYXJlbnRTdGF0ZVZhbHVlLCB0aGlzLnZhbHVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBXaGV0aGVyIHRoZSBjdXJyZW50IHN0YXRlIGNvbmZpZ3VyYXRpb24gaGFzIGEgc3RhdGUgbm9kZSB3aXRoIHRoZSBzcGVjaWZpZWQgYHRhZ2AuXG4gICAqIEBwYXJhbSB0YWdcbiAgICovXG4gIGhhc1RhZyh0YWcpIHtcbiAgICByZXR1cm4gdGhpcy50YWdzLmhhcyh0YWcpO1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVybWluZXMgd2hldGhlciBzZW5kaW5nIHRoZSBgZXZlbnRgIHdpbGwgY2F1c2UgYSBub24tZm9yYmlkZGVuIHRyYW5zaXRpb25cbiAgICogdG8gYmUgc2VsZWN0ZWQsIGV2ZW4gaWYgdGhlIHRyYW5zaXRpb25zIGhhdmUgbm8gYWN0aW9ucyBub3JcbiAgICogY2hhbmdlIHRoZSBzdGF0ZSB2YWx1ZS5cbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCB0byB0ZXN0XG4gICAqIEByZXR1cm5zIFdoZXRoZXIgdGhlIGV2ZW50IHdpbGwgY2F1c2UgYSB0cmFuc2l0aW9uXG4gICAqL1xuICBjYW4oZXZlbnQpIHtcbiAgICBjb25zdCB0cmFuc2l0aW9uRGF0YSA9IHRoaXMubWFjaGluZS5nZXRUcmFuc2l0aW9uRGF0YSh0aGlzLCBldmVudCk7XG4gICAgcmV0dXJuICEhdHJhbnNpdGlvbkRhdGE/Lmxlbmd0aCAmJlxuICAgIC8vIENoZWNrIHRoYXQgYXQgbGVhc3Qgb25lIHRyYW5zaXRpb24gaXMgbm90IGZvcmJpZGRlblxuICAgIHRyYW5zaXRpb25EYXRhLnNvbWUodCA9PiB0LnRhcmdldCAhPT0gdW5kZWZpbmVkIHx8IHQuYWN0aW9ucy5sZW5ndGgpO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBuZXh0IGV2ZW50cyB0aGF0IHdpbGwgY2F1c2UgYSB0cmFuc2l0aW9uIGZyb20gdGhlIGN1cnJlbnQgc3RhdGUuXG4gICAqL1xuICBnZXQgbmV4dEV2ZW50cygpIHtcbiAgICByZXR1cm4gbWVtbyh0aGlzLCAnbmV4dEV2ZW50cycsICgpID0+IHtcbiAgICAgIHJldHVybiBbLi4ubmV3IFNldChmbGF0dGVuKFsuLi50aGlzLmNvbmZpZ3VyYXRpb24ubWFwKHNuID0+IHNuLm93bkV2ZW50cyldKSldO1xuICAgIH0pO1xuICB9XG4gIGdldCBtZXRhKCkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb24ucmVkdWNlKChhY2MsIHN0YXRlTm9kZSkgPT4ge1xuICAgICAgaWYgKHN0YXRlTm9kZS5tZXRhICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjW3N0YXRlTm9kZS5pZF0gPSBzdGF0ZU5vZGUubWV0YTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuICB9XG59XG5mdW5jdGlvbiBjbG9uZVN0YXRlKHN0YXRlLCBjb25maWcgPSB7fSkge1xuICByZXR1cm4gbmV3IFN0YXRlKHtcbiAgICAuLi5zdGF0ZSxcbiAgICAuLi5jb25maWdcbiAgfSwgc3RhdGUubWFjaGluZSk7XG59XG5mdW5jdGlvbiBnZXRQZXJzaXN0ZWRTdGF0ZShzdGF0ZSkge1xuICBjb25zdCB7XG4gICAgY29uZmlndXJhdGlvbixcbiAgICB0YWdzLFxuICAgIG1hY2hpbmUsXG4gICAgY2hpbGRyZW4sXG4gICAgLi4uanNvblZhbHVlc1xuICB9ID0gc3RhdGU7XG4gIGNvbnN0IGNoaWxkcmVuSnNvbiA9IHt9O1xuICBmb3IgKGNvbnN0IGlkIGluIGNoaWxkcmVuKSB7XG4gICAgY29uc3QgY2hpbGQgPSBjaGlsZHJlbltpZF07XG4gICAgY2hpbGRyZW5Kc29uW2lkXSA9IHtcbiAgICAgIHN0YXRlOiBjaGlsZC5nZXRQZXJzaXN0ZWRTdGF0ZT8uKCksXG4gICAgICBzcmM6IGNoaWxkLnNyY1xuICAgIH07XG4gIH1cbiAgcmV0dXJuIHtcbiAgICAuLi5qc29uVmFsdWVzLFxuICAgIGNoaWxkcmVuOiBjaGlsZHJlbkpzb25cbiAgfTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVJhaXNlKF8sIHN0YXRlLCBhcmdzLCB7XG4gIGV2ZW50OiBldmVudE9yRXhwcixcbiAgaWQsXG4gIGRlbGF5XG59KSB7XG4gIGNvbnN0IGRlbGF5c01hcCA9IHN0YXRlLm1hY2hpbmUuaW1wbGVtZW50YXRpb25zLmRlbGF5cztcbiAgaWYgKHR5cGVvZiBldmVudE9yRXhwciA9PT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE9ubHkgZXZlbnQgb2JqZWN0cyBtYXkgYmUgdXNlZCB3aXRoIHJhaXNlOyB1c2UgcmFpc2UoeyB0eXBlOiBcIiR7ZXZlbnRPckV4cHJ9XCIgfSkgaW5zdGVhZGApO1xuICB9XG4gIGNvbnN0IHJlc29sdmVkRXZlbnQgPSB0eXBlb2YgZXZlbnRPckV4cHIgPT09ICdmdW5jdGlvbicgPyBldmVudE9yRXhwcihhcmdzKSA6IGV2ZW50T3JFeHByO1xuICBsZXQgcmVzb2x2ZWREZWxheTtcbiAgaWYgKHR5cGVvZiBkZWxheSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBjb25maWdEZWxheSA9IGRlbGF5c01hcCAmJiBkZWxheXNNYXBbZGVsYXldO1xuICAgIHJlc29sdmVkRGVsYXkgPSB0eXBlb2YgY29uZmlnRGVsYXkgPT09ICdmdW5jdGlvbicgPyBjb25maWdEZWxheShhcmdzKSA6IGNvbmZpZ0RlbGF5O1xuICB9IGVsc2Uge1xuICAgIHJlc29sdmVkRGVsYXkgPSB0eXBlb2YgZGVsYXkgPT09ICdmdW5jdGlvbicgPyBkZWxheShhcmdzKSA6IGRlbGF5O1xuICB9XG4gIHJldHVybiBbdHlwZW9mIHJlc29sdmVkRGVsYXkgIT09ICdudW1iZXInID8gY2xvbmVTdGF0ZShzdGF0ZSwge1xuICAgIF9pbnRlcm5hbFF1ZXVlOiBzdGF0ZS5faW50ZXJuYWxRdWV1ZS5jb25jYXQocmVzb2x2ZWRFdmVudClcbiAgfSkgOiBzdGF0ZSwge1xuICAgIGV2ZW50OiByZXNvbHZlZEV2ZW50LFxuICAgIGlkLFxuICAgIGRlbGF5OiByZXNvbHZlZERlbGF5XG4gIH1dO1xufVxuZnVuY3Rpb24gZXhlY3V0ZVJhaXNlKGFjdG9yQ29udGV4dCwgcGFyYW1zKSB7XG4gIGlmICh0eXBlb2YgcGFyYW1zLmRlbGF5ID09PSAnbnVtYmVyJykge1xuICAgIGFjdG9yQ29udGV4dC5zZWxmLmRlbGF5U2VuZChwYXJhbXMpO1xuICAgIHJldHVybjtcbiAgfVxufVxuLyoqXG4gKiBSYWlzZXMgYW4gZXZlbnQuIFRoaXMgcGxhY2VzIHRoZSBldmVudCBpbiB0aGUgaW50ZXJuYWwgZXZlbnQgcXVldWUsIHNvIHRoYXRcbiAqIHRoZSBldmVudCBpcyBpbW1lZGlhdGVseSBjb25zdW1lZCBieSB0aGUgbWFjaGluZSBpbiB0aGUgY3VycmVudCBzdGVwLlxuICpcbiAqIEBwYXJhbSBldmVudFR5cGUgVGhlIGV2ZW50IHRvIHJhaXNlLlxuICovXG5mdW5jdGlvbiByYWlzZShldmVudE9yRXhwciwgb3B0aW9ucykge1xuICBmdW5jdGlvbiByYWlzZShfKSB7XG4gIH1cbiAgcmFpc2UudHlwZSA9ICd4c3RhdGUucmFpc2UnO1xuICByYWlzZS5ldmVudCA9IGV2ZW50T3JFeHByO1xuICByYWlzZS5pZCA9IG9wdGlvbnM/LmlkO1xuICByYWlzZS5kZWxheSA9IG9wdGlvbnM/LmRlbGF5O1xuICByYWlzZS5yZXNvbHZlID0gcmVzb2x2ZVJhaXNlO1xuICByYWlzZS5leGVjdXRlID0gZXhlY3V0ZVJhaXNlO1xuICByZXR1cm4gcmFpc2U7XG59XG5cbmV4cG9ydCB7IHJhaXNlIGFzIEEsIHN0b3AgYXMgQiwgU3RhdGUgYXMgUywgZm9ybWF0VHJhbnNpdGlvbiBhcyBhLCBmb3JtYXRJbml0aWFsVHJhbnNpdGlvbiBhcyBiLCBnZXRDYW5kaWRhdGVzIGFzIGMsIGdldENvbmZpZ3VyYXRpb24gYXMgZCwgZXZhbHVhdGVHdWFyZCBhcyBlLCBmb3JtYXRUcmFuc2l0aW9ucyBhcyBmLCBnZXREZWxheWVkVHJhbnNpdGlvbnMgYXMgZywgZ2V0U3RhdGVOb2RlcyBhcyBoLCBpc0luRmluYWxTdGF0ZSBhcyBpLCBjbG9uZVN0YXRlIGFzIGosIG1hY3Jvc3RlcCBhcyBrLCBnZXRJbml0aWFsQ29uZmlndXJhdGlvbiBhcyBsLCBtZW1vIGFzIG0sIHJlc29sdmVBY3Rpb25zQW5kQ29udGV4dCBhcyBuLCBtaWNyb3N0ZXAgYXMgbywgaXNBdG9taWNTdGF0ZU5vZGUgYXMgcCwgaXNTdGF0ZUlkIGFzIHEsIHJlc29sdmVTdGF0ZVZhbHVlIGFzIHIsIGdldFN0YXRlTm9kZUJ5UGF0aCBhcyBzLCB0cmFuc2l0aW9uTm9kZSBhcyB0LCBnZXRQZXJzaXN0ZWRTdGF0ZSBhcyB1LCBhbmQgYXMgdiwgbm90IGFzIHcsIG9yIGFzIHgsIHN0YXRlSW4gYXMgeSwgY2FuY2VsIGFzIHogfTtcbiIsImltcG9ydCB7IGogYXMgY2xvbmVTdGF0ZSwgZSBhcyBldmFsdWF0ZUd1YXJkIH0gZnJvbSAnLi9yYWlzZS0yZDkyZWFlOC5lc20uanMnO1xuaW1wb3J0IHsgZiBhcyBBY3RvclN0YXR1cywgayBhcyBjcmVhdGVFcnJvckFjdG9yRXZlbnQsIHIgYXMgcmVzb2x2ZVJlZmVyZW5jZWRBY3RvciwgZCBhcyBjcmVhdGVBY3RvciwgdCBhcyB0b0FycmF5LCB5IGFzIFhTVEFURV9FUlJPUiB9IGZyb20gJy4vaW50ZXJwcmV0ZXItMDM3Mzc4MTAuZXNtLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlU3Bhd25lcihhY3RvckNvbnRleHQsIHtcbiAgbWFjaGluZSxcbiAgY29udGV4dFxufSwgZXZlbnQsIHNwYXduZWRDaGlsZHJlbikge1xuICBjb25zdCBzcGF3biA9IChzcmMsIG9wdGlvbnMgPSB7fSkgPT4ge1xuICAgIGNvbnN0IHtcbiAgICAgIHN5c3RlbUlkXG4gICAgfSA9IG9wdGlvbnM7XG4gICAgaWYgKHR5cGVvZiBzcmMgPT09ICdzdHJpbmcnKSB7XG4gICAgICBjb25zdCByZWZlcmVuY2VkID0gcmVzb2x2ZVJlZmVyZW5jZWRBY3RvcihtYWNoaW5lLmltcGxlbWVudGF0aW9ucy5hY3RvcnNbc3JjXSk7XG4gICAgICBpZiAoIXJlZmVyZW5jZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBY3RvciBsb2dpYyAnJHtzcmN9JyBub3QgaW1wbGVtZW50ZWQgaW4gbWFjaGluZSAnJHttYWNoaW5lLmlkfSdgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGlucHV0ID0gJ2lucHV0JyBpbiBvcHRpb25zID8gb3B0aW9ucy5pbnB1dCA6IHJlZmVyZW5jZWQuaW5wdXQ7XG5cbiAgICAgIC8vIFRPRE86IHRoaXMgc2hvdWxkIGFsc28gcmVjZWl2ZSBgc3JjYFxuICAgICAgY29uc3QgYWN0b3JSZWYgPSBjcmVhdGVBY3RvcihyZWZlcmVuY2VkLnNyYywge1xuICAgICAgICBpZDogb3B0aW9ucy5pZCxcbiAgICAgICAgcGFyZW50OiBhY3RvckNvbnRleHQuc2VsZixcbiAgICAgICAgaW5wdXQ6IHR5cGVvZiBpbnB1dCA9PT0gJ2Z1bmN0aW9uJyA/IGlucHV0KHtcbiAgICAgICAgICBjb250ZXh0LFxuICAgICAgICAgIGV2ZW50LFxuICAgICAgICAgIHNlbGY6IGFjdG9yQ29udGV4dC5zZWxmXG4gICAgICAgIH0pIDogaW5wdXQsXG4gICAgICAgIHN5c3RlbUlkXG4gICAgICB9KTtcbiAgICAgIHNwYXduZWRDaGlsZHJlblthY3RvclJlZi5pZF0gPSBhY3RvclJlZjtcbiAgICAgIGlmIChvcHRpb25zLnN5bmNTbmFwc2hvdCkge1xuICAgICAgICBhY3RvclJlZi5zdWJzY3JpYmUoe1xuICAgICAgICAgIG5leHQ6IHNuYXBzaG90ID0+IHtcbiAgICAgICAgICAgIGlmIChzbmFwc2hvdC5zdGF0dXMgPT09ICdhY3RpdmUnKSB7XG4gICAgICAgICAgICAgIGFjdG9yQ29udGV4dC5zZWxmLnNlbmQoe1xuICAgICAgICAgICAgICAgIHR5cGU6IGB4c3RhdGUuc25hcHNob3QuJHthY3RvclJlZi5pZH1gLFxuICAgICAgICAgICAgICAgIHNuYXBzaG90XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgZXJyb3I6ICgpID0+IHtcbiAgICAgICAgICAgIC8qIFRPRE8gKi9cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjdG9yUmVmO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBUT0RPOiB0aGlzIHNob3VsZCBhbHNvIHJlY2VpdmUgYHNyY2BcbiAgICAgIGNvbnN0IGFjdG9yUmVmID0gY3JlYXRlQWN0b3Ioc3JjLCB7XG4gICAgICAgIGlkOiBvcHRpb25zLmlkLFxuICAgICAgICBwYXJlbnQ6IGFjdG9yQ29udGV4dC5zZWxmLFxuICAgICAgICBpbnB1dDogb3B0aW9ucy5pbnB1dCxcbiAgICAgICAgc3lzdGVtSWRcbiAgICAgIH0pO1xuICAgICAgaWYgKG9wdGlvbnMuc3luY1NuYXBzaG90KSB7XG4gICAgICAgIGFjdG9yUmVmLnN1YnNjcmliZSh7XG4gICAgICAgICAgbmV4dDogc25hcHNob3QgPT4ge1xuICAgICAgICAgICAgaWYgKHNuYXBzaG90LnN0YXR1cyA9PT0gJ2FjdGl2ZScpIHtcbiAgICAgICAgICAgICAgYWN0b3JDb250ZXh0LnNlbGYuc2VuZCh7XG4gICAgICAgICAgICAgICAgdHlwZTogYHhzdGF0ZS5zbmFwc2hvdC4ke2FjdG9yUmVmLmlkfWAsXG4gICAgICAgICAgICAgICAgc25hcHNob3QsXG4gICAgICAgICAgICAgICAgaWQ6IGFjdG9yUmVmLmlkXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgZXJyb3I6ICgpID0+IHtcbiAgICAgICAgICAgIC8qIFRPRE8gKi9cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjdG9yUmVmO1xuICAgIH1cbiAgfTtcbiAgcmV0dXJuIChzcmMsIG9wdGlvbnMpID0+IHtcbiAgICBjb25zdCBhY3RvclJlZiA9IHNwYXduKHNyYywgb3B0aW9ucyk7IC8vIFRPRE86IGZpeCB0eXBlc1xuICAgIHNwYXduZWRDaGlsZHJlblthY3RvclJlZi5pZF0gPSBhY3RvclJlZjtcbiAgICBhY3RvckNvbnRleHQuZGVmZXIoKCkgPT4ge1xuICAgICAgaWYgKGFjdG9yUmVmLnN0YXR1cyA9PT0gQWN0b3JTdGF0dXMuU3RvcHBlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBhY3RvclJlZi5zdGFydD8uKCk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgYWN0b3JDb250ZXh0LnNlbGYuc2VuZChjcmVhdGVFcnJvckFjdG9yRXZlbnQoYWN0b3JSZWYuaWQsIGVycikpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIGFjdG9yUmVmO1xuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlQXNzaWduKGFjdG9yQ29udGV4dCwgc3RhdGUsIGFjdGlvbkFyZ3MsIHtcbiAgYXNzaWdubWVudFxufSkge1xuICBpZiAoIXN0YXRlLmNvbnRleHQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBhc3NpZ24gdG8gdW5kZWZpbmVkIGBjb250ZXh0YC4gRW5zdXJlIHRoYXQgYGNvbnRleHRgIGlzIGRlZmluZWQgaW4gdGhlIG1hY2hpbmUgY29uZmlnLicpO1xuICB9XG4gIGNvbnN0IHNwYXduZWRDaGlsZHJlbiA9IHt9O1xuICBjb25zdCBhc3NpZ25BcmdzID0ge1xuICAgIGNvbnRleHQ6IHN0YXRlLmNvbnRleHQsXG4gICAgZXZlbnQ6IGFjdGlvbkFyZ3MuZXZlbnQsXG4gICAgYWN0aW9uOiBhY3Rpb25BcmdzLmFjdGlvbixcbiAgICBzcGF3bjogY3JlYXRlU3Bhd25lcihhY3RvckNvbnRleHQsIHN0YXRlLCBhY3Rpb25BcmdzLmV2ZW50LCBzcGF3bmVkQ2hpbGRyZW4pLFxuICAgIHNlbGY6IGFjdG9yQ29udGV4dD8uc2VsZixcbiAgICBzeXN0ZW06IGFjdG9yQ29udGV4dD8uc3lzdGVtXG4gIH07XG4gIGxldCBwYXJ0aWFsVXBkYXRlID0ge307XG4gIGlmICh0eXBlb2YgYXNzaWdubWVudCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHBhcnRpYWxVcGRhdGUgPSBhc3NpZ25tZW50KGFzc2lnbkFyZ3MpO1xuICB9IGVsc2Uge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGFzc2lnbm1lbnQpKSB7XG4gICAgICBjb25zdCBwcm9wQXNzaWdubWVudCA9IGFzc2lnbm1lbnRba2V5XTtcbiAgICAgIHBhcnRpYWxVcGRhdGVba2V5XSA9IHR5cGVvZiBwcm9wQXNzaWdubWVudCA9PT0gJ2Z1bmN0aW9uJyA/IHByb3BBc3NpZ25tZW50KGFzc2lnbkFyZ3MpIDogcHJvcEFzc2lnbm1lbnQ7XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRDb250ZXh0ID0gT2JqZWN0LmFzc2lnbih7fSwgc3RhdGUuY29udGV4dCwgcGFydGlhbFVwZGF0ZSk7XG4gIHJldHVybiBbY2xvbmVTdGF0ZShzdGF0ZSwge1xuICAgIGNvbnRleHQ6IHVwZGF0ZWRDb250ZXh0LFxuICAgIGNoaWxkcmVuOiBPYmplY3Qua2V5cyhzcGF3bmVkQ2hpbGRyZW4pLmxlbmd0aCA/IHtcbiAgICAgIC4uLnN0YXRlLmNoaWxkcmVuLFxuICAgICAgLi4uc3Bhd25lZENoaWxkcmVuXG4gICAgfSA6IHN0YXRlLmNoaWxkcmVuXG4gIH0pXTtcbn1cbi8qKlxuICogVXBkYXRlcyB0aGUgY3VycmVudCBjb250ZXh0IG9mIHRoZSBtYWNoaW5lLlxuICpcbiAqIEBwYXJhbSBhc3NpZ25tZW50IEFuIG9iamVjdCB0aGF0IHJlcHJlc2VudHMgdGhlIHBhcnRpYWwgY29udGV4dCB0byB1cGRhdGUuXG4gKi9cbmZ1bmN0aW9uIGFzc2lnbihhc3NpZ25tZW50KSB7XG4gIGZ1bmN0aW9uIGFzc2lnbihfKSB7XG4gIH1cbiAgYXNzaWduLnR5cGUgPSAneHN0YXRlLmFzc2lnbic7XG4gIGFzc2lnbi5hc3NpZ25tZW50ID0gYXNzaWdubWVudDtcbiAgYXNzaWduLnJlc29sdmUgPSByZXNvbHZlQXNzaWduO1xuICByZXR1cm4gYXNzaWduO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlQ2hvb3NlKF8sIHN0YXRlLCBhY3Rpb25BcmdzLCB7XG4gIGJyYW5jaGVzXG59KSB7XG4gIGNvbnN0IG1hdGNoZWRBY3Rpb25zID0gYnJhbmNoZXMuZmluZChjb25kaXRpb24gPT4ge1xuICAgIHJldHVybiAhY29uZGl0aW9uLmd1YXJkIHx8IGV2YWx1YXRlR3VhcmQoY29uZGl0aW9uLmd1YXJkLCBzdGF0ZS5jb250ZXh0LCBhY3Rpb25BcmdzLmV2ZW50LCBzdGF0ZSk7XG4gIH0pPy5hY3Rpb25zO1xuICByZXR1cm4gW3N0YXRlLCB1bmRlZmluZWQsIHRvQXJyYXkobWF0Y2hlZEFjdGlvbnMpXTtcbn1cbmZ1bmN0aW9uIGNob29zZShicmFuY2hlcykge1xuICBmdW5jdGlvbiBjaG9vc2UoXykge1xuICB9XG4gIGNob29zZS50eXBlID0gJ3hzdGF0ZS5jaG9vc2UnO1xuICBjaG9vc2UuYnJhbmNoZXMgPSBicmFuY2hlcztcbiAgY2hvb3NlLnJlc29sdmUgPSByZXNvbHZlQ2hvb3NlO1xuICByZXR1cm4gY2hvb3NlO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlTG9nKF8sIHN0YXRlLCBhY3Rpb25BcmdzLCB7XG4gIHZhbHVlLFxuICBsYWJlbFxufSkge1xuICByZXR1cm4gW3N0YXRlLCB7XG4gICAgdmFsdWU6IHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJyA/IHZhbHVlKGFjdGlvbkFyZ3MpIDogdmFsdWUsXG4gICAgbGFiZWxcbiAgfV07XG59XG5mdW5jdGlvbiBleGVjdXRlTG9nKHtcbiAgbG9nZ2VyXG59LCB7XG4gIHZhbHVlLFxuICBsYWJlbFxufSkge1xuICBpZiAobGFiZWwpIHtcbiAgICBsb2dnZXIobGFiZWwsIHZhbHVlKTtcbiAgfSBlbHNlIHtcbiAgICBsb2dnZXIodmFsdWUpO1xuICB9XG59XG4vKipcbiAqXG4gKiBAcGFyYW0gZXhwciBUaGUgZXhwcmVzc2lvbiBmdW5jdGlvbiB0byBldmFsdWF0ZSB3aGljaCB3aWxsIGJlIGxvZ2dlZC5cbiAqICBUYWtlcyBpbiAyIGFyZ3VtZW50czpcbiAqICAtIGBjdHhgIC0gdGhlIGN1cnJlbnQgc3RhdGUgY29udGV4dFxuICogIC0gYGV2ZW50YCAtIHRoZSBldmVudCB0aGF0IGNhdXNlZCB0aGlzIGFjdGlvbiB0byBiZSBleGVjdXRlZC5cbiAqIEBwYXJhbSBsYWJlbCBUaGUgbGFiZWwgdG8gZ2l2ZSB0byB0aGUgbG9nZ2VkIGV4cHJlc3Npb24uXG4gKi9cbmZ1bmN0aW9uIGxvZyh2YWx1ZSA9ICh7XG4gIGNvbnRleHQsXG4gIGV2ZW50XG59KSA9PiAoe1xuICBjb250ZXh0LFxuICBldmVudFxufSksIGxhYmVsKSB7XG4gIGZ1bmN0aW9uIGxvZyhfKSB7XG4gIH1cbiAgbG9nLnR5cGUgPSAneHN0YXRlLmxvZyc7XG4gIGxvZy52YWx1ZSA9IHZhbHVlO1xuICBsb2cubGFiZWwgPSBsYWJlbDtcbiAgbG9nLnJlc29sdmUgPSByZXNvbHZlTG9nO1xuICBsb2cuZXhlY3V0ZSA9IGV4ZWN1dGVMb2c7XG4gIHJldHVybiBsb2c7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVQdXJlKF8sIHN0YXRlLCBhcmdzLCB7XG4gIGdldFxufSkge1xuICByZXR1cm4gW3N0YXRlLCB1bmRlZmluZWQsIHRvQXJyYXkoZ2V0KHtcbiAgICBjb250ZXh0OiBhcmdzLmNvbnRleHQsXG4gICAgZXZlbnQ6IGFyZ3MuZXZlbnRcbiAgfSkpXTtcbn1cbmZ1bmN0aW9uIHB1cmUoZ2V0QWN0aW9ucykge1xuICBmdW5jdGlvbiBwdXJlKF8pIHtcbiAgfVxuICBwdXJlLnR5cGUgPSAneHN0YXRlLnB1cmUnO1xuICBwdXJlLmdldCA9IGdldEFjdGlvbnM7XG4gIHB1cmUucmVzb2x2ZSA9IHJlc29sdmVQdXJlO1xuICByZXR1cm4gcHVyZTtcbn1cblxuLyoqXG4gKiBgVCB8IHVua25vd25gIHJlZHVjZXMgdG8gYHVua25vd25gIGFuZCB0aGF0IGNhbiBiZSBwcm9ibGVtYXRpYyB3aGVuIGl0IGNvbWVzIHRvIGNvbnRleHR1YWwgdHlwaW5nLlxuICogSXQgZXNwZWNpYWxseSBpcyBhIHByb2JsZW0gd2hlbiB0aGUgdW5pb24gaGFzIGEgZnVuY3Rpb24gbWVtYmVyLCBsaWtlIGhlcmU6XG4gKlxuICogYGBgdHNcbiAqIGRlY2xhcmUgZnVuY3Rpb24gdGVzdChjYk9yVmFsOiAoKGFyZzogbnVtYmVyKSA9PiB1bmtub3duKSB8IHVua25vd24pOiB2b2lkO1xuICogdGVzdCgoYXJnKSA9PiB7fSkgLy8gb29wcywgaW1wbGljaXQgYW55XG4gKiBgYGBcbiAqXG4gKiBUaGlzIHR5cGUgY2FuIGJlIHVzZWQgdG8gYXZvaWQgdGhpcyBwcm9ibGVtLiBUaGlzIHVuaW9uIHJlcHJlc2VudHMgdGhlIHNhbWUgdmFsdWUgc3BhY2UgYXMgYHVua25vd25gLlxuICovXG5cbi8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvVHlwZVNjcmlwdC9pc3N1ZXMvMjMxODIjaXNzdWVjb21tZW50LTM3OTA5MTg4N1xuXG4vKipcbiAqIFRoZSBmdWxsIGRlZmluaXRpb24gb2YgYW4gZXZlbnQsIHdpdGggYSBzdHJpbmcgYHR5cGVgLlxuICovXG5cbi8qKlxuICogVGhlIHN0cmluZyBvciBvYmplY3QgcmVwcmVzZW50aW5nIHRoZSBzdGF0ZSB2YWx1ZSByZWxhdGl2ZSB0byB0aGUgcGFyZW50IHN0YXRlIG5vZGUuXG4gKlxuICogLSBGb3IgYSBjaGlsZCBhdG9taWMgc3RhdGUgbm9kZSwgdGhpcyBpcyBhIHN0cmluZywgZS5nLiwgYFwicGVuZGluZ1wiYC5cbiAqIC0gRm9yIGNvbXBsZXggc3RhdGUgbm9kZXMsIHRoaXMgaXMgYW4gb2JqZWN0LCBlLmcuLCBgeyBzdWNjZXNzOiBcInNvbWVDaGlsZFN0YXRlXCIgfWAuXG4gKi9cblxuLy8gVE9ETzogcmVtb3ZlIG9uY2UgVFMgZml4ZXMgdGhpcyB0eXBlLXdpZGVuaW5nIGlzc3VlXG5cbi8vIFRPRE86IHBvc3NpYmx5IHJlZmFjdG9yIHRoaXMgc29tZWhvdywgdXNlIGV2ZW4gYSBzaW1wbGVyIHR5cGUsIGFuZCBtYXliZSBldmVuIG1ha2UgYG1hY2hpbmUub3B0aW9uc2AgcHJpdmF0ZSBvciBzb21ldGhpbmdcblxubGV0IFNwZWNpYWxUYXJnZXRzID0gLyojX19QVVJFX18qL2Z1bmN0aW9uIChTcGVjaWFsVGFyZ2V0cykge1xuICBTcGVjaWFsVGFyZ2V0c1tcIlBhcmVudFwiXSA9IFwiI19wYXJlbnRcIjtcbiAgU3BlY2lhbFRhcmdldHNbXCJJbnRlcm5hbFwiXSA9IFwiI19pbnRlcm5hbFwiO1xuICByZXR1cm4gU3BlY2lhbFRhcmdldHM7XG59KHt9KTtcblxuZnVuY3Rpb24gcmVzb2x2ZVNlbmRUbyhhY3RvckNvbnRleHQsIHN0YXRlLCBhcmdzLCB7XG4gIHRvLFxuICBldmVudDogZXZlbnRPckV4cHIsXG4gIGlkLFxuICBkZWxheVxufSkge1xuICBjb25zdCBkZWxheXNNYXAgPSBzdGF0ZS5tYWNoaW5lLmltcGxlbWVudGF0aW9ucy5kZWxheXM7XG4gIGlmICh0eXBlb2YgZXZlbnRPckV4cHIgPT09ICdzdHJpbmcnKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBPbmx5IGV2ZW50IG9iamVjdHMgbWF5IGJlIHVzZWQgd2l0aCBzZW5kVG87IHVzZSBzZW5kVG8oeyB0eXBlOiBcIiR7ZXZlbnRPckV4cHJ9XCIgfSkgaW5zdGVhZGApO1xuICB9XG4gIGNvbnN0IHJlc29sdmVkRXZlbnQgPSB0eXBlb2YgZXZlbnRPckV4cHIgPT09ICdmdW5jdGlvbicgPyBldmVudE9yRXhwcihhcmdzKSA6IGV2ZW50T3JFeHByO1xuICBsZXQgcmVzb2x2ZWREZWxheTtcbiAgaWYgKHR5cGVvZiBkZWxheSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBjb25maWdEZWxheSA9IGRlbGF5c01hcCAmJiBkZWxheXNNYXBbZGVsYXldO1xuICAgIHJlc29sdmVkRGVsYXkgPSB0eXBlb2YgY29uZmlnRGVsYXkgPT09ICdmdW5jdGlvbicgPyBjb25maWdEZWxheShhcmdzKSA6IGNvbmZpZ0RlbGF5O1xuICB9IGVsc2Uge1xuICAgIHJlc29sdmVkRGVsYXkgPSB0eXBlb2YgZGVsYXkgPT09ICdmdW5jdGlvbicgPyBkZWxheShhcmdzKSA6IGRlbGF5O1xuICB9XG4gIGNvbnN0IHJlc29sdmVkVGFyZ2V0ID0gdHlwZW9mIHRvID09PSAnZnVuY3Rpb24nID8gdG8oYXJncykgOiB0bztcbiAgbGV0IHRhcmdldEFjdG9yUmVmO1xuICBpZiAodHlwZW9mIHJlc29sdmVkVGFyZ2V0ID09PSAnc3RyaW5nJykge1xuICAgIGlmIChyZXNvbHZlZFRhcmdldCA9PT0gU3BlY2lhbFRhcmdldHMuUGFyZW50KSB7XG4gICAgICB0YXJnZXRBY3RvclJlZiA9IGFjdG9yQ29udGV4dD8uc2VsZi5fcGFyZW50O1xuICAgIH0gZWxzZSBpZiAocmVzb2x2ZWRUYXJnZXQgPT09IFNwZWNpYWxUYXJnZXRzLkludGVybmFsKSB7XG4gICAgICB0YXJnZXRBY3RvclJlZiA9IGFjdG9yQ29udGV4dD8uc2VsZjtcbiAgICB9IGVsc2UgaWYgKHJlc29sdmVkVGFyZ2V0LnN0YXJ0c1dpdGgoJyNfJykpIHtcbiAgICAgIC8vIFNDWE1MIGNvbXBhdGliaWxpdHk6IGh0dHBzOi8vd3d3LnczLm9yZy9UUi9zY3htbC8jU0NYTUxFdmVudFByb2Nlc3NvclxuICAgICAgLy8gI19pbnZva2VpZC4gSWYgdGhlIHRhcmdldCBpcyB0aGUgc3BlY2lhbCB0ZXJtICcjX2ludm9rZWlkJywgd2hlcmUgaW52b2tlaWQgaXMgdGhlIGludm9rZWlkIG9mIGFuIFNDWE1MIHNlc3Npb24gdGhhdCB0aGUgc2VuZGluZyBzZXNzaW9uIGhhcyBjcmVhdGVkIGJ5IDxpbnZva2U+LCB0aGUgUHJvY2Vzc29yIG11c3QgYWRkIHRoZSBldmVudCB0byB0aGUgZXh0ZXJuYWwgcXVldWUgb2YgdGhhdCBzZXNzaW9uLlxuICAgICAgdGFyZ2V0QWN0b3JSZWYgPSBzdGF0ZS5jaGlsZHJlbltyZXNvbHZlZFRhcmdldC5zbGljZSgyKV07XG4gICAgfSBlbHNlIHtcbiAgICAgIHRhcmdldEFjdG9yUmVmID0gc3RhdGUuY2hpbGRyZW5bcmVzb2x2ZWRUYXJnZXRdO1xuICAgIH1cbiAgICBpZiAoIXRhcmdldEFjdG9yUmVmKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuYWJsZSB0byBzZW5kIGV2ZW50IHRvIGFjdG9yICcke3Jlc29sdmVkVGFyZ2V0fScgZnJvbSBtYWNoaW5lICcke3N0YXRlLm1hY2hpbmUuaWR9Jy5gKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0QWN0b3JSZWYgPSByZXNvbHZlZFRhcmdldCB8fCBhY3RvckNvbnRleHQ/LnNlbGY7XG4gIH1cbiAgcmV0dXJuIFtzdGF0ZSwge1xuICAgIHRvOiB0YXJnZXRBY3RvclJlZixcbiAgICBldmVudDogcmVzb2x2ZWRFdmVudCxcbiAgICBpZCxcbiAgICBkZWxheTogcmVzb2x2ZWREZWxheVxuICB9XTtcbn1cbmZ1bmN0aW9uIGV4ZWN1dGVTZW5kVG8oYWN0b3JDb250ZXh0LCBwYXJhbXMpIHtcbiAgaWYgKHR5cGVvZiBwYXJhbXMuZGVsYXkgPT09ICdudW1iZXInKSB7XG4gICAgYWN0b3JDb250ZXh0LnNlbGYuZGVsYXlTZW5kKHBhcmFtcyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnN0IHtcbiAgICB0byxcbiAgICBldmVudFxuICB9ID0gcGFyYW1zO1xuICBhY3RvckNvbnRleHQuZGVmZXIoKCkgPT4ge1xuICAgIGFjdG9yQ29udGV4dD8uc3lzdGVtLl9yZWxheShhY3RvckNvbnRleHQuc2VsZiwgdG8sIGV2ZW50LnR5cGUgPT09IFhTVEFURV9FUlJPUiA/IGNyZWF0ZUVycm9yQWN0b3JFdmVudChhY3RvckNvbnRleHQuc2VsZi5pZCwgZXZlbnQuZGF0YSkgOiBldmVudCk7XG4gIH0pO1xufVxuLyoqXG4gKiBTZW5kcyBhbiBldmVudCB0byBhbiBhY3Rvci5cbiAqXG4gKiBAcGFyYW0gYWN0b3IgVGhlIGBBY3RvclJlZmAgdG8gc2VuZCB0aGUgZXZlbnQgdG8uXG4gKiBAcGFyYW0gZXZlbnQgVGhlIGV2ZW50IHRvIHNlbmQsIG9yIGFuIGV4cHJlc3Npb24gdGhhdCBldmFsdWF0ZXMgdG8gdGhlIGV2ZW50IHRvIHNlbmRcbiAqIEBwYXJhbSBvcHRpb25zIFNlbmQgYWN0aW9uIG9wdGlvbnNcbiAqICAtIGBpZGAgLSBUaGUgdW5pcXVlIHNlbmQgZXZlbnQgaWRlbnRpZmllciAodXNlZCB3aXRoIGBjYW5jZWwoKWApLlxuICogIC0gYGRlbGF5YCAtIFRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIGRlbGF5IHRoZSBzZW5kaW5nIG9mIHRoZSBldmVudC5cbiAqL1xuZnVuY3Rpb24gc2VuZFRvKHRvLCBldmVudE9yRXhwciwgb3B0aW9ucykge1xuICBmdW5jdGlvbiBzZW5kVG8oXykge1xuICB9XG4gIHNlbmRUby50eXBlID0gJ3hzdGF0ZS5zZW5kVG8nO1xuICBzZW5kVG8udG8gPSB0bztcbiAgc2VuZFRvLmV2ZW50ID0gZXZlbnRPckV4cHI7XG4gIHNlbmRUby5pZCA9IG9wdGlvbnM/LmlkO1xuICBzZW5kVG8uZGVsYXkgPSBvcHRpb25zPy5kZWxheTtcbiAgc2VuZFRvLnJlc29sdmUgPSByZXNvbHZlU2VuZFRvO1xuICBzZW5kVG8uZXhlY3V0ZSA9IGV4ZWN1dGVTZW5kVG87XG4gIHJldHVybiBzZW5kVG87XG59XG5cbi8qKlxuICogU2VuZHMgYW4gZXZlbnQgdG8gdGhpcyBtYWNoaW5lJ3MgcGFyZW50LlxuICpcbiAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgdG8gc2VuZCB0byB0aGUgcGFyZW50IG1hY2hpbmUuXG4gKiBAcGFyYW0gb3B0aW9ucyBPcHRpb25zIHRvIHBhc3MgaW50byB0aGUgc2VuZCBldmVudC5cbiAqL1xuZnVuY3Rpb24gc2VuZFBhcmVudChldmVudCwgb3B0aW9ucykge1xuICByZXR1cm4gc2VuZFRvKFNwZWNpYWxUYXJnZXRzLlBhcmVudCwgZXZlbnQsIG9wdGlvbnMpO1xufVxuLyoqXG4gKiBGb3J3YXJkcyAoc2VuZHMpIGFuIGV2ZW50IHRvIGEgc3BlY2lmaWVkIHNlcnZpY2UuXG4gKlxuICogQHBhcmFtIHRhcmdldCBUaGUgdGFyZ2V0IHNlcnZpY2UgdG8gZm9yd2FyZCB0aGUgZXZlbnQgdG8uXG4gKiBAcGFyYW0gb3B0aW9ucyBPcHRpb25zIHRvIHBhc3MgaW50byB0aGUgc2VuZCBhY3Rpb24gY3JlYXRvci5cbiAqL1xuZnVuY3Rpb24gZm9yd2FyZFRvKHRhcmdldCwgb3B0aW9ucykge1xuICByZXR1cm4gc2VuZFRvKHRhcmdldCwgKHtcbiAgICBldmVudFxuICB9KSA9PiBldmVudCwgb3B0aW9ucyk7XG59XG5cbi8qKlxuICogRXNjYWxhdGVzIGFuIGVycm9yIGJ5IHNlbmRpbmcgaXQgYXMgYW4gZXZlbnQgdG8gdGhpcyBtYWNoaW5lJ3MgcGFyZW50LlxuICpcbiAqIEBwYXJhbSBlcnJvckRhdGEgVGhlIGVycm9yIGRhdGEgdG8gc2VuZCwgb3IgdGhlIGV4cHJlc3Npb24gZnVuY3Rpb24gdGhhdFxuICogdGFrZXMgaW4gdGhlIGBjb250ZXh0YCwgYGV2ZW50YCwgYW5kIGBtZXRhYCwgYW5kIHJldHVybnMgdGhlIGVycm9yIGRhdGEgdG8gc2VuZC5cbiAqIEBwYXJhbSBvcHRpb25zIE9wdGlvbnMgdG8gcGFzcyBpbnRvIHRoZSBzZW5kIGFjdGlvbiBjcmVhdG9yLlxuICovXG5mdW5jdGlvbiBlc2NhbGF0ZShlcnJvckRhdGEsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIHNlbmRQYXJlbnQoYXJnID0+IHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogWFNUQVRFX0VSUk9SLFxuICAgICAgZGF0YTogdHlwZW9mIGVycm9yRGF0YSA9PT0gJ2Z1bmN0aW9uJyA/IGVycm9yRGF0YShhcmcpIDogZXJyb3JEYXRhXG4gICAgfTtcbiAgfSwgb3B0aW9ucyk7XG59XG5cbmV4cG9ydCB7IFNwZWNpYWxUYXJnZXRzIGFzIFMsIGFzc2lnbiBhcyBhLCBzZW5kVG8gYXMgYiwgY2hvb3NlIGFzIGMsIGVzY2FsYXRlIGFzIGUsIGZvcndhcmRUbyBhcyBmLCBsb2cgYXMgbCwgcHVyZSBhcyBwLCBzZW5kUGFyZW50IGFzIHMgfTtcbiIsImV4cG9ydCB7IGNyZWF0ZUVtcHR5QWN0b3IsIGZyb21DYWxsYmFjaywgZnJvbUV2ZW50T2JzZXJ2YWJsZSwgZnJvbU9ic2VydmFibGUsIGZyb21Qcm9taXNlLCBmcm9tVHJhbnNpdGlvbiB9IGZyb20gJy4uL2FjdG9ycy9kaXN0L3hzdGF0ZS1hY3RvcnMuZXNtLmpzJztcbmltcG9ydCB7IFMgYXMgU1RBVEVfREVMSU1JVEVSLCBtIGFzIG1hcFZhbHVlcywgdCBhcyB0b0FycmF5LCBhIGFzIHRvVHJhbnNpdGlvbkNvbmZpZ0FycmF5LCBOIGFzIE5VTExfRVZFTlQsIGMgYXMgY3JlYXRlSW52b2tlSWQsIGkgYXMgaXNFcnJvckFjdG9yRXZlbnQsIGIgYXMgY3JlYXRlSW5pdEV2ZW50LCByIGFzIHJlc29sdmVSZWZlcmVuY2VkQWN0b3IsIGQgYXMgY3JlYXRlQWN0b3IsIGUgYXMgbWF0Y2hlc1N0YXRlIH0gZnJvbSAnLi9pbnRlcnByZXRlci0wMzczNzgxMC5lc20uanMnO1xuZXhwb3J0IHsgQSBhcyBBY3RvciwgZiBhcyBBY3RvclN0YXR1cywgSSBhcyBJbnRlcnByZXRlclN0YXR1cywgZCBhcyBjcmVhdGVBY3RvciwgZyBhcyBpbnRlcnByZXQsIGUgYXMgbWF0Y2hlc1N0YXRlLCBwIGFzIHBhdGhUb1N0YXRlVmFsdWUsIGggYXMgdG9PYnNlcnZlciB9IGZyb20gJy4vaW50ZXJwcmV0ZXItMDM3Mzc4MTAuZXNtLmpzJztcbmltcG9ydCB7IGYgYXMgZm9ybWF0VHJhbnNpdGlvbnMsIGEgYXMgZm9ybWF0VHJhbnNpdGlvbiwgbSBhcyBtZW1vLCBlIGFzIGV2YWx1YXRlR3VhcmQsIGcgYXMgZ2V0RGVsYXllZFRyYW5zaXRpb25zLCBiIGFzIGZvcm1hdEluaXRpYWxUcmFuc2l0aW9uLCBjIGFzIGdldENhbmRpZGF0ZXMsIGQgYXMgZ2V0Q29uZmlndXJhdGlvbiwgaCBhcyBnZXRTdGF0ZU5vZGVzLCByIGFzIHJlc29sdmVTdGF0ZVZhbHVlLCBpIGFzIGlzSW5GaW5hbFN0YXRlLCBTIGFzIFN0YXRlLCBqIGFzIGNsb25lU3RhdGUsIGsgYXMgbWFjcm9zdGVwLCB0IGFzIHRyYW5zaXRpb25Ob2RlLCBsIGFzIGdldEluaXRpYWxDb25maWd1cmF0aW9uLCBuIGFzIHJlc29sdmVBY3Rpb25zQW5kQ29udGV4dCwgbyBhcyBtaWNyb3N0ZXAsIHAgYXMgaXNBdG9taWNTdGF0ZU5vZGUsIHEgYXMgaXNTdGF0ZUlkLCBzIGFzIGdldFN0YXRlTm9kZUJ5UGF0aCwgdSBhcyBnZXRQZXJzaXN0ZWRTdGF0ZSB9IGZyb20gJy4vcmFpc2UtMmQ5MmVhZTguZXNtLmpzJztcbmV4cG9ydCB7IFMgYXMgU3RhdGUsIHYgYXMgYW5kLCB6IGFzIGNhbmNlbCwgaCBhcyBnZXRTdGF0ZU5vZGVzLCB3IGFzIG5vdCwgeCBhcyBvciwgQSBhcyByYWlzZSwgeSBhcyBzdGF0ZUluLCBCIGFzIHN0b3AgfSBmcm9tICcuL3JhaXNlLTJkOTJlYWU4LmVzbS5qcyc7XG5pbXBvcnQgeyBhIGFzIGFzc2lnbiB9IGZyb20gJy4vc2VuZC0wZWRlZTJiNC5lc20uanMnO1xuZXhwb3J0IHsgUyBhcyBTcGVjaWFsVGFyZ2V0cywgYSBhcyBhc3NpZ24sIGMgYXMgY2hvb3NlLCBlIGFzIGVzY2FsYXRlLCBmIGFzIGZvcndhcmRUbywgbCBhcyBsb2csIHAgYXMgcHVyZSwgcyBhcyBzZW5kUGFyZW50LCBiIGFzIHNlbmRUbyB9IGZyb20gJy4vc2VuZC0wZWRlZTJiNC5lc20uanMnO1xuaW1wb3J0ICcuLi9kZXYvZGlzdC94c3RhdGUtZGV2LmVzbS5qcyc7XG5cbmNsYXNzIFNpbXVsYXRlZENsb2NrIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy50aW1lb3V0cyA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLl9ub3cgPSAwO1xuICAgIHRoaXMuX2lkID0gMDtcbiAgfVxuICBub3coKSB7XG4gICAgcmV0dXJuIHRoaXMuX25vdztcbiAgfVxuICBnZXRJZCgpIHtcbiAgICByZXR1cm4gdGhpcy5faWQrKztcbiAgfVxuICBzZXRUaW1lb3V0KGZuLCB0aW1lb3V0KSB7XG4gICAgY29uc3QgaWQgPSB0aGlzLmdldElkKCk7XG4gICAgdGhpcy50aW1lb3V0cy5zZXQoaWQsIHtcbiAgICAgIHN0YXJ0OiB0aGlzLm5vdygpLFxuICAgICAgdGltZW91dCxcbiAgICAgIGZuXG4gICAgfSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG4gIGNsZWFyVGltZW91dChpZCkge1xuICAgIHRoaXMudGltZW91dHMuZGVsZXRlKGlkKTtcbiAgfVxuICBzZXQodGltZSkge1xuICAgIGlmICh0aGlzLl9ub3cgPiB0aW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byB0cmF2ZWwgYmFjayBpbiB0aW1lJyk7XG4gICAgfVxuICAgIHRoaXMuX25vdyA9IHRpbWU7XG4gICAgdGhpcy5mbHVzaFRpbWVvdXRzKCk7XG4gIH1cbiAgZmx1c2hUaW1lb3V0cygpIHtcbiAgICBbLi4udGhpcy50aW1lb3V0c10uc29ydCgoW19pZEEsIHRpbWVvdXRBXSwgW19pZEIsIHRpbWVvdXRCXSkgPT4ge1xuICAgICAgY29uc3QgZW5kQSA9IHRpbWVvdXRBLnN0YXJ0ICsgdGltZW91dEEudGltZW91dDtcbiAgICAgIGNvbnN0IGVuZEIgPSB0aW1lb3V0Qi5zdGFydCArIHRpbWVvdXRCLnRpbWVvdXQ7XG4gICAgICByZXR1cm4gZW5kQiA+IGVuZEEgPyAtMSA6IDE7XG4gICAgfSkuZm9yRWFjaCgoW2lkLCB0aW1lb3V0XSkgPT4ge1xuICAgICAgaWYgKHRoaXMubm93KCkgLSB0aW1lb3V0LnN0YXJ0ID49IHRpbWVvdXQudGltZW91dCkge1xuICAgICAgICB0aGlzLnRpbWVvdXRzLmRlbGV0ZShpZCk7XG4gICAgICAgIHRpbWVvdXQuZm4uY2FsbChudWxsKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICBpbmNyZW1lbnQobXMpIHtcbiAgICB0aGlzLl9ub3cgKz0gbXM7XG4gICAgdGhpcy5mbHVzaFRpbWVvdXRzKCk7XG4gIH1cbn1cblxuY29uc3QgRU1QVFlfT0JKRUNUID0ge307XG5jb25zdCB0b1NlcmlhbGl6YWJsZUFjdGlvbiA9IGFjdGlvbiA9PiB7XG4gIGlmICh0eXBlb2YgYWN0aW9uID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB7XG4gICAgICB0eXBlOiBhY3Rpb25cbiAgICB9O1xuICB9XG4gIGlmICh0eXBlb2YgYWN0aW9uID09PSAnZnVuY3Rpb24nKSB7XG4gICAgaWYgKCdyZXNvbHZlJyBpbiBhY3Rpb24pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHR5cGU6IGFjdGlvbi50eXBlXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogYWN0aW9uLm5hbWVcbiAgICB9O1xuICB9XG4gIHJldHVybiBhY3Rpb247XG59O1xuY2xhc3MgU3RhdGVOb2RlIHtcbiAgLyoqXG4gICAqIFRoZSByZWxhdGl2ZSBrZXkgb2YgdGhlIHN0YXRlIG5vZGUsIHdoaWNoIHJlcHJlc2VudHMgaXRzIGxvY2F0aW9uIGluIHRoZSBvdmVyYWxsIHN0YXRlIHZhbHVlLlxuICAgKi9cblxuICAvKipcbiAgICogVGhlIHVuaXF1ZSBJRCBvZiB0aGUgc3RhdGUgbm9kZS5cbiAgICovXG5cbiAgLyoqXG4gICAqIFRoZSB0eXBlIG9mIHRoaXMgc3RhdGUgbm9kZTpcbiAgICpcbiAgICogIC0gYCdhdG9taWMnYCAtIG5vIGNoaWxkIHN0YXRlIG5vZGVzXG4gICAqICAtIGAnY29tcG91bmQnYCAtIG5lc3RlZCBjaGlsZCBzdGF0ZSBub2RlcyAoWE9SKVxuICAgKiAgLSBgJ3BhcmFsbGVsJ2AgLSBvcnRob2dvbmFsIG5lc3RlZCBjaGlsZCBzdGF0ZSBub2RlcyAoQU5EKVxuICAgKiAgLSBgJ2hpc3RvcnknYCAtIGhpc3Rvcnkgc3RhdGUgbm9kZVxuICAgKiAgLSBgJ2ZpbmFsJ2AgLSBmaW5hbCBzdGF0ZSBub2RlXG4gICAqL1xuXG4gIC8qKlxuICAgKiBUaGUgc3RyaW5nIHBhdGggZnJvbSB0aGUgcm9vdCBtYWNoaW5lIG5vZGUgdG8gdGhpcyBub2RlLlxuICAgKi9cblxuICAvKipcbiAgICogVGhlIGNoaWxkIHN0YXRlIG5vZGVzLlxuICAgKi9cblxuICAvKipcbiAgICogVGhlIHR5cGUgb2YgaGlzdG9yeSBvbiB0aGlzIHN0YXRlIG5vZGUuIENhbiBiZTpcbiAgICpcbiAgICogIC0gYCdzaGFsbG93J2AgLSByZWNhbGxzIG9ubHkgdG9wLWxldmVsIGhpc3RvcmljYWwgc3RhdGUgdmFsdWVcbiAgICogIC0gYCdkZWVwJ2AgLSByZWNhbGxzIGhpc3RvcmljYWwgc3RhdGUgdmFsdWUgYXQgYWxsIGxldmVsc1xuICAgKi9cblxuICAvKipcbiAgICogVGhlIGFjdGlvbihzKSB0byBiZSBleGVjdXRlZCB1cG9uIGVudGVyaW5nIHRoZSBzdGF0ZSBub2RlLlxuICAgKi9cblxuICAvKipcbiAgICogVGhlIGFjdGlvbihzKSB0byBiZSBleGVjdXRlZCB1cG9uIGV4aXRpbmcgdGhlIHN0YXRlIG5vZGUuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBUaGUgcGFyZW50IHN0YXRlIG5vZGUuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBUaGUgcm9vdCBtYWNoaW5lIG5vZGUuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBUaGUgbWV0YSBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHN0YXRlIG5vZGUsIHdoaWNoIHdpbGwgYmUgcmV0dXJuZWQgaW4gU3RhdGUgaW5zdGFuY2VzLlxuICAgKi9cblxuICAvKipcbiAgICogVGhlIG91dHB1dCBkYXRhIHNlbnQgd2l0aCB0aGUgXCJ4c3RhdGUuZG9uZS5zdGF0ZS5faWRfXCIgZXZlbnQgaWYgdGhpcyBpcyBhIGZpbmFsIHN0YXRlIG5vZGUuXG4gICAqL1xuXG4gIC8qKlxuICAgKiBUaGUgb3JkZXIgdGhpcyBzdGF0ZSBub2RlIGFwcGVhcnMuIENvcnJlc3BvbmRzIHRvIHRoZSBpbXBsaWNpdCBkb2N1bWVudCBvcmRlci5cbiAgICovXG5cbiAgY29uc3RydWN0b3IoXG4gIC8qKlxuICAgKiBUaGUgcmF3IGNvbmZpZyB1c2VkIHRvIGNyZWF0ZSB0aGUgbWFjaGluZS5cbiAgICovXG4gIGNvbmZpZywgb3B0aW9ucykge1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIHRoaXMua2V5ID0gdm9pZCAwO1xuICAgIHRoaXMuaWQgPSB2b2lkIDA7XG4gICAgdGhpcy50eXBlID0gdm9pZCAwO1xuICAgIHRoaXMucGF0aCA9IHZvaWQgMDtcbiAgICB0aGlzLnN0YXRlcyA9IHZvaWQgMDtcbiAgICB0aGlzLmhpc3RvcnkgPSB2b2lkIDA7XG4gICAgdGhpcy5lbnRyeSA9IHZvaWQgMDtcbiAgICB0aGlzLmV4aXQgPSB2b2lkIDA7XG4gICAgdGhpcy5wYXJlbnQgPSB2b2lkIDA7XG4gICAgdGhpcy5tYWNoaW5lID0gdm9pZCAwO1xuICAgIHRoaXMubWV0YSA9IHZvaWQgMDtcbiAgICB0aGlzLm91dHB1dCA9IHZvaWQgMDtcbiAgICB0aGlzLm9yZGVyID0gLTE7XG4gICAgdGhpcy5kZXNjcmlwdGlvbiA9IHZvaWQgMDtcbiAgICB0aGlzLnRhZ3MgPSBbXTtcbiAgICB0aGlzLnRyYW5zaXRpb25zID0gdm9pZCAwO1xuICAgIHRoaXMuYWx3YXlzID0gdm9pZCAwO1xuICAgIHRoaXMucGFyZW50ID0gb3B0aW9ucy5fcGFyZW50O1xuICAgIHRoaXMua2V5ID0gb3B0aW9ucy5fa2V5O1xuICAgIHRoaXMubWFjaGluZSA9IG9wdGlvbnMuX21hY2hpbmU7XG4gICAgdGhpcy5wYXRoID0gdGhpcy5wYXJlbnQgPyB0aGlzLnBhcmVudC5wYXRoLmNvbmNhdCh0aGlzLmtleSkgOiBbXTtcbiAgICB0aGlzLmlkID0gdGhpcy5jb25maWcuaWQgfHwgW3RoaXMubWFjaGluZS5pZCwgLi4udGhpcy5wYXRoXS5qb2luKFNUQVRFX0RFTElNSVRFUik7XG4gICAgdGhpcy50eXBlID0gdGhpcy5jb25maWcudHlwZSB8fCAodGhpcy5jb25maWcuc3RhdGVzICYmIE9iamVjdC5rZXlzKHRoaXMuY29uZmlnLnN0YXRlcykubGVuZ3RoID8gJ2NvbXBvdW5kJyA6IHRoaXMuY29uZmlnLmhpc3RvcnkgPyAnaGlzdG9yeScgOiAnYXRvbWljJyk7XG4gICAgdGhpcy5kZXNjcmlwdGlvbiA9IHRoaXMuY29uZmlnLmRlc2NyaXB0aW9uO1xuICAgIHRoaXMub3JkZXIgPSB0aGlzLm1hY2hpbmUuaWRNYXAuc2l6ZTtcbiAgICB0aGlzLm1hY2hpbmUuaWRNYXAuc2V0KHRoaXMuaWQsIHRoaXMpO1xuICAgIHRoaXMuc3RhdGVzID0gdGhpcy5jb25maWcuc3RhdGVzID8gbWFwVmFsdWVzKHRoaXMuY29uZmlnLnN0YXRlcywgKHN0YXRlQ29uZmlnLCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IHN0YXRlTm9kZSA9IG5ldyBTdGF0ZU5vZGUoc3RhdGVDb25maWcsIHtcbiAgICAgICAgX3BhcmVudDogdGhpcyxcbiAgICAgICAgX2tleToga2V5LFxuICAgICAgICBfbWFjaGluZTogdGhpcy5tYWNoaW5lXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBzdGF0ZU5vZGU7XG4gICAgfSkgOiBFTVBUWV9PQkpFQ1Q7XG4gICAgaWYgKHRoaXMudHlwZSA9PT0gJ2NvbXBvdW5kJyAmJiAhdGhpcy5jb25maWcuaW5pdGlhbCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBpbml0aWFsIHN0YXRlIHNwZWNpZmllZCBmb3IgY29tcG91bmQgc3RhdGUgbm9kZSBcIiMke3RoaXMuaWR9XCIuIFRyeSBhZGRpbmcgeyBpbml0aWFsOiBcIiR7T2JqZWN0LmtleXModGhpcy5zdGF0ZXMpWzBdfVwiIH0gdG8gdGhlIHN0YXRlIGNvbmZpZy5gKTtcbiAgICB9XG5cbiAgICAvLyBIaXN0b3J5IGNvbmZpZ1xuICAgIHRoaXMuaGlzdG9yeSA9IHRoaXMuY29uZmlnLmhpc3RvcnkgPT09IHRydWUgPyAnc2hhbGxvdycgOiB0aGlzLmNvbmZpZy5oaXN0b3J5IHx8IGZhbHNlO1xuICAgIHRoaXMuZW50cnkgPSB0b0FycmF5KHRoaXMuY29uZmlnLmVudHJ5KS5zbGljZSgpO1xuICAgIHRoaXMuZXhpdCA9IHRvQXJyYXkodGhpcy5jb25maWcuZXhpdCkuc2xpY2UoKTtcbiAgICB0aGlzLm1ldGEgPSB0aGlzLmNvbmZpZy5tZXRhO1xuICAgIHRoaXMub3V0cHV0ID0gdGhpcy50eXBlID09PSAnZmluYWwnIHx8ICF0aGlzLnBhcmVudCA/IHRoaXMuY29uZmlnLm91dHB1dCA6IHVuZGVmaW5lZDtcbiAgICB0aGlzLnRhZ3MgPSB0b0FycmF5KGNvbmZpZy50YWdzKS5zbGljZSgpO1xuICB9XG4gIF9pbml0aWFsaXplKCkge1xuICAgIHRoaXMudHJhbnNpdGlvbnMgPSBmb3JtYXRUcmFuc2l0aW9ucyh0aGlzKTtcbiAgICBpZiAodGhpcy5jb25maWcuYWx3YXlzKSB7XG4gICAgICB0aGlzLmFsd2F5cyA9IHRvVHJhbnNpdGlvbkNvbmZpZ0FycmF5KHRoaXMuY29uZmlnLmFsd2F5cykubWFwKHQgPT4gZm9ybWF0VHJhbnNpdGlvbih0aGlzLCBOVUxMX0VWRU5ULCB0KSk7XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKHRoaXMuc3RhdGVzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICB0aGlzLnN0YXRlc1trZXldLl9pbml0aWFsaXplKCk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogVGhlIHdlbGwtc3RydWN0dXJlZCBzdGF0ZSBub2RlIGRlZmluaXRpb24uXG4gICAqL1xuICBnZXQgZGVmaW5pdGlvbigpIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IHRoaXMuaWQsXG4gICAgICBrZXk6IHRoaXMua2V5LFxuICAgICAgdmVyc2lvbjogdGhpcy5tYWNoaW5lLnZlcnNpb24sXG4gICAgICB0eXBlOiB0aGlzLnR5cGUsXG4gICAgICBpbml0aWFsOiB0aGlzLmluaXRpYWwgPyB7XG4gICAgICAgIHRhcmdldDogdGhpcy5pbml0aWFsLnRhcmdldCxcbiAgICAgICAgc291cmNlOiB0aGlzLFxuICAgICAgICBhY3Rpb25zOiB0aGlzLmluaXRpYWwuYWN0aW9ucy5tYXAodG9TZXJpYWxpemFibGVBY3Rpb24pLFxuICAgICAgICBldmVudFR5cGU6IG51bGwsXG4gICAgICAgIHJlZW50ZXI6IGZhbHNlLFxuICAgICAgICB0b0pTT046ICgpID0+ICh7XG4gICAgICAgICAgdGFyZ2V0OiB0aGlzLmluaXRpYWwudGFyZ2V0Lm1hcCh0ID0+IGAjJHt0LmlkfWApLFxuICAgICAgICAgIHNvdXJjZTogYCMke3RoaXMuaWR9YCxcbiAgICAgICAgICBhY3Rpb25zOiB0aGlzLmluaXRpYWwuYWN0aW9ucy5tYXAodG9TZXJpYWxpemFibGVBY3Rpb24pLFxuICAgICAgICAgIGV2ZW50VHlwZTogbnVsbFxuICAgICAgICB9KVxuICAgICAgfSA6IHVuZGVmaW5lZCxcbiAgICAgIGhpc3Rvcnk6IHRoaXMuaGlzdG9yeSxcbiAgICAgIHN0YXRlczogbWFwVmFsdWVzKHRoaXMuc3RhdGVzLCBzdGF0ZSA9PiB7XG4gICAgICAgIHJldHVybiBzdGF0ZS5kZWZpbml0aW9uO1xuICAgICAgfSksXG4gICAgICBvbjogdGhpcy5vbixcbiAgICAgIHRyYW5zaXRpb25zOiBbLi4udGhpcy50cmFuc2l0aW9ucy52YWx1ZXMoKV0uZmxhdCgpLm1hcCh0ID0+ICh7XG4gICAgICAgIC4uLnQsXG4gICAgICAgIGFjdGlvbnM6IHQuYWN0aW9ucy5tYXAodG9TZXJpYWxpemFibGVBY3Rpb24pXG4gICAgICB9KSksXG4gICAgICBlbnRyeTogdGhpcy5lbnRyeS5tYXAodG9TZXJpYWxpemFibGVBY3Rpb24pLFxuICAgICAgZXhpdDogdGhpcy5leGl0Lm1hcCh0b1NlcmlhbGl6YWJsZUFjdGlvbiksXG4gICAgICBtZXRhOiB0aGlzLm1ldGEsXG4gICAgICBvcmRlcjogdGhpcy5vcmRlciB8fCAtMSxcbiAgICAgIG91dHB1dDogdGhpcy5vdXRwdXQsXG4gICAgICBpbnZva2U6IHRoaXMuaW52b2tlLFxuICAgICAgZGVzY3JpcHRpb246IHRoaXMuZGVzY3JpcHRpb24sXG4gICAgICB0YWdzOiB0aGlzLnRhZ3NcbiAgICB9O1xuICB9XG4gIHRvSlNPTigpIHtcbiAgICByZXR1cm4gdGhpcy5kZWZpbml0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBsb2dpYyBpbnZva2VkIGFzIGFjdG9ycyBieSB0aGlzIHN0YXRlIG5vZGUuXG4gICAqL1xuICBnZXQgaW52b2tlKCkge1xuICAgIHJldHVybiBtZW1vKHRoaXMsICdpbnZva2UnLCAoKSA9PiB0b0FycmF5KHRoaXMuY29uZmlnLmludm9rZSkubWFwKChpbnZva2VDb25maWcsIGkpID0+IHtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgc3JjLFxuICAgICAgICBzeXN0ZW1JZFxuICAgICAgfSA9IGludm9rZUNvbmZpZztcbiAgICAgIGNvbnN0IHJlc29sdmVkSWQgPSBpbnZva2VDb25maWcuaWQgfHwgY3JlYXRlSW52b2tlSWQodGhpcy5pZCwgaSk7XG4gICAgICAvLyBUT0RPOiByZXNvbHZpbmcgc2hvdWxkIG5vdCBoYXBwZW4gaGVyZVxuICAgICAgY29uc3QgcmVzb2x2ZWRTcmMgPSB0eXBlb2Ygc3JjID09PSAnc3RyaW5nJyA/IHNyYyA6ICEoJ3R5cGUnIGluIHNyYykgPyByZXNvbHZlZElkIDogc3JjO1xuICAgICAgaWYgKCF0aGlzLm1hY2hpbmUuaW1wbGVtZW50YXRpb25zLmFjdG9yc1tyZXNvbHZlZElkXSAmJiB0eXBlb2Ygc3JjICE9PSAnc3RyaW5nJyAmJiAhKCd0eXBlJyBpbiBzcmMpKSB7XG4gICAgICAgIHRoaXMubWFjaGluZS5pbXBsZW1lbnRhdGlvbnMuYWN0b3JzID0ge1xuICAgICAgICAgIC4uLnRoaXMubWFjaGluZS5pbXBsZW1lbnRhdGlvbnMuYWN0b3JzLFxuICAgICAgICAgIC8vIFRPRE86IHRoaXMgc2hvdWxkIGFjY2VwdCBgc3JjYCBhcy1pc1xuICAgICAgICAgIFtyZXNvbHZlZElkXTogc3JjXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5pbnZva2VDb25maWcsXG4gICAgICAgIHNyYzogcmVzb2x2ZWRTcmMsXG4gICAgICAgIGlkOiByZXNvbHZlZElkLFxuICAgICAgICBzeXN0ZW1JZDogc3lzdGVtSWQsXG4gICAgICAgIHRvSlNPTigpIHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBvbkRvbmUsXG4gICAgICAgICAgICBvbkVycm9yLFxuICAgICAgICAgICAgLi4uaW52b2tlRGVmVmFsdWVzXG4gICAgICAgICAgfSA9IGludm9rZUNvbmZpZztcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uaW52b2tlRGVmVmFsdWVzLFxuICAgICAgICAgICAgdHlwZTogJ3hzdGF0ZS5pbnZva2UnLFxuICAgICAgICAgICAgc3JjOiByZXNvbHZlZFNyYyxcbiAgICAgICAgICAgIGlkOiByZXNvbHZlZElkXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICB9KSk7XG4gIH1cblxuICAvKipcbiAgICogVGhlIG1hcHBpbmcgb2YgZXZlbnRzIHRvIHRyYW5zaXRpb25zLlxuICAgKi9cbiAgZ2V0IG9uKCkge1xuICAgIHJldHVybiBtZW1vKHRoaXMsICdvbicsICgpID0+IHtcbiAgICAgIGNvbnN0IHRyYW5zaXRpb25zID0gdGhpcy50cmFuc2l0aW9ucztcbiAgICAgIHJldHVybiBbLi4udHJhbnNpdGlvbnNdLmZsYXRNYXAoKFtkZXNjcmlwdG9yLCB0XSkgPT4gdC5tYXAodCA9PiBbZGVzY3JpcHRvciwgdF0pKS5yZWR1Y2UoKG1hcCwgW2Rlc2NyaXB0b3IsIHRyYW5zaXRpb25dKSA9PiB7XG4gICAgICAgIG1hcFtkZXNjcmlwdG9yXSA9IG1hcFtkZXNjcmlwdG9yXSB8fCBbXTtcbiAgICAgICAgbWFwW2Rlc2NyaXB0b3JdLnB1c2godHJhbnNpdGlvbik7XG4gICAgICAgIHJldHVybiBtYXA7XG4gICAgICB9LCB7fSk7XG4gICAgfSk7XG4gIH1cbiAgZ2V0IGFmdGVyKCkge1xuICAgIHJldHVybiBtZW1vKHRoaXMsICdkZWxheWVkVHJhbnNpdGlvbnMnLCAoKSA9PiBnZXREZWxheWVkVHJhbnNpdGlvbnModGhpcykpO1xuICB9XG4gIGdldCBpbml0aWFsKCkge1xuICAgIHJldHVybiBtZW1vKHRoaXMsICdpbml0aWFsJywgKCkgPT4gZm9ybWF0SW5pdGlhbFRyYW5zaXRpb24odGhpcywgdGhpcy5jb25maWcuaW5pdGlhbCB8fCBbXSkpO1xuICB9XG4gIG5leHQoc3RhdGUsIGV2ZW50KSB7XG4gICAgY29uc3QgZXZlbnRUeXBlID0gZXZlbnQudHlwZTtcbiAgICBjb25zdCBhY3Rpb25zID0gW107XG4gICAgbGV0IHNlbGVjdGVkVHJhbnNpdGlvbjtcbiAgICBjb25zdCBjYW5kaWRhdGVzID0gbWVtbyh0aGlzLCBgY2FuZGlkYXRlcy0ke2V2ZW50VHlwZX1gLCAoKSA9PiBnZXRDYW5kaWRhdGVzKHRoaXMsIGV2ZW50VHlwZSkpO1xuICAgIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgZ3VhcmRcbiAgICAgIH0gPSBjYW5kaWRhdGU7XG4gICAgICBjb25zdCByZXNvbHZlZENvbnRleHQgPSBzdGF0ZS5jb250ZXh0O1xuICAgICAgbGV0IGd1YXJkUGFzc2VkID0gZmFsc2U7XG4gICAgICB0cnkge1xuICAgICAgICBndWFyZFBhc3NlZCA9ICFndWFyZCB8fCBldmFsdWF0ZUd1YXJkKGd1YXJkLCByZXNvbHZlZENvbnRleHQsIGV2ZW50LCBzdGF0ZSk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc3QgZ3VhcmRUeXBlID0gdHlwZW9mIGd1YXJkID09PSAnc3RyaW5nJyA/IGd1YXJkIDogdHlwZW9mIGd1YXJkID09PSAnb2JqZWN0JyA/IGd1YXJkLnR5cGUgOiB1bmRlZmluZWQ7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGV2YWx1YXRlIGd1YXJkICR7Z3VhcmRUeXBlID8gYCcke2d1YXJkVHlwZX0nIGAgOiAnJ31pbiB0cmFuc2l0aW9uIGZvciBldmVudCAnJHtldmVudFR5cGV9JyBpbiBzdGF0ZSBub2RlICcke3RoaXMuaWR9JzpcXG4ke2Vyci5tZXNzYWdlfWApO1xuICAgICAgfVxuICAgICAgaWYgKGd1YXJkUGFzc2VkKSB7XG4gICAgICAgIGFjdGlvbnMucHVzaCguLi5jYW5kaWRhdGUuYWN0aW9ucyk7XG4gICAgICAgIHNlbGVjdGVkVHJhbnNpdGlvbiA9IGNhbmRpZGF0ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzZWxlY3RlZFRyYW5zaXRpb24gPyBbc2VsZWN0ZWRUcmFuc2l0aW9uXSA6IHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBbGwgdGhlIGV2ZW50IHR5cGVzIGFjY2VwdGVkIGJ5IHRoaXMgc3RhdGUgbm9kZSBhbmQgaXRzIGRlc2NlbmRhbnRzLlxuICAgKi9cbiAgZ2V0IGV2ZW50cygpIHtcbiAgICByZXR1cm4gbWVtbyh0aGlzLCAnZXZlbnRzJywgKCkgPT4ge1xuICAgICAgY29uc3Qge1xuICAgICAgICBzdGF0ZXNcbiAgICAgIH0gPSB0aGlzO1xuICAgICAgY29uc3QgZXZlbnRzID0gbmV3IFNldCh0aGlzLm93bkV2ZW50cyk7XG4gICAgICBpZiAoc3RhdGVzKSB7XG4gICAgICAgIGZvciAoY29uc3Qgc3RhdGVJZCBvZiBPYmplY3Qua2V5cyhzdGF0ZXMpKSB7XG4gICAgICAgICAgY29uc3Qgc3RhdGUgPSBzdGF0ZXNbc3RhdGVJZF07XG4gICAgICAgICAgaWYgKHN0YXRlLnN0YXRlcykge1xuICAgICAgICAgICAgZm9yIChjb25zdCBldmVudCBvZiBzdGF0ZS5ldmVudHMpIHtcbiAgICAgICAgICAgICAgZXZlbnRzLmFkZChgJHtldmVudH1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBBcnJheS5mcm9tKGV2ZW50cyk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQWxsIHRoZSBldmVudHMgdGhhdCBoYXZlIHRyYW5zaXRpb25zIGRpcmVjdGx5IGZyb20gdGhpcyBzdGF0ZSBub2RlLlxuICAgKlxuICAgKiBFeGNsdWRlcyBhbnkgaW5lcnQgZXZlbnRzLlxuICAgKi9cbiAgZ2V0IG93bkV2ZW50cygpIHtcbiAgICBjb25zdCBldmVudHMgPSBuZXcgU2V0KFsuLi50aGlzLnRyYW5zaXRpb25zLmtleXMoKV0uZmlsdGVyKGRlc2NyaXB0b3IgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudHJhbnNpdGlvbnMuZ2V0KGRlc2NyaXB0b3IpLnNvbWUodHJhbnNpdGlvbiA9PiAhKCF0cmFuc2l0aW9uLnRhcmdldCAmJiAhdHJhbnNpdGlvbi5hY3Rpb25zLmxlbmd0aCAmJiAhdHJhbnNpdGlvbi5yZWVudGVyKSk7XG4gICAgfSkpO1xuICAgIHJldHVybiBBcnJheS5mcm9tKGV2ZW50cyk7XG4gIH1cbn1cblxuY29uc3QgU1RBVEVfSURFTlRJRklFUiA9ICcjJztcbmNsYXNzIFN0YXRlTWFjaGluZSB7XG4gIC8qKlxuICAgKiBUaGUgbWFjaGluZSdzIG93biB2ZXJzaW9uLlxuICAgKi9cblxuICBjb25zdHJ1Y3RvcihcbiAgLyoqXG4gICAqIFRoZSByYXcgY29uZmlnIHVzZWQgdG8gY3JlYXRlIHRoZSBtYWNoaW5lLlxuICAgKi9cbiAgY29uZmlnLCBpbXBsZW1lbnRhdGlvbnMpIHtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICB0aGlzLnZlcnNpb24gPSB2b2lkIDA7XG4gICAgdGhpcy5pbXBsZW1lbnRhdGlvbnMgPSB2b2lkIDA7XG4gICAgdGhpcy50eXBlcyA9IHZvaWQgMDtcbiAgICB0aGlzLl9feHN0YXRlbm9kZSA9IHRydWU7XG4gICAgdGhpcy5pZE1hcCA9IG5ldyBNYXAoKTtcbiAgICB0aGlzLnJvb3QgPSB2b2lkIDA7XG4gICAgdGhpcy5pZCA9IHZvaWQgMDtcbiAgICB0aGlzLnN0YXRlcyA9IHZvaWQgMDtcbiAgICB0aGlzLmV2ZW50cyA9IHZvaWQgMDtcbiAgICB0aGlzLl9fVENvbnRleHQgPSB2b2lkIDA7XG4gICAgdGhpcy5fX1RFdmVudCA9IHZvaWQgMDtcbiAgICB0aGlzLl9fVEFjdG9yID0gdm9pZCAwO1xuICAgIHRoaXMuX19UQWN0aW9uID0gdm9pZCAwO1xuICAgIHRoaXMuX19UR3VhcmQgPSB2b2lkIDA7XG4gICAgdGhpcy5fX1REZWxheSA9IHZvaWQgMDtcbiAgICB0aGlzLl9fVFRhZyA9IHZvaWQgMDtcbiAgICB0aGlzLl9fVElucHV0ID0gdm9pZCAwO1xuICAgIHRoaXMuX19UT3V0cHV0ID0gdm9pZCAwO1xuICAgIHRoaXMuX19UUmVzb2x2ZWRUeXBlc01ldGEgPSB2b2lkIDA7XG4gICAgdGhpcy5pZCA9IGNvbmZpZy5pZCB8fCAnKG1hY2hpbmUpJztcbiAgICB0aGlzLmltcGxlbWVudGF0aW9ucyA9IHtcbiAgICAgIGFjdG9yczogaW1wbGVtZW50YXRpb25zPy5hY3RvcnMgPz8ge30sXG4gICAgICBhY3Rpb25zOiBpbXBsZW1lbnRhdGlvbnM/LmFjdGlvbnMgPz8ge30sXG4gICAgICBkZWxheXM6IGltcGxlbWVudGF0aW9ucz8uZGVsYXlzID8/IHt9LFxuICAgICAgZ3VhcmRzOiBpbXBsZW1lbnRhdGlvbnM/Lmd1YXJkcyA/PyB7fVxuICAgIH07XG4gICAgdGhpcy52ZXJzaW9uID0gdGhpcy5jb25maWcudmVyc2lvbjtcbiAgICB0aGlzLnR5cGVzID0gdGhpcy5jb25maWcudHlwZXMgPz8ge307XG4gICAgdGhpcy50cmFuc2l0aW9uID0gdGhpcy50cmFuc2l0aW9uLmJpbmQodGhpcyk7XG4gICAgdGhpcy5nZXRJbml0aWFsU3RhdGUgPSB0aGlzLmdldEluaXRpYWxTdGF0ZS5iaW5kKHRoaXMpO1xuICAgIHRoaXMucmVzdG9yZVN0YXRlID0gdGhpcy5yZXN0b3JlU3RhdGUuYmluZCh0aGlzKTtcbiAgICB0aGlzLnN0YXJ0ID0gdGhpcy5zdGFydC5iaW5kKHRoaXMpO1xuICAgIHRoaXMuZ2V0UGVyc2lzdGVkU3RhdGUgPSB0aGlzLmdldFBlcnNpc3RlZFN0YXRlLmJpbmQodGhpcyk7XG4gICAgdGhpcy5yb290ID0gbmV3IFN0YXRlTm9kZShjb25maWcsIHtcbiAgICAgIF9rZXk6IHRoaXMuaWQsXG4gICAgICBfbWFjaGluZTogdGhpc1xuICAgIH0pO1xuICAgIHRoaXMucm9vdC5faW5pdGlhbGl6ZSgpO1xuICAgIHRoaXMuc3RhdGVzID0gdGhpcy5yb290LnN0YXRlczsgLy8gVE9ETzogcmVtb3ZlIVxuICAgIHRoaXMuZXZlbnRzID0gdGhpcy5yb290LmV2ZW50cztcbiAgfVxuXG4gIC8qKlxuICAgKiBDbG9uZXMgdGhpcyBzdGF0ZSBtYWNoaW5lIHdpdGggdGhlIHByb3ZpZGVkIGltcGxlbWVudGF0aW9uc1xuICAgKiBhbmQgbWVyZ2VzIHRoZSBgY29udGV4dGAgKGlmIHByb3ZpZGVkKS5cbiAgICpcbiAgICogQHBhcmFtIGltcGxlbWVudGF0aW9ucyBPcHRpb25zIChgYWN0aW9uc2AsIGBndWFyZHNgLCBgYWN0b3JzYCwgYGRlbGF5c2AsIGBjb250ZXh0YClcbiAgICogIHRvIHJlY3Vyc2l2ZWx5IG1lcmdlIHdpdGggdGhlIGV4aXN0aW5nIG9wdGlvbnMuXG4gICAqXG4gICAqIEByZXR1cm5zIEEgbmV3IGBTdGF0ZU1hY2hpbmVgIGluc3RhbmNlIHdpdGggdGhlIHByb3ZpZGVkIGltcGxlbWVudGF0aW9ucy5cbiAgICovXG4gIHByb3ZpZGUoaW1wbGVtZW50YXRpb25zKSB7XG4gICAgY29uc3Qge1xuICAgICAgYWN0aW9ucyxcbiAgICAgIGd1YXJkcyxcbiAgICAgIGFjdG9ycyxcbiAgICAgIGRlbGF5c1xuICAgIH0gPSB0aGlzLmltcGxlbWVudGF0aW9ucztcbiAgICByZXR1cm4gbmV3IFN0YXRlTWFjaGluZSh0aGlzLmNvbmZpZywge1xuICAgICAgYWN0aW9uczoge1xuICAgICAgICAuLi5hY3Rpb25zLFxuICAgICAgICAuLi5pbXBsZW1lbnRhdGlvbnMuYWN0aW9uc1xuICAgICAgfSxcbiAgICAgIGd1YXJkczoge1xuICAgICAgICAuLi5ndWFyZHMsXG4gICAgICAgIC4uLmltcGxlbWVudGF0aW9ucy5ndWFyZHNcbiAgICAgIH0sXG4gICAgICBhY3RvcnM6IHtcbiAgICAgICAgLi4uYWN0b3JzLFxuICAgICAgICAuLi5pbXBsZW1lbnRhdGlvbnMuYWN0b3JzXG4gICAgICB9LFxuICAgICAgZGVsYXlzOiB7XG4gICAgICAgIC4uLmRlbGF5cyxcbiAgICAgICAgLi4uaW1wbGVtZW50YXRpb25zLmRlbGF5c1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc29sdmVzIHRoZSBnaXZlbiBgc3RhdGVgIHRvIGEgbmV3IGBTdGF0ZWAgaW5zdGFuY2UgcmVsYXRpdmUgdG8gdGhpcyBtYWNoaW5lLlxuICAgKlxuICAgKiBUaGlzIGVuc3VyZXMgdGhhdCBgLm5leHRFdmVudHNgIHJlcHJlc2VudCB0aGUgY29ycmVjdCB2YWx1ZXMuXG4gICAqXG4gICAqIEBwYXJhbSBzdGF0ZSBUaGUgc3RhdGUgdG8gcmVzb2x2ZVxuICAgKi9cbiAgcmVzb2x2ZVN0YXRlKHN0YXRlKSB7XG4gICAgY29uc3QgY29uZmlndXJhdGlvblNldCA9IGdldENvbmZpZ3VyYXRpb24oZ2V0U3RhdGVOb2Rlcyh0aGlzLnJvb3QsIHN0YXRlLnZhbHVlKSk7XG4gICAgY29uc3QgY29uZmlndXJhdGlvbiA9IEFycmF5LmZyb20oY29uZmlndXJhdGlvblNldCk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlU3RhdGUoe1xuICAgICAgLi4uc3RhdGUsXG4gICAgICB2YWx1ZTogcmVzb2x2ZVN0YXRlVmFsdWUodGhpcy5yb290LCBzdGF0ZS52YWx1ZSksXG4gICAgICBjb25maWd1cmF0aW9uLFxuICAgICAgc3RhdHVzOiBpc0luRmluYWxTdGF0ZShjb25maWd1cmF0aW9uKSA/ICdkb25lJyA6IHN0YXRlLnN0YXR1c1xuICAgIH0pO1xuICB9XG4gIHJlc29sdmVTdGF0ZVZhbHVlKHN0YXRlVmFsdWUsIC4uLltjb250ZXh0XSkge1xuICAgIGNvbnN0IHJlc29sdmVkU3RhdGVWYWx1ZSA9IHJlc29sdmVTdGF0ZVZhbHVlKHRoaXMucm9vdCwgc3RhdGVWYWx1ZSk7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZVN0YXRlKFN0YXRlLmZyb20ocmVzb2x2ZWRTdGF0ZVZhbHVlLCBjb250ZXh0LCB0aGlzKSk7XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lcyB0aGUgbmV4dCBzdGF0ZSBnaXZlbiB0aGUgY3VycmVudCBgc3RhdGVgIGFuZCByZWNlaXZlZCBgZXZlbnRgLlxuICAgKiBDYWxjdWxhdGVzIGEgZnVsbCBtYWNyb3N0ZXAgZnJvbSBhbGwgbWljcm9zdGVwcy5cbiAgICpcbiAgICogQHBhcmFtIHN0YXRlIFRoZSBjdXJyZW50IFN0YXRlIGluc3RhbmNlIG9yIHN0YXRlIHZhbHVlXG4gICAqIEBwYXJhbSBldmVudCBUaGUgcmVjZWl2ZWQgZXZlbnRcbiAgICovXG4gIHRyYW5zaXRpb24oc3RhdGUsIGV2ZW50LCBhY3RvckN0eCkge1xuICAgIC8vIFRPRE86IGhhbmRsZSBlcnJvciBldmVudHMgaW4gYSBiZXR0ZXIgd2F5XG4gICAgaWYgKGlzRXJyb3JBY3RvckV2ZW50KGV2ZW50KSAmJiAhc3RhdGUubmV4dEV2ZW50cy5zb21lKG5leHRFdmVudCA9PiBuZXh0RXZlbnQgPT09IGV2ZW50LnR5cGUpKSB7XG4gICAgICByZXR1cm4gY2xvbmVTdGF0ZShzdGF0ZSwge1xuICAgICAgICBzdGF0dXM6ICdlcnJvcicsXG4gICAgICAgIGVycm9yOiBldmVudC5kYXRhXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3Qge1xuICAgICAgc3RhdGU6IG5leHRTdGF0ZVxuICAgIH0gPSBtYWNyb3N0ZXAoc3RhdGUsIGV2ZW50LCBhY3RvckN0eCk7XG4gICAgcmV0dXJuIG5leHRTdGF0ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBEZXRlcm1pbmVzIHRoZSBuZXh0IHN0YXRlIGdpdmVuIHRoZSBjdXJyZW50IGBzdGF0ZWAgYW5kIGBldmVudGAuXG4gICAqIENhbGN1bGF0ZXMgYSBtaWNyb3N0ZXAuXG4gICAqXG4gICAqIEBwYXJhbSBzdGF0ZSBUaGUgY3VycmVudCBzdGF0ZVxuICAgKiBAcGFyYW0gZXZlbnQgVGhlIHJlY2VpdmVkIGV2ZW50XG4gICAqL1xuICBtaWNyb3N0ZXAoc3RhdGUsIGV2ZW50LCBhY3RvckN0eCkge1xuICAgIHJldHVybiBtYWNyb3N0ZXAoc3RhdGUsIGV2ZW50LCBhY3RvckN0eCkubWljcm9zdGF0ZXM7XG4gIH1cbiAgZ2V0VHJhbnNpdGlvbkRhdGEoc3RhdGUsIGV2ZW50KSB7XG4gICAgcmV0dXJuIHRyYW5zaXRpb25Ob2RlKHRoaXMucm9vdCwgc3RhdGUudmFsdWUsIHN0YXRlLCBldmVudCkgfHwgW107XG4gIH1cblxuICAvKipcbiAgICogVGhlIGluaXRpYWwgc3RhdGUgX2JlZm9yZV8gZXZhbHVhdGluZyBhbnkgbWljcm9zdGVwcy5cbiAgICogVGhpcyBcInByZS1pbml0aWFsXCIgc3RhdGUgaXMgcHJvdmlkZWQgdG8gaW5pdGlhbCBhY3Rpb25zIGV4ZWN1dGVkIGluIHRoZSBpbml0aWFsIHN0YXRlLlxuICAgKi9cbiAgZ2V0UHJlSW5pdGlhbFN0YXRlKGFjdG9yQ3R4LCBpbml0RXZlbnQpIHtcbiAgICBjb25zdCB7XG4gICAgICBjb250ZXh0XG4gICAgfSA9IHRoaXMuY29uZmlnO1xuICAgIGNvbnN0IHByZUluaXRpYWwgPSB0aGlzLnJlc29sdmVTdGF0ZSh0aGlzLmNyZWF0ZVN0YXRlKHtcbiAgICAgIHZhbHVlOiB7fSxcbiAgICAgIC8vIFRPRE86IHRoaXMgaXMgY29tcHV0ZWQgaW4gc3RhdGUgY29uc3RydWN0b3JcbiAgICAgIGNvbnRleHQ6IHR5cGVvZiBjb250ZXh0ICE9PSAnZnVuY3Rpb24nICYmIGNvbnRleHQgPyBjb250ZXh0IDoge30sXG4gICAgICBtZXRhOiB1bmRlZmluZWQsXG4gICAgICBjb25maWd1cmF0aW9uOiBnZXRJbml0aWFsQ29uZmlndXJhdGlvbih0aGlzLnJvb3QpLFxuICAgICAgY2hpbGRyZW46IHt9LFxuICAgICAgc3RhdHVzOiAnYWN0aXZlJ1xuICAgIH0pKTtcbiAgICBpZiAodHlwZW9mIGNvbnRleHQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGNvbnN0IGFzc2lnbm1lbnQgPSAoe1xuICAgICAgICBzcGF3bixcbiAgICAgICAgZXZlbnRcbiAgICAgIH0pID0+IGNvbnRleHQoe1xuICAgICAgICBzcGF3bixcbiAgICAgICAgaW5wdXQ6IGV2ZW50LmlucHV0XG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXNvbHZlQWN0aW9uc0FuZENvbnRleHQoW2Fzc2lnbihhc3NpZ25tZW50KV0sIGluaXRFdmVudCwgcHJlSW5pdGlhbCwgYWN0b3JDdHgpO1xuICAgIH1cbiAgICByZXR1cm4gcHJlSW5pdGlhbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBpbml0aWFsIGBTdGF0ZWAgaW5zdGFuY2UsIHdpdGggcmVmZXJlbmNlIHRvIGBzZWxmYCBhcyBhbiBgQWN0b3JSZWZgLlxuICAgKi9cbiAgZ2V0SW5pdGlhbFN0YXRlKGFjdG9yQ3R4LCBpbnB1dCkge1xuICAgIGNvbnN0IGluaXRFdmVudCA9IGNyZWF0ZUluaXRFdmVudChpbnB1dCk7IC8vIFRPRE86IGZpeDtcblxuICAgIGNvbnN0IHByZUluaXRpYWxTdGF0ZSA9IHRoaXMuZ2V0UHJlSW5pdGlhbFN0YXRlKGFjdG9yQ3R4LCBpbml0RXZlbnQpO1xuICAgIGNvbnN0IG5leHRTdGF0ZSA9IG1pY3Jvc3RlcChbe1xuICAgICAgdGFyZ2V0OiBbLi4ucHJlSW5pdGlhbFN0YXRlLmNvbmZpZ3VyYXRpb25dLmZpbHRlcihpc0F0b21pY1N0YXRlTm9kZSksXG4gICAgICBzb3VyY2U6IHRoaXMucm9vdCxcbiAgICAgIHJlZW50ZXI6IHRydWUsXG4gICAgICBhY3Rpb25zOiBbXSxcbiAgICAgIGV2ZW50VHlwZTogbnVsbCxcbiAgICAgIHRvSlNPTjogbnVsbCAvLyBUT0RPOiBmaXhcbiAgICB9XSwgcHJlSW5pdGlhbFN0YXRlLCBhY3RvckN0eCwgaW5pdEV2ZW50LCB0cnVlKTtcbiAgICBjb25zdCB7XG4gICAgICBzdGF0ZTogbWFjcm9TdGF0ZVxuICAgIH0gPSBtYWNyb3N0ZXAobmV4dFN0YXRlLCBpbml0RXZlbnQsIGFjdG9yQ3R4KTtcbiAgICByZXR1cm4gbWFjcm9TdGF0ZTtcbiAgfVxuICBzdGFydChzdGF0ZSkge1xuICAgIE9iamVjdC52YWx1ZXMoc3RhdGUuY2hpbGRyZW4pLmZvckVhY2goY2hpbGQgPT4ge1xuICAgICAgaWYgKGNoaWxkLnN0YXR1cyA9PT0gMCkge1xuICAgICAgICBjaGlsZC5zdGFydD8uKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgZ2V0U3RhdGVOb2RlQnlJZChzdGF0ZUlkKSB7XG4gICAgY29uc3QgZnVsbFBhdGggPSBzdGF0ZUlkLnNwbGl0KFNUQVRFX0RFTElNSVRFUik7XG4gICAgY29uc3QgcmVsYXRpdmVQYXRoID0gZnVsbFBhdGguc2xpY2UoMSk7XG4gICAgY29uc3QgcmVzb2x2ZWRTdGF0ZUlkID0gaXNTdGF0ZUlkKGZ1bGxQYXRoWzBdKSA/IGZ1bGxQYXRoWzBdLnNsaWNlKFNUQVRFX0lERU5USUZJRVIubGVuZ3RoKSA6IGZ1bGxQYXRoWzBdO1xuICAgIGNvbnN0IHN0YXRlTm9kZSA9IHRoaXMuaWRNYXAuZ2V0KHJlc29sdmVkU3RhdGVJZCk7XG4gICAgaWYgKCFzdGF0ZU5vZGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2hpbGQgc3RhdGUgbm9kZSAnIyR7cmVzb2x2ZWRTdGF0ZUlkfScgZG9lcyBub3QgZXhpc3Qgb24gbWFjaGluZSAnJHt0aGlzLmlkfSdgKTtcbiAgICB9XG4gICAgcmV0dXJuIGdldFN0YXRlTm9kZUJ5UGF0aChzdGF0ZU5vZGUsIHJlbGF0aXZlUGF0aCk7XG4gIH1cbiAgZ2V0IGRlZmluaXRpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMucm9vdC5kZWZpbml0aW9uO1xuICB9XG4gIHRvSlNPTigpIHtcbiAgICByZXR1cm4gdGhpcy5kZWZpbml0aW9uO1xuICB9XG4gIGdldFBlcnNpc3RlZFN0YXRlKHN0YXRlKSB7XG4gICAgcmV0dXJuIGdldFBlcnNpc3RlZFN0YXRlKHN0YXRlKTtcbiAgfVxuICBjcmVhdGVTdGF0ZShzdGF0ZUNvbmZpZykge1xuICAgIHJldHVybiBzdGF0ZUNvbmZpZyBpbnN0YW5jZW9mIFN0YXRlID8gc3RhdGVDb25maWcgOiBuZXcgU3RhdGUoc3RhdGVDb25maWcsIHRoaXMpO1xuICB9XG4gIHJlc3RvcmVTdGF0ZShzbmFwc2hvdCwgX2FjdG9yQ3R4KSB7XG4gICAgY29uc3QgY2hpbGRyZW4gPSB7fTtcbiAgICBPYmplY3Qua2V5cyhzbmFwc2hvdC5jaGlsZHJlbikuZm9yRWFjaChhY3RvcklkID0+IHtcbiAgICAgIGNvbnN0IGFjdG9yRGF0YSA9IHNuYXBzaG90LmNoaWxkcmVuW2FjdG9ySWRdO1xuICAgICAgY29uc3QgY2hpbGRTdGF0ZSA9IGFjdG9yRGF0YS5zdGF0ZTtcbiAgICAgIGNvbnN0IHNyYyA9IGFjdG9yRGF0YS5zcmM7XG4gICAgICBjb25zdCBsb2dpYyA9IHNyYyA/IHJlc29sdmVSZWZlcmVuY2VkQWN0b3IodGhpcy5pbXBsZW1lbnRhdGlvbnMuYWN0b3JzW3NyY10pPy5zcmMgOiB1bmRlZmluZWQ7XG4gICAgICBpZiAoIWxvZ2ljKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGFjdG9yU3RhdGUgPSBsb2dpYy5yZXN0b3JlU3RhdGU/LihjaGlsZFN0YXRlLCBfYWN0b3JDdHgpO1xuICAgICAgY29uc3QgYWN0b3JSZWYgPSBjcmVhdGVBY3Rvcihsb2dpYywge1xuICAgICAgICBpZDogYWN0b3JJZCxcbiAgICAgICAgcGFyZW50OiBfYWN0b3JDdHg/LnNlbGYsXG4gICAgICAgIHN0YXRlOiBhY3RvclN0YXRlXG4gICAgICB9KTtcbiAgICAgIGNoaWxkcmVuW2FjdG9ySWRdID0gYWN0b3JSZWY7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlU3RhdGUobmV3IFN0YXRlKHtcbiAgICAgIC4uLnNuYXBzaG90LFxuICAgICAgY2hpbGRyZW5cbiAgICB9LCB0aGlzKSk7XG4gIH1cblxuICAvKipAZGVwcmVjYXRlZCBhbiBpbnRlcm5hbCBwcm9wZXJ0eSBhY3RpbmcgYXMgYSBcInBoYW50b21cIiB0eXBlLCBub3QgbWVhbnQgdG8gYmUgdXNlZCBhdCBydW50aW1lICovXG59XG5cbmNvbnN0IGRlZmF1bHRXYWl0Rm9yT3B0aW9ucyA9IHtcbiAgdGltZW91dDogMTBfMDAwIC8vIDEwIHNlY29uZHNcbn07XG5cbi8qKlxuICogU3Vic2NyaWJlcyB0byBhbiBhY3RvciByZWYgYW5kIHdhaXRzIGZvciBpdHMgZW1pdHRlZCB2YWx1ZSB0byBzYXRpc2Z5XG4gKiBhIHByZWRpY2F0ZSwgYW5kIHRoZW4gcmVzb2x2ZXMgd2l0aCB0aGF0IHZhbHVlLlxuICogV2lsbCB0aHJvdyBpZiB0aGUgZGVzaXJlZCBzdGF0ZSBpcyBub3QgcmVhY2hlZCBhZnRlciBhIHRpbWVvdXRcbiAqIChkZWZhdWx0cyB0byAxMCBzZWNvbmRzKS5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBganNcbiAqIGNvbnN0IHN0YXRlID0gYXdhaXQgd2FpdEZvcihzb21lU2VydmljZSwgc3RhdGUgPT4ge1xuICogICByZXR1cm4gc3RhdGUuaGFzVGFnKCdsb2FkZWQnKTtcbiAqIH0pO1xuICpcbiAqIHN0YXRlLmhhc1RhZygnbG9hZGVkJyk7IC8vIHRydWVcbiAqIGBgYFxuICpcbiAqIEBwYXJhbSBhY3RvclJlZiBUaGUgYWN0b3IgcmVmIHRvIHN1YnNjcmliZSB0b1xuICogQHBhcmFtIHByZWRpY2F0ZSBEZXRlcm1pbmVzIGlmIGEgdmFsdWUgbWF0Y2hlcyB0aGUgY29uZGl0aW9uIHRvIHdhaXQgZm9yXG4gKiBAcGFyYW0gb3B0aW9uc1xuICogQHJldHVybnMgQSBwcm9taXNlIHRoYXQgZXZlbnR1YWxseSByZXNvbHZlcyB0byB0aGUgZW1pdHRlZCB2YWx1ZVxuICogdGhhdCBtYXRjaGVzIHRoZSBjb25kaXRpb25cbiAqL1xuZnVuY3Rpb24gd2FpdEZvcihhY3RvclJlZiwgcHJlZGljYXRlLCBvcHRpb25zKSB7XG4gIGNvbnN0IHJlc29sdmVkT3B0aW9ucyA9IHtcbiAgICAuLi5kZWZhdWx0V2FpdEZvck9wdGlvbnMsXG4gICAgLi4ub3B0aW9uc1xuICB9O1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgbGV0IGRvbmUgPSBmYWxzZTtcbiAgICBjb25zdCBoYW5kbGUgPSByZXNvbHZlZE9wdGlvbnMudGltZW91dCA9PT0gSW5maW5pdHkgPyB1bmRlZmluZWQgOiBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHN1Yi51bnN1YnNjcmliZSgpO1xuICAgICAgcmVqKG5ldyBFcnJvcihgVGltZW91dCBvZiAke3Jlc29sdmVkT3B0aW9ucy50aW1lb3V0fSBtcyBleGNlZWRlZGApKTtcbiAgICB9LCByZXNvbHZlZE9wdGlvbnMudGltZW91dCk7XG4gICAgY29uc3QgZGlzcG9zZSA9ICgpID0+IHtcbiAgICAgIGNsZWFyVGltZW91dChoYW5kbGUpO1xuICAgICAgZG9uZSA9IHRydWU7XG4gICAgICBzdWI/LnVuc3Vic2NyaWJlKCk7XG4gICAgfTtcbiAgICBmdW5jdGlvbiBjaGVja0VtaXR0ZWQoZW1pdHRlZCkge1xuICAgICAgaWYgKHByZWRpY2F0ZShlbWl0dGVkKSkge1xuICAgICAgICBkaXNwb3NlKCk7XG4gICAgICAgIHJlcyhlbWl0dGVkKTtcbiAgICAgIH1cbiAgICB9XG4gICAgbGV0IHN1YjsgLy8gYXZvaWQgVERaIHdoZW4gZGlzcG9zaW5nIHN5bmNocm9ub3VzbHlcblxuICAgIC8vIFNlZSBpZiB0aGUgY3VycmVudCBzbmFwc2hvdCBhbHJlYWR5IG1hdGNoZXMgdGhlIHByZWRpY2F0ZVxuICAgIGNoZWNrRW1pdHRlZChhY3RvclJlZi5nZXRTbmFwc2hvdCgpKTtcbiAgICBpZiAoZG9uZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzdWIgPSBhY3RvclJlZi5zdWJzY3JpYmUoe1xuICAgICAgbmV4dDogY2hlY2tFbWl0dGVkLFxuICAgICAgZXJyb3I6IGVyciA9PiB7XG4gICAgICAgIGRpc3Bvc2UoKTtcbiAgICAgICAgcmVqKGVycik7XG4gICAgICB9LFxuICAgICAgY29tcGxldGU6ICgpID0+IHtcbiAgICAgICAgZGlzcG9zZSgpO1xuICAgICAgICByZWoobmV3IEVycm9yKGBBY3RvciB0ZXJtaW5hdGVkIHdpdGhvdXQgc2F0aXNmeWluZyBwcmVkaWNhdGVgKSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKGRvbmUpIHtcbiAgICAgIHN1Yi51bnN1YnNjcmliZSgpO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1hY2hpbmUoY29uZmlnLCBpbXBsZW1lbnRhdGlvbnMpIHtcbiAgcmV0dXJuIG5ldyBTdGF0ZU1hY2hpbmUoY29uZmlnLCBpbXBsZW1lbnRhdGlvbnMpO1xufVxuXG5mdW5jdGlvbiBtYXBTdGF0ZShzdGF0ZU1hcCwgc3RhdGVJZCkge1xuICBsZXQgZm91bmRTdGF0ZUlkO1xuICBmb3IgKGNvbnN0IG1hcHBlZFN0YXRlSWQgb2YgT2JqZWN0LmtleXMoc3RhdGVNYXApKSB7XG4gICAgaWYgKG1hdGNoZXNTdGF0ZShtYXBwZWRTdGF0ZUlkLCBzdGF0ZUlkKSAmJiAoIWZvdW5kU3RhdGVJZCB8fCBzdGF0ZUlkLmxlbmd0aCA+IGZvdW5kU3RhdGVJZC5sZW5ndGgpKSB7XG4gICAgICBmb3VuZFN0YXRlSWQgPSBtYXBwZWRTdGF0ZUlkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RhdGVNYXBbZm91bmRTdGF0ZUlkXTtcbn1cblxuZXhwb3J0IHsgU2ltdWxhdGVkQ2xvY2ssIFN0YXRlTWFjaGluZSwgU3RhdGVOb2RlLCBjcmVhdGVNYWNoaW5lLCBtYXBTdGF0ZSwgd2FpdEZvciB9O1xuIiwiaW1wb3J0IHsgY3JlYXRlTWFjaGluZSB9IGZyb20gJ3hzdGF0ZSc7XHJcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tICcuLi9Db250ZXh0JztcclxuaW1wb3J0IHsgSUNvbnRleHQsIEV2ZW50cyB9IGZyb20gJy4uL3R5cGVzJztcclxuXHJcbmV4cG9ydCBjb25zdCBmZWVkYmFja01hY2hpbmUgPSBjcmVhdGVNYWNoaW5lKHtcclxuXHRpZDogJ0ZlZWRiYWNrTWFjaGluZScsXHJcblx0dHlwZXM6IHt9IGFzIHtcclxuXHRcdGNvbnRleHQ6IElDb250ZXh0O1xyXG5cdFx0ZXZlbnRzOiBFdmVudHM7XHJcblx0XHQvLyBndWFyZHM6IEd1YXJkcyxcclxuXHR9LFxyXG5cdGNvbnRleHQ6IENvbnRleHQsXHJcblx0aW5pdGlhbDogJ1NhdGlzZmllZCcsXHJcblx0c3RhdGVzOiB7XHJcblx0XHRTYXRpc2ZpZWQ6IHtcclxuXHRcdFx0ZW50cnk6ICdzZXRNb2RhbFRvU2F0aXNmaWVkJyxcclxuXHRcdFx0b246IHtcclxuXHRcdFx0XHRTQVRJU0ZJRURfWUVTOiAnVGhhbngnLFxyXG5cdFx0XHRcdFNBVElTRklFRF9OTzogJ0ZlZWRiYWNrJyxcclxuXHRcdFx0fSxcclxuXHRcdH0sXHJcblx0XHRGZWVkYmFjazoge1xyXG5cdFx0XHRlbnRyeTogJ3NldE1vZGFsVG9GZWVkYmFjaycsXHJcblx0XHR9LFxyXG5cdFx0VGhhbng6IHtcclxuXHRcdFx0ZW50cnk6ICdzZXRNb2RhbFRvVGhhbngnLFxyXG5cdFx0fSxcclxuXHRcdENsb3NlZDoge30sXHJcblx0fSxcclxufSwge1xyXG5cdGFjdGlvbnM6IHtcclxuXHRcdHNldE1vZGFsVG9TYXRpc2ZpZWQ6ICh7Y29udGV4dH0pID0+IHtcclxuXHRcdFx0Y29udGV4dC5tb2RhbC52YWx1ZSA9ICdTYXRpc2ZpZWQnO1xyXG5cdFx0fSxcclxuXHRcdHNldE1vZGFsVG9GZWVkYmFjazogKHtjb250ZXh0fSkgPT4ge1xyXG5cdFx0XHRjb250ZXh0Lm1vZGFsLnZhbHVlID0gJ0ZlZWRiYWNrJztcclxuXHRcdH0sXHJcblx0XHRzZXRNb2RhbFRvVGhhbng6ICh7Y29udGV4dH0pID0+IHtcclxuXHRcdFx0Y29udGV4dC5tb2RhbC52YWx1ZSA9ICdUaGFueCc7XHJcblx0XHR9LFxyXG5cdH0sXHJcbn0pO1xyXG4iLCJpbXBvcnQgeyBjcmVhdGVBY3RvciB9IGZyb20gJ3hzdGF0ZSc7XHJcbmltcG9ydCB7IGZlZWRiYWNrTWFjaGluZSB9IGZyb20gJy4vRmVlZGJhY2tNYWNoaW5lJztcclxuXHJcbmV4cG9ydCBjb25zdCBmZWVkYmFja0FjdG9yID0gY3JlYXRlQWN0b3IoZmVlZGJhY2tNYWNoaW5lKTtcclxuXHJcbiIsImltcG9ydCB7IGZlZWRiYWNrQWN0b3IgfSBmcm9tICcuL2ZzbS9GZWVkYmFja0FjdG9yJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEZlZWRiYWNrTG9naWMge1xyXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdTQVRJU0ZJRURfWUVTJywgZmVlZGJhY2tBY3Rvci5zZW5kKTtcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdTQVRJU0ZJRURfTk8nLCBmZWVkYmFja0FjdG9yLnNlbmQpO1xyXG5cdFx0ZmVlZGJhY2tBY3Rvci5zdWJzY3JpYmUoc25hcHNob3QgPT4ge1xyXG5cdFx0XHRjb25zb2xlLmxvZyhzbmFwc2hvdC52YWx1ZSk7XHJcblx0XHR9KTtcclxuXHRcdGZlZWRiYWNrQWN0b3Iuc3RhcnQoKTtcclxuXHJcblx0XHQvLyBmZWVkYmFja0FjdG9yLnNlbmQoeyB0eXBlOiAnU0FUSVNGSUVEX1lFUycgfSk7XHJcblx0fVxyXG59XHJcbiIsImltcG9ydCBJQmFzZSBmcm9tICcuL0lCYXNlJztcclxuaW1wb3J0IElDb250YWluZXIgZnJvbSAnLi9JQ29udGFpbmVyJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGFic3RyYWN0IGNsYXNzIEJhc2UgZXh0ZW5kcyBIVE1MRWxlbWVudCBpbXBsZW1lbnRzIElCYXNlIHtcclxuXHRwdWJsaWMgY29uc3RydWN0b3IoKSB7XHJcblx0XHRzdXBlcigpO1xyXG5cdH1cclxuXHJcblx0cHJvdGVjdGVkIGNvbW1pdFByb3BlcnRpZXMoKTogdm9pZCB7XHJcblx0XHRpZiAodGhpcy5fd2lkdGhDaGFuZ2VkIHx8IHRoaXMuX2hlaWdodENoYW5nZWQpIHtcclxuXHRcdFx0dGhpcy5zaXplQ2hhbmdlZCgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICh0aGlzLl9wb3NpdGlvbkNoYW5nZWQpIHtcclxuXHRcdFx0dGhpcy5wb3NpdGlvbkNoYW5nZWQoKTtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAodGhpcy5fbGVmdENoYW5nZWQgfHwgdGhpcy5fdG9wQ2hhbmdlZCB8fCB0aGlzLl9yaWdodENoYW5nZWQgfHwgdGhpcy5fYm90dG9tQ2hhbmdlZCkge1xyXG5cdFx0XHR0aGlzLmNvbnRyYWludHNDaGFuZ2VkKCk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcm90ZWN0ZWQgc2l6ZUNoYW5nZWQoKSB7XHJcblx0XHR0aGlzLl93aWR0aENoYW5nZWQgPSBmYWxzZTtcclxuXHRcdHRoaXMuX2hlaWdodENoYW5nZWQgPSBmYWxzZTtcclxuXHR9XHJcblxyXG5cdHByb3RlY3RlZCBwb3NpdGlvbkNoYW5nZWQoKSB7XHJcblx0XHR0aGlzLl9wb3NpdGlvbkNoYW5nZWQgPSBmYWxzZTtcclxuXHR9XHJcblxyXG5cdHByb3RlY3RlZCBjb250cmFpbnRzQ2hhbmdlZCgpIHtcclxuXHRcdHRoaXMuX2xlZnRDaGFuZ2VkID0gZmFsc2U7XHJcblx0XHR0aGlzLl90b3BDaGFuZ2VkID0gZmFsc2U7XHJcblx0XHR0aGlzLl9yaWdodENoYW5nZWQgPSBmYWxzZTtcclxuXHRcdHRoaXMuX2JvdHRvbUNoYW5nZWQgPSBmYWxzZTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3dpZHRoOiBudW1iZXIgfCAnRklMTCcgfCAnSFVHJyA9ICdIVUcnO1xyXG5cdHByaXZhdGUgX3dpZHRoQ2hhbmdlZCA9IHRydWU7XHJcblxyXG5cdHB1YmxpYyBnZXQgd2lkdGgoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fd2lkdGg7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IHdpZHRoKHZhbHVlOiBudW1iZXIgfCAnRklMTCcgfCAnSFVHJykge1xyXG5cdFx0aWYgKHRoaXMuX3dpZHRoID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHZhbHVlID09PSAnRklMTCcgfHwgdmFsdWUgPT09ICdIVUcnKSB7XHJcblx0XHRcdHRoaXMuX3dpZHRoID0gdmFsdWU7XHJcblx0XHRcdHRoaXMuX3dpZHRoQ2hhbmdlZCA9IHRydWU7XHJcblx0XHRcdHRoaXMuaW52YWxpZGF0ZVByb3BlcnRpZXMoKTtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPCAwKSB7XHJcblx0XHRcdGlmICh0aGlzLl93aWR0aCAhPT0gMCkge1xyXG5cdFx0XHRcdHRoaXMuX3dpZHRoID0gMDtcclxuXHRcdFx0XHR0aGlzLl93aWR0aENoYW5nZWQgPSB0cnVlO1xyXG5cdFx0XHRcdHRoaXMuaW52YWxpZGF0ZVByb3BlcnRpZXMoKTtcclxuXHRcdFx0fVxyXG5cclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3dpZHRoID0gdmFsdWU7XHJcblx0XHR0aGlzLl93aWR0aENoYW5nZWQgPSB0cnVlO1xyXG5cdFx0dGhpcy5pbnZhbGlkYXRlUHJvcGVydGllcygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfaGVpZ2h0OiBudW1iZXIgfCAnRklMTCcgfCAnSFVHJyA9ICdIVUcnO1xyXG5cdHByaXZhdGUgX2hlaWdodENoYW5nZWQgPSB0cnVlO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGhlaWdodCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9oZWlnaHQ7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGhlaWdodCh2YWx1ZTogbnVtYmVyIHwgJ0ZJTEwnIHwgJ0hVRycpIHtcclxuXHRcdGlmICh0aGlzLl9oZWlnaHQgPT09IHZhbHVlKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAodmFsdWUgPT09ICdGSUxMJyB8fCB2YWx1ZSA9PT0gJ0hVRycpIHtcclxuXHRcdFx0dGhpcy5faGVpZ2h0ID0gdmFsdWU7XHJcblx0XHRcdHRoaXMuX2hlaWdodENoYW5nZWQgPSB0cnVlO1xyXG5cdFx0XHR0aGlzLmludmFsaWRhdGVQcm9wZXJ0aWVzKCk7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlIDwgMCkge1xyXG5cdFx0XHRpZiAodGhpcy5faGVpZ2h0ICE9PSAwKSB7XHJcblx0XHRcdFx0dGhpcy5faGVpZ2h0ID0gMDtcclxuXHRcdFx0XHR0aGlzLl9oZWlnaHRDaGFuZ2VkID0gdHJ1ZTtcclxuXHRcdFx0XHR0aGlzLmludmFsaWRhdGVQcm9wZXJ0aWVzKCk7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9oZWlnaHQgPSB2YWx1ZTtcclxuXHRcdHRoaXMuX2hlaWdodENoYW5nZWQgPSB0cnVlO1xyXG5cdFx0dGhpcy5pbnZhbGlkYXRlUHJvcGVydGllcygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcG9zaXRpb246ICdTQ1JPTExfV0lUSF9QQVJFTlQnIHwgJ0ZJWEVEJyB8ICdTVElDS1knID0gJ1NDUk9MTF9XSVRIX1BBUkVOVCc7XHJcblx0cHJpdmF0ZSBfcG9zaXRpb25DaGFuZ2VkID0gZmFsc2U7XHJcblxyXG5cdHB1YmxpYyBnZXQgcG9zaXRpb24oKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fcG9zaXRpb247XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IHBvc2l0aW9uKHZhbHVlOiAnU0NST0xMX1dJVEhfUEFSRU5UJyB8ICdGSVhFRCcgfCAnU1RJQ0tZJykge1xyXG5cdFx0aWYgKHRoaXMuX3Bvc2l0aW9uID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fcG9zaXRpb24gPSB2YWx1ZTtcclxuXHRcdHRoaXMuX3Bvc2l0aW9uQ2hhbmdlZCA9IHRydWU7XHJcblx0XHR0aGlzLmludmFsaWRhdGVQcm9wZXJ0aWVzKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9sZWZ0ID0gTmFOO1xyXG5cdHByaXZhdGUgX2xlZnRDaGFuZ2VkID0gZmFsc2U7XHJcblxyXG5cdHB1YmxpYyBnZXQgbGVmdCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9sZWZ0O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBsZWZ0KHZhbHVlOiBudW1iZXIpIHtcclxuXHRcdGlmICh0aGlzLl9sZWZ0ID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih0aGlzLl9sZWZ0KSAmJiBOdW1iZXIuaXNOYU4odmFsdWUpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9sZWZ0ID0gdmFsdWU7XHJcblx0XHR0aGlzLl9sZWZ0Q2hhbmdlZCA9IHRydWU7XHJcblx0XHR0aGlzLmludmFsaWRhdGVQcm9wZXJ0aWVzKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF90b3AgPSBOYU47XHJcblx0cHJpdmF0ZSBfdG9wQ2hhbmdlZCA9IGZhbHNlO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHRvcCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl90b3A7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IHRvcCh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5fdG9wID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih0aGlzLl90b3ApICYmIE51bWJlci5pc05hTih2YWx1ZSkpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3RvcCA9IHZhbHVlO1xyXG5cdFx0dGhpcy5fdG9wQ2hhbmdlZCA9IHRydWU7XHJcblx0XHR0aGlzLmludmFsaWRhdGVQcm9wZXJ0aWVzKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9yaWdodCA9IE5hTjtcclxuXHRwcml2YXRlIF9yaWdodENoYW5nZWQgPSBmYWxzZTtcclxuXHJcblx0cHVibGljIGdldCByaWdodCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9yaWdodDtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgcmlnaHQodmFsdWU6IG51bWJlcikge1xyXG5cdFx0aWYgKHRoaXMuX3JpZ2h0ID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih0aGlzLl9yaWdodCkgJiYgTnVtYmVyLmlzTmFOKHZhbHVlKSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fcmlnaHQgPSB2YWx1ZTtcclxuXHRcdHRoaXMuX3JpZ2h0Q2hhbmdlZCA9IHRydWU7XHJcblx0XHR0aGlzLmludmFsaWRhdGVQcm9wZXJ0aWVzKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9ib3R0b20gPSBOYU47XHJcblx0cHJpdmF0ZSBfYm90dG9tQ2hhbmdlZCA9IGZhbHNlO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGJvdHRvbSgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9ib3R0b207XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGJvdHRvbSh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5fYm90dG9tID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih0aGlzLl9ib3R0b20pICYmIE51bWJlci5pc05hTih2YWx1ZSkpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2JvdHRvbSA9IHZhbHVlO1xyXG5cdFx0dGhpcy5fYm90dG9tQ2hhbmdlZCA9IHRydWU7XHJcblx0XHR0aGlzLmludmFsaWRhdGVQcm9wZXJ0aWVzKCk7XHJcblx0fVxyXG5cclxuXHRwcm90ZWN0ZWQgZ2V0IHBhcmVudCgpIHtcclxuXHRcdGlmICh0aGlzLnBhcmVudE5vZGUgaW5zdGFuY2VvZiBIVE1MQW5jaG9yRWxlbWVudCkge1xyXG5cdFx0XHRyZXR1cm4gdGhpcy5wYXJlbnROb2RlLnBhcmVudE5vZGUgYXMgdW5rbm93biBhcyBJQ29udGFpbmVyO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzLnBhcmVudE5vZGUgYXMgdW5rbm93biBhcyBJQ29udGFpbmVyO1xyXG5cdH1cclxuXHJcblx0cHJvdGVjdGVkIGludmFsaWRhdGVQcm9wZXJ0aWVzKCkge1xyXG5cdFx0aWYgKHRoaXMuY29ubmVjdGVkKSB7XHJcblx0XHRcdHRoaXMuY29tbWl0UHJvcGVydGllcygpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBjb25uZWN0ZWQgPSBmYWxzZTtcclxuXHJcblx0cHVibGljIGNvbm5lY3RlZENhbGxiYWNrKCkge1xyXG5cdFx0dGhpcy5jb25uZWN0ZWQgPSB0cnVlO1xyXG5cdFx0dGhpcy5jb21taXRQcm9wZXJ0aWVzKCk7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgZGlzY29ubmVjdGVkQ2FsbGJhY2soKSB7XHJcblx0XHR0aGlzLmNvbm5lY3RlZCA9IGZhbHNlO1xyXG5cdH1cclxufVxyXG4iLCJpbXBvcnQgSUNvbXBvbmVudCBmcm9tICcuL0lDb21wb25lbnQnO1xyXG5pbXBvcnQgSUNvbnRhaW5lciBmcm9tICcuL0lDb250YWluZXInO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0UGFkZGluZyh0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdHRhcmdldC5zdHlsZS5wYWRkaW5nID0gJyc7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBhcHBseVBhZGRpbmcoY29udGFpbmVyOiBJQ29udGFpbmVyLCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdHRhcmdldC5zdHlsZS5wYWRkaW5nTGVmdCA9IGNvbnRhaW5lci5wYWRkaW5nTGVmdCArICdweCc7XHJcblx0dGFyZ2V0LnN0eWxlLnBhZGRpbmdUb3AgPSBjb250YWluZXIucGFkZGluZ1RvcCArICdweCc7XHJcblx0dGFyZ2V0LnN0eWxlLnBhZGRpbmdSaWdodCA9IGNvbnRhaW5lci5wYWRkaW5nUmlnaHQgKyAncHgnO1xyXG5cdHRhcmdldC5zdHlsZS5wYWRkaW5nQm90dG9tID0gY29udGFpbmVyLnBhZGRpbmdCb3R0b20gKyAncHgnO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2V0RGlzcGxheUF1dG9sYXlvdXRIb3Jpem9udGFsT3JWZXJ0aWNhbCh0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSwgcGFyZW50OiBJQ29udGFpbmVyKSB7XHJcblx0Y29uc3QgcGFyZW50RWxlbWVudCA9IHBhcmVudCBhcyB1bmtub3duIGFzIEhUTUxFbGVtZW50O1xyXG5cdGlmIChwYXJlbnRFbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcclxuXHR9IGVsc2Uge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldERpc3BsYXlBdXRvTGF5b3V0R3JpZCh0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSwgcGFyZW50OiBJQ29udGFpbmVyKSB7XHJcblx0Y29uc3QgcGFyZW50RWxlbWVudCA9IHBhcmVudCBhcyB1bmtub3duIGFzIEhUTUxFbGVtZW50O1xyXG5cdGlmIChwYXJlbnRFbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuZGlzcGxheSA9ICdncmlkJztcclxuXHR9IGVsc2Uge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWdyaWQnO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldERpc3BsYXlBdXRvbGF5b3V0Tm9uZSh0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSwgcGFyZW50OiBJQ29udGFpbmVyKSB7XHJcblx0Y29uc3QgcGFyZW50RWxlbWVudCA9IHBhcmVudCBhcyB1bmtub3duIGFzIEhUTUxFbGVtZW50O1xyXG5cdGlmIChwYXJlbnRFbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZS1ibG9jayc7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbChjb21wb25lbnQ6IElDb21wb25lbnQsIHRhcmdldDogRWxlbWVudENTU0lubGluZVN0eWxlKSB7XHJcblx0aWYgKGNvbXBvbmVudC5wb3NpdGlvbiA9PT0gJ1NDUk9MTF9XSVRIX1BBUkVOVCcpIHtcclxuXHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWxTY3JvbGxXaXRoUGFyZW50KGNvbXBvbmVudCwgdGFyZ2V0KTtcclxuXHR9IGVsc2UgaWYgKGNvbXBvbmVudC5wb3NpdGlvbiA9PT0gJ1NUSUNLWScpIHtcclxuXHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWxTdGlja3koY29tcG9uZW50LCB0YXJnZXQpO1xyXG5cdH0gZWxzZSB7XHJcblx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRIb3Jpem9udGFsRml4ZWQoY29tcG9uZW50LCB0YXJnZXQpO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEdyaWQoY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQucG9zaXRpb24gPT09ICdTQ1JPTExfV0lUSF9QQVJFTlQnKSB7XHJcblx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkU2Nyb2xsV2l0aFBhcmVudCh0YXJnZXQpO1xyXG5cdH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0R3JpZFNjcm9sbFdpdGhQYXJlbnQodGFyZ2V0OiBFbGVtZW50Q1NTSW5saW5lU3R5bGUpIHtcclxuXHR0YXJnZXQuc3R5bGUud2lkdGggPSAnJztcclxuXHR0YXJnZXQuc3R5bGUuZmxleEdyb3cgPSAnMSc7XHJcblx0dGFyZ2V0LnN0eWxlLmZsZXhCYXNpcyA9ICcwJSc7XHJcblx0dGFyZ2V0LnN0eWxlLmhlaWdodCA9ICcnO1xyXG5cdHRhcmdldC5zdHlsZS5hbGlnblNlbGYgPSAnJztcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbFNjcm9sbFdpdGhQYXJlbnQoY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQud2lkdGggPT09ICdGSUxMJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLndpZHRoID0gJyc7XHJcblx0XHR0YXJnZXQuc3R5bGUuZmxleEdyb3cgPSAnMSc7XHJcblx0XHR0YXJnZXQuc3R5bGUuZmxleEJhc2lzID0gJzAlJztcclxuXHR9IGVsc2UgaWYgKGNvbXBvbmVudC53aWR0aCA9PT0gJ0hVRycpIHtcclxuXHRcdHRhcmdldC5zdHlsZS53aWR0aCA9ICcnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmZsZXhHcm93ID0gJzAnO1xyXG5cdH0gZWxzZSB7XHJcblx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSBjb21wb25lbnQud2lkdGggKyAncHgnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmZsZXhHcm93ID0gJzAnO1xyXG5cdH1cclxuXHJcblx0aWYgKGNvbXBvbmVudC5oZWlnaHQgPT09ICdGSUxMJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmhlaWdodCA9ICcnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduU2VsZiA9ICdzdHJldGNoJztcclxuXHR9IGVsc2UgaWYgKGNvbXBvbmVudC5oZWlnaHQgPT09ICdIVUcnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuaGVpZ2h0ID0gJyc7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25TZWxmID0gJyc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSBjb21wb25lbnQuaGVpZ2h0ICsgJ3B4JztcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnblNlbGYgPSAnJztcclxuXHR9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWxTdGlja3koY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQud2lkdGggPT09ICdGSUxMJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLndpZHRoID0gJyc7XHJcblx0XHR0YXJnZXQuc3R5bGUuZmxleEdyb3cgPSAnMSc7XHJcblx0XHR0YXJnZXQuc3R5bGUuZmxleEJhc2lzID0gJzAlJztcclxuXHR9IGVsc2UgaWYgKGNvbXBvbmVudC53aWR0aCA9PT0gJ0hVRycpIHtcclxuXHRcdHRhcmdldC5zdHlsZS53aWR0aCA9ICcnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmZsZXhHcm93ID0gJzAnO1xyXG5cdH0gZWxzZSB7XHJcblx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSBjb21wb25lbnQud2lkdGggKyAncHgnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmZsZXhHcm93ID0gJzAnO1xyXG5cdH1cclxuXHJcblx0aWYgKGNvbXBvbmVudC5oZWlnaHQgPT09ICdGSUxMJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmhlaWdodCA9ICcnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduU2VsZiA9ICdzdHJldGNoJztcclxuXHR9IGVsc2UgaWYgKGNvbXBvbmVudC5oZWlnaHQgPT09ICdIVUcnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuaGVpZ2h0ID0gJyc7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25TZWxmID0gJyc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSBjb21wb25lbnQuaGVpZ2h0ICsgJ3B4JztcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnblNlbGYgPSAnJztcclxuXHR9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWxGaXhlZChjb21wb25lbnQ6IElDb21wb25lbnQsIHRhcmdldDogRWxlbWVudENTU0lubGluZVN0eWxlKSB7XHJcblx0aWYgKGNvbXBvbmVudC53aWR0aCAhPT0gJ0ZJTEwnICYmIGNvbXBvbmVudC53aWR0aCAhPT0gJ0hVRycgJiYgIWlzTmFOKGNvbXBvbmVudC53aWR0aCkpIHtcclxuXHRcdHRhcmdldC5zdHlsZS53aWR0aCA9IGNvbXBvbmVudC53aWR0aCArICdweCc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS53aWR0aCA9ICcnO1xyXG5cdH1cclxuXHJcblx0aWYgKGNvbXBvbmVudC5oZWlnaHQgIT09ICdGSUxMJyAmJiBjb21wb25lbnQuaGVpZ2h0ICE9PSAnSFVHJyAmJiAhaXNOYU4oY29tcG9uZW50LmhlaWdodCkpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSBjb21wb25lbnQuaGVpZ2h0ICsgJ3B4JztcclxuXHR9IGVsc2Uge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmhlaWdodCA9ICcnO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dFZlcnRpY2FsKGNvbXBvbmVudDogSUNvbXBvbmVudCwgdGFyZ2V0OiBFbGVtZW50Q1NTSW5saW5lU3R5bGUpIHtcclxuXHRpZiAoY29tcG9uZW50LnBvc2l0aW9uID09PSAnU0NST0xMX1dJVEhfUEFSRU5UJykge1xyXG5cdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWxTY3JvbGxXaXRoUGFyZW50KGNvbXBvbmVudCwgdGFyZ2V0KTtcclxuXHR9IGVsc2UgaWYgKGNvbXBvbmVudC5wb3NpdGlvbiA9PT0gJ1NUSUNLWScpIHtcclxuXHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dFZlcnRpY2FsU3RpY2t5KGNvbXBvbmVudCwgdGFyZ2V0KTtcclxuXHR9IGVsc2Uge1xyXG5cdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWxGaXhlZChjb21wb25lbnQsIHRhcmdldCk7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbFNjcm9sbFdpdGhQYXJlbnQoY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQud2lkdGggPT09ICdGSUxMJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLndpZHRoID0gJyc7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25TZWxmID0gJ3N0cmV0Y2gnO1xyXG5cdH0gZWxzZSBpZiAoY29tcG9uZW50LndpZHRoID09PSAnSFVHJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLndpZHRoID0gJyc7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25TZWxmID0gJyc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS53aWR0aCA9IGNvbXBvbmVudC53aWR0aCArICdweCc7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25TZWxmID0gJyc7XHJcblx0fVxyXG5cclxuXHRpZiAoY29tcG9uZW50LmhlaWdodCA9PT0gJ0ZJTEwnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuaGVpZ2h0ID0gJyc7XHJcblx0XHR0YXJnZXQuc3R5bGUuZmxleEdyb3cgPSAnMSc7XHJcblx0fSBlbHNlIGlmIChjb21wb25lbnQuaGVpZ2h0ID09PSAnSFVHJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmhlaWdodCA9ICcnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmZsZXhHcm93ID0gJzAnO1xyXG5cdH0gZWxzZSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuaGVpZ2h0ID0gY29tcG9uZW50LmhlaWdodCArICdweCc7XHJcblx0XHR0YXJnZXQuc3R5bGUuZmxleEdyb3cgPSAnMCc7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbFN0aWNreShjb21wb25lbnQ6IElDb21wb25lbnQsIHRhcmdldDogRWxlbWVudENTU0lubGluZVN0eWxlKSB7XHJcblx0aWYgKGNvbXBvbmVudC53aWR0aCA9PT0gJ0ZJTEwnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSAnJztcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnblNlbGYgPSAnc3RyZXRjaCc7XHJcblx0fSBlbHNlIGlmIChjb21wb25lbnQud2lkdGggPT09ICdIVUcnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSAnJztcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnblNlbGYgPSAnJztcclxuXHR9IGVsc2Uge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLndpZHRoID0gY29tcG9uZW50LndpZHRoICsgJ3B4JztcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnblNlbGYgPSAnJztcclxuXHR9XHJcblxyXG5cdGlmIChjb21wb25lbnQuaGVpZ2h0ID09PSAnRklMTCcpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSAnJztcclxuXHRcdHRhcmdldC5zdHlsZS5mbGV4R3JvdyA9ICcxJztcclxuXHR9IGVsc2UgaWYgKGNvbXBvbmVudC5oZWlnaHQgPT09ICdIVUcnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuaGVpZ2h0ID0gJyc7XHJcblx0XHR0YXJnZXQuc3R5bGUuZmxleEdyb3cgPSAnMCc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSBjb21wb25lbnQuaGVpZ2h0ICsgJ3B4JztcclxuXHRcdHRhcmdldC5zdHlsZS5mbGV4R3JvdyA9ICcwJztcclxuXHR9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dFZlcnRpY2FsRml4ZWQoY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQud2lkdGggIT09ICdGSUxMJyAmJiBjb21wb25lbnQud2lkdGggIT09ICdIVUcnICYmICFpc05hTihjb21wb25lbnQud2lkdGgpKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSBjb21wb25lbnQud2lkdGggKyAncHgnO1xyXG5cdH0gZWxzZSB7XHJcblx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSAnJztcclxuXHR9XHJcblxyXG5cdGlmIChjb21wb25lbnQuaGVpZ2h0ICE9PSAnRklMTCcgJiYgY29tcG9uZW50LmhlaWdodCAhPT0gJ0hVRycgJiYgIWlzTmFOKGNvbXBvbmVudC5oZWlnaHQpKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuaGVpZ2h0ID0gY29tcG9uZW50LmhlaWdodCArICdweCc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSAnJztcclxuXHR9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXROb25lKGNvbXBvbmVudDogSUNvbXBvbmVudCwgdGFyZ2V0OiBFbGVtZW50Q1NTSW5saW5lU3R5bGUpIHtcclxuXHRpZiAoY29tcG9uZW50LndpZHRoICE9PSAnRklMTCcgJiYgY29tcG9uZW50LndpZHRoICE9PSAnSFVHJykge1xyXG5cdFx0aWYgKCFpc05hTihjb21wb25lbnQubGVmdCkgJiYgIWlzTmFOKGNvbXBvbmVudC5yaWdodCkpIHtcclxuXHRcdFx0dGFyZ2V0LnN0eWxlLndpZHRoID0gJyc7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSBjb21wb25lbnQud2lkdGggKyAncHgnO1xyXG5cdFx0fVxyXG5cdH0gZWxzZSB7XHJcblx0XHR0YXJnZXQuc3R5bGUud2lkdGggPSAnJztcclxuXHR9XHJcblxyXG5cdGlmIChjb21wb25lbnQuaGVpZ2h0ICE9PSAnRklMTCcgJiYgY29tcG9uZW50LmhlaWdodCAhPT0gJ0hVRycpIHtcclxuXHRcdGlmICghaXNOYU4oY29tcG9uZW50LnRvcCkgJiYgIWlzTmFOKGNvbXBvbmVudC5ib3R0b20pKSB7XHJcblx0XHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSAnJztcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRhcmdldC5zdHlsZS5oZWlnaHQgPSBjb21wb25lbnQuaGVpZ2h0ICsgJ3B4JztcclxuXHRcdH1cclxuXHR9IGVsc2Uge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmhlaWdodCA9ICcnO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldENvbnRyYWludHNXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwoY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQucG9zaXRpb24gPT09ICdTQ1JPTExfV0lUSF9QQVJFTlQnKSB7XHJcblx0XHRyZXNldENvbnRyYWludHModGFyZ2V0KTtcclxuXHR9IGVsc2Uge1xyXG5cdFx0YXBwbHlDb250cmFpbnRzKGNvbXBvbmVudCwgdGFyZ2V0KTtcclxuXHR9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbChjb21wb25lbnQ6IElDb21wb25lbnQsIHRhcmdldDogRWxlbWVudENTU0lubGluZVN0eWxlKSB7XHJcblx0aWYgKGNvbXBvbmVudC5wb3NpdGlvbiA9PT0gJ1NDUk9MTF9XSVRIX1BBUkVOVCcpIHtcclxuXHRcdHJlc2V0Q29udHJhaW50cyh0YXJnZXQpO1xyXG5cdH0gZWxzZSB7XHJcblx0XHRhcHBseUNvbnRyYWludHMoY29tcG9uZW50LCB0YXJnZXQpO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldENvbnRyYWludHNXaXRoUGFyZW50QXV0b0xheW91dEdyaWQoY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQucG9zaXRpb24gPT09ICdTQ1JPTExfV0lUSF9QQVJFTlQnKSB7XHJcblx0XHRyZXNldENvbnRyYWludHModGFyZ2V0KTtcclxuXHR9IGVsc2Uge1xyXG5cdFx0YXBwbHlDb250cmFpbnRzKGNvbXBvbmVudCwgdGFyZ2V0KTtcclxuXHR9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRQb3NpdGlvbldpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbChjb21wb25lbnQ6IElDb21wb25lbnQsIHRhcmdldDogRWxlbWVudENTU0lubGluZVN0eWxlKSB7XHJcblx0aWYgKGNvbXBvbmVudC5wb3NpdGlvbiA9PT0gJ1NDUk9MTF9XSVRIX1BBUkVOVCcpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XHJcblx0fSBlbHNlIGlmIChjb21wb25lbnQucG9zaXRpb24gPT09ICdTVElDS1knKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUucG9zaXRpb24gPSAnc3RpY2t5JztcclxuXHR9IGVsc2Uge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJztcclxuXHR9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRQb3NpdGlvbldpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwoY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQucG9zaXRpb24gPT09ICdTQ1JPTExfV0lUSF9QQVJFTlQnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xyXG5cdH0gZWxzZSBpZiAoY29tcG9uZW50LnBvc2l0aW9uID09PSAnU1RJQ0tZJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLnBvc2l0aW9uID0gJ3N0aWNreSc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCc7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dEdyaWQoY29tcG9uZW50OiBJQ29tcG9uZW50LCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb21wb25lbnQucG9zaXRpb24gPT09ICdTQ1JPTExfV0lUSF9QQVJFTlQnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xyXG5cdH0gZWxzZSBpZiAoY29tcG9uZW50LnBvc2l0aW9uID09PSAnU1RJQ0tZJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLnBvc2l0aW9uID0gJ3N0aWNreSc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5wb3NpdGlvbiA9ICdmaXhlZCc7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRDb250cmFpbnRzKHRhcmdldDogRWxlbWVudENTU0lubGluZVN0eWxlKSB7XHJcblx0dGFyZ2V0LnN0eWxlLmxlZnQgPSAnJztcclxuXHR0YXJnZXQuc3R5bGUudG9wID0gJyc7XHJcblx0dGFyZ2V0LnN0eWxlLnJpZ2h0ID0gJyc7XHJcblx0dGFyZ2V0LnN0eWxlLmJvdHRvbSA9ICcnO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlDb250cmFpbnRzKGNvbXBvbmVudDogSUNvbXBvbmVudCwgdGFyZ2V0OiBFbGVtZW50Q1NTSW5saW5lU3R5bGUpIHtcclxuXHRpZiAoaXNOYU4oY29tcG9uZW50LmxlZnQpKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUubGVmdCA9ICcnO1xyXG5cdH0gZWxzZSB7XHJcblx0XHR0YXJnZXQuc3R5bGUubGVmdCA9IGNvbXBvbmVudC5sZWZ0ICsgJ3B4JztcclxuXHR9XHJcblxyXG5cdGlmIChpc05hTihjb21wb25lbnQudG9wKSkge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLnRvcCA9ICcnO1xyXG5cdH0gZWxzZSB7XHJcblx0XHR0YXJnZXQuc3R5bGUudG9wID0gY29tcG9uZW50LnRvcCArICdweCc7XHJcblx0fVxyXG5cclxuXHRpZiAoaXNOYU4oY29tcG9uZW50LnJpZ2h0KSkge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLnJpZ2h0ID0gJyc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5yaWdodCA9IGNvbXBvbmVudC5yaWdodCArICdweCc7XHJcblx0fVxyXG5cclxuXHRpZiAoaXNOYU4oY29tcG9uZW50LmJvdHRvbSkpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5ib3R0b20gPSAnJztcclxuXHR9IGVsc2Uge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmJvdHRvbSA9IGNvbXBvbmVudC5ib3R0b20gKyAncHgnO1xyXG5cdH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGFsaWduQ2hpbGRyZW5Ib3Jpem9udGFsUGFja2VkKGNvbnRhaW5lcjogSUNvbnRhaW5lciwgdGFyZ2V0OiBFbGVtZW50Q1NTSW5saW5lU3R5bGUpIHtcclxuXHRpZiAoY29udGFpbmVyLmFsaWduID09PSAnVE9QX0xFRlQnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25JdGVtcyA9ICdmbGV4LXN0YXJ0JztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICcnO1xyXG5cdH0gZWxzZSBpZiAoY29udGFpbmVyLmFsaWduID09PSAnVE9QX0NFTlRFUicpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2ZsZXgtc3RhcnQnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2NlbnRlcic7XHJcblx0fSBlbHNlIGlmIChjb250YWluZXIuYWxpZ24gPT09ICdUT1BfUklHSFQnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25JdGVtcyA9ICdmbGV4LXN0YXJ0JztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdmbGV4LWVuZCc7XHJcblx0fSBlbHNlIGlmIChjb250YWluZXIuYWxpZ24gPT09ICdMRUZUJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICcnO1xyXG5cdH0gZWxzZSBpZiAoY29udGFpbmVyLmFsaWduID09PSAnQ0VOVEVSJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdjZW50ZXInO1xyXG5cdH0gZWxzZSBpZiAoY29udGFpbmVyLmFsaWduID09PSAnUklHSFQnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2ZsZXgtZW5kJztcclxuXHR9IGVsc2UgaWYgKGNvbnRhaW5lci5hbGlnbiA9PT0gJ0JPVFRPTV9MRUZUJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnZmxleC1lbmQnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJyc7XHJcblx0fSBlbHNlIGlmIChjb250YWluZXIuYWxpZ24gPT09ICdCT1RUT01fQ0VOVEVSJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnZmxleC1lbmQnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2NlbnRlcic7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2ZsZXgtZW5kJztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdmbGV4LWVuZCc7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYWxpZ25DaGlsZHJlblZlcnRpY2FsUGFja2VkKGNvbnRhaW5lcjogSUNvbnRhaW5lciwgdGFyZ2V0OiBFbGVtZW50Q1NTSW5saW5lU3R5bGUpIHtcclxuXHRpZiAoY29udGFpbmVyLmFsaWduID09PSAnVE9QX0xFRlQnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25JdGVtcyA9ICdmbGV4LXN0YXJ0JztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICcnO1xyXG5cdH0gZWxzZSBpZiAoY29udGFpbmVyLmFsaWduID09PSAnVE9QX0NFTlRFUicpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XHJcblx0XHR0YXJnZXQuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnJztcclxuXHR9IGVsc2UgaWYgKGNvbnRhaW5lci5hbGlnbiA9PT0gJ1RPUF9SSUdIVCcpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2ZsZXgtZW5kJztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICcnO1xyXG5cdH0gZWxzZSBpZiAoY29udGFpbmVyLmFsaWduID09PSAnTEVGVCcpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2ZsZXgtc3RhcnQnO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2NlbnRlcic7XHJcblx0fSBlbHNlIGlmIChjb250YWluZXIuYWxpZ24gPT09ICdDRU5URVInKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ2NlbnRlcic7XHJcblx0fSBlbHNlIGlmIChjb250YWluZXIuYWxpZ24gPT09ICdSSUdIVCcpIHtcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2ZsZXgtZW5kJztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdjZW50ZXInO1xyXG5cdH0gZWxzZSBpZiAoY29udGFpbmVyLmFsaWduID09PSAnQk9UVE9NX0xFRlQnKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25JdGVtcyA9ICdmbGV4LXN0YXJ0JztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdmbGV4LWVuZCc7XHJcblx0fSBlbHNlIGlmIChjb250YWluZXIuYWxpZ24gPT09ICdCT1RUT01fQ0VOVEVSJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdmbGV4LWVuZCc7XHJcblx0fSBlbHNlIHtcclxuXHRcdHRhcmdldC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2ZsZXgtZW5kJztcclxuXHRcdHRhcmdldC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdmbGV4LWVuZCc7XHJcblx0fVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYWxpZ25DaGlsZHJlbkhvcml6b250YWxTcGFjZUJldHdlZW4oY29udGFpbmVyOiBJQ29udGFpbmVyLCB0YXJnZXQ6IEVsZW1lbnRDU1NJbmxpbmVTdHlsZSkge1xyXG5cdGlmIChjb250YWluZXIuYWxpZ24gPT09ICdUT1BfTEVGVCcgfHwgY29udGFpbmVyLmFsaWduID09PSAnVE9QX0NFTlRFUicgfHwgY29udGFpbmVyLmFsaWduID09PSAnVE9QX1JJR0hUJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnZmxleC1zdGFydCc7XHJcblx0fSBlbHNlIGlmIChjb250YWluZXIuYWxpZ24gPT09ICdMRUZUJyB8fCBjb250YWluZXIuYWxpZ24gPT09ICdDRU5URVInIHx8IGNvbnRhaW5lci5hbGlnbiA9PT0gJ1JJR0hUJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcclxuXHR9IGVsc2Uge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnZmxleC1lbmQnO1xyXG5cdH1cclxuXHJcblx0dGFyZ2V0LnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJ3NwYWNlLWJldHdlZW4nO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYWxpZ25DaGlsZHJlblZlcnRpY2FsU3BhY2VCZXR3ZWVuKGNvbnRhaW5lcjogSUNvbnRhaW5lciwgdGFyZ2V0OiBFbGVtZW50Q1NTSW5saW5lU3R5bGUpIHtcclxuXHRpZiAoY29udGFpbmVyLmFsaWduID09PSAnVE9QX0xFRlQnIHx8IGNvbnRhaW5lci5hbGlnbiA9PT0gJ0xFRlQnIHx8IGNvbnRhaW5lci5hbGlnbiA9PT0gJ0JPVFRPTV9MRUZUJykge1xyXG5cdFx0dGFyZ2V0LnN0eWxlLmFsaWduSXRlbXMgPSAnZmxleC1zdGFydCc7XHJcblx0fSBlbHNlIGlmIChjb250YWluZXIuYWxpZ24gPT09ICdUT1BfQ0VOVEVSJyB8fCBjb250YWluZXIuYWxpZ24gPT09ICdDRU5URVInIHx8IGNvbnRhaW5lci5hbGlnbiA9PT0gJ0JPVFRPTV9DRU5URVInKSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25JdGVtcyA9ICdjZW50ZXInO1xyXG5cdH0gZWxzZSB7XHJcblx0XHR0YXJnZXQuc3R5bGUuYWxpZ25JdGVtcyA9ICdmbGV4LWVuZCc7XHJcblx0fVxyXG5cclxuXHR0YXJnZXQuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnc3BhY2UtYmV0d2Vlbic7XHJcbn1cclxuIiwiaW1wb3J0IEJhc2UgZnJvbSAnLi9CYXNlJztcclxuaW1wb3J0IElDb21wb25lbnQgZnJvbSAnLi9JQ29tcG9uZW50JztcclxuaW1wb3J0IHthcHBseUNvbnRyYWludHMsIHJlc2V0Q29udHJhaW50cywgc2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbCwgc2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0Tm9uZSwgc2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWx9IGZyb20gJy4vaGVscGVycyc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBhYnN0cmFjdCBjbGFzcyBDb21wb25lbnQgZXh0ZW5kcyBCYXNlIGltcGxlbWVudHMgSUNvbXBvbmVudCB7XHJcblx0cHVibGljIGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0c3VwZXIoKTtcclxuXHRcdHRoaXMuc3R5bGUuYm94U2l6aW5nID0gJ2JvcmRlci1ib3gnO1xyXG5cdFx0dGhpcy5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XHJcblx0XHR0aGlzLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcclxuXHRcdHRoaXMuc3R5bGUuZmxleCA9ICdub25lJztcclxuXHRcdHRoaXMuc3R5bGUuZmxleEdyb3cgPSAnMCc7XHJcblx0XHR0aGlzLnN0eWxlLmJvcmRlciA9ICdub25lJztcclxuXHRcdHRoaXMuc3R5bGUub3V0bGluZSA9ICdub25lJztcclxuXHRcdHRoaXMuc3R5bGUubWluV2lkdGggPSAnMCc7XHJcblx0XHR0aGlzLnN0eWxlLm1pbkhlaWdodCA9ICcwJztcclxuXHR9XHJcblxyXG5cdHByb3RlY3RlZCBzaXplQ2hhbmdlZCgpIHtcclxuXHRcdHN1cGVyLnNpemVDaGFuZ2VkKCk7XHJcblx0XHRpZiAodGhpcy5wYXJlbnQuYXV0b0xheW91dCA9PT0gJ0hPUklaT05UQUwnKSB7XHJcblx0XHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwodGhpcywgdGhpcyk7XHJcblx0XHR9IGVsc2UgaWYgKHRoaXMucGFyZW50LmF1dG9MYXlvdXQgPT09ICdWRVJUSUNBTCcpIHtcclxuXHRcdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwodGhpcywgdGhpcyk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXROb25lKHRoaXMsIHRoaXMpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJvdGVjdGVkIHBvc2l0aW9uQ2hhbmdlZCgpIHtcclxuXHRcdHN1cGVyLnBvc2l0aW9uQ2hhbmdlZCgpO1xyXG5cdFx0aWYgKHRoaXMucG9zaXRpb24gPT09ICdTQ1JPTExfV0lUSF9QQVJFTlQnKSB7XHJcblx0XHRcdGlmICh0aGlzLnBhcmVudC5hdXRvTGF5b3V0ID09PSAnTk9ORScpIHtcclxuXHRcdFx0XHR0aGlzLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIGlmICh0aGlzLnBvc2l0aW9uID09PSAnRklYRUQnKSB7XHJcblx0XHRcdHRoaXMuc3R5bGUucG9zaXRpb24gPSAnZml4ZWQnO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5zdHlsZS5wb3NpdGlvbiA9ICdzdGlja3knO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJvdGVjdGVkIGNvbnRyYWludHNDaGFuZ2VkKCkge1xyXG5cdFx0c3VwZXIuY29udHJhaW50c0NoYW5nZWQoKTtcclxuXHRcdGlmICh0aGlzLnBhcmVudC5hdXRvTGF5b3V0ID09PSAnTk9ORScgfHwgdGhpcy5wb3NpdGlvbiA9PT0gJ0ZJWEVEJyB8fCB0aGlzLnBvc2l0aW9uID09PSAnU1RJQ0tZJykge1xyXG5cdFx0XHRhcHBseUNvbnRyYWludHModGhpcywgdGhpcyk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRyZXNldENvbnRyYWludHModGhpcyk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9jdXJzb3I6ICdkZWZhdWx0JyB8ICdwb2ludGVyJyA9ICdkZWZhdWx0JztcclxuXHJcblx0cHVibGljIGdldCBjdXJzb3IoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBjdXJzb3IodmFsdWU6ICdkZWZhdWx0JyB8ICdwb2ludGVyJykge1xyXG5cdFx0dGhpcy5fY3Vyc29yID0gdmFsdWU7XHJcblx0XHR0aGlzLnN0eWxlLmN1cnNvciA9IHZhbHVlO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfb3BhY2l0eSA9IDE7XHJcblxyXG5cdHB1YmxpYyBnZXQgb3BhY2l0eSgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9vcGFjaXR5O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBvcGFjaXR5KHZhbHVlOiBudW1iZXIpIHtcclxuXHRcdGlmIChOdW1iZXIuaXNOYU4odmFsdWUpKSB7XHJcblx0XHRcdHRoaXMuX29wYWNpdHkgPSAxO1xyXG5cdFx0XHR0aGlzLnN0eWxlLm9wYWNpdHkgPSAnJztcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICh2YWx1ZSA8IDApIHtcclxuXHRcdFx0dGhpcy5fb3BhY2l0eSA9IDA7XHJcblx0XHRcdHRoaXMuc3R5bGUub3BhY2l0eSA9ICcwJztcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICh2YWx1ZSA+IDEpIHtcclxuXHRcdFx0dGhpcy5fb3BhY2l0eSA9IDE7XHJcblx0XHRcdHRoaXMuc3R5bGUub3BhY2l0eSA9ICcnO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fb3BhY2l0eSA9IHZhbHVlO1xyXG5cdFx0dGhpcy5zdHlsZS5vcGFjaXR5ID0gdmFsdWUudG9TdHJpbmcoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2Nvcm5lclJhZGl1cyA9IDA7XHJcblxyXG5cdHB1YmxpYyBnZXQgY29ybmVyUmFkaXVzKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2Nvcm5lclJhZGl1cztcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgY29ybmVyUmFkaXVzKHZhbHVlOiBudW1iZXIpIHtcclxuXHRcdGlmIChOdW1iZXIuaXNOYU4odmFsdWUpIHx8IHZhbHVlIDwgMCkge1xyXG5cdFx0XHR0aGlzLl9jb3JuZXJSYWRpdXMgPSAwO1xyXG5cdFx0XHR0aGlzLnN0eWxlLmJvcmRlclJhZGl1cyA9ICcnO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fY29ybmVyUmFkaXVzID0gdmFsdWU7XHJcblx0XHR0aGlzLnN0eWxlLmJvcmRlclJhZGl1cyA9IHZhbHVlICsgJ3B4JztcclxuXHR9XHJcblxyXG5cdHByb3RlY3RlZCBfZmlsbCA9ICcnO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGZpbGwoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fZmlsbDtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgZmlsbCh2YWx1ZTogc3RyaW5nKSB7XHJcblx0XHR0aGlzLl9maWxsID0gdmFsdWU7XHJcblx0XHR0aGlzLnN0eWxlLmJhY2tncm91bmQgPSB2YWx1ZTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2NsaXBDb250ZW50ID0gZmFsc2U7XHJcblxyXG5cdHB1YmxpYyBnZXQgY2xpcENvbnRlbnQoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY2xpcENvbnRlbnQ7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGNsaXBDb250ZW50KHZhbHVlOiBib29sZWFuKSB7XHJcblx0XHR0aGlzLl9jbGlwQ29udGVudCA9IHZhbHVlO1xyXG5cdFx0aWYgKHZhbHVlKSB7XHJcblx0XHRcdHRoaXMuc3R5bGUub3ZlcmZsb3cgPSAnYXV0byc7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLnN0eWxlLm92ZXJmbG93ID0gJyc7XHJcblx0XHR9XHJcblx0fVxyXG59XHJcbiIsImltcG9ydCBCYXNlIGZyb20gJy4vQmFzZSc7XHJcbmltcG9ydCBJQ29tcG9uZW50IGZyb20gJy4vSUNvbXBvbmVudCc7XHJcbmltcG9ydCBJQ29udGFpbmVyIGZyb20gJy4vSUNvbnRhaW5lcic7XHJcbmltcG9ydCBJTGluayBmcm9tICcuL0lMaW5rJztcclxuaW1wb3J0IHtcclxuXHRhbGlnbkNoaWxkcmVuSG9yaXpvbnRhbFBhY2tlZCxcclxuXHRhbGlnbkNoaWxkcmVuSG9yaXpvbnRhbFNwYWNlQmV0d2VlbixcclxuXHRhbGlnbkNoaWxkcmVuVmVydGljYWxQYWNrZWQsXHJcblx0YWxpZ25DaGlsZHJlblZlcnRpY2FsU3BhY2VCZXR3ZWVuLFxyXG5cdGFwcGx5Q29udHJhaW50cyxcclxuXHRhcHBseVBhZGRpbmcsXHJcblx0cmVzZXRDb250cmFpbnRzLFxyXG5cdHJlc2V0UGFkZGluZyxcclxuXHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkLFxyXG5cdHNldENvbnRyYWludHNXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwsXHJcblx0c2V0Q29udHJhaW50c1dpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwsXHJcblx0c2V0RGlzcGxheUF1dG9MYXlvdXRHcmlkLFxyXG5cdHNldERpc3BsYXlBdXRvbGF5b3V0SG9yaXpvbnRhbE9yVmVydGljYWwsXHJcblx0c2V0RGlzcGxheUF1dG9sYXlvdXROb25lLFxyXG5cdHNldFBvc2l0aW9uV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkLFxyXG5cdHNldFBvc2l0aW9uV2l0aFBhcmVudEF1dG9MYXlvdXRIb3Jpem9udGFsLFxyXG5cdHNldFBvc2l0aW9uV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbCxcclxuXHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkLFxyXG5cdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwsXHJcblx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0Tm9uZSxcclxuXHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbCxcclxufSBmcm9tICcuL2hlbHBlcnMnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgYWJzdHJhY3QgY2xhc3MgTGluayBleHRlbmRzIEJhc2UgaW1wbGVtZW50cyBJTGluayB7XHJcblx0cHVibGljIGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0c3VwZXIoKTtcclxuXHRcdHRoaXMuc3R5bGUuZGlzcGxheSA9ICdjb250ZW50cyc7XHJcblx0XHR0aGlzLmFwcGVuZENoaWxkKHRoaXMuYW5jaG9yKTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBhZGRDb21wb25lbnQoY29tcG9uZW50OiBJQ29tcG9uZW50KSB7XHJcblx0XHR0aGlzLmFuY2hvci5hcHBlbmRDaGlsZChjb21wb25lbnQgYXMgdW5rbm93biBhcyBOb2RlKTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBhZGRDb21wb25lbnRzKGNvbXBvbmVudHM6IElDb21wb25lbnRbXSkge1xyXG5cdFx0Y29uc3QgZnJhZzogRG9jdW1lbnRGcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcclxuXHRcdGNvbXBvbmVudHMuZm9yRWFjaChjb21wb25lbnQgPT4gZnJhZy5hcHBlbmRDaGlsZChjb21wb25lbnQgYXMgdW5rbm93biBhcyBOb2RlKSk7XHJcblx0XHR0aGlzLmFuY2hvci5hcHBlbmRDaGlsZChmcmFnKTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyByZW1vdmVDb21wb25lbnQoY29tcG9uZW50OiBJQ29tcG9uZW50KSB7XHJcblx0XHRpZiAodGhpcy5jb250YWluc0NvbXBvbmVudChjb21wb25lbnQpKSB7XHJcblx0XHRcdHRoaXMuYW5jaG9yLnJlbW92ZUNoaWxkKGNvbXBvbmVudCBhcyB1bmtub3duIGFzIE5vZGUpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHVibGljIGNvbnRhaW5zQ29tcG9uZW50KGNvbXBvbmVudDogSUNvbXBvbmVudCk6IGJvb2xlYW4ge1xyXG5cdFx0cmV0dXJuIHRoaXMuYW5jaG9yLmNvbnRhaW5zKGNvbXBvbmVudCBhcyB1bmtub3duIGFzIE5vZGUpO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHJlbW92ZUFsbENvbXBvbmVudHMoKSB7XHJcblx0XHR3aGlsZSAodGhpcy5hbmNob3IuZmlyc3RDaGlsZCkge1xyXG5cdFx0XHR0aGlzLnJlbW92ZUNoaWxkKHRoaXMuYW5jaG9yLmZpcnN0Q2hpbGQpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJvdGVjdGVkIGNvbW1pdFByb3BlcnRpZXMoKTogdm9pZCB7XHJcblx0XHRzdXBlci5jb21taXRQcm9wZXJ0aWVzKCk7XHJcblx0XHRpZiAodGhpcy5fYXV0b0xheW91dENoYW5nZWQgfHwgdGhpcy5fdmlzaWJsZUNoYW5nZWQpIHtcclxuXHRcdFx0dGhpcy5hdXRvTGF5b3V0Q2hhbmdlZCgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICh0aGlzLl9hbGlnbkNoYW5nZWQgfHwgdGhpcy5fc3BhY2luZ01vZGVDaGFuZ2VkKSB7XHJcblx0XHRcdHRoaXMuYWxpZ25PclNwYWNpbmdNb2RlQ2hhbmdlZCgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhdXRvTGF5b3V0Q2hhbmdlZCgpIHtcclxuXHRcdHRoaXMuX2F1dG9MYXlvdXRDaGFuZ2VkID0gZmFsc2U7XHJcblx0XHR0aGlzLl92aXNpYmxlQ2hhbmdlZCA9IGZhbHNlO1xyXG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xyXG5cdFx0XHR0aGlzLmFwcGx5QXV0b0xheW91dCgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5hcHBseVZpc2libGVGYWxzZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhbGlnbk9yU3BhY2luZ01vZGVDaGFuZ2VkKCkge1xyXG5cdFx0dGhpcy5fYWxpZ25DaGFuZ2VkID0gZmFsc2U7XHJcblx0XHR0aGlzLl9zcGFjaW5nTW9kZUNoYW5nZWQgPSBmYWxzZTtcclxuXHRcdGlmICh0aGlzLmF1dG9MYXlvdXQgPT09ICdIT1JJWk9OVEFMJykge1xyXG5cdFx0XHR0aGlzLmFsaWduSG9yaXpvbnRhbCgpO1xyXG5cdFx0fSBlbHNlIGlmICh0aGlzLmF1dG9MYXlvdXQgPT09ICdWRVJUSUNBTCcpIHtcclxuXHRcdFx0dGhpcy5hbGlnblZlcnRpY2FsKCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLmFsaWduTm9uZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhcHBseUF1dG9MYXlvdXQoKSB7XHJcblx0XHRpZiAodGhpcy5hdXRvTGF5b3V0ID09PSAnSE9SSVpPTlRBTCcpIHtcclxuXHRcdFx0dGhpcy51cGRhdGVBdXRvTGF5b3V0SG9yaXpvbnRhbCgpO1xyXG5cdFx0fSBlbHNlIGlmICh0aGlzLmF1dG9MYXlvdXQgPT09ICdWRVJUSUNBTCcpIHtcclxuXHRcdFx0dGhpcy51cGRhdGVBdXRvTGF5b3V0VmVydGljYWwoKTtcclxuXHRcdH0gZWxzZSBpZiAodGhpcy5hdXRvTGF5b3V0ID09PSAnR1JJRCcpIHtcclxuXHRcdFx0dGhpcy51cGRhdGVBdXRvTGF5b3V0R3JpZCgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy51cGRhdGVBdXRvTGF5b3V0Tm9uZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSB1cGRhdGVBdXRvTGF5b3V0SG9yaXpvbnRhbCgpIHtcclxuXHRcdHNldERpc3BsYXlBdXRvbGF5b3V0SG9yaXpvbnRhbE9yVmVydGljYWwodGhpcy5hbmNob3IsIHRoaXMucGFyZW50KTtcclxuXHRcdGFwcGx5UGFkZGluZyh0aGlzLCB0aGlzLmFuY2hvcik7XHJcblx0XHR0aGlzLmFuY2hvci5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ3Jvdyc7XHJcblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuSG9yaXpvbnRhbCgpO1xyXG5cdFx0dGhpcy5hbGlnbkhvcml6b250YWwoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgdXBkYXRlQXV0b0xheW91dFZlcnRpY2FsKCkge1xyXG5cdFx0c2V0RGlzcGxheUF1dG9sYXlvdXRIb3Jpem9udGFsT3JWZXJ0aWNhbCh0aGlzLmFuY2hvciwgdGhpcy5wYXJlbnQpO1xyXG5cdFx0YXBwbHlQYWRkaW5nKHRoaXMsIHRoaXMuYW5jaG9yKTtcclxuXHRcdHRoaXMuYW5jaG9yLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcclxuXHRcdHRoaXMudXBkYXRlQ2hpbGRyZW5WZXJ0aWNhbCgpO1xyXG5cdFx0dGhpcy5hbGlnblZlcnRpY2FsKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHVwZGF0ZUF1dG9MYXlvdXRHcmlkKCkge1xyXG5cdFx0c2V0RGlzcGxheUF1dG9MYXlvdXRHcmlkKHRoaXMuYW5jaG9yLCB0aGlzLnBhcmVudCk7XHJcblx0XHRhcHBseVBhZGRpbmcodGhpcywgdGhpcy5hbmNob3IpO1xyXG5cdFx0dGhpcy5hbmNob3Iuc3R5bGUuZmxleERpcmVjdGlvbiA9ICcnO1xyXG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlbkdyaWQoKTtcclxuXHRcdHRoaXMuYWxpZ25HcmlkKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHVwZGF0ZUF1dG9MYXlvdXROb25lKCkge1xyXG5cdFx0c2V0RGlzcGxheUF1dG9sYXlvdXROb25lKHRoaXMuYW5jaG9yLCB0aGlzLnBhcmVudCk7XHJcblx0XHRyZXNldFBhZGRpbmcodGhpcy5hbmNob3IpO1xyXG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlbk5vbmUoKTtcclxuXHRcdHRoaXMuYWxpZ25Ob25lKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGFsaWduSG9yaXpvbnRhbCgpIHtcclxuXHRcdGlmICh0aGlzLnNwYWNpbmdNb2RlID09PSAnUEFDS0VEJykge1xyXG5cdFx0XHRhbGlnbkNoaWxkcmVuSG9yaXpvbnRhbFBhY2tlZCh0aGlzLCB0aGlzLmFuY2hvcik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRhbGlnbkNoaWxkcmVuSG9yaXpvbnRhbFNwYWNlQmV0d2Vlbih0aGlzLCB0aGlzLmFuY2hvcik7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGFsaWduVmVydGljYWwoKSB7XHJcblx0XHRpZiAodGhpcy5zcGFjaW5nTW9kZSA9PT0gJ1BBQ0tFRCcpIHtcclxuXHRcdFx0YWxpZ25DaGlsZHJlblZlcnRpY2FsUGFja2VkKHRoaXMsIHRoaXMuYW5jaG9yKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGFsaWduQ2hpbGRyZW5WZXJ0aWNhbFNwYWNlQmV0d2Vlbih0aGlzLCB0aGlzLmFuY2hvcik7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGFsaWduR3JpZCgpIHtcclxuXHRcdHRoaXMuYW5jaG9yLnN0eWxlLmFsaWduSXRlbXMgPSAnc3RhcnQnO1xyXG5cdFx0dGhpcy5hbmNob3Iuc3R5bGUuYWxpZ25Db250ZW50ID0gJ3N0YXJ0JztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgYWxpZ25Ob25lKCkge1xyXG5cdFx0dGhpcy5hbmNob3Iuc3R5bGUuYWxpZ25JdGVtcyA9ICcnO1xyXG5cdFx0dGhpcy5hbmNob3Iuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnJztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgdXBkYXRlQ2hpbGRyZW5Ib3Jpem9udGFsKCkge1xyXG5cdFx0bGV0IGNoaWxkOiBJQ29tcG9uZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlO1xyXG5cdFx0dGhpcy5hbmNob3IuY2hpbGROb2Rlcy5mb3JFYWNoKG5vZGUgPT4ge1xyXG5cdFx0XHRjaGlsZCA9IG5vZGUgYXMgdW5rbm93biBhcyBJQ29tcG9uZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlO1xyXG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBMaW5rKSB7XHJcblx0XHRcdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbChjaGlsZCwgY2hpbGQuYW5jaG9yKTtcclxuXHRcdFx0XHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRIb3Jpem9udGFsKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHRcdHNldFBvc2l0aW9uV2l0aFBhcmVudEF1dG9MYXlvdXRIb3Jpem9udGFsKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0XHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRIb3Jpem9udGFsKGNoaWxkLCBjaGlsZCk7XHJcblx0XHRcdFx0c2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHVwZGF0ZUNoaWxkcmVuVmVydGljYWwoKSB7XHJcblx0XHRsZXQgY2hpbGQ6IElDb21wb25lbnQgJiBFbGVtZW50Q1NTSW5saW5lU3R5bGU7XHJcblx0XHR0aGlzLmFuY2hvci5jaGlsZE5vZGVzLmZvckVhY2gobm9kZSA9PiB7XHJcblx0XHRcdGNoaWxkID0gbm9kZSBhcyB1bmtub3duIGFzIElDb21wb25lbnQgJiBFbGVtZW50Q1NTSW5saW5lU3R5bGU7XHJcblx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIExpbmspIHtcclxuXHRcdFx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbChjaGlsZCwgY2hpbGQuYW5jaG9yKTtcclxuXHRcdFx0XHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbChjaGlsZCwgY2hpbGQuYW5jaG9yKTtcclxuXHRcdFx0XHRzZXRQb3NpdGlvbldpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwoY2hpbGQsIGNoaWxkLmFuY2hvcik7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0XHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbChjaGlsZCwgY2hpbGQpO1xyXG5cdFx0XHRcdHNldFBvc2l0aW9uV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbChjaGlsZCwgY2hpbGQpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgdXBkYXRlQ2hpbGRyZW5HcmlkKCkge1xyXG5cdFx0bGV0IGNoaWxkOiBJQ29tcG9uZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlO1xyXG5cdFx0dGhpcy5hbmNob3IuY2hpbGROb2Rlcy5mb3JFYWNoKG5vZGUgPT4ge1xyXG5cdFx0XHRjaGlsZCA9IG5vZGUgYXMgdW5rbm93biBhcyBJQ29tcG9uZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlO1xyXG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBMaW5rKSB7XHJcblx0XHRcdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0R3JpZChjaGlsZCwgY2hpbGQuYW5jaG9yKTtcclxuXHRcdFx0XHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHRcdHNldFBvc2l0aW9uV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEdyaWQoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0XHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkKGNoaWxkLCBjaGlsZCk7XHJcblx0XHRcdFx0c2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dEdyaWQoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHVwZGF0ZUNoaWxkcmVuTm9uZSgpIHtcclxuXHRcdGxldCBjaGlsZDogSUNvbXBvbmVudCAmIEVsZW1lbnRDU1NJbmxpbmVTdHlsZTtcclxuXHRcdHRoaXMuYW5jaG9yLmNoaWxkTm9kZXMuZm9yRWFjaChub2RlID0+IHtcclxuXHRcdFx0Y2hpbGQgPSBub2RlIGFzIHVua25vd24gYXMgSUNvbXBvbmVudCAmIEVsZW1lbnRDU1NJbmxpbmVTdHlsZTtcclxuXHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgTGluaykge1xyXG5cdFx0XHRcdGlmIChjaGlsZC5wb3NpdGlvbiA9PT0gJ1NDUk9MTF9XSVRIX1BBUkVOVCcpIHtcclxuXHRcdFx0XHRcdGNoaWxkLmFuY2hvci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXROb25lKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHRcdGFwcGx5Q29udHJhaW50cyhjaGlsZCwgY2hpbGQuYW5jaG9yKTtcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHRpZiAoY2hpbGQucG9zaXRpb24gPT09ICdTQ1JPTExfV0lUSF9QQVJFTlQnKSB7XHJcblx0XHRcdFx0XHRjaGlsZC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXROb25lKGNoaWxkLCBjaGlsZCk7XHJcblx0XHRcdFx0YXBwbHlDb250cmFpbnRzKGNoaWxkLCBjaGlsZCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhcHBseVZpc2libGVGYWxzZSgpIHtcclxuXHRcdHRoaXMuYW5jaG9yLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcblx0fVxyXG5cclxuXHRwcm90ZWN0ZWQgc2l6ZUNoYW5nZWQoKSB7XHJcblx0XHRzdXBlci5zaXplQ2hhbmdlZCgpO1xyXG5cdFx0aWYgKHRoaXMucGFyZW50LmF1dG9MYXlvdXQgPT09ICdIT1JJWk9OVEFMJykge1xyXG5cdFx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRIb3Jpem9udGFsKHRoaXMsIHRoaXMuYW5jaG9yKTtcclxuXHRcdH0gZWxzZSBpZiAodGhpcy5wYXJlbnQuYXV0b0xheW91dCA9PT0gJ1ZFUlRJQ0FMJykge1xyXG5cdFx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbCh0aGlzLCB0aGlzLmFuY2hvcik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXROb25lKHRoaXMsIHRoaXMuYW5jaG9yKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByb3RlY3RlZCBwb3NpdGlvbkNoYW5nZWQoKSB7XHJcblx0XHRzdXBlci5wb3NpdGlvbkNoYW5nZWQoKTtcclxuXHRcdGlmICh0aGlzLnBvc2l0aW9uID09PSAnU0NST0xMX1dJVEhfUEFSRU5UJykge1xyXG5cdFx0XHRpZiAodGhpcy5wYXJlbnQuYXV0b0xheW91dCA9PT0gJ05PTkUnKSB7XHJcblx0XHRcdFx0dGhpcy5hbmNob3Iuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHRoaXMuYW5jaG9yLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcclxuXHRcdFx0fVxyXG5cdFx0fSBlbHNlIGlmICh0aGlzLnBvc2l0aW9uID09PSAnRklYRUQnKSB7XHJcblx0XHRcdHRoaXMuYW5jaG9yLnN0eWxlLnBvc2l0aW9uID0gJ2ZpeGVkJztcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuYW5jaG9yLnN0eWxlLnBvc2l0aW9uID0gJ3N0aWNreSc7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHRwcm90ZWN0ZWQgY29udHJhaW50c0NoYW5nZWQoKSB7XHJcblx0XHRzdXBlci5jb250cmFpbnRzQ2hhbmdlZCgpO1xyXG5cdFx0aWYgKHRoaXMucGFyZW50LmF1dG9MYXlvdXQgPT09ICdOT05FJyB8fCB0aGlzLnBvc2l0aW9uID09PSAnRklYRUQnIHx8IHRoaXMucG9zaXRpb24gPT09ICdTVElDS1knKSB7XHJcblx0XHRcdGFwcGx5Q29udHJhaW50cyh0aGlzLCB0aGlzLmFuY2hvcik7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHRyZXNldENvbnRyYWludHModGhpcy5hbmNob3IpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfYW5jaG9yITogSFRNTEFuY2hvckVsZW1lbnQ7XHJcblxyXG5cdHB1YmxpYyBnZXQgYW5jaG9yKCk6IEhUTUxBbmNob3JFbGVtZW50IHtcclxuXHRcdGlmICghdGhpcy5fYW5jaG9yKSB7XHJcblx0XHRcdHRoaXMuX2FuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcclxuXHRcdFx0dGhpcy5fYW5jaG9yLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcclxuXHRcdFx0dGhpcy5fYW5jaG9yLnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94JztcclxuXHRcdFx0dGhpcy5fYW5jaG9yLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcclxuXHRcdFx0dGhpcy5fYW5jaG9yLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWJsb2NrJztcclxuXHRcdFx0dGhpcy5fYW5jaG9yLnN0eWxlLmZsZXggPSAnbm9uZSc7XHJcblx0XHRcdHRoaXMuX2FuY2hvci5zdHlsZS5mbGV4R3JvdyA9ICcwJztcclxuXHRcdFx0dGhpcy5fYW5jaG9yLnN0eWxlLmJvcmRlciA9ICdub25lJztcclxuXHRcdFx0dGhpcy5fYW5jaG9yLnN0eWxlLm91dGxpbmUgPSAnbm9uZSc7XHJcblx0XHRcdHRoaXMuX2FuY2hvci5zdHlsZS5taW5XaWR0aCA9ICcwcHgnO1xyXG5cdFx0XHR0aGlzLl9hbmNob3Iuc3R5bGUubWluSGVpZ2h0ID0gJzBweCc7XHJcblx0XHRcdHRoaXMuX2FuY2hvci5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICdub25lJztcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fYW5jaG9yO1xyXG5cdH1cclxuXHJcblx0cHVibGljIGdldCBocmVmKCk6IHN0cmluZyB7XHJcblx0XHRyZXR1cm4gdGhpcy5hbmNob3IuaHJlZjtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgaHJlZih2YWx1ZTogc3RyaW5nKSB7XHJcblx0XHR0aGlzLmFuY2hvci5ocmVmID0gdmFsdWU7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF90YXJnZXQ6ICdfc2VsZicgfCAnX2JsYW5rJyB8ICdfcGFyZW50JyB8ICdfdG9wJyA9ICdfc2VsZic7XHJcblxyXG5cdHB1YmxpYyBnZXQgdGFyZ2V0KCk6ICdfc2VsZicgfCAnX2JsYW5rJyB8ICdfcGFyZW50JyB8ICdfdG9wJyB7XHJcblx0XHRyZXR1cm4gdGhpcy5fdGFyZ2V0O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCB0YXJnZXQodmFsdWU6ICdfc2VsZicgfCAnX2JsYW5rJyB8ICdfcGFyZW50JyB8ICdfdG9wJykge1xyXG5cdFx0dGhpcy5fdGFyZ2V0ID0gdmFsdWU7XHJcblx0XHR0aGlzLmFuY2hvci50YXJnZXQgPSB2YWx1ZTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2F1dG9MYXlvdXQ6ICdIT1JJWk9OVEFMJyB8ICdWRVJUSUNBTCcgfCAnTk9ORScgfCAnR1JJRCcgPSAnSE9SSVpPTlRBTCc7XHJcblxyXG5cdHByaXZhdGUgX2F1dG9MYXlvdXRDaGFuZ2VkID0gdHJ1ZTtcclxuXHJcblx0cHVibGljIGdldCBhdXRvTGF5b3V0KCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2F1dG9MYXlvdXQ7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGF1dG9MYXlvdXQodmFsdWU6ICdIT1JJWk9OVEFMJyB8ICdWRVJUSUNBTCcgfCAnTk9ORScgfCAnR1JJRCcpIHtcclxuXHRcdGlmICh0aGlzLl9hdXRvTGF5b3V0ID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fYXV0b0xheW91dCA9IHZhbHVlO1xyXG5cdFx0dGhpcy5fYXV0b0xheW91dENoYW5nZWQgPSB0cnVlO1xyXG5cdFx0dGhpcy5pbnZhbGlkYXRlUHJvcGVydGllcygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfdmlzaWJsZSA9IHRydWU7XHJcblxyXG5cdHByaXZhdGUgX3Zpc2libGVDaGFuZ2VkID0gZmFsc2U7XHJcblxyXG5cdHB1YmxpYyBnZXQgdmlzaWJsZSgpIHtcclxuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCB2aXNpYmxlKHZhbHVlOiBib29sZWFuKSB7XHJcblx0XHRpZiAodGhpcy5fdmlzaWJsZSA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3Zpc2libGUgPSB2YWx1ZTtcclxuXHRcdHRoaXMuX3Zpc2libGVDaGFuZ2VkID0gdHJ1ZTtcclxuXHRcdHRoaXMuaW52YWxpZGF0ZVByb3BlcnRpZXMoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2N1cnNvcjogJ2RlZmF1bHQnIHwgJ3BvaW50ZXInID0gJ2RlZmF1bHQnO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGN1cnNvcigpIHtcclxuXHRcdHJldHVybiB0aGlzLl9jdXJzb3I7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGN1cnNvcih2YWx1ZTogJ2RlZmF1bHQnIHwgJ3BvaW50ZXInKSB7XHJcblx0XHR0aGlzLl9jdXJzb3IgPSB2YWx1ZTtcclxuXHRcdHRoaXMuYW5jaG9yLnN0eWxlLmN1cnNvciA9IHZhbHVlO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfb3BhY2l0eSA9IDE7XHJcblxyXG5cdHB1YmxpYyBnZXQgb3BhY2l0eSgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9vcGFjaXR5O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBvcGFjaXR5KHZhbHVlOiBudW1iZXIpIHtcclxuXHRcdGlmIChOdW1iZXIuaXNOYU4odmFsdWUpKSB7XHJcblx0XHRcdHRoaXMuX29wYWNpdHkgPSAxO1xyXG5cdFx0XHR0aGlzLmFuY2hvci5zdHlsZS5vcGFjaXR5ID0gJyc7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAodmFsdWUgPCAwKSB7XHJcblx0XHRcdHRoaXMuX29wYWNpdHkgPSAwO1xyXG5cdFx0XHR0aGlzLmFuY2hvci5zdHlsZS5vcGFjaXR5ID0gJzAnO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKHZhbHVlID4gMSkge1xyXG5cdFx0XHR0aGlzLl9vcGFjaXR5ID0gMTtcclxuXHRcdFx0dGhpcy5hbmNob3Iuc3R5bGUub3BhY2l0eSA9ICcnO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fb3BhY2l0eSA9IHZhbHVlO1xyXG5cdFx0dGhpcy5hbmNob3Iuc3R5bGUub3BhY2l0eSA9IHZhbHVlLnRvU3RyaW5nKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9jb3JuZXJSYWRpdXMgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGNvcm5lclJhZGl1cygpIHtcclxuXHRcdHJldHVybiB0aGlzLl9jb3JuZXJSYWRpdXM7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGNvcm5lclJhZGl1cyh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA8IDApIHtcclxuXHRcdFx0dGhpcy5fY29ybmVyUmFkaXVzID0gMDtcclxuXHRcdFx0dGhpcy5hbmNob3Iuc3R5bGUuYm9yZGVyUmFkaXVzID0gJyc7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9jb3JuZXJSYWRpdXMgPSB2YWx1ZTtcclxuXHRcdHRoaXMuYW5jaG9yLnN0eWxlLmJvcmRlclJhZGl1cyA9IHZhbHVlICsgJ3B4JztcclxuXHR9XHJcblxyXG5cdHByb3RlY3RlZCBnZXQgcGFyZW50KCkge1xyXG5cdFx0aWYgKHRoaXMucGFyZW50Tm9kZSBpbnN0YW5jZW9mIEhUTUxBbmNob3JFbGVtZW50KSB7XHJcblx0XHRcdHJldHVybiB0aGlzLnBhcmVudE5vZGUucGFyZW50Tm9kZSBhcyB1bmtub3duIGFzIElDb250YWluZXI7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMucGFyZW50Tm9kZSBhcyB1bmtub3duIGFzIElDb250YWluZXI7XHJcblx0fVxyXG5cclxuXHRwcm90ZWN0ZWQgX2ZpbGwgPSAnJztcclxuXHJcblx0cHVibGljIGdldCBmaWxsKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGw7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGZpbGwodmFsdWU6IHN0cmluZykge1xyXG5cdFx0dGhpcy5fZmlsbCA9IHZhbHVlO1xyXG5cdFx0dGhpcy5hbmNob3Iuc3R5bGUuYmFja2dyb3VuZCA9IHZhbHVlO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfY2xpcENvbnRlbnQgPSBmYWxzZTtcclxuXHJcblx0cHVibGljIGdldCBjbGlwQ29udGVudCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9jbGlwQ29udGVudDtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgY2xpcENvbnRlbnQodmFsdWU6IGJvb2xlYW4pIHtcclxuXHRcdHRoaXMuX2NsaXBDb250ZW50ID0gdmFsdWU7XHJcblx0XHRpZiAodmFsdWUpIHtcclxuXHRcdFx0dGhpcy5hbmNob3Iuc3R5bGUub3ZlcmZsb3cgPSAnYXV0byc7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLmFuY2hvci5zdHlsZS5vdmVyZmxvdyA9ICcnO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfbWluR3JpZENvbHVtbldpZHRoID0gTmFOO1xyXG5cclxuXHRwdWJsaWMgZ2V0IG1pbkdyaWRDb2x1bW5XaWR0aCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9taW5HcmlkQ29sdW1uV2lkdGg7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IG1pbkdyaWRDb2x1bW5XaWR0aCh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5fbWluR3JpZENvbHVtbldpZHRoID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih0aGlzLl9taW5HcmlkQ29sdW1uV2lkdGgpICYmIE51bWJlci5pc05hTih2YWx1ZSkpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPCAwKSB7XHJcblx0XHRcdHRoaXMuX21pbkdyaWRDb2x1bW5XaWR0aCA9IE5hTjtcclxuXHRcdFx0dGhpcy5hbmNob3Iuc3R5bGVbJ2dyaWRUZW1wbGF0ZUNvbHVtbnMnXSA9ICcnO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fbWluR3JpZENvbHVtbldpZHRoID0gdmFsdWU7XHJcblx0XHR0aGlzLmFuY2hvci5zdHlsZVsnZ3JpZFRlbXBsYXRlQ29sdW1ucyddID0gJ3JlcGVhdChhdXRvLWZpbGwsIG1pbm1heCgnICsgdmFsdWUgKyAncHgsIDFmcikpJztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3BhZGRpbmcgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHBhZGRpbmcoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fcGFkZGluZztcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgcGFkZGluZyh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlIDwgMCkge1xyXG5cdFx0XHR0aGlzLl9wYWRkaW5nID0gMDtcclxuXHRcdFx0dGhpcy5wYWRkaW5nTGVmdCA9IDA7XHJcblx0XHRcdHRoaXMucGFkZGluZ1RvcCA9IDA7XHJcblx0XHRcdHRoaXMucGFkZGluZ1JpZ2h0ID0gMDtcclxuXHRcdFx0dGhpcy5wYWRkaW5nQm90dG9tID0gMDtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3BhZGRpbmcgPSB2YWx1ZTtcclxuXHRcdHRoaXMucGFkZGluZ0xlZnQgPSB2YWx1ZTtcclxuXHRcdHRoaXMucGFkZGluZ1RvcCA9IHZhbHVlO1xyXG5cdFx0dGhpcy5wYWRkaW5nUmlnaHQgPSB2YWx1ZTtcclxuXHRcdHRoaXMucGFkZGluZ0JvdHRvbSA9IHZhbHVlO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcGFkZGluZ0xlZnQgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHBhZGRpbmdMZWZ0KCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3BhZGRpbmdMZWZ0O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBwYWRkaW5nTGVmdCh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5fcGFkZGluZ0xlZnQgPT09IHZhbHVlKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA8IDApIHtcclxuXHRcdFx0dGhpcy5fcGFkZGluZ0xlZnQgPSAwO1xyXG5cdFx0XHR0aGlzLmFuY2hvci5zdHlsZS5wYWRkaW5nTGVmdCA9ICcnO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fcGFkZGluZ0xlZnQgPSB2YWx1ZTtcclxuXHRcdHRoaXMuYW5jaG9yLnN0eWxlLnBhZGRpbmdMZWZ0ID0gdmFsdWUgKyAncHgnO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcGFkZGluZ1RvcCA9IDA7XHJcblxyXG5cdHB1YmxpYyBnZXQgcGFkZGluZ1RvcCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9wYWRkaW5nVG9wO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBwYWRkaW5nVG9wKHZhbHVlOiBudW1iZXIpIHtcclxuXHRcdGlmICh0aGlzLl9wYWRkaW5nVG9wID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih2YWx1ZSkgfHwgdmFsdWUgPCAwKSB7XHJcblx0XHRcdHRoaXMuX3BhZGRpbmdUb3AgPSAwO1xyXG5cdFx0XHR0aGlzLmFuY2hvci5zdHlsZS5wYWRkaW5nVG9wID0gJyc7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9wYWRkaW5nVG9wID0gdmFsdWU7XHJcblx0XHR0aGlzLmFuY2hvci5zdHlsZS5wYWRkaW5nVG9wID0gdmFsdWUgKyAncHgnO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcGFkZGluZ1JpZ2h0ID0gMDtcclxuXHJcblx0cHVibGljIGdldCBwYWRkaW5nUmlnaHQoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fcGFkZGluZ1JpZ2h0O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBwYWRkaW5nUmlnaHQodmFsdWU6IG51bWJlcikge1xyXG5cdFx0aWYgKHRoaXMuX3BhZGRpbmdSaWdodCA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChOdW1iZXIuaXNOYU4odmFsdWUpIHx8IHZhbHVlIDwgMCkge1xyXG5cdFx0XHR0aGlzLl9wYWRkaW5nUmlnaHQgPSAwO1xyXG5cdFx0XHR0aGlzLmFuY2hvci5zdHlsZS5wYWRkaW5nUmlnaHQgPSAnJztcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3BhZGRpbmdSaWdodCA9IHZhbHVlO1xyXG5cdFx0dGhpcy5hbmNob3Iuc3R5bGUucGFkZGluZ1JpZ2h0ID0gdmFsdWUgKyAncHgnO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcGFkZGluZ0JvdHRvbSA9IDA7XHJcblxyXG5cdHB1YmxpYyBnZXQgcGFkZGluZ0JvdHRvbSgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9wYWRkaW5nQm90dG9tO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBwYWRkaW5nQm90dG9tKHZhbHVlOiBudW1iZXIpIHtcclxuXHRcdGlmICh0aGlzLl9wYWRkaW5nQm90dG9tID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih2YWx1ZSkgfHwgdmFsdWUgPCAwKSB7XHJcblx0XHRcdHRoaXMuX3BhZGRpbmdCb3R0b20gPSAwO1xyXG5cdFx0XHR0aGlzLmFuY2hvci5zdHlsZS5wYWRkaW5nQm90dG9tID0gJyc7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9wYWRkaW5nQm90dG9tID0gdmFsdWU7XHJcblx0XHR0aGlzLmFuY2hvci5zdHlsZS5wYWRkaW5nQm90dG9tID0gdmFsdWUgKyAncHgnO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfaXRlbVNwYWNpbmcgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGl0ZW1TcGFjaW5nKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW1TcGFjaW5nO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBpdGVtU3BhY2luZyh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5faXRlbVNwYWNpbmcgPT09IHZhbHVlKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA8IDApIHtcclxuXHRcdFx0aWYgKHRoaXMuX2l0ZW1TcGFjaW5nICE9PSAwKSB7XHJcblx0XHRcdFx0dGhpcy5faXRlbVNwYWNpbmcgPSAwO1xyXG5cdFx0XHRcdHRoaXMuYW5jaG9yLnN0eWxlWydnYXAnXSA9ICcnO1xyXG5cdFx0XHR9XHJcblxyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5faXRlbVNwYWNpbmcgPSB2YWx1ZTtcclxuXHRcdHRoaXMuYW5jaG9yLnN0eWxlWydnYXAnXSA9IHZhbHVlICsgJ3B4JztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3NwYWNpbmdNb2RlOiAnUEFDS0VEJyB8ICdTUEFDRV9CRVRXRUVOJyA9ICdQQUNLRUQnO1xyXG5cclxuXHRwcml2YXRlIF9zcGFjaW5nTW9kZUNoYW5nZWQgPSB0cnVlO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHNwYWNpbmdNb2RlKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3NwYWNpbmdNb2RlO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBzcGFjaW5nTW9kZSh2YWx1ZTogJ1BBQ0tFRCcgfCAnU1BBQ0VfQkVUV0VFTicpIHtcclxuXHRcdGlmICh0aGlzLl9zcGFjaW5nTW9kZSA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3NwYWNpbmdNb2RlID0gdmFsdWU7XHJcblx0XHR0aGlzLl9zcGFjaW5nTW9kZUNoYW5nZWQgPSB0cnVlO1xyXG5cdFx0dGhpcy5pbnZhbGlkYXRlUHJvcGVydGllcygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfYWxpZ246ICdUT1BfTEVGVCcgfCAnVE9QX0NFTlRFUicgfCAnVE9QX1JJR0hUJyB8ICdMRUZUJyB8ICdDRU5URVInIHwgJ1JJR0hUJyB8ICdCT1RUT01fTEVGVCcgfCAnQk9UVE9NX0NFTlRFUicgfCAnQk9UVE9NX1JJR0hUJyA9ICdUT1BfTEVGVCc7XHJcblxyXG5cdHByaXZhdGUgX2FsaWduQ2hhbmdlZCA9IHRydWU7XHJcblxyXG5cdHB1YmxpYyBnZXQgYWxpZ24oKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fYWxpZ247XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGFsaWduKHZhbHVlOiAnVE9QX0xFRlQnIHwgJ1RPUF9DRU5URVInIHwgJ1RPUF9SSUdIVCcgfCAnTEVGVCcgfCAnQ0VOVEVSJyB8ICdSSUdIVCcgfCAnQk9UVE9NX0xFRlQnIHwgJ0JPVFRPTV9DRU5URVInIHwgJ0JPVFRPTV9SSUdIVCcpIHtcclxuXHRcdGlmICh0aGlzLl9hbGlnbiA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2FsaWduID0gdmFsdWU7XHJcblx0XHR0aGlzLl9hbGlnbkNoYW5nZWQgPSB0cnVlO1xyXG5cdFx0dGhpcy5pbnZhbGlkYXRlUHJvcGVydGllcygpO1xyXG5cdH1cclxufVxyXG4iLCJpbXBvcnQgQ29tcG9uZW50IGZyb20gJy4vQ29tcG9uZW50JztcclxuaW1wb3J0IElDb21wb25lbnQgZnJvbSAnLi9JQ29tcG9uZW50JztcclxuaW1wb3J0IElDb250YWluZXIgZnJvbSAnLi9JQ29udGFpbmVyJztcclxuaW1wb3J0IExpbmsgZnJvbSAnLi9MaW5rJztcclxuaW1wb3J0IHtcclxuXHRhbGlnbkNoaWxkcmVuSG9yaXpvbnRhbFBhY2tlZCxcclxuXHRhbGlnbkNoaWxkcmVuSG9yaXpvbnRhbFNwYWNlQmV0d2VlbixcclxuXHRhbGlnbkNoaWxkcmVuVmVydGljYWxQYWNrZWQsXHJcblx0YWxpZ25DaGlsZHJlblZlcnRpY2FsU3BhY2VCZXR3ZWVuLFxyXG5cdGFwcGx5Q29udHJhaW50cyxcclxuXHRhcHBseVBhZGRpbmcsXHJcblx0cmVzZXRQYWRkaW5nLFxyXG5cdHNldENvbnRyYWludHNXaXRoUGFyZW50QXV0b0xheW91dEdyaWQsXHJcblx0c2V0Q29udHJhaW50c1dpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbCxcclxuXHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRWZXJ0aWNhbCxcclxuXHRzZXREaXNwbGF5QXV0b0xheW91dEdyaWQsXHJcblx0c2V0RGlzcGxheUF1dG9sYXlvdXRIb3Jpem9udGFsT3JWZXJ0aWNhbCxcclxuXHRzZXREaXNwbGF5QXV0b2xheW91dE5vbmUsXHJcblx0c2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dEdyaWQsXHJcblx0c2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwsXHJcblx0c2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dFZlcnRpY2FsLFxyXG5cdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEdyaWQsXHJcblx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbCxcclxuXHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXROb25lLFxyXG5cdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dFZlcnRpY2FsLFxyXG59IGZyb20gJy4vaGVscGVycyc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDb250YWluZXIgZXh0ZW5kcyBDb21wb25lbnQgaW1wbGVtZW50cyBJQ29udGFpbmVyIHtcclxuXHRwdWJsaWMgY29uc3RydWN0b3IoKSB7XHJcblx0XHRzdXBlcigpO1xyXG5cdH1cclxuXHJcblx0cHJvdGVjdGVkIGNvbW1pdFByb3BlcnRpZXMoKTogdm9pZCB7XHJcblx0XHRzdXBlci5jb21taXRQcm9wZXJ0aWVzKCk7XHJcblx0XHRpZiAodGhpcy5fYXV0b0xheW91dENoYW5nZWQgfHwgdGhpcy5fdmlzaWJsZUNoYW5nZWQpIHtcclxuXHRcdFx0dGhpcy5hdXRvTGF5b3V0Q2hhbmdlZCgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmICh0aGlzLl9hbGlnbkNoYW5nZWQgfHwgdGhpcy5fc3BhY2luZ01vZGVDaGFuZ2VkKSB7XHJcblx0XHRcdHRoaXMuYWxpZ25PclNwYWNpbmdNb2RlQ2hhbmdlZCgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhbGlnbk9yU3BhY2luZ01vZGVDaGFuZ2VkKCkge1xyXG5cdFx0dGhpcy5fYWxpZ25DaGFuZ2VkID0gZmFsc2U7XHJcblx0XHR0aGlzLl9zcGFjaW5nTW9kZUNoYW5nZWQgPSBmYWxzZTtcclxuXHRcdGlmICh0aGlzLmF1dG9MYXlvdXQgPT09ICdIT1JJWk9OVEFMJykge1xyXG5cdFx0XHR0aGlzLmFsaWduSG9yaXpvbnRhbCgpO1xyXG5cdFx0fSBlbHNlIGlmICh0aGlzLmF1dG9MYXlvdXQgPT09ICdWRVJUSUNBTCcpIHtcclxuXHRcdFx0dGhpcy5hbGlnblZlcnRpY2FsKCk7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0aGlzLmFsaWduTm9uZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhdXRvTGF5b3V0Q2hhbmdlZCgpIHtcclxuXHRcdHRoaXMuX2F1dG9MYXlvdXRDaGFuZ2VkID0gZmFsc2U7XHJcblx0XHR0aGlzLl92aXNpYmxlQ2hhbmdlZCA9IGZhbHNlO1xyXG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xyXG5cdFx0XHR0aGlzLmFwcGx5QXV0b0xheW91dCgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5hcHBseVZpc2libGVGYWxzZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhcHBseUF1dG9MYXlvdXQoKSB7XHJcblx0XHRpZiAodGhpcy5hdXRvTGF5b3V0ID09PSAnSE9SSVpPTlRBTCcpIHtcclxuXHRcdFx0dGhpcy51cGRhdGVBdXRvTGF5b3V0SG9yaXpvbnRhbCgpO1xyXG5cdFx0fSBlbHNlIGlmICh0aGlzLmF1dG9MYXlvdXQgPT09ICdWRVJUSUNBTCcpIHtcclxuXHRcdFx0dGhpcy51cGRhdGVBdXRvTGF5b3V0VmVydGljYWwoKTtcclxuXHRcdH0gZWxzZSBpZiAodGhpcy5hdXRvTGF5b3V0ID09PSAnR1JJRCcpIHtcclxuXHRcdFx0dGhpcy51cGRhdGVBdXRvTGF5b3V0R3JpZCgpO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy51cGRhdGVBdXRvTGF5b3V0Tm9uZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhcHBseVZpc2libGVGYWxzZSgpIHtcclxuXHRcdHRoaXMuc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgdXBkYXRlQXV0b0xheW91dEhvcml6b250YWwoKSB7XHJcblx0XHRzZXREaXNwbGF5QXV0b2xheW91dEhvcml6b250YWxPclZlcnRpY2FsKHRoaXMsIHRoaXMucGFyZW50KTtcclxuXHRcdGFwcGx5UGFkZGluZyh0aGlzLCB0aGlzKTtcclxuXHRcdHRoaXMuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdyb3cnO1xyXG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlbkhvcml6b250YWwoKTtcclxuXHRcdHRoaXMuYWxpZ25Ib3Jpem9udGFsKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHVwZGF0ZUF1dG9MYXlvdXRWZXJ0aWNhbCgpIHtcclxuXHRcdHNldERpc3BsYXlBdXRvbGF5b3V0SG9yaXpvbnRhbE9yVmVydGljYWwodGhpcywgdGhpcy5wYXJlbnQpO1xyXG5cdFx0YXBwbHlQYWRkaW5nKHRoaXMsIHRoaXMpO1xyXG5cdFx0dGhpcy5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XHJcblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuVmVydGljYWwoKTtcclxuXHRcdHRoaXMuYWxpZ25WZXJ0aWNhbCgpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSB1cGRhdGVBdXRvTGF5b3V0R3JpZCgpIHtcclxuXHRcdHNldERpc3BsYXlBdXRvTGF5b3V0R3JpZCh0aGlzLCB0aGlzLnBhcmVudCk7XHJcblx0XHRhcHBseVBhZGRpbmcodGhpcywgdGhpcyk7XHJcblx0XHR0aGlzLnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnJztcclxuXHRcdHRoaXMudXBkYXRlQ2hpbGRyZW5HcmlkKCk7XHJcblx0XHR0aGlzLmFsaWduR3JpZCgpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSB1cGRhdGVBdXRvTGF5b3V0Tm9uZSgpIHtcclxuXHRcdHNldERpc3BsYXlBdXRvbGF5b3V0Tm9uZSh0aGlzLCB0aGlzLnBhcmVudCk7XHJcblx0XHRyZXNldFBhZGRpbmcodGhpcyk7XHJcblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuTm9uZSgpO1xyXG5cdFx0dGhpcy5hbGlnbk5vbmUoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgdXBkYXRlQ2hpbGRyZW5Ib3Jpem9udGFsKCkge1xyXG5cdFx0bGV0IGNoaWxkOiBJQ29tcG9uZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlO1xyXG5cdFx0dGhpcy5jaGlsZE5vZGVzLmZvckVhY2gobm9kZSA9PiB7XHJcblx0XHRcdGNoaWxkID0gbm9kZSBhcyB1bmtub3duIGFzIElDb21wb25lbnQgJiBFbGVtZW50Q1NTSW5saW5lU3R5bGU7XHJcblx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIExpbmspIHtcclxuXHRcdFx0XHRzZXRTaXplV2l0aFBhcmVudEF1dG9MYXlvdXRIb3Jpem9udGFsKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHRcdHNldENvbnRyYWludHNXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwoY2hpbGQsIGNoaWxkLmFuY2hvcik7XHJcblx0XHRcdFx0c2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwoY2hpbGQsIGNoaWxkLmFuY2hvcik7XHJcblx0XHRcdH0gZWxzZSB7XHJcblx0XHRcdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbChjaGlsZCwgY2hpbGQpO1xyXG5cdFx0XHRcdHNldENvbnRyYWludHNXaXRoUGFyZW50QXV0b0xheW91dEhvcml6b250YWwoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0XHRzZXRQb3NpdGlvbldpdGhQYXJlbnRBdXRvTGF5b3V0SG9yaXpvbnRhbChjaGlsZCwgY2hpbGQpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgdXBkYXRlQ2hpbGRyZW5WZXJ0aWNhbCgpIHtcclxuXHRcdGxldCBjaGlsZDogSUNvbXBvbmVudCAmIEVsZW1lbnRDU1NJbmxpbmVTdHlsZTtcclxuXHRcdHRoaXMuY2hpbGROb2Rlcy5mb3JFYWNoKG5vZGUgPT4ge1xyXG5cdFx0XHRjaGlsZCA9IG5vZGUgYXMgdW5rbm93biBhcyBJQ29tcG9uZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlO1xyXG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBMaW5rKSB7XHJcblx0XHRcdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwoY2hpbGQsIGNoaWxkLmFuY2hvcik7XHJcblx0XHRcdFx0c2V0Q29udHJhaW50c1dpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwoY2hpbGQsIGNoaWxkLmFuY2hvcik7XHJcblx0XHRcdFx0c2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dFZlcnRpY2FsKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dFZlcnRpY2FsKGNoaWxkLCBjaGlsZCk7XHJcblx0XHRcdFx0c2V0Q29udHJhaW50c1dpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0XHRzZXRQb3NpdGlvbldpdGhQYXJlbnRBdXRvTGF5b3V0VmVydGljYWwoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHVwZGF0ZUNoaWxkcmVuR3JpZCgpIHtcclxuXHRcdGxldCBjaGlsZDogSUNvbXBvbmVudCAmIEVsZW1lbnRDU1NJbmxpbmVTdHlsZTtcclxuXHRcdHRoaXMuY2hpbGROb2Rlcy5mb3JFYWNoKG5vZGUgPT4ge1xyXG5cdFx0XHRjaGlsZCA9IG5vZGUgYXMgdW5rbm93biBhcyBJQ29tcG9uZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlO1xyXG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBMaW5rKSB7XHJcblx0XHRcdFx0c2V0U2l6ZVdpdGhQYXJlbnRBdXRvTGF5b3V0R3JpZChjaGlsZCwgY2hpbGQuYW5jaG9yKTtcclxuXHRcdFx0XHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHRcdHNldFBvc2l0aW9uV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dEdyaWQoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0XHRzZXRDb250cmFpbnRzV2l0aFBhcmVudEF1dG9MYXlvdXRHcmlkKGNoaWxkLCBjaGlsZCk7XHJcblx0XHRcdFx0c2V0UG9zaXRpb25XaXRoUGFyZW50QXV0b0xheW91dEdyaWQoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIHVwZGF0ZUNoaWxkcmVuTm9uZSgpIHtcclxuXHRcdGxldCBjaGlsZDogSUNvbXBvbmVudCAmIEVsZW1lbnRDU1NJbmxpbmVTdHlsZTtcclxuXHRcdHRoaXMuY2hpbGROb2Rlcy5mb3JFYWNoKG5vZGUgPT4ge1xyXG5cdFx0XHRjaGlsZCA9IG5vZGUgYXMgdW5rbm93biBhcyBJQ29tcG9uZW50ICYgRWxlbWVudENTU0lubGluZVN0eWxlO1xyXG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBMaW5rKSB7XHJcblx0XHRcdFx0aWYgKGNoaWxkLnBvc2l0aW9uID09PSAnU0NST0xMX1dJVEhfUEFSRU5UJykge1xyXG5cdFx0XHRcdFx0Y2hpbGQuYW5jaG9yLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dE5vbmUoY2hpbGQsIGNoaWxkLmFuY2hvcik7XHJcblx0XHRcdFx0YXBwbHlDb250cmFpbnRzKGNoaWxkLCBjaGlsZC5hbmNob3IpO1xyXG5cdFx0XHR9IGVsc2Uge1xyXG5cdFx0XHRcdGlmIChjaGlsZC5wb3NpdGlvbiA9PT0gJ1NDUk9MTF9XSVRIX1BBUkVOVCcpIHtcclxuXHRcdFx0XHRcdGNoaWxkLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHNldFNpemVXaXRoUGFyZW50QXV0b0xheW91dE5vbmUoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0XHRhcHBseUNvbnRyYWludHMoY2hpbGQsIGNoaWxkKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGFsaWduSG9yaXpvbnRhbCgpIHtcclxuXHRcdGlmICh0aGlzLnNwYWNpbmdNb2RlID09PSAnUEFDS0VEJykge1xyXG5cdFx0XHRhbGlnbkNoaWxkcmVuSG9yaXpvbnRhbFBhY2tlZCh0aGlzLCB0aGlzKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGFsaWduQ2hpbGRyZW5Ib3Jpem9udGFsU3BhY2VCZXR3ZWVuKHRoaXMsIHRoaXMpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBhbGlnblZlcnRpY2FsKCkge1xyXG5cdFx0aWYgKHRoaXMuc3BhY2luZ01vZGUgPT09ICdQQUNLRUQnKSB7XHJcblx0XHRcdGFsaWduQ2hpbGRyZW5WZXJ0aWNhbFBhY2tlZCh0aGlzLCB0aGlzKTtcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGFsaWduQ2hpbGRyZW5WZXJ0aWNhbFNwYWNlQmV0d2Vlbih0aGlzLCB0aGlzKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgYWxpZ25HcmlkKCkge1xyXG5cdFx0dGhpcy5zdHlsZS5hbGlnbkl0ZW1zID0gJ3N0YXJ0JztcclxuXHRcdHRoaXMuc3R5bGUuYWxpZ25Db250ZW50ID0gJ3N0YXJ0JztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgYWxpZ25Ob25lKCkge1xyXG5cdFx0dGhpcy5zdHlsZS5hbGlnbkl0ZW1zID0gJyc7XHJcblx0XHR0aGlzLnN0eWxlLmp1c3RpZnlDb250ZW50ID0gJyc7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgYWRkQ29tcG9uZW50KGNvbXBvbmVudDogSUNvbXBvbmVudCkge1xyXG5cdFx0dGhpcy5hcHBlbmRDaGlsZChjb21wb25lbnQgYXMgdW5rbm93biBhcyBOb2RlKTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBhZGRDb21wb25lbnRzKGNvbXBvbmVudHM6IElDb21wb25lbnRbXSkge1xyXG5cdFx0Y29uc3QgZnJhZzogRG9jdW1lbnRGcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcclxuXHRcdGNvbXBvbmVudHMuZm9yRWFjaChjb21wb25lbnQgPT4gZnJhZy5hcHBlbmRDaGlsZChjb21wb25lbnQgYXMgdW5rbm93biBhcyBOb2RlKSk7XHJcblx0XHR0aGlzLmFwcGVuZENoaWxkKGZyYWcpO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHJlbW92ZUNvbXBvbmVudChjb21wb25lbnQ6IElDb21wb25lbnQpIHtcclxuXHRcdGlmICh0aGlzLmNvbnRhaW5zQ29tcG9uZW50KGNvbXBvbmVudCkpIHtcclxuXHRcdFx0dGhpcy5yZW1vdmVDaGlsZChjb21wb25lbnQgYXMgdW5rbm93biBhcyBOb2RlKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHB1YmxpYyBjb250YWluc0NvbXBvbmVudChjb21wb25lbnQ6IElDb21wb25lbnQpOiBib29sZWFuIHtcclxuXHRcdHJldHVybiB0aGlzLmNvbnRhaW5zKGNvbXBvbmVudCBhcyB1bmtub3duIGFzIE5vZGUpO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHJlbW92ZUFsbENvbXBvbmVudHMoKSB7XHJcblx0XHR3aGlsZSAodGhpcy5maXJzdENoaWxkKSB7XHJcblx0XHRcdHRoaXMucmVtb3ZlQ2hpbGQodGhpcy5maXJzdENoaWxkKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3NwYWNpbmdNb2RlOiAnUEFDS0VEJyB8ICdTUEFDRV9CRVRXRUVOJyA9ICdQQUNLRUQnO1xyXG5cclxuXHRwcml2YXRlIF9zcGFjaW5nTW9kZUNoYW5nZWQgPSB0cnVlO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHNwYWNpbmdNb2RlKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3NwYWNpbmdNb2RlO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBzcGFjaW5nTW9kZSh2YWx1ZTogJ1BBQ0tFRCcgfCAnU1BBQ0VfQkVUV0VFTicpIHtcclxuXHRcdGlmICh0aGlzLl9zcGFjaW5nTW9kZSA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3NwYWNpbmdNb2RlID0gdmFsdWU7XHJcblx0XHR0aGlzLl9zcGFjaW5nTW9kZUNoYW5nZWQgPSB0cnVlO1xyXG5cdFx0dGhpcy5pbnZhbGlkYXRlUHJvcGVydGllcygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfYWxpZ246ICdUT1BfTEVGVCcgfCAnVE9QX0NFTlRFUicgfCAnVE9QX1JJR0hUJyB8ICdMRUZUJyB8ICdDRU5URVInIHwgJ1JJR0hUJyB8ICdCT1RUT01fTEVGVCcgfCAnQk9UVE9NX0NFTlRFUicgfCAnQk9UVE9NX1JJR0hUJyA9ICdUT1BfTEVGVCc7XHJcblxyXG5cdHByaXZhdGUgX2FsaWduQ2hhbmdlZCA9IHRydWU7XHJcblxyXG5cdHB1YmxpYyBnZXQgYWxpZ24oKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fYWxpZ247XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGFsaWduKHZhbHVlOiAnVE9QX0xFRlQnIHwgJ1RPUF9DRU5URVInIHwgJ1RPUF9SSUdIVCcgfCAnTEVGVCcgfCAnQ0VOVEVSJyB8ICdSSUdIVCcgfCAnQk9UVE9NX0xFRlQnIHwgJ0JPVFRPTV9DRU5URVInIHwgJ0JPVFRPTV9SSUdIVCcpIHtcclxuXHRcdGlmICh0aGlzLl9hbGlnbiA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2FsaWduID0gdmFsdWU7XHJcblx0XHR0aGlzLl9hbGlnbkNoYW5nZWQgPSB0cnVlO1xyXG5cdFx0dGhpcy5pbnZhbGlkYXRlUHJvcGVydGllcygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfaXRlbVNwYWNpbmcgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGl0ZW1TcGFjaW5nKCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW1TcGFjaW5nO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBpdGVtU3BhY2luZyh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5faXRlbVNwYWNpbmcgPT09IHZhbHVlKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA8IDApIHtcclxuXHRcdFx0aWYgKHRoaXMuX2l0ZW1TcGFjaW5nICE9PSAwKSB7XHJcblx0XHRcdFx0dGhpcy5faXRlbVNwYWNpbmcgPSAwO1xyXG5cdFx0XHRcdHRoaXMuc3R5bGVbJ2dhcCddID0gJyc7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9pdGVtU3BhY2luZyA9IHZhbHVlO1xyXG5cdFx0dGhpcy5zdHlsZVsnZ2FwJ10gPSB2YWx1ZSArICdweCc7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9hdXRvTGF5b3V0OiAnSE9SSVpPTlRBTCcgfCAnVkVSVElDQUwnIHwgJ05PTkUnIHwgJ0dSSUQnID0gJ0hPUklaT05UQUwnO1xyXG5cclxuXHRwcml2YXRlIF9hdXRvTGF5b3V0Q2hhbmdlZCA9IHRydWU7XHJcblxyXG5cdHB1YmxpYyBnZXQgYXV0b0xheW91dCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9hdXRvTGF5b3V0O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBhdXRvTGF5b3V0KHZhbHVlOiAnSE9SSVpPTlRBTCcgfCAnVkVSVElDQUwnIHwgJ05PTkUnIHwgJ0dSSUQnKSB7XHJcblx0XHRpZiAodGhpcy5fYXV0b0xheW91dCA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2F1dG9MYXlvdXQgPSB2YWx1ZTtcclxuXHRcdHRoaXMuX2F1dG9MYXlvdXRDaGFuZ2VkID0gdHJ1ZTtcclxuXHRcdHRoaXMuaW52YWxpZGF0ZVByb3BlcnRpZXMoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3BhZGRpbmcgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHBhZGRpbmcoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fcGFkZGluZztcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgcGFkZGluZyh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlIDwgMCkge1xyXG5cdFx0XHR0aGlzLl9wYWRkaW5nID0gMDtcclxuXHRcdFx0dGhpcy5wYWRkaW5nTGVmdCA9IDA7XHJcblx0XHRcdHRoaXMucGFkZGluZ1RvcCA9IDA7XHJcblx0XHRcdHRoaXMucGFkZGluZ1JpZ2h0ID0gMDtcclxuXHRcdFx0dGhpcy5wYWRkaW5nQm90dG9tID0gMDtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3BhZGRpbmcgPSB2YWx1ZTtcclxuXHRcdHRoaXMucGFkZGluZ0xlZnQgPSB2YWx1ZTtcclxuXHRcdHRoaXMucGFkZGluZ1RvcCA9IHZhbHVlO1xyXG5cdFx0dGhpcy5wYWRkaW5nUmlnaHQgPSB2YWx1ZTtcclxuXHRcdHRoaXMucGFkZGluZ0JvdHRvbSA9IHZhbHVlO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcGFkZGluZ0xlZnQgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHBhZGRpbmdMZWZ0KCkge1xyXG5cdFx0cmV0dXJuIHRoaXMuX3BhZGRpbmdMZWZ0O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBwYWRkaW5nTGVmdCh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5fcGFkZGluZ0xlZnQgPT09IHZhbHVlKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA8IDApIHtcclxuXHRcdFx0dGhpcy5fcGFkZGluZ0xlZnQgPSAwO1xyXG5cdFx0XHR0aGlzLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJyc7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9wYWRkaW5nTGVmdCA9IHZhbHVlO1xyXG5cdFx0dGhpcy5zdHlsZS5wYWRkaW5nTGVmdCA9IHZhbHVlICsgJ3B4JztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3BhZGRpbmdUb3AgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHBhZGRpbmdUb3AoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fcGFkZGluZ1RvcDtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgcGFkZGluZ1RvcCh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5fcGFkZGluZ1RvcCA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChOdW1iZXIuaXNOYU4odmFsdWUpIHx8IHZhbHVlIDwgMCkge1xyXG5cdFx0XHR0aGlzLl9wYWRkaW5nVG9wID0gMDtcclxuXHRcdFx0dGhpcy5zdHlsZS5wYWRkaW5nVG9wID0gJyc7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9wYWRkaW5nVG9wID0gdmFsdWU7XHJcblx0XHR0aGlzLnN0eWxlLnBhZGRpbmdUb3AgPSB2YWx1ZSArICdweCc7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9wYWRkaW5nUmlnaHQgPSAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IHBhZGRpbmdSaWdodCgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9wYWRkaW5nUmlnaHQ7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IHBhZGRpbmdSaWdodCh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAodGhpcy5fcGFkZGluZ1JpZ2h0ID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih2YWx1ZSkgfHwgdmFsdWUgPCAwKSB7XHJcblx0XHRcdHRoaXMuX3BhZGRpbmdSaWdodCA9IDA7XHJcblx0XHRcdHRoaXMuc3R5bGUucGFkZGluZ1JpZ2h0ID0gJyc7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9wYWRkaW5nUmlnaHQgPSB2YWx1ZTtcclxuXHRcdHRoaXMuc3R5bGUucGFkZGluZ1JpZ2h0ID0gdmFsdWUgKyAncHgnO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfcGFkZGluZ0JvdHRvbSA9IDA7XHJcblxyXG5cdHB1YmxpYyBnZXQgcGFkZGluZ0JvdHRvbSgpIHtcclxuXHRcdHJldHVybiB0aGlzLl9wYWRkaW5nQm90dG9tO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBwYWRkaW5nQm90dG9tKHZhbHVlOiBudW1iZXIpIHtcclxuXHRcdGlmICh0aGlzLl9wYWRkaW5nQm90dG9tID09PSB2YWx1ZSkge1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0aWYgKE51bWJlci5pc05hTih2YWx1ZSkgfHwgdmFsdWUgPCAwKSB7XHJcblx0XHRcdHRoaXMuX3BhZGRpbmdCb3R0b20gPSAwO1xyXG5cdFx0XHR0aGlzLnN0eWxlLnBhZGRpbmdCb3R0b20gPSAnJztcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3BhZGRpbmdCb3R0b20gPSB2YWx1ZTtcclxuXHRcdHRoaXMuc3R5bGUucGFkZGluZ0JvdHRvbSA9IHZhbHVlICsgJ3B4JztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX21pbkdyaWRDb2x1bW5XaWR0aCA9IE5hTjtcclxuXHJcblx0cHVibGljIGdldCBtaW5HcmlkQ29sdW1uV2lkdGgoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fbWluR3JpZENvbHVtbldpZHRoO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBtaW5HcmlkQ29sdW1uV2lkdGgodmFsdWU6IG51bWJlcikge1xyXG5cdFx0aWYgKHRoaXMuX21pbkdyaWRDb2x1bW5XaWR0aCA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdGlmIChOdW1iZXIuaXNOYU4odGhpcy5fbWluR3JpZENvbHVtbldpZHRoKSAmJiBOdW1iZXIuaXNOYU4odmFsdWUpKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHRpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlIDwgMCkge1xyXG5cdFx0XHR0aGlzLl9taW5HcmlkQ29sdW1uV2lkdGggPSBOYU47XHJcblx0XHRcdHRoaXMuc3R5bGUuZ3JpZFRlbXBsYXRlQ29sdW1ucyA9ICcnO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fbWluR3JpZENvbHVtbldpZHRoID0gdmFsdWU7XHJcblx0XHR0aGlzLnN0eWxlWydncmlkVGVtcGxhdGVDb2x1bW5zJ10gPSAncmVwZWF0KGF1dG8tZmlsbCwgbWlubWF4KCcgKyB2YWx1ZSArICdweCwgMWZyKSknO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfdmlzaWJsZSA9IHRydWU7XHJcblxyXG5cdHByaXZhdGUgX3Zpc2libGVDaGFuZ2VkID0gZmFsc2U7XHJcblxyXG5cdHB1YmxpYyBnZXQgdmlzaWJsZSgpIHtcclxuXHRcdHJldHVybiB0aGlzLl92aXNpYmxlO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCB2aXNpYmxlKHZhbHVlOiBib29sZWFuKSB7XHJcblx0XHRpZiAodGhpcy5fdmlzaWJsZSA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3Zpc2libGUgPSB2YWx1ZTtcclxuXHRcdHRoaXMuX3Zpc2libGVDaGFuZ2VkID0gdHJ1ZTtcclxuXHRcdHRoaXMuaW52YWxpZGF0ZVByb3BlcnRpZXMoKTtcclxuXHR9XHJcbn1cclxuY3VzdG9tRWxlbWVudHMuZGVmaW5lKCdjb250YWluZXItZWxlbWVudCcsIENvbnRhaW5lcik7XHJcbiIsImltcG9ydCBDb250YWluZXIgZnJvbSAnLi9Db250YWluZXInO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgYWJzdHJhY3QgY2xhc3MgQXBwbGljYXRpb24gZXh0ZW5kcyBDb250YWluZXIge1xyXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHN1cGVyKCk7XHJcblx0XHR0aGlzLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG5cdFx0dGhpcy5zdHlsZS5taW5IZWlnaHQgPSAnMTAwJSc7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgZ2V0IGZpbGwoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fZmlsbDtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgZmlsbCh2YWx1ZTogc3RyaW5nKSB7XHJcblx0XHR0aGlzLl9maWxsID0gdmFsdWU7XHJcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLmJhY2tncm91bmQgPSB2YWx1ZTtcclxuXHR9XHJcbn1cclxuIiwiaW1wb3J0IENvbXBvbmVudCBmcm9tICcuL0NvbXBvbmVudCc7XHJcbmltcG9ydCBJTGFiZWwgZnJvbSAnLi9JTGFiZWwnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTGFiZWwgZXh0ZW5kcyBDb21wb25lbnQgaW1wbGVtZW50cyBJTGFiZWwge1xyXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHN1cGVyKCk7XHJcblx0XHR0aGlzLnN0eWxlLnVzZXJTZWxlY3QgPSAnbm9uZSc7XHJcblx0XHR0aGlzLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XHJcblx0XHR0aGlzLnN0eWxlLmxpbmVIZWlnaHQgPSAnMjBweCc7XHJcblx0XHR0aGlzLnN0eWxlLmZvbnRTaXplID0gJzE2cHgnO1xyXG5cdFx0dGhpcy5zdHlsZS5mb250V2VpZ2h0ID0gJzQwMCc7XHJcblx0XHR0aGlzLnN0eWxlLmxldHRlclNwYWNpbmcgPSAnJztcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX3RydW5jYXRlID0gZmFsc2U7XHJcblxyXG5cdHB1YmxpYyBnZXQgdHJ1bmNhdGUoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fdHJ1bmNhdGU7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IHRydW5jYXRlKHZhbHVlOiBib29sZWFuKSB7XHJcblx0XHRpZiAodGhpcy5fdHJ1bmNhdGUgPT09IHZhbHVlKSB7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl90cnVuY2F0ZSA9IHZhbHVlO1xyXG5cdFx0aWYgKHZhbHVlKSB7XHJcblx0XHRcdHRoaXMuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcclxuXHRcdFx0dGhpcy5zdHlsZS50ZXh0T3ZlcmZsb3cgPSAnZWxsaXBzaXMnO1xyXG5cdFx0XHR0aGlzLnN0eWxlLndoaXRlU3BhY2UgPSAnbm93cmFwJztcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdGlmICh0aGlzLmNsaXBDb250ZW50KSB7XHJcblx0XHRcdFx0dGhpcy5zdHlsZS5vdmVyZmxvdyA9ICdhdXRvJztcclxuXHRcdFx0fSBlbHNlIHtcclxuXHRcdFx0XHR0aGlzLnN0eWxlLm92ZXJmbG93ID0gJyc7XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHRoaXMuc3R5bGUudGV4dE92ZXJmbG93ID0gJyc7XHJcblx0XHRcdHRoaXMuc3R5bGUud2hpdGVTcGFjZSA9ICcnO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfY29udGVudCA9ICcnO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGNvbnRlbnQoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudDtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgY29udGVudCh2YWx1ZTogc3RyaW5nKSB7XHJcblx0XHR0aGlzLl9jb250ZW50ID0gdmFsdWU7XHJcblx0XHR0aGlzLmlubmVyVGV4dCA9IHRoaXMuY29udGVudDtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBnZXQgZm9udEZhbWlseSgpOiBzdHJpbmcge1xyXG5cdFx0cmV0dXJuIHRoaXMuc3R5bGUuZm9udEZhbWlseTtcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgZm9udEZhbWlseSh2YWx1ZTogc3RyaW5nKSB7XHJcblx0XHR0aGlzLnN0eWxlLmZvbnRGYW1pbHkgPSB2YWx1ZTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2NvbG9yID0gJyc7XHJcblxyXG5cdHB1YmxpYyBnZXQgY29sb3IoKSB7XHJcblx0XHRyZXR1cm4gdGhpcy5fY29sb3I7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGNvbG9yKHZhbHVlOiBzdHJpbmcpIHtcclxuXHRcdGlmICh0aGlzLl9jb2xvciA9PT0gdmFsdWUpIHtcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2NvbG9yID0gdmFsdWU7XHJcblx0XHR0aGlzLnN0eWxlLmNvbG9yID0gdmFsdWU7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9saW5lSGVpZ2h0ID0gMjA7XHJcblxyXG5cdHB1YmxpYyBnZXQgbGluZUhlaWdodCgpOiBudW1iZXIge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVIZWlnaHQ7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgc2V0IGxpbmVIZWlnaHQodmFsdWU6IG51bWJlcikge1xyXG5cdFx0aWYgKE51bWJlci5pc05hTih2YWx1ZSkgfHwgdmFsdWUgPCAwKSB7XHJcblx0XHRcdHRoaXMuX2xpbmVIZWlnaHQgPSAyMDtcclxuXHRcdFx0dGhpcy5zdHlsZS5saW5lSGVpZ2h0ID0gJzIwcHgnO1xyXG5cdFx0XHRyZXR1cm47XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fbGluZUhlaWdodCA9IHZhbHVlO1xyXG5cdFx0dGhpcy5zdHlsZS5saW5lSGVpZ2h0ID0gdmFsdWUgKyAncHgnO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfZm9udFNpemUgPSAxNjtcclxuXHJcblx0cHVibGljIGdldCBmb250U2l6ZSgpOiBudW1iZXIge1xyXG5cdFx0cmV0dXJuIHRoaXMuX2ZvbnRTaXplO1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBmb250U2l6ZSh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA8IDApIHtcclxuXHRcdFx0dGhpcy5fZm9udFNpemUgPSAxNjtcclxuXHRcdFx0dGhpcy5zdHlsZS5mb250U2l6ZSA9ICcxNnB4JztcclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX2ZvbnRTaXplID0gdmFsdWU7XHJcblx0XHR0aGlzLnN0eWxlLmZvbnRTaXplID0gdmFsdWUgKyAncHgnO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfZm9udFdlaWdodDogNDAwIHwgNTAwIHwgNjAwIHwgNzAwID0gNDAwO1xyXG5cclxuXHRwdWJsaWMgZ2V0IGZvbnRXZWlnaHQoKTogNDAwIHwgNTAwIHwgNjAwIHwgNzAwIHtcclxuXHRcdHJldHVybiB0aGlzLl9mb250V2VpZ2h0O1xyXG5cdH1cclxuXHJcblx0cHVibGljIHNldCBmb250V2VpZ2h0KHZhbHVlOiA0MDAgfCA1MDAgfCA2MDAgfCA3MDApIHtcclxuXHRcdHRoaXMuX2ZvbnRXZWlnaHQgPSB2YWx1ZTtcclxuXHRcdHRoaXMuc3R5bGUuZm9udFdlaWdodCA9IHZhbHVlLnRvU3RyaW5nKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIF9sZXR0ZXJTcGFjaW5nID0gMDtcclxuXHJcblx0cHVibGljIGdldCBsZXR0ZXJTcGFjaW5nKCk6IG51bWJlciB7XHJcblx0XHRyZXR1cm4gdGhpcy5fbGV0dGVyU3BhY2luZztcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgbGV0dGVyU3BhY2luZyh2YWx1ZTogbnVtYmVyKSB7XHJcblx0XHRpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSkge1xyXG5cdFx0XHR0aGlzLl9sZXR0ZXJTcGFjaW5nID0gMDtcclxuXHRcdFx0dGhpcy5zdHlsZS5sZXR0ZXJTcGFjaW5nID0gJyc7XHJcblx0XHRcdHJldHVybjtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl9sZXR0ZXJTcGFjaW5nID0gdmFsdWU7XHJcblx0XHR0aGlzLnN0eWxlLmxldHRlclNwYWNpbmcgPSB2YWx1ZSArICdweCc7XHJcblx0fVxyXG5cclxuXHRwdWJsaWMgZ2V0IHRleHRBbGlnbigpOiAnc3RhcnQnIHwgJ2VuZCcgfCAnbGVmdCcgfCAncmlnaHQnIHwgJ2NlbnRlcicgfCAnanVzdGlmeScgfCAnanVzdGlmeS1hbGwnIHwgJ21hdGNoLXBhcmVudCcge1xyXG5cdFx0cmV0dXJuIHRoaXMuc3R5bGUudGV4dEFsaWduIGFzICdzdGFydCcgfCAnZW5kJyB8ICdsZWZ0JyB8ICdyaWdodCcgfCAnY2VudGVyJyB8ICdqdXN0aWZ5JyB8ICdqdXN0aWZ5LWFsbCcgfCAnbWF0Y2gtcGFyZW50JztcclxuXHR9XHJcblxyXG5cdHB1YmxpYyBzZXQgdGV4dEFsaWduKHZhbHVlOiAnc3RhcnQnIHwgJ2VuZCcgfCAnbGVmdCcgfCAncmlnaHQnIHwgJ2NlbnRlcicgfCAnanVzdGlmeScgfCAnanVzdGlmeS1hbGwnIHwgJ21hdGNoLXBhcmVudCcpIHtcclxuXHRcdHRoaXMuc3R5bGUudGV4dEFsaWduID0gdmFsdWU7XHJcblx0fVxyXG59XHJcbmN1c3RvbUVsZW1lbnRzLmRlZmluZSgnbGFiZWwtZWxlbWVudCcsIExhYmVsKTtcclxuIiwiaW1wb3J0IENvbnRhaW5lciBmcm9tICcuLi9jb21wb25lbnRzL0NvbnRhaW5lcic7XHJcbmltcG9ydCBJTGFiZWwgZnJvbSAnLi4vY29tcG9uZW50cy9JTGFiZWwnO1xyXG5pbXBvcnQgTGFiZWwgZnJvbSAnLi4vY29tcG9uZW50cy9MYWJlbCc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCYXNlQnV0dG9uIGV4dGVuZHMgQ29udGFpbmVyIHtcclxuXHRwdWJsaWMgY29uc3RydWN0b3IobGFiZWw6IHN0cmluZywgZmlsbDogc3RyaW5nLCBjbGlja1R5cGU6IHN0cmluZykge1xyXG5cdFx0c3VwZXIoKTtcclxuXHRcdHRoaXMubGFiZWwuY29udGVudCA9IGxhYmVsO1xyXG5cdFx0dGhpcy5maWxsID0gZmlsbDtcclxuXHRcdHRoaXMuY2xpY2tUeXBlID0gY2xpY2tUeXBlO1xyXG5cdFx0dGhpcy5jdXJzb3IgPSAncG9pbnRlcic7XHJcblx0XHR0aGlzLmNvcm5lclJhZGl1cyA9IDQ7XHJcblx0XHR0aGlzLnBhZGRpbmdMZWZ0ID0gMTI7XHJcblx0XHR0aGlzLnBhZGRpbmdSaWdodCA9IDEyO1xyXG5cdFx0dGhpcy5wYWRkaW5nVG9wID0gODtcclxuXHRcdHRoaXMucGFkZGluZ0JvdHRvbSA9IDg7XHJcblx0XHR0aGlzLmFkZENvbXBvbmVudCh0aGlzLmxhYmVsKTtcclxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmNsaWNrZWQpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSByZWFkb25seSBjbGlja1R5cGU6IHN0cmluZztcclxuXHJcblx0cHJpdmF0ZSBjbGlja2VkKCkge1xyXG5cdFx0dGhpcy5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudCh0aGlzLmNsaWNrVHlwZSwgeyBidWJibGVzOiB0cnVlIH0pKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgX2xhYmVsITogSUxhYmVsO1xyXG5cclxuXHRwcml2YXRlIGdldCBsYWJlbCgpIHtcclxuXHRcdGlmICghdGhpcy5fbGFiZWwpIHtcclxuXHRcdFx0dGhpcy5fbGFiZWwgPSBuZXcgTGFiZWwoKTtcclxuXHRcdFx0dGhpcy5fbGFiZWwuZm9udFdlaWdodCA9IDYwMDtcclxuXHRcdH1cclxuXHJcblx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XHJcblx0fVxyXG59XHJcbmN1c3RvbUVsZW1lbnRzLmRlZmluZSgnYmFzZS1idXR0b24nLCBCYXNlQnV0dG9uKTtcclxuIiwiZXhwb3J0IGNvbnN0IExBUkdFID0gJzBweCA0cHggNnB4IC0ycHggcmdiYSgxNiwgMjQsIDQwLCAwLjAzKSwgMHB4IDEycHggMTZweCAtNHB4IHJnYmEoMTYsIDI0LCA0MCwgMC4wOCknO1xyXG5leHBvcnQgY29uc3QgTUVESVVNID0gJzBweCAycHggNHB4IC0ycHggcmdiYSgxNiwgMjQsIDQwLCAwLjA2KSwgMHB4IDRweCA4cHggLTJweCByZ2JhKDE2LCAyNCwgNDAsIDAuMTApJztcclxuZXhwb3J0IGNvbnN0IFNNQUxMID0gJzBweCAxcHggMnB4IDBweCByZ2JhKDE2LCAyNCwgNDAsIDAuMDYpLCAwcHggMXB4IDNweCAwcHggcmdiYSgxNiwgMjQsIDQwLCAwLjEwKSc7XHJcbmV4cG9ydCBjb25zdCBNRURJVU1fVVAgPSAnMHB4IC0ycHggNHB4IC0ycHggcmdiYSgxNiwgMjQsIDQwLCAwLjA2KSwgMHB4IC00cHggOHB4IC0ycHggcmdiYSgxNiwgMjQsIDQwLCAwLjEwKSc7XHJcbiIsImltcG9ydCBDb250YWluZXIgZnJvbSAnLi4vY29tcG9uZW50cy9Db250YWluZXInO1xyXG5pbXBvcnQgeyBMQVJHRSB9IGZyb20gJy4vdGhlbWUvU2hhZG93cyc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCYXNlTW9kYWwgZXh0ZW5kcyBDb250YWluZXIge1xyXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHN1cGVyKCk7XHJcblx0XHR0aGlzLmZpbGwgPSAnd2hpdGUnO1xyXG5cdFx0dGhpcy5jb3JuZXJSYWRpdXMgPSA4O1xyXG5cdFx0dGhpcy5zdHlsZS5ib3hTaGFkb3cgPSBMQVJHRTtcclxuXHR9XHJcbn1cclxuY3VzdG9tRWxlbWVudHMuZGVmaW5lKCdiYXNlLW1vZGFsJywgQmFzZU1vZGFsKTtcclxuIiwiZXhwb3J0IGNvbnN0IEJMVUVfNzAwID0gJyMxNzVDRDMnO1xyXG5leHBvcnQgY29uc3QgQkxVRV8yMDAgPSAnI0IyRERGRic7XHJcbmV4cG9ydCBjb25zdCBQSU5LXzcwMCA9ICcjQzExNTc0JztcclxuZXhwb3J0IGNvbnN0IFBJTktfMjAwID0gJyNGQ0NFRUUnO1xyXG5leHBvcnQgY29uc3QgWUVMTE9XXzcwMCA9ICcjQTE1QzA3JztcclxuZXhwb3J0IGNvbnN0IFlFTExPV18yMDAgPSAnI0ZFRUU5NSc7XHJcbmV4cG9ydCBjb25zdCBQVVJQTEVfNzAwID0gJyM1OTI1REMnO1xyXG5leHBvcnQgY29uc3QgUFVSUExFXzIwMCA9ICcjRDlENkZFJztcclxuZXhwb3J0IGNvbnN0IEdSRUVOXzcwMCA9ICcjMDg3NDQzJztcclxuZXhwb3J0IGNvbnN0IEdSRUVOXzIwMCA9ICcjQUFGMEM0JztcclxuZXhwb3J0IGNvbnN0IFRFQUxfNzAwID0gJyMxMDc1NjknO1xyXG5leHBvcnQgY29uc3QgVEVBTF8yMDAgPSAnIzk5RjZFMCc7XHJcbmV4cG9ydCBjb25zdCBFUlJPUl83MDAgPSAnI0I0MjMxOCc7XHJcbmV4cG9ydCBjb25zdCBFUlJPUl8yMDAgPSAnI0ZFQ0RDQSc7XHJcblxyXG5leHBvcnQgY29uc3QgV0hJVEUgPSAnI0ZGRkZGRic7XHJcbmV4cG9ydCBjb25zdCBHUkFZXzUwID0gJyNGOUZBRkInO1xyXG5leHBvcnQgY29uc3QgR1JBWV8xMDAgPSAnI0YyRjRGNyc7XHJcbmV4cG9ydCBjb25zdCBHUkFZXzIwMCA9ICcjRUFFQ0YwJztcclxuZXhwb3J0IGNvbnN0IEdSQVlfMzAwID0gJyNEMEQ1REQnO1xyXG5leHBvcnQgY29uc3QgR1JBWV81MDAgPSAnIzY2NzA4NSc7XHJcbmV4cG9ydCBjb25zdCBHUkFZXzcwMCA9ICcjMzQ0MDU0JztcclxuZXhwb3J0IGNvbnN0IEdSQVlfOTAwID0gJyMxMDE4MjgnO1xyXG4iLCJpbXBvcnQgQ29udGFpbmVyIGZyb20gJy4uL2NvbXBvbmVudHMvQ29udGFpbmVyJztcclxuaW1wb3J0IElDb250YWluZXIgZnJvbSAnLi4vY29tcG9uZW50cy9JQ29udGFpbmVyJztcclxuaW1wb3J0IElMYWJlbCBmcm9tICcuLi9jb21wb25lbnRzL0lMYWJlbCc7XHJcbmltcG9ydCBMYWJlbCBmcm9tICcuLi9jb21wb25lbnRzL0xhYmVsJztcclxuaW1wb3J0IEJhc2VCdXR0b24gZnJvbSAnLi9CYXNlQnV0dG9uJztcclxuaW1wb3J0IEJhc2VNb2RhbCBmcm9tICcuL0Jhc2VNb2RhbCc7XHJcbmltcG9ydCB7IEVSUk9SXzcwMCwgR1JFRU5fNzAwIH0gZnJvbSAnLi90aGVtZS9Db2xvcnMnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2F0aXNmaWVkTW9kYWwgZXh0ZW5kcyBCYXNlTW9kYWwge1xyXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHN1cGVyKCk7XHJcblx0XHR0aGlzLmF1dG9MYXlvdXQgPSAnVkVSVElDQUwnO1xyXG5cdFx0dGhpcy5wYWRkaW5nID0gMzI7XHJcblx0XHR0aGlzLml0ZW1TcGFjaW5nID0gMzI7XHJcblx0XHR0aGlzLmFkZENvbXBvbmVudHMoW1xyXG5cdFx0XHR0aGlzLnRpdGxlTGFiZWwsXHJcblx0XHRcdHRoaXMuYWN0aW9ucyxcclxuXHRcdF0pO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfdGl0bGVMYWJlbCE6IElMYWJlbDtcclxuXHJcblx0cHJpdmF0ZSBnZXQgdGl0bGVMYWJlbCgpIHtcclxuXHRcdGlmICghdGhpcy5fdGl0bGVMYWJlbCkge1xyXG5cdFx0XHR0aGlzLl90aXRsZUxhYmVsID0gbmV3IExhYmVsKCk7XHJcblx0XHRcdHRoaXMuX3RpdGxlTGFiZWwuZm9udFNpemUgPSAzMjtcclxuXHRcdFx0dGhpcy5fdGl0bGVMYWJlbC5saW5lSGVpZ2h0ID0gMjY7XHJcblx0XHRcdHRoaXMuX3RpdGxlTGFiZWwuY29udGVudCA9ICdTYXRpc2ZpZWQgTW9kYWwnO1xyXG5cdFx0fVxyXG5cclxuXHRcdHJldHVybiB0aGlzLl90aXRsZUxhYmVsO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBfYWN0aW9ucyE6IElDb250YWluZXI7XHJcblxyXG5cdHByaXZhdGUgZ2V0IGFjdGlvbnMoKSB7XHJcblx0XHRpZiAoIXRoaXMuX2FjdGlvbnMpIHtcclxuXHRcdFx0dGhpcy5fYWN0aW9ucyA9IG5ldyBDb250YWluZXIoKTtcclxuXHRcdFx0dGhpcy5fYWN0aW9ucy53aWR0aCA9ICdGSUxMJztcclxuXHRcdFx0dGhpcy5fYWN0aW9ucy5hdXRvTGF5b3V0ID0gJ0hPUklaT05UQUwnO1xyXG5cdFx0XHR0aGlzLl9hY3Rpb25zLml0ZW1TcGFjaW5nID0gMTY7XHJcblx0XHRcdHRoaXMuYWN0aW9ucy5hbGlnbiA9ICdSSUdIVCc7XHJcblx0XHRcdHRoaXMuX2FjdGlvbnMuYWRkQ29tcG9uZW50cyhbXHJcblx0XHRcdFx0bmV3IEJhc2VCdXR0b24oJ1llcycsIEdSRUVOXzcwMCwgJ1NBVElTRklFRF9ZRVMnKSxcclxuXHRcdFx0XHRuZXcgQmFzZUJ1dHRvbignTm8nLCBFUlJPUl83MDAsICdTQVRJU0ZJRURfTk8nKSxcclxuXHRcdFx0XSk7XHJcblx0XHR9XHJcblxyXG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvbnM7XHJcblx0fVxyXG59XHJcbmN1c3RvbUVsZW1lbnRzLmRlZmluZSgnc2F0aXNmaWVkLW1vZGFsJywgU2F0aXNmaWVkTW9kYWwpO1xyXG4iLCJpbXBvcnQgeyBDb250ZXh0IH0gZnJvbSAnLi9Db250ZXh0JztcclxuaW1wb3J0IEZlZWRiYWNrTG9naWMgZnJvbSAnLi9GZWVkYmFja0xvZ2ljJztcclxuaW1wb3J0IEFwcGxpY2F0aW9uIGZyb20gJy4vY29tcG9uZW50cy9BcHBsaWNhdGlvbic7XHJcbmltcG9ydCB7IE1vZGFscyB9IGZyb20gJy4vdHlwZXMnO1xyXG5pbXBvcnQgU2F0aXNmaWVkTW9kYWwgZnJvbSAnLi91aS9TYXRpc2ZpZWRNb2RhbCc7XHJcbmltcG9ydCB7IEdSQVlfMTAwIH0gZnJvbSAnLi91aS90aGVtZS9Db2xvcnMnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9kZWxCYXNlZFRlc3RpbmcgZXh0ZW5kcyBBcHBsaWNhdGlvbiB7XHJcblx0cHVibGljIGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0c3VwZXIoKTtcclxuXHRcdHRoaXMuZmlsbCA9IEdSQVlfMTAwO1xyXG5cdFx0dGhpcy5hbGlnbiA9ICdDRU5URVInO1xyXG5cdFx0Q29udGV4dC5tb2RhbC5hZGQodGhpcy5tb2RhbENoYW5nZWQuYmluZCh0aGlzKSk7XHJcblx0XHRuZXcgRmVlZGJhY2tMb2dpYygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSByZWFkb25seSBzYXRpc2ZpZWRNb2RhbCA9IG5ldyBTYXRpc2ZpZWRNb2RhbCgpO1xyXG5cclxuXHRwcml2YXRlIG1vZGFsQ2hhbmdlZCh2YWx1ZTogTW9kYWxzKSB7XHJcblx0XHRjb25zb2xlLmxvZygnbW9kYWxDaGFuZ2VkJywgdmFsdWUpO1xyXG5cdFx0dGhpcy5yZW1vdmVBbGxDb21wb25lbnRzKCk7XHJcblx0XHRpZiAodmFsdWUgPT09ICdTYXRpc2ZpZWQnKSB7XHJcblx0XHRcdHRoaXMuYWRkQ29tcG9uZW50KHRoaXMuc2F0aXNmaWVkTW9kYWwpO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5jdXN0b21FbGVtZW50cy5kZWZpbmUoJ21vZGVsLWJhc2VkLXRlc3RpbmcnLCBNb2RlbEJhc2VkVGVzdGluZyk7XHJcbiJdLCJuYW1lcyI6WyJfX3B1YmxpY0ZpZWxkIiwiU1RBVEVfSURFTlRJRklFUiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7QUFFTyxNQUFNLFVBQWMsQ0FBQTtBQUFBLEVBS25CLFlBQVksS0FBVSxFQUFBO0FBSjdCLElBQVFBLGVBQUEsQ0FBQSxJQUFBLEVBQUEsUUFBQSxDQUFBLENBQUE7QUFFUixJQUFpQkEsZUFBQSxDQUFBLElBQUEsRUFBQSxXQUFBLENBQUEsQ0FBQTtBQUdoQixJQUFBLElBQUEsQ0FBSyxNQUFTLEdBQUEsS0FBQSxDQUFBO0FBQ2QsSUFBQSxJQUFBLENBQUssWUFBWSxFQUFDLENBQUE7QUFBQSxHQUNuQjtBQUFBLEVBRU8sSUFBSSxRQUF1QixFQUFBO0FBQ2pDLElBQUssSUFBQSxDQUFBLFNBQUEsQ0FBVSxLQUFLLFFBQVEsQ0FBQSxDQUFBO0FBQUEsR0FDN0I7QUFBQSxFQUVBLElBQVcsS0FBUSxHQUFBO0FBQ2xCLElBQUEsT0FBTyxJQUFLLENBQUEsTUFBQSxDQUFBO0FBQUEsR0FDYjtBQUFBLEVBRUEsSUFBVyxNQUFNLEtBQVUsRUFBQTtBQUMxQixJQUFJLElBQUEsSUFBQSxDQUFLLFdBQVcsS0FBTyxFQUFBO0FBQzFCLE1BQUEsSUFBQSxDQUFL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QUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMxQyxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsV0FBVyxFQUFFLEdBQUcsS0FBSztBQUMzRixNQUFNLE1BQU0sU0FBUyxHQUFHLElBQUksU0FBUyxDQUFDLFdBQVcsRUFBRTtBQUNuRCxRQUFRLE9BQU8sRUFBRSxJQUFJO0FBQ3JCLFFBQVEsSUFBSSxFQUFFLEdBQUc7QUFDakIsUUFBUSxRQUFRLEVBQUUsSUFBSSxDQUFDLE9BQU87QUFDOUIsT0FBTyxDQUFDLENBQUM7QUFDVCxNQUFNLE9BQU8sU0FBUyxDQUFDO0FBQ3ZCLEtBQUssQ0FBQyxHQUFHLFlBQVksQ0FBQztBQUN0QixJQUFJLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRTtBQUMxRCxNQUFNLE1BQU0sSUFBSSxLQUFLLENBQUMsQ0FBQyxxREFBcUQsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLDBCQUEwQixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztBQUN6SyxLQUFLO0FBQ0w7QUFDQTtBQUNBLElBQUksSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sS0FBSyxJQUFJLEdBQUcsU0FBUyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLEtBQUssQ0FBQztBQUMzRixJQUFJLElBQUksQ0FBQyxLQUFLLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7QUFDcEQsSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FB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
