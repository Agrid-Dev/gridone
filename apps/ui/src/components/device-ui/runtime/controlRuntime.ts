import type { Scalar } from "../conditions";

/**
 * Command runtime shared by every interactive representation of a device
 * page (form controls and the face). It owns the *intentions* per attribute
 * and serialises their writes, as the device-presentation ADR §4 requires:
 *
 * - an intention is what the user asked last; a discrete action is sent at
 *   once, repeated increments are grouped by a debounce (600 ms by default);
 * - at most one write is in flight per attribute; a newer intention
 *   replaces the *pending* one, never a command already sent, and is sent
 *   when the in-flight write completes;
 * - the displayed value is the newest intention while one exists, then the
 *   reported value; a reported update (device sync, WebSocket) never
 *   overrides a newer intention, and an intention is never a measurement;
 * - a failed or unconfirmed write shows the reported value and the real
 *   outcome; nothing is retried automatically;
 * - detaching (device change, unmount) cancels pending timers and ignores
 *   late completions until the runtime is attached again — React may run an
 *   effect cleanup and re-run the effect on the same instance.
 *
 * The runtime is framework-agnostic; `useDeviceControlRuntime` binds it to
 * a device and the SDK client.
 */

export type WriteOutcome =
  | { kind: "cancelled" }
  | { kind: "ok" }
  | { kind: "error"; message: string }
  | { kind: "unconfirmed"; message: string };

export type WriteState =
  | { kind: "idle" }
  | { kind: "sending"; requested: Scalar }
  | { kind: "confirmed"; requested: Scalar }
  | { kind: "error" | "unconfirmed"; requested: Scalar; message: string };

export type ControlSnapshot = {
  confirming?: boolean;
  /** Last value reported by the device (null when unknown). */
  reported: Scalar | null;
  /** What the representations show: the newest intention, else reported. */
  displayed: Scalar | null;
  write: WriteState;
  /** An intention is waiting for its debounce or for the in-flight write. */
  pending: boolean;
};

export type PreparedSend = { kind: "send"; send: () => Promise<WriteOutcome> };
export type Prepared =
  | PreparedSend
  | { kind: "confirm"; confirm: () => Promise<PreparedSend | WriteOutcome> }
  | WriteOutcome;

/** Preview first; the runtime locks only a returned human-confirmation step. */
export type AttributeWriter = (
  attribute: string,
  value: Scalar,
  signal: AbortSignal,
) => Prepared | Promise<Prepared>;

export const DEFAULT_DEBOUNCE_MS = 600;

type Intent = {
  value: Scalar;
  seq: number;
  resolve: (outcome: WriteOutcome) => void;
};

type AttributeState = {
  preparing: Intent | null;
  confirming: boolean;
  abort: AbortController | null;
  pending: Intent | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Intent | null;
  write: WriteState;
};

const IDLE: WriteState = { kind: "idle" };

export class ControlRuntime {
  private readonly reported = new Map<string, Scalar | null>();
  private readonly states = new Map<string, AttributeState>();
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private detached = false;
  /** Bumped on every notification; a cheap changing snapshot for React. */
  version = 0;

  constructor(
    private readonly writer: AttributeWriter,
    private readonly debounceMs = DEFAULT_DEBOUNCE_MS,
  ) {}

  /** Includes writes already sent, even if their control disappeared on reload. */
  get busy(): boolean {
    return [...this.states.values()].some(
      (state) =>
        state.pending !== null ||
        state.inFlight !== null ||
        state.preparing !== null,
    );
  }

  /** Reported values from the device; never touches intentions. */
  setReported(attribute: string, value: Scalar | null): void {
    if (this.reported.get(attribute) === value && this.reported.has(attribute))
      return;
    this.reported.set(attribute, value);
    this.notify();
  }

  snapshot(attribute: string): ControlSnapshot {
    const reported = this.reported.get(attribute) ?? null;
    const state = this.states.get(attribute);
    const intent =
      state?.pending ?? state?.preparing ?? state?.inFlight ?? null;
    return {
      reported,
      displayed: intent ? intent.value : reported,
      write: state?.write ?? IDLE,
      pending:
        state?.pending != null ||
        (state?.preparing != null && !state.confirming),
      ...(state?.confirming ? { confirming: true } : {}),
    };
  }

  /**
   * Record an intention. Discrete actions pass `immediate`; increments are
   * debounced so a burst produces one command (a burst during an in-flight
   * write produces one more once it completes).
   */
  request(
    attribute: string,
    value: Scalar,
    { immediate = false }: { immediate?: boolean } = {},
  ): Promise<WriteOutcome> {
    const state = this.state(attribute);
    if (this.detached || state.confirming)
      return Promise.resolve({ kind: "cancelled" });
    state.pending?.resolve({ kind: "cancelled" });
    this.seq += 1;
    let resolve!: (outcome: WriteOutcome) => void;
    const result = new Promise<WriteOutcome>((done) => {
      resolve = done;
    });
    state.pending = { value, seq: this.seq, resolve };
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (immediate) {
      this.flush(attribute);
    } else {
      state.timer = setTimeout(() => {
        state.timer = null;
        this.flush(attribute);
      }, this.debounceMs);
    }
    this.notify();
    return result;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Accept intentions and completions again after a `detach`. */
  attach(): void {
    this.detached = false;
  }

  /** Cancel every pending intention and ignore late completions. */
  detach(): void {
    this.detached = true;
    for (const state of this.states.values()) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.pending?.resolve({ kind: "cancelled" });
      state.preparing?.resolve({ kind: "cancelled" });
      state.pending = null;
      state.confirming = false;
      state.abort?.abort();
      state.abort = null;
      state.preparing = null;
    }
  }

  private state(attribute: string): AttributeState {
    let state = this.states.get(attribute);
    if (!state) {
      state = {
        pending: null,
        timer: null,
        inFlight: null,
        preparing: null,
        confirming: false,
        abort: null,
        write: IDLE,
      };
      this.states.set(attribute, state);
    }
    return state;
  }

  /** Preview without dropping newer intentions; consent and transport remain serialized. */
  private flush(attribute: string): void {
    const state = this.state(attribute);
    if (state.inFlight || state.preparing || !state.pending) return;
    const intent = state.pending;
    state.pending = null;
    state.preparing = intent;
    const abort = new AbortController();
    state.abort = abort;
    try {
      const prepared = this.writer(attribute, intent.value, abort.signal);
      if (prepared instanceof Promise) {
        this.notify();
        void prepared.then(
          (result) => this.prepared(attribute, intent, abort, result),
          (error: unknown) => this.complete(attribute, intent, failed(error)),
        );
      } else this.prepared(attribute, intent, abort, prepared);
    } catch (error) {
      this.complete(attribute, intent, failed(error));
    }
  }

  private prepared(
    attribute: string,
    intent: Intent,
    abort: AbortController,
    result: Prepared,
  ): void {
    if (this.detached || abort.signal.aborted) return;
    const state = this.state(attribute);
    if (result.kind === "confirm") {
      // A warning preview for an older click must never open a stale dialog.
      // Keep the newer intention's debounce before preparing it again.
      if (state.pending) {
        this.complete(attribute, intent, { kind: "cancelled" });
        return;
      }
      state.confirming = true;
      this.notify();
      void result.confirm().then(
        (confirmed) => this.prepared(attribute, intent, abort, confirmed),
        (error: unknown) => this.complete(attribute, intent, failed(error)),
      );
    } else if (result.kind === "send") {
      state.preparing = null;
      state.confirming = false;
      state.inFlight = intent;
      state.write = { kind: "sending", requested: intent.value };
      this.notify();
      void result.send().then(
        (outcome) => this.complete(attribute, intent, outcome),
        (error: unknown) => this.complete(attribute, intent, failed(error)),
      );
    } else this.complete(attribute, intent, result);
  }

  /** One outcome mapping for preview failures, cancelled consent and transport results. */
  private complete(
    attribute: string,
    intent: Intent,
    outcome: WriteOutcome,
  ): void {
    intent.resolve(this.detached ? { kind: "cancelled" } : outcome);
    const state = this.state(attribute);
    if (
      state.inFlight?.seq !== intent.seq &&
      state.preparing?.seq !== intent.seq
    )
      return;
    state.inFlight = null;
    state.preparing = null;
    state.confirming = false;
    state.abort = null;
    if (this.detached) return;
    if (state.pending) {
      if (!state.timer) this.flush(attribute);
    } else {
      state.write = outcomeState(outcome, intent.value);
    }
    this.notify();
  }

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

function outcomeState(outcome: WriteOutcome, requested: Scalar): WriteState {
  if (outcome.kind === "cancelled") return IDLE;
  if (outcome.kind === "ok") return { kind: "confirmed", requested };
  return { ...outcome, requested };
}

function failed(error: unknown): WriteOutcome {
  return {
    kind: "error",
    message: error instanceof Error ? error.message : String(error),
  };
}
