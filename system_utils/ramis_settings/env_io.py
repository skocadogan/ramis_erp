"""Parse and serialize Ramis .env files while preserving comments and unknown keys."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Iterable


@dataclass
class EnvLine:
    kind: str  # comment | blank | kv
    raw: str = ""
    key: str = ""
    value: str = ""


@dataclass
class EnvDocument:
    path: str
    lines: list[EnvLine] = field(default_factory=list)

    def values(self) -> dict[str, str]:
        return {line.key: line.value for line in self.lines if line.kind == "kv"}

    def set_value(self, key: str, value: str) -> None:
        for line in self.lines:
            if line.kind == "kv" and line.key == key:
                line.value = value
                return
        self.lines.append(EnvLine(kind="kv", key=key, value=value, raw=f"{key}={value}"))

    def to_text(self) -> str:
        out: list[str] = []
        for line in self.lines:
            if line.kind == "comment":
                out.append(line.raw)
            elif line.kind == "blank":
                out.append("")
            elif line.kind == "kv":
                out.append(f"{line.key}={_format_env_value(line.value)}")
        text = "\n".join(out)
        if text and not text.endswith("\n"):
            text += "\n"
        return text


def _strip_inline_comment(value: str) -> str:
    if not value:
        return value
    if value[0] in "\"'":
        quote = value[0]
        end = 1
        while end < len(value):
            if value[end] == quote and value[end - 1] != "\\":
                return value[: end + 1]
            end += 1
        return value
    return value.split("#", 1)[0].strip()


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return _strip_inline_comment(value)


def _format_env_value(value: str) -> str:
    if value == "":
        return ""
    if re.search(r"[\s#'\"\\]", value):
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return value


def parse_env_text(text: str, path: str = "") -> EnvDocument:
    doc = EnvDocument(path=path)
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            doc.lines.append(EnvLine(kind="blank", raw=raw_line))
            continue
        if line.startswith("#"):
            doc.lines.append(EnvLine(kind="comment", raw=raw_line))
            continue
        body = line
        if body.startswith("export "):
            body = body[7:].strip()
        if "=" not in body:
            doc.lines.append(EnvLine(kind="comment", raw=raw_line))
            continue
        key, _, value = body.partition("=")
        key = key.strip()
        value = _unquote(value.strip())
        doc.lines.append(EnvLine(kind="kv", raw=raw_line, key=key, value=value))
    return doc


def parse_env_file(path: str) -> EnvDocument:
    if not os.path.exists(path):
        return EnvDocument(path=path)
    with open(path, "r", encoding="utf-8-sig") as handle:
        return parse_env_text(handle.read(), path=path)


def merge_values(doc: EnvDocument, updates: dict[str, str]) -> None:
    for key, value in updates.items():
        doc.set_value(key, value)


def remove_keys(doc: EnvDocument, keys: Iterable[str]) -> None:
    drop = set(keys)
    doc.lines = [line for line in doc.lines if not (line.kind == "kv" and line.key in drop)]
