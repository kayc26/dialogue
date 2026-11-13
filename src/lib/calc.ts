// A small arithmetic evaluator for the `calculator` tool.
//
// Never `eval`: the expression comes from model output, which can be steered by
// prompt injection, and anything eval runs could read the API key from
// localStorage (ADR-0001). This parser only knows numbers, operators, a fixed
// set of functions and two constants — there is nothing else for it to reach.
//
// Grammar (lowest to highest precedence):
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/' | '%') unary)*
//   unary   := ('+' | '-') unary | power
//   power   := primary ('^' unary)?          right-associative; -2^2 = -4, 2^-1 = 0.5
//   primary := number | constant | func '(' expr (',' expr)* ')' | '(' expr ')'

const FUNCS: Record<string, { fn: (...a: number[]) => number; arity: number | 'variadic' }> = {
  sqrt: { fn: Math.sqrt, arity: 1 },
  cbrt: { fn: Math.cbrt, arity: 1 },
  abs: { fn: Math.abs, arity: 1 },
  sin: { fn: Math.sin, arity: 1 },
  cos: { fn: Math.cos, arity: 1 },
  tan: { fn: Math.tan, arity: 1 },
  asin: { fn: Math.asin, arity: 1 },
  acos: { fn: Math.acos, arity: 1 },
  atan: { fn: Math.atan, arity: 1 },
  ln: { fn: Math.log, arity: 1 },
  log: { fn: Math.log10, arity: 1 },
  log2: { fn: Math.log2, arity: 1 },
  exp: { fn: Math.exp, arity: 1 },
  floor: { fn: Math.floor, arity: 1 },
  ceil: { fn: Math.ceil, arity: 1 },
  round: { fn: Math.round, arity: 1 },
  pow: { fn: Math.pow, arity: 2 },
  min: { fn: Math.min, arity: 'variadic' },
  max: { fn: Math.max, arity: 'variadic' },
}

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

type Token = { kind: 'num'; value: number } | { kind: 'id'; value: string } | { kind: 'op'; value: string }

export class CalcError extends Error {}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const num = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))
    if (num) {
      tokens.push({ kind: 'num', value: Number(num[0]) })
      i += num[0].length
      continue
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))
    if (id) {
      tokens.push({ kind: 'id', value: id[0].toLowerCase() })
      i += id[0].length
      continue
    }
    if (src.startsWith('**', i)) {
      tokens.push({ kind: 'op', value: '^' }) // models often write Python-style powers
      i += 2
      continue
    }
    if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch })
      i++
      continue
    }
    throw new CalcError(`Unexpected character '${ch}' at position ${i + 1}`)
  }
  return tokens
}

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    if (this.tokens.length === 0) throw new CalcError('Empty expression')
    const v = this.expr()
    const extra = this.tokens[this.pos]
    if (extra) throw new CalcError(`Unexpected '${extra.value}' after the end of the expression`)
    return v
  }

  private peekOp(...ops: string[]): string | null {
    const t = this.tokens[this.pos]
    return t?.kind === 'op' && ops.includes(t.value) ? t.value : null
  }

  private expect(op: string): void {
    if (this.peekOp(op) === null) throw new CalcError(`Expected '${op}'`)
    this.pos++
  }

  private expr(): number {
    let v = this.term()
    for (let op = this.peekOp('+', '-'); op; op = this.peekOp('+', '-')) {
      this.pos++
      const r = this.term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  private term(): number {
    let v = this.unary()
    for (let op = this.peekOp('*', '/', '%'); op; op = this.peekOp('*', '/', '%')) {
      this.pos++
      const r = this.unary()
      if ((op === '/' || op === '%') && r === 0) throw new CalcError('Division by zero')
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }

  private unary(): number {
    const op = this.peekOp('+', '-')
    if (op) {
      this.pos++
      const v = this.unary()
      return op === '-' ? -v : v
    }
    return this.power()
  }

  private power(): number {
    const base = this.primary()
    if (this.peekOp('^')) {
      this.pos++
      return Math.pow(base, this.unary())
    }
    return base
  }

  private primary(): number {
    const t = this.tokens[this.pos]
    if (!t) throw new CalcError('Unexpected end of expression')
    if (t.kind === 'num') {
      this.pos++
      return t.value
    }
    if (t.kind === 'op' && t.value === '(') {
      this.pos++
      const v = this.expr()
      this.expect(')')
      return v
    }
    if (t.kind === 'id') {
      this.pos++
      // Object.hasOwn: names like "constructor" or "__proto__" must not resolve through the prototype.
      if (this.peekOp('(')) {
        if (!Object.hasOwn(FUNCS, t.value)) throw new CalcError(`Unknown function '${t.value}'`)
        const f = FUNCS[t.value]!
        this.pos++
        const args = [this.expr()]
        while (this.peekOp(',')) {
          this.pos++
          args.push(this.expr())
        }
        this.expect(')')
        if (f.arity !== 'variadic' && args.length !== f.arity) {
          throw new CalcError(`${t.value}() takes ${f.arity} argument${f.arity === 1 ? '' : 's'}, got ${args.length}`)
        }
        return f.fn(...args)
      }
      if (Object.hasOwn(CONSTS, t.value)) return CONSTS[t.value]!
      throw new CalcError(`Unknown name '${t.value}'`)
    }
    throw new CalcError(`Unexpected '${t.value}'`)
  }
}

/** Evaluates an arithmetic expression. Throws CalcError with a readable message on bad input. */
export function evaluate(expression: string): number {
  const v = new Parser(tokenize(expression)).parse()
  if (!Number.isFinite(v)) throw new CalcError('The result is not a finite number')
  return v
}

/** Evaluates and formats: 15 significant digits, so 0.1 + 0.2 reads as 0.3 rather than 0.30000000000000004. */
export function calculate(expression: string): string {
  return String(Number(evaluate(expression).toPrecision(15)))
}
