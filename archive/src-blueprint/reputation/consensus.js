// Phase 14 — 多节点评价共识
// 输入多个节点对该用户的分 → 中位数加权平均（防御离群点）
class Consensus {
  calculate(scores) {
    if (!Array.isArray(scores) || scores.length === 0) return 500;
    const arr = scores.slice().sort((a, b) => a - b);
    // 去掉首尾各 10% 极端值
    const trim = Math.max(1, Math.floor(arr.length * 0.1));
    const trimmed = arr.length > 4 ? arr.slice(trim, arr.length - trim) : arr;
    const total = trimmed.reduce((s, v) => s + v, 0);
    return Math.round(total / trimmed.length);
  }

  // 计算离群度（方差/mean^2）
  variance(scores) {
    if (scores.length < 2) return 0;
    const mean = this.calculate(scores);
    const sum = scores.reduce((s, v) => s + (v - mean) ** 2, 0);
    return sum / (scores.length * mean * mean);
  }
}

module.exports = new Consensus();
