#!/usr/bin/env python3
"""Upload APKs from a GitHub release to VirusTotal and save JSON reports."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API_BASE = "https://www.virustotal.com/api/v3"
GITHUB_API = "https://api.github.com"
MAX_DIRECT_UPLOAD_BYTES = 32 * 1024 * 1024
APK_NAME = re.compile(r"^mangora-(?P<architecture>.+)-(?P<version>\d+\.\d+\.\d+)\.apk$")


class ScanError(RuntimeError):
    """An expected release, network, or VirusTotal API error."""


def load_api_key() -> str:
    api_key = os.environ.get("VT_KEY") or os.environ.get("VIRUSTOTAL_API_KEY")
    if api_key:
        return api_key.strip()

    env_file = Path(".env")
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            name, separator, value = line.partition("=")
            if separator and name.strip() == "VT_KEY":
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                if value:
                    return value

    raise ScanError("VirusTotal API key not found; set VT_KEY or VIRUSTOTAL_API_KEY.")


def api_request(
    url: str,
    api_key: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    request_headers = {"x-apikey": api_key, "accept": "application/json"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(url, data=data, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise ScanError(f"VirusTotal returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise ScanError(f"Could not reach VirusTotal: {error.reason}") from error

    try:
        result = json.loads(payload)
    except json.JSONDecodeError as error:
        raise ScanError("VirusTotal returned an invalid JSON response.") from error
    if not isinstance(result, dict):
        raise ScanError("VirusTotal returned an unexpected response.")
    return result


def fetch_release(repo: str, tag: str | None) -> dict[str, Any]:
    if tag:
        endpoint = f"tags/{urllib.parse.quote(tag, safe='')}"
    else:
        endpoint = "latest"
    url = f"{GITHUB_API}/repos/{repo}/releases/{endpoint}"
    request = urllib.request.Request(url, headers={"User-Agent": "Mangora-VirusTotal-Scanner"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read())
    except urllib.error.HTTPError as error:
        if error.code == 404:
            release_name = tag or "latest"
            raise ScanError(f"GitHub release {release_name!r} was not found in {repo}.") from error
        raise ScanError(f"GitHub returned HTTP {error.code} while looking up release {tag or 'latest'}.") from error
    except (urllib.error.URLError, json.JSONDecodeError) as error:
        raise ScanError(f"Could not read GitHub release {tag or 'latest'}: {error}") from error
    if not isinstance(result, dict):
        raise ScanError("GitHub returned an unexpected release response.")
    return result


def download_asset(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "Mangora-VirusTotal-Scanner"})
    try:
        with urllib.request.urlopen(request, timeout=300) as response, destination.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    except (urllib.error.URLError, OSError) as error:
        destination.unlink(missing_ok=True)
        raise ScanError(f"Could not download release APK: {error}") from error


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as apk:
        while chunk := apk.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def upload_file(path: Path, api_key: str) -> str:
    if path.stat().st_size > MAX_DIRECT_UPLOAD_BYTES:
        upload_info = api_request(f"{API_BASE}/files/upload_url", api_key)
        upload_url = upload_info.get("data")
        if not isinstance(upload_url, str):
            raise ScanError("VirusTotal did not return a large-file upload URL.")
        parsed_upload_url = urllib.parse.urlparse(upload_url)
        if (
            parsed_upload_url.scheme != "https"
            or not parsed_upload_url.hostname
            or not parsed_upload_url.hostname.endswith(".virustotal.com")
        ):
            raise ScanError("VirusTotal returned an unexpected large-file upload URL.")
    else:
        upload_url = f"{API_BASE}/files"

    boundary = f"----MangoraVirusTotal{hashlib.sha256(os.urandom(32)).hexdigest()}"
    prefix = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        "Content-Type: application/vnd.android.package-archive\r\n\r\n"
    ).encode("utf-8")
    suffix = f"\r\n--{boundary}--\r\n".encode("ascii")
    body = prefix + path.read_bytes() + suffix
    result = api_request(
        upload_url,
        api_key,
        data=body,
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    )
    analysis_id = result.get("data", {}).get("id")
    if not isinstance(analysis_id, str) or not analysis_id:
        raise ScanError(f"VirusTotal did not return an analysis ID for {path.name}.")
    return analysis_id


def wait_for_analysis(analysis_id: str, api_key: str, timeout: int) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while True:
        result = api_request(f"{API_BASE}/analyses/{urllib.parse.quote(analysis_id, safe='')}", api_key)
        attributes = result.get("data", {}).get("attributes", {})
        if not isinstance(attributes, dict):
            raise ScanError("VirusTotal returned an invalid analysis response.")
        status = attributes.get("status")
        if status == "completed":
            return attributes
        if status not in {"queued", "in-progress"}:
            raise ScanError(f"VirusTotal analysis ended with unexpected status {status!r}.")
        if time.monotonic() >= deadline:
            raise ScanError(f"Timed out waiting for VirusTotal analysis {analysis_id}.")
        time.sleep(min(15, max(1, deadline - time.monotonic())))


def scan_asset(
    asset: dict[str, Any],
    version: str,
    tag: str,
    repo: str,
    api_key: str,
    output_dir: Path,
    timeout: int,
) -> Path:
    name = asset.get("name")
    match = APK_NAME.fullmatch(name) if isinstance(name, str) else None
    if not match:
        raise ScanError(f"Unexpected APK asset name: {name!r}.")
    if match.group("version") != version:
        raise ScanError(f"APK {name} does not match release version {version}.")
    download_url = asset.get("browser_download_url")
    if not isinstance(download_url, str):
        raise ScanError(f"GitHub did not provide a download URL for {name}.")

    output_dir.mkdir(parents=True, exist_ok=True)
    apk_path = output_dir / name
    try:
        download_asset(download_url, apk_path)
        digest = sha256_file(apk_path)
        analysis_id = upload_file(apk_path, api_key)
        analysis = wait_for_analysis(analysis_id, api_key, timeout)

        scan_timestamp = analysis.get("date")
        if not isinstance(scan_timestamp, (int, float)):
            scan_timestamp = datetime.now(timezone.utc).timestamp()
        scan_date = datetime.fromtimestamp(scan_timestamp, timezone.utc).isoformat().replace("+00:00", "Z")
        report = {
            "app": "Mangora",
            "version": version,
            "architecture": match.group("architecture"),
            "file_name": name,
            "file_size_bytes": apk_path.stat().st_size,
            "sha256": digest,
            "scan_date": scan_date,
            "analysis_status": analysis.get("status"),
            "analysis_id": analysis_id,
            "analysis_link": f"https://www.virustotal.com/gui/file/{digest}/detection",
            "analysis_stats": analysis.get("stats", {}),
            "source_release": f"https://github.com/{repo}/releases/tag/{urllib.parse.quote(tag, safe='')}",
        }
        report_path = output_dir / f"scan_{version}_{match.group('architecture')}.json"
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return report_path
    finally:
        apk_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", default="", help="GitHub release tag; omit to scan the latest release")
    parser.add_argument("--repo", default="MR-LORD-REX/mangora", help="GitHub owner/repository")
    parser.add_argument("--output-dir", type=Path, default=Path("security"))
    parser.add_argument("--timeout", type=int, default=1800, help="Maximum scan wait in seconds")
    args = parser.parse_args()

    if args.tag and not re.fullmatch(r"v?\d+\.\d+\.\d+", args.tag):
        parser.error("--tag must have the form vMAJOR.MINOR.PATCH")
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")

    try:
        api_key = load_api_key()
        release = fetch_release(args.repo, args.tag or None)
        tag = release.get("tag_name")
        if not isinstance(tag, str) or not tag:
            raise ScanError("GitHub release response is missing its tag.")
        version = tag.removeprefix("v")
        if not re.fullmatch(r"\d+\.\d+\.\d+", version):
            raise ScanError(f"GitHub release tag {tag!r} is not a semantic version.")
        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output:
            with Path(github_output).open("a", encoding="utf-8") as output:
                output.write(f"release_tag={tag}\n")
        assets = release.get("assets", [])
        apk_assets = [asset for asset in assets if isinstance(asset, dict) and str(asset.get("name", "")).endswith(".apk")]
        if not apk_assets:
            raise ScanError(f"Release {tag} has no APK assets.")

        reports = []
        for asset in apk_assets:
            report = scan_asset(
                asset,
                version,
                tag,
                args.repo,
                api_key,
                args.output_dir,
                args.timeout,
            )
            reports.append(report)
            print(f"Saved {report}")
        return 0
    except (ScanError, OSError) as error:
        print(f"VirusTotal release scan failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
