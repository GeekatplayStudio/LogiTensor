PRECEDENCE = {
    "||": 1, "&&": 2,
    "==": 3, "!=": 3,
    "<": 4, "<=": 4, ">": 4, ">=": 4,
    "+": 5, "-": 5,
    "*": 6, "/": 6, "%": 6,
    "UNARY_MINUS": 7, "UNARY_NOT": 7
}

ASSOCIATIVITY = {
    "||": "LEFT", "&&": "LEFT",
    "==": "LEFT", "!=": "LEFT",
    "<": "LEFT", "<=": "LEFT", ">": "LEFT", ">=": "LEFT",
    "+": "LEFT", "-": "LEFT",
    "*": "LEFT", "/": "LEFT", "%": "LEFT",
    "UNARY_MINUS": "RIGHT", "UNARY_NOT": "RIGHT"
}

def tokenize(expr: str):
    tokens = []
    i = 0
    while i < len(expr):
        char = expr[i]
        if char.isspace():
            i += 1
            continue
        if char == "(":
            tokens.append(("LPAREN", "("))
            i += 1
            continue
        if char == ")":
            tokens.append(("RPAREN", ")"))
            i += 1
            continue
        if char in ["'", '"']:
            quote = char
            val = ""
            i += 1
            while i < len(expr) and expr[i] != quote:
                if expr[i] == "\\":
                    i += 1
                val += expr[i]
                i += 1
            i += 1
            tokens.append(("STRING", val))
            continue
        if char.isdigit() or (char == "." and i + 1 < len(expr) and expr[i+1].isdigit()):
            val = ""
            while i < len(expr) and (expr[i].isdigit() or expr[i] == "."):
                val += expr[i]
                i += 1
            tokens.append(("NUMBER", val))
            continue
        two_char = expr[i:i+2]
        if two_char in ["==", "!=", "<=", ">=", "&&", "||"]:
            tokens.append(("OPERATOR", two_char))
            i += 2
            continue
        if char in ["+", "-", "*", "/", "%", "<", ">", "!"]:
            tokens.append(("OPERATOR", char))
            i += 1
            continue
        if char.isalpha() or char == "_":
            val = ""
            while i < len(expr) and (expr[i].isalnum() or expr[i] == "_"):
                val += expr[i]
                i += 1
            if val == "true":
                tokens.append(("BOOLEAN", "true"))
            elif val == "false":
                tokens.append(("BOOLEAN", "false"))
            else:
                tokens.append(("IDENTIFIER", val))
            continue
        raise ValueError(f"Unexpected character: {char}")
    return tokens

def to_postfix(tokens):
    output = []
    stack = []
    for idx, token in enumerate(tokens):
        t_type, val = token
        if t_type in ["NUMBER", "STRING", "BOOLEAN", "IDENTIFIER"]:
            output.append(token)
        elif t_type == "OPERATOR":
            prev = tokens[idx - 1] if idx > 0 else None
            is_unary = not prev or prev[0] == "LPAREN" or prev[0] == "OPERATOR"
            op_val = val
            if is_unary:
                if val == "-":
                    op_val = "UNARY_MINUS"
                elif val == "!":
                    op_val = "UNARY_NOT"
                else:
                    raise ValueError(f"Invalid unary operator: {val}")
            
            p1 = PRECEDENCE.get(op_val, 0)
            assoc = ASSOCIATIVITY.get(op_val, "LEFT")
            
            while stack and stack[-1][0] == "OPERATOR":
                top_val = stack[-1][1]
                p2 = PRECEDENCE.get(top_val, 0)
                if (assoc == "LEFT" and p1 <= p2) or (assoc == "RIGHT" and p1 < p2):
                    output.append(stack.pop())
                else:
                    break
            stack.append(("OPERATOR", op_val))
        elif t_type == "LPAREN":
            stack.append(token)
        elif t_type == "RPAREN":
            popped = False
            while stack:
                if stack[-1][0] == "LPAREN":
                    stack.pop()
                    popped = True
                    break
                output.append(stack.pop())
            if not popped:
                raise ValueError("Mismatched parentheses")
    while stack:
        top = stack.pop()
        if top[0] in ["LPAREN", "RPAREN"]:
            raise ValueError("Mismatched parentheses")
        output.append(top)
    return output

def evaluate_postfix(postfix, context):
    stack = []
    for t_type, val in postfix:
        if t_type == "NUMBER":
            stack.append(float(val) if "." in val else int(val))
        elif t_type == "STRING":
            stack.append(val)
        elif t_type == "BOOLEAN":
            stack.append(val == "true")
        elif t_type == "IDENTIFIER":
            stack.append(context.get(val, None))
        elif t_type == "OPERATOR":
            if val == "UNARY_MINUS":
                v = stack.pop()
                stack.append(-v)
            elif val == "UNARY_NOT":
                v = stack.pop()
                stack.append(not v)
            else:
                right = stack.pop()
                left = stack.pop()
                if val == "+":
                    stack.append(left + right)
                elif val == "-":
                    stack.append(left - right)
                elif val == "*":
                    stack.append(left * right)
                elif val == "/":
                    stack.append(left / right)
                elif val == "%":
                    stack.append(left % right)
                elif val == "==":
                    stack.append(left == right)
                elif val == "!=":
                    stack.append(left != right)
                elif val == "<":
                    stack.append(left < right)
                elif val == "<=":
                    stack.append(left <= right)
                elif val == ">":
                    stack.append(left > right)
                elif val == ">=":
                    stack.append(left >= right)
                elif val == "&&":
                    stack.append(bool(left and right))
                elif val == "||":
                    stack.append(bool(left or right))
    if len(stack) != 1:
        raise ValueError("Invalid expression state")
    return stack[0]

def safe_evaluate(expr: str, context: dict = {}):
    trimmed = expr.strip()
    if not trimmed:
        return True
    tokens = tokenize(trimmed)
    postfix = to_postfix(tokens)
    return evaluate_postfix(postfix, context)
