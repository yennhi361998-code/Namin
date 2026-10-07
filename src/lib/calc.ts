/** Expression typed on the amount keypad, e.g. "45000+30000×2". */
export type Op = '+' | '−' | '×' | '÷';
const OPS: Op[] = ['+', '−', '×', '÷'];
const MAX_LEN = 24;

const isOp = (c: string): c is Op => (OPS as string[]).includes(c);

export function press(expr: string, key: string): string {
  if (key === 'back') return expr.slice(0, -1);
  if (key === 'clear') return '';
  if (expr.length >= MAX_LEN) return expr;
  const last = expr.slice(-1);
  if (isOp(key)) {
    if (!expr) return expr; // can't start with an operator
    return isOp(last) ? expr.slice(0, -1) + key : expr + key; // tapping a second operator swaps it
  }
  const current = expr.split(/[+−×÷]/).pop() ?? '';
  if (key === '.') {
    if (current.includes('.')) return expr;
    return expr + (current ? '.' : '0.');
  }
  if (/^0+$/.test(key) && (current === '' || current === '0')) return current === '' ? expr + '0' : expr; // "000" can't start a number
  if (/^\d+$/.test(key)) {
    if (current === '0') return expr.slice(0, -1) + key.replace(/^0+(?=\d)/, '') || expr; // no leading zeros
    return expr + key;
  }
  return expr;
}

/** Evaluates with × ÷ before + −. Trailing operator is ignored. Null when there's nothing to evaluate. */
export function evaluate(expr: string): number | null {
  const clean = isOp(expr.slice(-1)) ? expr.slice(0, -1) : expr;
  if (!clean) return null;
  const tokens = clean.match(/\d*\.?\d+|\d+\.|[+−×÷]/g);
  if (!tokens) return null;
  const nums: number[] = [Number(tokens[0])];
  const adds: Op[] = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as Op;
    const n = Number(tokens[i + 1]);
    if (op === '×') nums[nums.length - 1] *= n;
    else if (op === '÷') nums[nums.length - 1] = n === 0 ? NaN : nums[nums.length - 1] / n;
    else {
      adds.push(op);
      nums.push(n);
    }
  }
  let total = nums[0];
  adds.forEach((op, i) => (total = op === '+' ? total + nums[i + 1] : total - nums[i + 1]));
  return Number.isFinite(total) ? total : null;
}

/** True once there's something to calculate, e.g. "5+2" (not "5+"). */
export const hasOperator = (expr: string) => /[+−×÷]\d/.test(expr);
