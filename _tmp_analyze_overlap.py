"""
Analyze all test files for TRUE behavioral duplication.
Not just module overlap, but actual test logic overlap:
- Same production classes/functions tested
- Same scenarios simulated
- Same assertion patterns (same boundary checks, same error case)
- Integration tests that duplicate unit test coverage
"""

import ast
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

TESTS_DIR = Path("backend/tests")


def safe_extract(node):
    """Extract a string representation from a node."""
    if isinstance(node, ast.Name):
        return node.id
    elif isinstance(node, ast.Attribute):
        return f"{safe_extract(node.value)}.{node.attr}"
    elif isinstance(node, ast.Call):
        func = safe_extract(node.func)
        args = [safe_extract(a) for a in node.args[:3]]
        kwargs = {}
        for kw in node.keywords[:3]:
            kwargs[kw.arg or "?"] = safe_extract(kw.value)
        return f"{func}({', '.join(args[:2])})"
    elif isinstance(node, ast.Constant):
        if isinstance(node.value, str):
            v = node.value
            return v[:60] + "..." if len(v) > 60 else v
        return str(node.value)
    elif isinstance(node, ast.List):
        return f"[{', '.join(safe_extract(e) for e in node.elts[:3])}]"
    elif isinstance(node, ast.Dict):
        return "{dict}"
    elif isinstance(node, ast.Tuple):
        return f"({', '.join(safe_extract(e) for e in node.elts[:3])})"
    elif isinstance(node, ast.Subscript):
        return f"{safe_extract(node.value)}[{safe_extract(node.slice)}]"
    elif isinstance(node, ast.Compare):
        return f"{safe_extract(node.left)} {type(node.ops[0]).__name__} {safe_extract(node.comparators[0])}"
    elif isinstance(node, ast.UnaryOp):
        return f"{type(node.op).__name__}{safe_extract(node.operand)}"
    elif isinstance(node, ast.BoolOp):
        return f"{safe_extract(node.values[0])} {type(node.op).__name__} {safe_extract(node.values[1])}"
    elif isinstance(node, ast.BinOp):
        return f"{safe_extract(node.left)} {type(node.op).__name__} {safe_extract(node.right)}"
    elif isinstance(node, ast.ListComp):
        return f"[{safe_extract(node.elt)} for {safe_extract(node.generators[0].target)} in ...]"
    elif isinstance(node, ast.DictComp):
        return "{} for ..."
    elif isinstance(node, ast.Slice):
        return f"{safe_extract(node.lower or '')}:{safe_extract(node.upper or '')}"
    elif isinstance(node, ast.Lambda):
        return f"lambda ...: {safe_extract(node.body)}"
    elif isinstance(node, ast.Set):
        return f"{{...}}"
    elif isinstance(node, (ast.NamedExpr,)):
        return f"({safe_extract(node.target)} := {safe_extract(node.value)})"
    elif node is None:
        return "None"
    return f"<{type(node).__name__}>"


def extract_imports(tree):
    """Extract production imports (non-test, non-stdlib)."""
    imports = set()
    stdlib = {
        "abc", "ast", "asyncio", "base64", "collections", "concurrent", "contextlib",
        "copy", "csv", "datetime", "decimal", "functools", "glob", "hashlib",
        "html", "http", "importlib", "inspect", "io", "itertools", "json",
        "logging", "math", "multiprocessing", "operator", "os", "pathlib",
        "pickle", "pprint", "queue", "random", "re", "secrets", "shutil",
        "signal", "socket", "sqlite3", "statistics", "string", "struct",
        "subprocess", "sys", "tempfile", "textwrap", "threading", "time",
        "traceback", "types", "typing", "unittest", "urllib", "uuid",
        "weakref", "xml", "zipfile",
    }
    third_party = {"pytest", "fastapi"}
    
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                mod = alias.name.split(".")[0]
                if mod not in stdlib and mod not in third_party:
                    imports.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                mod = node.module.split(".")[0]
                if mod not in stdlib and mod not in third_party:
                    imports.add(node.module)
    return sorted(imports)


def extract_test_info(tree, source_lines):
    """Extract detailed info about each test function."""
    tests = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_"):
            # Collect assertions
            assertions = []
            pytest_raises = False
            production_calls = []
            
            for sub in ast.walk(node):
                if isinstance(sub, ast.Assert):
                    try:
                        assertions.append(safe_extract(sub.test))
                    except Exception:
                        assertions.append("<unparseable>")
                elif isinstance(sub, ast.Call):
                    if isinstance(sub.func, ast.Attribute) and sub.func.attr == "raises" and isinstance(sub.func.value, ast.Name) and sub.func.value.id == "pytest":
                        pytest_raises = True
                    
                    # Check if calling a production class or module
                    func_name = safe_extract(sub.func)
                    if func_name not in ("assert", "pytest.raises", "getattr", "hasattr", "isinstance",
                                        "len", "print", "range", "sorted", "sum", "str", "int", "list",
                                        "dict", "set", "tuple", "type", "super", "object", "open",
                                        "zip", "map", "filter", "enumerate"):
                        production_calls.append(func_name)
            
            # Get the test body summary
            body_lines = []
            for stmt in node.body:
                try:
                    start = getattr(stmt, 'lineno', 0)
                    end = getattr(stmt, 'end_lineno', start)
                    body_lines.extend(source_lines[start-1:end])
                except Exception:
                    pass
            
            body_text = "\n".join(body_lines)
            
            # Determine the "scenario" or "pattern" of the test
            scenario_keywords = set()
            for word in re.findall(r'[A-Za-z_]+', node.name.lower()):
                scenario_keywords.add(word)
            
            tests.append({
                "name": node.name,
                "is_async": isinstance(node, ast.AsyncFunctionDef),
                "assertion_count": len([s for s in ast.walk(node) if isinstance(s, ast.Assert)]),
                "has_pytest_raises": pytest_raises,
                "production_calls": list(set(production_calls))[:10],
                "assertions": assertions[:8],
                "body_line_count": len(body_lines),
                "scenario_keywords": scenario_keywords,
            })
    return tests


def compute_overlap_signature(test):
    """
    Compute a signature that captures the test's behavioral essence.
    This is used to find tests with similar logic, not just same imports.
    """
    # Class of assertion types (e.g., "eq", "contains", "is_true", "gt")
    assertion_types = set()
    for a in test["assertions"]:
        if "==" in a or ".eq" in a:
            assertion_types.add("eq")
        elif "in" in a and "not" not in a:
            assertion_types.add("contains")
        elif "is True" in a or ".true" in a.lower():
            assertion_types.add("is_true")
        elif ">" in a:
            assertion_types.add("gt")
        elif "<" in a:
            assertion_types.add("lt")
        elif "is not None" in a or ".not_empty" in a.lower():
            assertion_types.add("not_none")
        elif "is None" in a:
            assertion_types.add("is_none")
        elif "not in" in a:
            assertion_types.add("not_contains")
        elif "is False" in a or ".false" in a.lower():
            assertion_types.add("is_false")
        elif ">=" in a:
            assertion_types.add("gte")
        elif "<=" in a:
            assertion_types.add("lte")
        elif "!=" in a:
            assertion_types.add("neq")
    
    # Key scenario patterns
    has_pytest_raises = test["has_pytest_raises"]
    
    # Production calls tell us what's being tested
    production_classes = set()
    for call in test["production_calls"]:
        parts = call.split("(")[0].split(".")[-1]
        production_classes.add(parts)
    
    return {
        "assertion_types": frozenset(assertion_types),
        "has_pytest_raises": has_pytest_raises,
        "production_classes": frozenset(production_classes),
        "async": test["is_async"],
    }


def main():
    test_files = sorted(TESTS_DIR.glob("test_*.py"))
    print(f"Analyzing {len(test_files)} test files...\n")
    
    all_tests = {}  # filename -> [test_info]
    file_imports = {}  # filename -> [modules]
    
    for path in test_files:
        source = path.read_text(encoding="utf-8")
        source_lines = source.split("\n")
        tree = ast.parse(source, filename=str(path))
        
        imports = extract_imports(tree)
        tests = extract_test_info(tree, source_lines)
        
        file_imports[path.name] = imports
        all_tests[path.name] = tests
    
    # ============================================================
    # ANALYSIS 1: Find files that test the SAME production modules
    # ============================================================
    print("=" * 80)
    print("ANALYSIS 1: Module import overlap (same production modules imported)")
    print("=" * 80)
    
    module_files = defaultdict(set)
    for fname, imports in file_imports.items():
        for imp in imports:
            module_files[imp].add(fname)
    
    overlapping_modules = {m: files for m, files in module_files.items() if len(files) > 1}
    for module in sorted(overlapping_modules):
        files = sorted(overlapping_modules[module])
        if len(files) >= 2:
            print(f"\n  Module '{module}' imported by {len(files)} files:")
            for f in files:
                test_count = len(all_tests[f])
                print(f"    - {f} ({test_count} tests)")
    
    # ============================================================
    # ANALYSIS 2: Find tests with identical behavioral signatures
    # ============================================================
    print("\n\n" + "=" * 80)
    print("ANALYSIS 2: Tests with IDENTICAL behavioral signatures")
    print("(same assertion types + same production classes + same error-handling pattern)")
    print("=" * 80)
    
    sig_groups = defaultdict(list)
    for fname, tests in all_tests.items():
        for t in tests:
            sig = compute_overlap_signature(t)
            sig_groups[sig].append((fname, t["name"], t["assertions"][:5]))
    
    for sig, group in sorted(sig_groups.items(), key=lambda x: -len(x[1])):
        if len(group) >= 3:  # Only flag if 3+ tests share same signature
            print(f"\n  Signature: assertion_types={set(sig['assertion_types'])}, "
                  f"classes={set(sig['production_classes'])}, "
                  f"raises={sig['has_pytest_raises']}, async={sig['async']}")
            for fname, tname, assertions in group:
                print(f"    - {fname}::{tname}")
                if assertions:
                    print(f"      assertions: {assertions}")
    
    # ============================================================
    # ANALYSIS 3: Detect tests that create the same objects with same field values
    # ============================================================
    print("\n\n" + "=" * 80)
    print("ANALYSIS 3: Potential test duplication patterns")
    print("=" * 80)
    
    # Group tests by the production classes they instantiate
    class_tests = defaultdict(list)
    for fname, tests in all_tests.items():
        for t in tests:
            classes = set()
            for call in t["production_calls"]:
                cls_name = call.split("(")[0].split(".")[0]
                if cls_name[0].isupper():
                    classes.add(cls_name)
            for cls in classes:
                class_tests[cls].append((fname, t["name"], t["assertion_count"]))
    
    for cls, tests in sorted(class_tests.items(), key=lambda x: -len(x[1])):
        if len(tests) >= 2:
            print(f"\n  Class '{cls}' tested in {len(tests)} tests:")
            for fname, tname, a_count in sorted(tests):
                print(f"    - {fname}::{tname} ({a_count} assertions)")
    
    # Identify "identical mock/init patterns" - tests that create objects with same constructor args
    # This indicates tests that are testing the same thing at different abstraction levels
    print("\n\n  DEEP SCAN: Tests that test the SAME production function/class across files")
    print("  (looking for the same production function being called, not just same module)")
    
    # Find tests that call the exact same production function
    func_tests = defaultdict(list)
    for fname, tests in all_tests.items():
        for t in tests:
            for call in t["production_calls"]:
                # Get the actual function/method name
                func = call.split("(")[0] if "(" in call else call
                func_tests[func].append((fname, t["name"]))
    
    for func, tests in sorted(func_tests.items(), key=lambda x: -len(x[1])):
        if len(tests) >= 3 and len(set(t[0] for t in tests)) >= 2:
            print(f"\n  Production function '{func}' tested in {len(tests)} tests across {len(set(t[0] for t in tests))} files:")
            for fname, tname in sorted(tests):
                print(f"    - {fname}::{tname}")
    
    # ============================================================
    # ANALYSIS 4: Integration tests that overlap with unit tests
    # ============================================================
    print("\n\n" + "=" * 80)
    print("ANALYSIS 4: Integration vs Unit overlap")
    print("(integration tests that cover the same code paths as unit tests)")
    print("=" * 80)
    
    # Identify files marked as integration
    integration_markers = ["pytestmark = pytest.mark.integration"]
    integration_files = []
    unit_files = []
    
    for path in test_files:
        source = path.read_text(encoding="utf-8")
        is_int = any(marker in source for marker in integration_markers)
        if is_int:
            integration_files.append(path.name)
        else:
            unit_files.append(path.name)
    
    print(f"\n  Integration files: {len(integration_files)}")
    for f in sorted(integration_files):
        print(f"    - {f}")
    print(f"\n  Unit files: {len(unit_files)}")
    for f in sorted(unit_files):
        print(f"    - {f}")
    
    # Find integration tests that test the same production functions as unit tests
    print("\n\n  Integration tests potentially overlapping unit tests (testing same functions):")
    
    int_prod_calls = defaultdict(set)
    unit_prod_calls = defaultdict(set)
    
    for fname, tests in all_tests.items():
        for t in tests:
            for call in t["production_calls"]:
                if fname in integration_files:
                    int_prod_calls[call].add(fname)
                else:
                    unit_prod_calls[call].add(fname)
    
    overlap_found = False
    for call in sorted(set(int_prod_calls) & set(unit_prod_calls)):
        int_files = int_prod_calls[call]
        unit_fnames = unit_prod_calls[call]
        if len(int_files) >= 1 and len(unit_fnames) >= 1:
            # Check if the integration tests actually test different scenarios
            overlap_found = True
            print(f"\n    Function '{call}' tested in integration: {sorted(int_files)}")
            print(f"      ... and in unit: {sorted(unit_fnames)}")
    
    if not overlap_found:
        print("    (none - integration and unit tests test disjoint functions)")
    
    # ============================================================
    # SUMMARY
    # ============================================================
    print("\n\n" + "=" * 80)
    print("SUMMARY: Files with highest duplication risk")
    print("=" * 80)
    
    # Files that share the most production module imports
    print("\n  Files sharing 3+ production module imports (high overlap possibility):")
    for fname1 in sorted(all_tests):
        for fname2 in sorted(all_tests):
            if fname1 >= fname2:
                continue
            shared = set(file_imports.get(fname1, [])) & set(file_imports.get(fname2, []))
            if len(shared) >= 3:
                print(f"\n    {fname1} <-> {fname2}: {len(shared)} shared modules")
                for m in sorted(shared):
                    print(f"      - {m}")
    
    print("\n\nDone.")


if __name__ == "__main__":
    main()
