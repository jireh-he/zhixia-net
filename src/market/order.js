// Phase 19 — 需求订单
class Order {
  constructor(data) {
    this.id = 'order:' + Date.now();
    this.requester = data.requester;
    this.type = data.type;
    this.amount = data.amount;
    this.status = 'open';
    this.created = Date.now();
  }
}

module.exports = Order;
