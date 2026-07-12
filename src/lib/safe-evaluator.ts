type TokenType = "NUMBER" | "STRING" | "BOOLEAN" | "IDENTIFIER" | "OPERATOR" | "LPAREN" | "RPAREN";

export interface Token {
  type: TokenType;
  value: string;
}

const PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
  "UNARY_MINUS": 7,
  "UNARY_NOT": 7,
};

const ASSOCIATIVITY: Record<string, "LEFT" | "RIGHT"> = {
  "||": "LEFT",
  "&&": "LEFT",
  "==": "LEFT",
  "!=": "LEFT",
  "<": "LEFT",
  "<=": "LEFT",
  ">": "LEFT",
  ">=": "LEFT",
  "+": "LEFT",
  "-": "LEFT",
  "*": "LEFT",
  "/": "LEFT",
  "%": "LEFT",
  "UNARY_MINUS": "RIGHT",
  "UNARY_NOT": "RIGHT",
};

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    // String literals (single or double quotes)
    if (char === '"' || char === "'") {
      const quote = char;
      let val = "";
      i++; // skip quote
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\") {
          i++; // skip escape character and get next
        }
        val += expr[i];
        i++;
      }
      if (i >= expr.length) {
        throw new Error("Unterminated string literal");
      }
      i++; // skip closing quote
      tokens.push({ type: "STRING", value: val });
      continue;
    }

    // Numbers (integers and floats)
    if (/\d/.test(char) || (char === "." && /\d/.test(expr[i + 1] || ""))) {
      let val = "";
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === ".")) {
        val += expr[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value: val });
      continue;
    }

    // Two-character operators
    const twoChar = expr.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(twoChar)) {
      tokens.push({ type: "OPERATOR", value: twoChar });
      i += 2;
      continue;
    }

    // One-character operators
    if (["+", "-", "*", "/", "%", "<", ">", "!"].includes(char)) {
      tokens.push({ type: "OPERATOR", value: char });
      i++;
      continue;
    }

    // Identifiers (variables like x, a, param_1, etc.)
    if (/[a-zA-Z_]/.test(char)) {
      let val = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        val += expr[i];
        i++;
      }

      if (val === "true") {
        tokens.push({ type: "BOOLEAN", value: "true" });
      } else if (val === "false") {
        tokens.push({ type: "BOOLEAN", value: "false" });
      } else {
        tokens.push({ type: "IDENTIFIER", value: val });
      }
      continue;
    }

    throw new Error(`Unexpected character: "${char}" at index ${i}`);
  }

  return tokens;
}

export function toPostfix(tokens: Token[]): Token[] {
  const outputQueue: Token[] = [];
  const operatorStack: Token[] = [];

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];

    if (
      token.type === "NUMBER" ||
      token.type === "STRING" ||
      token.type === "BOOLEAN" ||
      token.type === "IDENTIFIER"
    ) {
      outputQueue.push(token);
    } else if (token.type === "OPERATOR") {
      const opToken = { ...token };

      // Determine if this is a unary operator
      const prev = idx > 0 ? tokens[idx - 1] : null;
      const isUnary =
        !prev || prev.type === "LPAREN" || prev.type === "OPERATOR";

      if (isUnary) {
        if (opToken.value === "-") {
          opToken.value = "UNARY_MINUS";
        } else if (opToken.value === "!") {
          opToken.value = "UNARY_NOT";
        } else {
          throw new Error(`Invalid unary operator: ${opToken.value}`);
        }
      }

      const p1 = PRECEDENCE[opToken.value] || 0;
      const assoc = ASSOCIATIVITY[opToken.value] || "LEFT";

      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1];
        if (top.type !== "OPERATOR") {
          break;
        }

        const p2 = PRECEDENCE[top.value] || 0;
        if ((assoc === "LEFT" && p1 <= p2) || (assoc === "RIGHT" && p1 < p2)) {
          outputQueue.push(operatorStack.pop()!);
        } else {
          break;
        }
      }

      operatorStack.push(opToken);
    } else if (token.type === "LPAREN") {
      operatorStack.push(token);
    } else if (token.type === "RPAREN") {
      let popped = false;
      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1];
        if (top.type === "LPAREN") {
          operatorStack.pop();
          popped = true;
          break;
        }
        outputQueue.push(operatorStack.pop()!);
      }
      if (!popped) {
        throw new Error("Mismatched parentheses (extra right parenthesis)");
      }
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top.type === "LPAREN" || top.type === "RPAREN") {
      throw new Error("Mismatched parentheses");
    }
    outputQueue.push(top);
  }

  return outputQueue;
}

export function evaluatePostfix(postfix: Token[], context: Record<string, any> = {}): any {
  const stack: any[] = [];

  for (const token of postfix) {
    if (token.type === "NUMBER") {
      stack.push(Number(token.value));
    } else if (token.type === "STRING") {
      stack.push(token.value);
    } else if (token.type === "BOOLEAN") {
      stack.push(token.value === "true");
    } else if (token.type === "IDENTIFIER") {
      const val = context[token.value];
      stack.push(val === undefined ? null : val);
    } else if (token.type === "OPERATOR") {
      if (token.value === "UNARY_MINUS") {
        if (stack.length < 1) {
          throw new Error("Invalid unary minus operation");
        }
        const val = stack.pop();
        stack.push(-Number(val));
      } else if (token.value === "UNARY_NOT") {
        if (stack.length < 1) {
          throw new Error("Invalid unary not operation");
        }
        const val = stack.pop();
        stack.push(!val);
      } else {
        if (stack.length < 2) {
          throw new Error(`Insufficient operands for operator: ${token.value}`);
        }
        const right = stack.pop();
        const left = stack.pop();

        switch (token.value) {
          case "+":
            stack.push(left + right);
            break;
          case "-":
            stack.push(left - right);
            break;
          case "*":
            stack.push(left * right);
            break;
          case "/":
            stack.push(left / right);
            break;
          case "%":
            stack.push(left % right);
            break;
          case "==":
            stack.push(left == right);
            break;
          case "!=":
            stack.push(left != right);
            break;
          case "<":
            stack.push(left < right);
            break;
          case "<=":
            stack.push(left <= right);
            break;
          case ">":
            stack.push(left > right);
            break;
          case ">=":
            stack.push(left >= right);
            break;
          case "&&":
            stack.push(Boolean(left && right));
            break;
          case "||":
            stack.push(Boolean(left || right));
            break;
          default:
            throw new Error(`Unknown operator: ${token.value}`);
        }
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error("Failed to evaluate expression: stack size mismatch");
  }

  return stack[0];
}

export function safeEvaluate(expr: string, context: Record<string, any> = {}): any {
  const trimmed = expr.trim();
  if (!trimmed) {
    return true;
  }
  const tokens = tokenize(trimmed);
  const postfix = toPostfix(tokens);
  return evaluatePostfix(postfix, context);
}
