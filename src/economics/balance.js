// Phase 18 — 余额系统
class Balance {
  constructor() { this.accounts = new Map(); }

  add(id, value) {
    const cur = this.accounts.get(id) || 0;
    this.accounts.set(id, cur + value);
    return this.accounts.get(id);
  }

  get(id) { return this.accounts.get(id) || 0; }

  subtract(id, value) {
    const cur = this.accounts.get(id) || 0;
    if (cur < value) throw new Error('Insufficient balance: ' + cur + ' < ' + value);
    this.accounts.set(id, cur - value);
    return this.accounts.get(id);
  }

  transfer(from, to, value) {
    this.subtract(from, value);
    this.add(to, value);
    return { from: this.get(from), to: this.get(to), amount: value };
  }

  rank() {
    const arr = [...this.accounts.entries()].map(([id, v]) => ({ id, balance: v }));
    arr.sort((a, b) => b.balance - a.balance);
    return arr;
  }
}

module.exports = new Balance();
