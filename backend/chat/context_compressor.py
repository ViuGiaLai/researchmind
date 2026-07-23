"""Citation-safe context compression at complete source-block boundaries."""
import re

from common.text_utils import count_tokens

_BLOCK = re.compile(r"(?ms)(^\[[^\n]+\]\n.*?)(?=^\[[^\n]+\]\n|\Z)")
def compress_context_blocks(text: str, max_tokens: int, model: str = "gpt-4o") -> tuple[str, bool]:
    if count_tokens(text, model) <= max_tokens: return text, False
    header, _, body = text.partition("\n"); blocks = _BLOCK.findall(body); selected = []
    for block in blocks:
        candidate = header + "\n" + "\n".join(selected + [block.strip()])
        if count_tokens(candidate, model) > max_tokens: break
        selected.append(block.strip())
    if selected: return header + "\n" + "\n\n".join(selected) + "\n\n[Context truncated at a source boundary.]", True
    return header + "\n[Context omitted because no complete source block fits.]", True
