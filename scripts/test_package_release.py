#!/usr/bin/env python3
"""Fixture tests for archive contents, not binary/runtime compatibility tests."""

from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile

from package_release import ROOT, package_binary


class ReleasePackageTest(unittest.TestCase):
    def test_every_release_target_contains_exact_license_and_notices(self):
        targets = (
            ("linux", "amd64", ""), ("linux", "arm64", ""), ("linux", "arm", "7"),
            ("darwin", "amd64", ""), ("darwin", "arm64", ""), ("windows", "amd64", ""),
        )
        for goos, goarch, goarm in targets:
            with self.subTest(goos=goos, goarch=goarch, goarm=goarm), tempfile.TemporaryDirectory() as directory:
                binary = "memos.exe" if goos == "windows" else "memos"
                payload = b"release packaging test fixture\n"
                (Path(directory) / binary).write_bytes(payload)
                archive = package_binary(directory, "1.2.3-rc.1", goos, goarch, goarm)
                extension = ".zip" if goos == "windows" else ".tar.gz"
                variant = f"v{goarm}" if goarm else ""
                self.assertEqual(archive.name, f"memos-plus_1.2.3-rc.1_{goos}_{goarch}{variant}{extension}")
                expected = {
                    binary: payload,
                    "LICENSE": (ROOT / "LICENSE").read_bytes(),
                    "visual-effects-NOTICES.txt": (ROOT / "web/public/visual-effects-NOTICES.txt").read_bytes(),
                }
                if goos == "windows":
                    with zipfile.ZipFile(archive) as output:
                        self.assertEqual(set(output.namelist()), set(expected))
                        for member, content in expected.items():
                            self.assertEqual(output.read(member), content)
                else:
                    with tarfile.open(archive) as output:
                        self.assertEqual(set(output.getnames()), set(expected))
                        self.assertEqual(output.getmember(binary).mode, 0o755)
                        for member, content in expected.items():
                            self.assertEqual(output.extractfile(member).read(), content)

    def test_missing_binary_does_not_create_an_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(FileNotFoundError):
                package_binary(directory, "1.2.3", "linux", "amd64")
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_artifact_name_cannot_escape_build_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                package_binary(directory, "../outside", "linux", "amd64")


if __name__ == "__main__":
    unittest.main()
