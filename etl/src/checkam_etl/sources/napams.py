from checkam_etl.run_report import RunReport


async def ingest_napams() -> RunReport:
    """NAPAMS ingester. Documents that automation is skipped per login/CAPTCHA constraints."""
    report = RunReport(source="napams")
    report.errors.append(
        "NAPAMS requires CAPTCHA and Certificate auth. Skipped per polite scraper rule 3."
    )
    report.complete()
    return report
