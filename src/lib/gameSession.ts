import { GrowthGame } from './growthGame';
import type { GrowthSide } from './GrowthSimulation';
import type { IBasicsRecord } from '../interfaces/IBasicsRecord';
type Adjustment = { side: GrowthSide; value: number; advance?: true };

// User gestures are undo units. Replaying the inputs restores the existing
// network and personal ledger together, without cloning private engine state.
export class GameSession {
  game: GrowthGame;
  actions: Adjustment[] = [];
  private history: Adjustment[][] = [];
  private dragStart?: Adjustment[];
  private dragValues?: { mining: number; vaulting: number };
  private dragRecorded = false;
  constructor(private readonly data: IBasicsRecord, private readonly initialCapital = 10_000) { this.game = new GrowthGame(data, initialCapital); }
  get canUndo() { return this.history.length > 0; }
  advanceCompetition(side: GrowthSide) {
    this.endDrag();
    const { maximum } = this.game.bounds(side);
    if (maximum > this.game.value(side)) {
      // Playback is a slider gesture at its endpoint, sharing settlement,
      // competition limits, and undo history with manual adjustments.
      this.beginDrag();
      const changed = this.drag(side, maximum);
      this.endDrag();
      if (changed) return true;
    }
    return this.advanceDay(side);
  }
  advanceDay(side: GrowthSide) {
    this.endDrag();
    if (!this.game.advanceDay(side)) return false;
    this.history.push([...this.actions]);
    this.actions = [...this.actions, { side, value: this.game.value(side), advance: true }];
    return true;
  }
  private replay(actions: Adjustment[]) {
    this.game = new GrowthGame(this.data, this.initialCapital);
    for (const action of actions) {
      if (action.advance) this.game.advanceDay(action.side);
      else this.game.setValue(action.side, action.value);
    }
  }
  increment(side: GrowthSide) {
    this.endDrag();
    const before = this.game.view;
    this.game.increment(side);
    if (this.game.view === before) return false;
    this.history.push([...this.actions]);
    this.actions = [...this.actions, { side, value: this.game.value(side) }];
    return true;
  }
  beginDrag() {
    this.endDrag();
    this.dragStart = [...this.actions];
    this.dragValues = { mining: this.game.miners, vaulting: this.game.bitcoin };
    this.dragRecorded = false;
  }
  drag(side: GrowthSide, value: number) {
    if (!Number.isFinite(value)) return false;
    if (!this.dragStart) this.beginDrag();
    const previous = this.game.value(side);
    this.game.setValue(side, value);
    if (previous === this.game.value(side)) return false;
    if (!this.dragRecorded) { this.history.push(this.dragStart!); this.dragRecorded = true; }
    this.actions = [...this.dragStart!, { side, value: this.game.value(side) }];
    return true;
  }
  endDrag() {
    if (this.dragStart && this.dragValues
      && this.game.miners === this.dragValues.mining
      && Math.abs(this.game.bitcoin - this.dragValues.vaulting) < 1e-10) {
      if (this.dragRecorded) this.history.pop();
      this.actions = this.dragStart;
      // Restore phase state too: visiting the other side must not commit a no-op.
      this.replay(this.actions);
    }
    this.dragStart = undefined;
    this.dragValues = undefined;
    this.dragRecorded = false;
  }
  undo() {
    this.endDrag();
    const actions = this.history.pop();
    if (!actions) return false;
    this.replay(actions);
    this.actions = actions;
    return true;
  }
}
