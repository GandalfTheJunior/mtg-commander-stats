"""Print JaCoCo's report-level counters without imposing percentage gates."""

import os
from pathlib import Path
import xml.etree.ElementTree as ET

report = Path("target/site/jacoco/jacoco.xml")
if not report.exists():
    print("JaCoCo report unavailable (verify may have failed before report generation).")
else:
    root = ET.parse(report).getroot()
    summary = "### Backend JaCoCo coverage\n\n"
    summary += "Scope: all compiled src/main/java classes; existing Maven tests, including PostgreSQL integration tests.\n\n"
    summary += "| Metric | Covered / total | Coverage |\n| --- | ---: | ---: |\n"
    for counter in root.findall("counter"):
        if counter.attrib["type"] not in ("LINE", "BRANCH", "METHOD"):
            continue
        covered = int(counter.attrib["covered"])
        total = covered + int(counter.attrib["missed"])
        percent = f"{100 * covered / total:.2f}%" if total else "n/a"
        summary += f"| {counter.attrib['type']} | {covered}/{total} | {percent} |\n"
    summary += "\nNo thresholds. See backend-coverage artifact for HTML and XML details.\n"
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
            output.write(summary)
