import ast

BLACKLISTED_MODULES = {
    "os", "sys", "subprocess", "shutil", "socket", "urllib", "requests",
    "builtins", "ctypes", "platform", "importlib", "pty", "posix", "pwd"
}

BLACKLISTED_FUNCTIONS = {
    "eval", "exec", "open", "compile", "__import__", "globals", "locals",
    "getattr", "setattr"
}

def validate_python_code(code: str) -> None:
    """
    Statically analyzes user-written Python code using abstract syntax trees.
    Raises ValueError if imports or function calls violate safety guidelines.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise ValueError(f"Syntax error in script: {e.msg} at line {e.lineno}")

    for node in ast.walk(tree):
        # 1. Check direct imports (e.g. import os)
        if isinstance(node, ast.Import):
            for alias in node.names:
                root_module = alias.name.split(".")[0]
                if root_module in BLACKLISTED_MODULES:
                    raise ValueError(f"Import of module '{alias.name}' is blocked for system safety.")
        
        # 2. Check form imports (e.g. from subprocess import Popen)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root_module = node.module.split(".")[0]
                if root_module in BLACKLISTED_MODULES:
                    raise ValueError(f"Import from module '{node.module}' is blocked for system safety.")
        
        # 3. Check function calls (e.g. eval(), open())
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in BLACKLISTED_FUNCTIONS:
                    raise ValueError(f"Call to built-in function '{node.func.id}' is blocked for system safety.")
            elif isinstance(node.func, ast.Attribute):
                if node.func.attr.startswith("__"):
                    raise ValueError("Access to system attributes (dunder properties) is blocked.")
        
        # 4. Check general attribute access (e.g. obj.__class__)
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__"):
                raise ValueError("Access to system attributes (dunder properties) is blocked.")
