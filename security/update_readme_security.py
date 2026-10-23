#!/usr/bin/env python3
"""Render the latest release's VirusTotal reports in the README."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

START_MARKER = "<!-- latest-security-start -->"
END_MARKER = "<!-- latest-security-end -->"
VERSION_PATTERN = re.compile(r"^v?(?P<version>\d+\.\d+\.\d+)$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
VIRUSTOTAL_PATTERN = re.compile(
    r"^https://www\.virustotal\.com/gui/file/[0-9a-f]{64}/detection$"
)


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not read JSON from {path}: {error}") from error
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object in {path}.")
    return payload


def generate_section(release: dict[str, Any], report_dir: Path) -> str:
    tag = release.get("tag_name")
    release_url = release.get("html_url")
    version_match = VERSION_PATTERN.fullmatch(tag) if isinstance(tag, str) else None
    if not version_match:
        raise ValueError(f"Latest release has an invalid tag_name: {tag!r}.")
    if not isinstance(release_url, str) or not release_url.startswith(
        "https://github.com/"
    ):
        raise ValueError("Latest release has an invalid html_url.")

    version = version_match.group("version")
    reports = []
    for report_path in sorted(report_dir.glob(f"scan_{version}_*.json")):
        report = read_json(report_path)
        architecture = report.get("architecture")
        sha256 = report.get("sha256")
        analysis_link = report.get("analysis_link")
        if not isinstance(architecture, str) or not re.fullmatch(
            r"[a-zA-Z0-9_-]+", architecture
        ):
            raise ValueError(f"Report has an invalid architecture: {report_path}.")
        if not isinstance(sha256, str) or not SHA256_PATTERN.fullmatch(sha256):
            raise ValueError(f"Report has an invalid SHA-256: {report_path}.")
        if not isinstance(analysis_link, str) or not VIRUSTOTAL_PATTERN.fullmatch(
            analysis_link
        ):
            raise ValueError(f"Report has an invalid VirusTotal link: {report_path}.")
        reports.append((architecture, analysis_link, sha256))

    if not reports:
        raise ValueError(f"No VirusTotal reports found for latest release {tag}.")

    rows = "\n".join(
        f"| {architecture} | [View report]({analysis_link}) | `{sha256}` |"
        for architecture, analysis_link, sha256 in reports
    )
    return (
        f"The [{tag}]({release_url}) APKs were analyzed by VirusTotal. "
        "See each report for its detection results.\n\n"
        "| Build | VirusTotal analysis | SHA-256 |\n"
        "| --- | --- | --- |\n"
        f"{rows}"
    )


def update_readme(readme_path: Path, section: str) -> None:
    readme = readme_path.read_text(encoding="utf-8")
    if readme.count(START_MARKER) != 1 or readme.count(END_MARKER) != 1:
        raise ValueError(f"Expected exactly one generated security block in {readme_path}.")
    start = readme.index(START_MARKER) + len(START_MARKER)
    end = readme.index(END_MARKER)
    if start >= end:
        raise ValueError(f"Security block markers are out of order in {readme_path}.")
    readme_path.write_text(
        readme[:start] + "\n" + section + "\n" + readme[end:],
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-json", required=True, type=Path)
    parser.add_argument("--reports-dir", default=Path("security"), type=Path)
    parser.add_argument("--readme", default=Path("README.md"), type=Path)
    parser.add_argument("--scanned-tag", required=True)
    args = parser.parse_args()

    try:
        latest_release = read_json(args.release_json)
        latest_tag = latest_release.get("tag_name")
        if latest_tag != args.scanned_tag:
            print(
                f"README security section unchanged: scanned {args.scanned_tag}, "
                f"but latest release is {latest_tag}."
            )
            return 0
        update_readme(args.readme, generate_section(latest_release, args.reports_dir))
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    print(f"Updated README security section for {args.scanned_tag}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
