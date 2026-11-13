import { describe, expect, it } from 'vitest'
import { calculate } from './calc'

describe('calculate (the calculator tool)', () => {
  it.each([
    ['2 + 3 * 4', '14'],
    ['(2 + 3) * 4', '20'],
    ['2^3^2', '512'], // right-associative, as in math
    ['-2^2', '-4'], // the power binds tighter than the minus
    ['2^-1', '0.5'],
    ['2**10', '1024'], // Python-style, which models often emit
    ['10 % 3', '1'],
    ['sqrt(16) + abs(-3)', '7'],
    ['max(3, 9, 4) - min(5, 2)', '7'],
    ['round(pi * 100) / 100', '3.14'],
    ['1.5e3 / 3', '500'],
    ['0.1 + 0.2', '0.3'], // shown as 0.3, not 0.30000000000000004
  ])('%s = %s', (expr, want) => {
    expect(calculate(expr)).toBe(want)
  })

  it('reports division by zero instead of returning Infinity', () => {
    expect(() => calculate('1/0')).toThrow('Division by zero')
    expect(() => calculate('5 % (2-2)')).toThrow('Division by zero')
  })

  it('refuses anything that is not arithmetic, even when the model is steered to try', () => {
    // Inputs a prompt-injected model might send. None may reach JavaScript.
    expect(() => calculate('alert(1)')).toThrow("Unknown function 'alert'")
    expect(() => calculate('constructor')).toThrow("Unknown name 'constructor'")
    expect(() => calculate('__proto__')).toThrow("Unknown name '__proto__'")
    expect(() => calculate('toString(1)')).toThrow("Unknown function 'tostring'")
    expect(() => calculate('1; fetch("x")')).toThrow("Unexpected character ';'")
  })

  it('gives readable errors for malformed input', () => {
    expect(() => calculate('')).toThrow('Empty expression')
    expect(() => calculate('2 +')).toThrow('Unexpected end of expression')
    expect(() => calculate('(1 + 2')).toThrow("Expected ')'")
    expect(() => calculate('2 2')).toThrow("Unexpected '2' after the end")
    expect(() => calculate('sqrt(1, 2)')).toThrow('sqrt() takes 1 argument, got 2')
  })
})
