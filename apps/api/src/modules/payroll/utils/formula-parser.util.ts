import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface FormulaToken {
  type: 'NUMBER' | 'IDENTIFIER' | 'OPERATOR' | 'LPAREN' | 'RPAREN';
  value: string;
}

/**
 * Safe, zero-eval Mathematical Formula Parser & Evaluator for Payroll Components.
 *
 * Guarantees:
 * - NO `eval()`, NO `Function()`, NO arbitrary code execution or SQL injection.
 * - Strict character whitelisting: only uppercase component identifiers, decimals, and basic math operators.
 * - Circular dependency detection via cycle checking in component dependency graphs.
 * - Exact financial precision using Prisma.Decimal arithmetic.
 */
export class FormulaParserUtil {
  private static readonly ALLOWED_CHARS_REGEX = /^[A-Z0-9_+\-*/().\s]+$/;
  private static readonly TOKEN_REGEX =
    /\s*([A-Z_][A-Z0-9_]*|\d+(?:\.\d+)?|[+\-*/()]|[^A-Z0-9_+\-*/().\s]+)\s*/g;

  /**
   * Validate formula syntax, ensure safe tokens, and extract variable dependencies.
   */
  static validateAndExtractDependencies(formula: string): string[] {
    const trimmed = formula.trim();
    if (!trimmed) {
      throw new BadRequestException('Formula cannot be empty');
    }

    if (!this.ALLOWED_CHARS_REGEX.test(trimmed)) {
      throw new BadRequestException(
        'Formula contains invalid characters. Only uppercase alphanumeric codes, decimals, and operators (+, -, *, /, ()) are allowed.',
      );
    }

    const tokens = this.tokenize(trimmed);
    if (tokens.length === 0) {
      throw new BadRequestException('No valid tokens found in formula');
    }

    // Check parenthesis balance
    let parenDepth = 0;
    for (const t of tokens) {
      if (t.type === 'LPAREN') parenDepth++;
      if (t.type === 'RPAREN') parenDepth--;
      if (parenDepth < 0) {
        throw new BadRequestException('Mismatched closing parenthesis in formula');
      }
    }
    if (parenDepth !== 0) {
      throw new BadRequestException('Unclosed parenthesis in formula');
    }

    // Extract unique identifier dependencies
    const dependencies = new Set<string>();
    for (const token of tokens) {
      if (token.type === 'IDENTIFIER') {
        dependencies.add(token.value);
      }
    }

    return Array.from(dependencies);
  }

  /**
   * Detect circular dependencies in a set of structure component formulas.
   */
  static detectCircularDependencies(componentDependencies: Map<string, string[]>): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const checkCycle = (node: string, path: string[]) => {
      visited.add(node);
      inStack.add(node);

      const neighbors = componentDependencies.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          checkCycle(neighbor, [...path, neighbor]);
        } else if (inStack.has(neighbor)) {
          const cyclePath = [...path, neighbor].join(' -> ');
          throw new BadRequestException(
            `Circular dependency detected in salary formula: ${cyclePath}`,
          );
        }
      }

      inStack.delete(node);
    };

    for (const node of componentDependencies.keys()) {
      if (!visited.has(node)) {
        checkCycle(node, [node]);
      }
    }
  }

  /**
   * Safely evaluate formula with given variable context using Decimal math.
   */
  static evaluate(formula: string, context: Record<string, Prisma.Decimal>): Prisma.Decimal {
    const tokens = this.tokenize(formula);
    const rpn = this.shuntingYard(tokens);
    return this.evaluateRpn(rpn, context);
  }

  private static tokenize(formula: string): FormulaToken[] {
    const tokens: FormulaToken[] = [];
    let match: RegExpExecArray | null;
    this.TOKEN_REGEX.lastIndex = 0;

    while ((match = this.TOKEN_REGEX.exec(formula)) !== null) {
      const val = match[1];
      if (!val) continue;

      if (/^\d+(?:\.\d+)?$/.test(val)) {
        tokens.push({ type: 'NUMBER', value: val });
      } else if (/^[A-Z_][A-Z0-9_]*$/.test(val)) {
        tokens.push({ type: 'IDENTIFIER', value: val });
      } else if (val === '(') {
        tokens.push({ type: 'LPAREN', value: val });
      } else if (val === ')') {
        tokens.push({ type: 'RPAREN', value: val });
      } else if (['+', '-', '*', '/'].includes(val)) {
        tokens.push({ type: 'OPERATOR', value: val });
      } else {
        throw new BadRequestException(`Disallowed token in formula: '${val}'`);
      }
    }

    return tokens;
  }

  private static shuntingYard(tokens: FormulaToken[]): FormulaToken[] {
    const output: FormulaToken[] = [];
    const opStack: FormulaToken[] = [];

    const precedence: Record<string, number> = {
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2,
    };

    for (const token of tokens) {
      if (token.type === 'NUMBER' || token.type === 'IDENTIFIER') {
        output.push(token);
      } else if (token.type === 'OPERATOR') {
        while (
          opStack.length > 0 &&
          opStack[opStack.length - 1].type === 'OPERATOR' &&
          precedence[opStack[opStack.length - 1].value] >= precedence[token.value]
        ) {
          output.push(opStack.pop()!);
        }
        opStack.push(token);
      } else if (token.type === 'LPAREN') {
        opStack.push(token);
      } else if (token.type === 'RPAREN') {
        while (opStack.length > 0 && opStack[opStack.length - 1].type !== 'LPAREN') {
          output.push(opStack.pop()!);
        }
        if (opStack.length === 0) {
          throw new BadRequestException('Mismatched parentheses in formula');
        }
        opStack.pop(); // discard LPAREN
      }
    }

    while (opStack.length > 0) {
      const top = opStack.pop()!;
      if (top.type === 'LPAREN') {
        throw new BadRequestException('Mismatched parentheses in formula');
      }
      output.push(top);
    }

    return output;
  }

  private static evaluateRpn(
    rpn: FormulaToken[],
    context: Record<string, Prisma.Decimal>,
  ): Prisma.Decimal {
    const stack: Prisma.Decimal[] = [];

    for (const token of rpn) {
      if (token.type === 'NUMBER') {
        stack.push(new Prisma.Decimal(token.value));
      } else if (token.type === 'IDENTIFIER') {
        const val = context[token.value];
        if (val === undefined || val === null) {
          throw new BadRequestException(
            `Variable '${token.value}' referenced in formula is not defined in calculation context`,
          );
        }
        stack.push(val);
      } else if (token.type === 'OPERATOR') {
        if (stack.length < 2) {
          throw new BadRequestException('Invalid formula syntax: insufficient operands');
        }
        const b = stack.pop()!;
        const a = stack.pop()!;

        let res: Prisma.Decimal;
        switch (token.value) {
          case '+':
            res = a.plus(b);
            break;
          case '-':
            res = a.minus(b);
            break;
          case '*':
            res = a.times(b);
            break;
          case '/':
            if (b.isZero()) {
              throw new BadRequestException('Division by zero in payroll formula');
            }
            res = a.dividedBy(b);
            break;
          default:
            throw new BadRequestException(`Unsupported operator: ${token.value}`);
        }
        stack.push(res);
      }
    }

    if (stack.length !== 1) {
      throw new BadRequestException('Invalid formula: multiple unresolved results');
    }

    return stack[0];
  }

  /**
   * Apply statutory financial rounding rules using Prisma.Decimal.
   */
  static round(value: Prisma.Decimal, rule = 'HALF_UP', precision = 2): Prisma.Decimal {
    switch (rule) {
      case 'UP':
        return value.toDecimalPlaces(precision, Prisma.Decimal.ROUND_UP);
      case 'DOWN':
        return value.toDecimalPlaces(precision, Prisma.Decimal.ROUND_DOWN);
      case 'NEAREST_INTEGER':
        return value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
      case 'HALF_UP':
      default:
        return value.toDecimalPlaces(precision, Prisma.Decimal.ROUND_HALF_UP);
    }
  }
}
