// Phase 15 — 身份权重
// 权重 = 1 + 存在时间(年) + contribution*0.1，上限 10
class IdentityWeight {
  calculate(identity) {
    let weight = 1;
    if (identity.age)       weight += identity.age / 365;     // age 单位天
    if (identity.contribution) weight += identity.contribution * 0.1;
    if (identity.actions)    weight += identity.actions * 0.001;
    if (identity.endorsements) weight += identity.endorsements * 0.2;
    return Math.min(weight, 10);
  }

  tier(weight) {
    if (weight >= 5)  return 'established';
    if (weight >= 2)  return 'known';
    return 'new';
  }
}

module.exports = new IdentityWeight();
