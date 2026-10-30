#!/usr/bin/env python3
"""Package a prebuilt release binary with the project's license and notices."""

import argparse
from pathlib import Path
import re
import tarfile
import zipfile


ROOT = Path(__file__).resolve().parent.parent


def package_binary(build_dir, version, goos, goarch, goarm="", prefix="memos-plus"):
    for component in (version, goos, goarch, prefix):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]*", component):
            raise ValueError("Invalid artifact name component")
    if goos not in ("linux", "darwin", "windows"):
        raise ValueError("Unsupported release OS")
    if goarm and (goos, goarch, goarm) != ("linux", "arm", "7"):
        raise ValueError("Unsupported ARM variant")

    build_dir = Path(build_dir)
    executable = "memos.exe" if goos == "windows" else "memos"
    files = {
        executable: build_dir / executable,
        "LICENSE": ROOT / "LICENSE",
        "visual-effects-NOTICES.txt": ROOT / "web/public/visual-effects-NOTICES.txt",
    }
    for source in files.values():
        if not source.is_file() or source.stat().st_size == 0:
            raise FileNotFoundError(f"Missing or empty release input: {source}")

    variant = f"v{goarm}" if goarm else ""
    name = f"{prefix}_{version}_{goos}_{goarch}{variant}"
    suffix = ".zip" if goos == "windows" else ".tar.gz"
    archive = build_dir / (name + suffix)
    temporary = build_dir / (name + suffix + ".tmp")
    try:
        if goos == "windows":
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as output:
                for member, source in files.items():
                    output.write(source, arcname=member)
        else:
            with tarfile.open(temporary, "w:gz") as output:
                for member, source in files.items():
                    info = output.gettarinfo(str(source), arcname=member)
                    info.mode = 0o755 if member == executable else 0o644
                    with source.open("rb") as content:
                        output.addfile(info, content)
        temporary.replace(archive)
    finally:
        if temporary.exists():
            temporary.unlink()
    return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-dir", type=Path, default=Path("build"))
    parser.add_argument("--version", required=True)
    parser.add_argument("--goos", choices=("linux", "darwin", "windows"), required=True)
    parser.add_argument("--goarch", choices=("amd64", "arm64", "arm"), required=True)
    parser.add_argument("--goarm", default="")
    parser.add_argument("--prefix", default="memos-plus")
    args = parser.parse_args()
    print(package_binary(**vars(args)).name)


if __name__ == "__main__":
    main()
