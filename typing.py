from __future__ import annotations

import os
import random
import sys
import time

EASY = [
    "cat", "dog", "sun", "moon", "tree", "book", "code", "type", "fast",
    "game", "play", "word", "keys", "home", "path", "file", "list", "loop",
]
MEDIUM = [
    "python script", "terminal window", "press the keys", "read the prompt",
    "count each word", "focus and type", "steady rhythm", "practice daily",
]
HARD = [
    "The quick brown fox jumps over the lazy dog.",
    "Typing faster starts with fewer mistakes.",
    "Measure speed in words per minute carefully.",
    "Green means correct and red means try again.",
]
DIFFICULTIES = {"1": EASY, "2": MEDIUM, "3": HARD}
ROUND_SECONDS = 60

RESET = "\033[0m"
DIM = "\033[2m"
GREEN = "\033[32m"
RED = "\033[31m"
CYAN = "\033[36m"
YELLOW = "\033[33m"


def enable_windows_ansi() -> None:
    if os.name != "nt":
        return
    try:
        import ctypes

        handle = ctypes.windll.kernel32.GetStdHandle(-11)
        mode = ctypes.c_uint32()
        if ctypes.windll.kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            ctypes.windll.kernel32.SetConsoleMode(handle, mode.value | 0x0004)
    except Exception:
        pass


def clear() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def write(text: str = "") -> None:
    sys.stdout.write(text)
    sys.stdout.flush()


class RawTerminal:
    def __init__(self) -> None:
        self._fd = None
        self._old = None

    def __enter__(self) -> RawTerminal:
        if not sys.stdin.isatty():
            raise SystemExit("Need an interactive terminal.")
        if os.name != "nt":
            import termios
            import tty

            self._fd = sys.stdin.fileno()
            self._old = termios.tcgetattr(self._fd)
            tty.setcbreak(self._fd)
        return self

    def __exit__(self, *exc) -> None:
        if self._old is not None:
            import termios

            termios.tcsetattr(self._fd, termios.TCSADRAIN, self._old)

    def read_key(self, timeout: float) -> str | None:
        if os.name == "nt":
            import msvcrt

            end = time.time() + timeout
            while time.time() < end:
                if msvcrt.kbhit():
                    ch = msvcrt.getwch()
                    if ch in ("\x00", "\xe0"):
                        msvcrt.getwch()
                        return ""
                    return "\n" if ch == "\r" else ch
                time.sleep(0.02)
            return None

        import select

        ready, _, _ = select.select([sys.stdin], [], [], timeout)
        return sys.stdin.read(1) if ready else None


def paint(prompt: str, typed: str) -> None:
    parts = ["\r  "]
    for i, ch in enumerate(prompt):
        if i < len(typed):
            parts.append(f"{GREEN if typed[i] == ch else RED}{ch}{RESET}")
        else:
            parts.append(f"{DIM}{ch}{RESET}")
    write("".join(parts) + "\033[K")


def play_prompt(raw: RawTerminal, prompt: str, deadline: float) -> tuple[int, int, bool]:
    typed = ""
    keystrokes = correct = 0
    write("\n")
    paint(prompt, typed)

    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            write("\n")
            return keystrokes, correct, False

        ch = raw.read_key(min(0.25, remaining))
        if ch is None or ch == "" or ch == "\n":
            continue
        if ch == "\x03":
            raise KeyboardInterrupt
        if ch in ("\x7f", "\b"):
            if typed:
                last = typed[-1]
                typed = typed[:-1]
                keystrokes = max(0, keystrokes - 1)
                if last == prompt[len(typed)]:
                    correct = max(0, correct - 1)
                paint(prompt, typed)
            continue
        if len(ch) != 1 or ord(ch) < 32 or len(typed) >= len(prompt):
            continue

        keystrokes += 1
        if ch == prompt[len(typed)]:
            correct += 1
        typed += ch
        paint(prompt, typed)
        if typed == prompt:
            write(f"\n  {GREEN}correct!{RESET}\n")
            return keystrokes, correct, True


def play_round(bank: list[str]) -> None:
    clear()
    write(f"{CYAN}  {ROUND_SECONDS}s{RESET}\n")

    typed = correct = finished = 0
    start = time.time()
    deadline = start + ROUND_SECONDS

    with RawTerminal() as raw:
        while time.time() < deadline:
            t, c, ok = play_prompt(raw, random.choice(bank), deadline)
            typed += t
            correct += c
            finished += ok

    seconds = min(ROUND_SECONDS, time.time() - start)
    accuracy = 0.0 if typed == 0 else 100.0 * correct / typed
    wpm = 0.0 if seconds <= 0 else (correct / 5.0) / (seconds / 60.0)

    write(f"\n  Finished: {finished}\n")
    write(f"  Accuracy: {accuracy:.1f}%\n")
    write(f"  WPM:      {YELLOW}{wpm:.1f}{RESET}\n\n")


def main() -> None:
    enable_windows_ansi()
    while True:
        clear()
        write(f"\n{CYAN}  Typing Game{RESET}\n")
        write("  1) Easy  2) Medium  3) Hard  q) Quit\n  > ")
        choice = input().strip().lower()
        if choice in ("q", "quit"):
            return
        if choice not in DIFFICULTIES:
            continue
        try:
            play_round(DIFFICULTIES[choice])
        except KeyboardInterrupt:
            write("\n")
        input("  Enter...")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        write("\n")